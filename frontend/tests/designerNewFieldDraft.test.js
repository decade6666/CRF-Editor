import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')

function fnBody(name) {
  const re = new RegExp(`(?:async )?function ${name}\\(([^)]*)\\) \\{([\\s\\S]*?)\\n\\}`)
  const m = re.exec(source)
  assert.ok(m, `should locate function ${name}`)
  return m[2]
}

test('草稿常量与判定辅助存在', () => {
  assert.match(source, /const DRAFT_FIELD_ID = '__draft__'/)
  assert.match(source, /function isDraftField\(ff\) \{[\s\S]*?__draft === true[\s\S]*?DRAFT_FIELD_ID/)
  assert.match(source, /const hasDraft = computed\(\(\) => formFields\.value\.some\(isDraftField\)\)/)
})

test('newField 只构造本地草稿，不发任何网络请求', () => {
  const body = fnBody('newField')
  // 不得在新增时落库
  assert.doesNotMatch(body, /api\.(post|put|patch|del)\(/, 'newField 不应发起任何请求')
  // 构造草稿对象并插入列表、选中
  assert.match(body, /id: DRAFT_FIELD_ID/)
  assert.match(body, /__draft: true/)
  assert.match(body, /formFields\.value = \[\.\.\.formFields\.value, draft\]/)
  assert.match(body, /selectField\(draft\)/)
  // 存在草稿时先确认
  assert.match(body, /confirmDiscardDraft\(\)/)
})

test('saveDraftField 一次 field-profile 原子保存并替换草稿、入撤销栈', () => {
  const body = fnBody('saveDraftField')
  const profilePost = body.indexOf('/api/forms/${formId}/field-profile`')
  assert.ok(profilePost > -1, '应 POST field-profile 原子接口')
  // 原子命令：创建/绑定定义 + 实例 upsert（不再分两次请求）
  assert.match(body, /const command = buildFieldProfileCommand\(\{/)
  assert.match(body, /const result = await api\.post\(`\/api\/forms\/\$\{formId\}\/field-profile`, command\)/)
  assert.match(body, /const createdFfId = result\.form_field_id \?\? result\.form_field\?\.id/)
  assert.match(body, /const createdFdId = result\.final_definition_id/)
  assert.match(body, /const definitionCreated = Boolean\(result\.definition_created\)/)
  // 字段库同步刷新 + 草稿行不「先删后补」（2.10：保存后立即出现、字段库立即更新）
  assert.match(body, /refreshKey\.value\+\+/)
  assert.match(body, /reloaded = await loadFormFields\(formId\)/)
  assert.match(body, /loadFieldDefs\(\)/)
  // 加载被会话守卫吞掉/失败时：草稿行原位转正，不留下空列表
  assert.match(body, /formFields\.value = formFields\.value\.map\(\(f\) =>/)
  assert.match(body, /__draft: false/)
  // 作为一次「新建字段」入撤销栈；撤销=删除实例+条件清理定义，重做=复用/重建
  assert.match(body, /recordDesignerHistory\(historyContext, \{/)
  assert.match(body, /label: '新建字段'/)
  assert.match(body, /buildDeleteProfileCommand\(\{[\s\S]*?cleanupDefinitionId: definitionCreated \? ids\.fdId : null/)
  assert.match(body, /preferred_definition_id: ids\.fdId/)
  // 失败保留草稿并报错，不静默
  assert.match(body, /ElMessage\.error\(e\.message\)/)
  assert.match(body, /return false/)
})

test('saveDraftField selects the real field after fallback map when reload is skipped', () => {
  const body = fnBody('saveDraftField')
  const fallbackBranch = body.match(/if \(!reloaded\) \{([\s\S]*?)\n    \} else \{/)

  assert.ok(fallbackBranch, 'saveDraftField should keep a fallback branch when field reload is skipped')
  assert.match(
    fallbackBranch[1],
    /formFields\.value = formFields\.value\.map\(\(f\) =>[\s\S]*?__draft: false[\s\S]*?const realFf = formFields\.value\.find\(\(f\) => f\.id === createdFfId\)[\s\S]*?if \(realFf\) selectField\(realFf\)/,
  )
})

test('选项字段保存前要求选择字典', () => {
  const body = fnBody('saveDraftField')
  assert.match(body, /isChoiceField\(fd\.field_type\) && !fd\.codelist_id/)
})

test('链接候选且改了定义级属性时：命令携带候选快照、保存前确认影响范围', () => {
  const body = fnBody('saveDraftField')
  // 候选点击时捕获的快照传入命令构造器，9 键差异决定是否随保存共享更新候选定义
  assert.match(body, /candidateDefinitionPayload: candidateBeforeDefinition/)
  assert.match(body, /const definitionChanged = command\.definition_operation\?\.operation === 'update_shared'/)
  // 有差异才需要多表单影响确认；取消确认不弹错误、不落库
  assert.match(body, /if \(definitionChanged\) \{[\s\S]*?await confirmFieldReferenceImpact\(selectedDefinitionId\.value\)/)
  assert.match(body, /if \(e === 'cancel' \|\| e === 'close'\) return false/)
})

test('链接候选修改定义的保存：undo 先 PUT 恢复共享定义内容再删实例', () => {
  const body = fnBody('saveDraftField')
  assert.match(
    body,
    /const restoreDefinitionPayload = definitionChanged \? candidateBeforeDefinition : null/,
  )
  // undo 闭包：先恢复定义内容（其他表单同引用的定义保持内容一致），再删除实例；随后走回放刷新
  assert.match(
    body,
    /if \(restoreDefinitionPayload\) \{[\s\S]*?await api\.put\(`\/api\/projects\/\$\{projectId\}\/field-definitions\/\$\{ids\.fdId\}`, restoreDefinitionPayload\)[\s\S]*?api\.invalidateCache\(`\/api\/projects\/\$\{projectId\}\/field-definitions`\)[\s\S]*?\}[\s\S]*?const deleteCommand = buildDeleteProfileCommand/,
  )
})

test('链接候选修改定义的保存：redo 原样重放捕获命令（existing 绑定 + 共享更新），不重建定义', () => {
  const body = fnBody('saveDraftField')
  assert.match(
    body,
    /const redoCommand = command\.binding\?\.mode === 'existing'\s*\?\s*command\s*:\s*\{[\s\S]*?definition_operation: \{[\s\S]*?operation: 'create_or_restore'/,
  )
})

test('removeField 对草稿仅移除本地、不调 DELETE', () => {
  const body = fnBody('removeField')
  const draftBranch = /if \(isDraftField\(ff\)\) \{[\s\S]*?removeDraftFromState\(\);[\s\S]*?return;[\s\S]*?\}/
  assert.match(body, draftBranch)
  assert.match(body, /if \(isDraftField\(ff\)\) \{[\s\S]*?confirmDelete\(ElMessageBox\.confirm/)
  // 草稿分支在真实删除（DELETE）之前短路
  const branchIdx = body.search(draftBranch)
  const delIdx = body.indexOf('api.del(`/api/form-fields/')
  assert.ok(branchIdx > -1 && (delIdx === -1 || branchIdx < delIdx), '草稿短路应先于 DELETE')
})

test('removeField 删除标签字段后可通过快照重建定义与实例', () => {
  const body = fnBody('removeField')
  assert.match(source, /function buildReplaySnapshot\(ff\) \{/)
  assert.match(source, /function recreateFieldFromSnapshot\(formId, snapshot\) \{/)
  assert.match(source, /if \(status !== 404\) throw error;/)
  assert.match(source, /await api\.del\(`\/api\/field-definitions\/\$\{recreatedDefinition\.id\}`\);/)
  assert.match(body, /const snapshot = buildReplaySnapshot\(ff\)/)
  assert.match(body, /const shouldReloadDefs = Boolean\(snapshot\.fieldDefinitionPayload\)/)
  assert.match(body, /const recreated = await recreateFieldFromSnapshot\(formId, snapshot\)/)
  assert.match(body, /reloadAfterReplay\(formId, \{ defs: shouldReloadDefs \}\)/)
  // undo 复用外层 shouldReloadDefs，不再独立重算 Boolean(snapshot.fieldDefinitionPayload)
})


test('removeDraftFromState 不发请求，只过滤本地草稿', () => {
  const body = fnBody('removeDraftFromState')
  assert.doesNotMatch(body, /api\.(post|put|patch|del)\(/)
  assert.match(body, /formFields\.value = formFields\.value\.filter\(\(f\) => !isDraftField\(f\)\)/)
})

test('属性自动保存对草稿短路为本地写回，不入队', () => {
  // 自动保存 watcher 对草稿调用 applyEditorToDraft 并 return，不走 upsert/flush
  assert.match(
    source,
    /if \(selectedFieldId\.value === DRAFT_FIELD_ID\) \{\s*applyEditorToDraft\(\);[\s\S]*?return;\s*\}/,
  )
  const body = fnBody('applyEditorToDraft')
  assert.doesNotMatch(body, /api\.(post|put|patch|del)\(/, 'applyEditorToDraft 不应发请求')
  assert.match(body, /formFields\.value = formFields\.value\.map\(\(f\) => \(isDraftField\(f\) \? updated : f\)\)/)
})

test('confirmDiscardDraft 提供保存/丢弃/取消三态', () => {
  const body = fnBody('confirmDiscardDraft')
  assert.match(body, /confirmButtonText: '保存'/)
  assert.match(body, /cancelButtonText: '丢弃'/)
  assert.match(body, /distinguishCancelAndClose: true/)
  assert.match(body, /return await saveDraftField\(\)/)
  assert.match(body, /removeDraftFromState\(\)/)
})

test('切换表单/选字段/新建草稿前都经过草稿确认', () => {
  // 表单切换
  assert.match(fnBody('selectForm'), /if \(hasDraft\.value\) \{[\s\S]*?confirmDiscardDraft\(\)/)
  // 字段点击入口
  const click = fnBody('onSelectFieldClick')
  assert.match(click, /if \(hasDraft\.value\) \{[\s\S]*?confirmDiscardDraft\(\)/)
  assert.match(click, /resolveFieldPropLeave\(\{ actionText: '切换字段' \}\)/)
})

test('切换项目时设计器已激活就必须经过 canLeaveProject 守卫', () => {
  const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')
  assert.match(appSource, /if \(isTabActivated\('designer'\) && formDesignerTabRef\.value\?\.canLeaveProject\) \{[\s\S]*const canLeave = await formDesignerTabRef\.value\.canLeaveProject\(\)[\s\S]*if \(!canLeave\) return/)
})

test('草稿存在时禁止排序', () => {
  assert.match(fnBody('onDrop'), /if \(hasDraft\.value\) return ElMessage\.warning/)
})

test('batchDelete 删除标签字段后回放时可重建被清理的字段定义', () => {
  const body = fnBody('batchDelete')
  assert.match(body, /const shouldReloadDefs = snapshots\.some\(\(item\) => Boolean\(item\.snapshot\.fieldDefinitionPayload\)\)/)
  assert.match(body, /const recreated = await recreateFieldFromSnapshot\(formId, snapshots\[i\]\.snapshot\)/)
  // undo/redo 均复用外层的 shouldReloadDefs，不再在 undo 闭包内重复计算
  assert.match(body, /reloadAfterReplay\(formId, \{ defs: shouldReloadDefs \}\)/)
})

test('模板：草稿态显示顶部保存按钮，草稿行无批量选择框', () => {
  assert.match(source, /v-if="hasDraft"[\s\S]*?data-test="designer-save-draft"[\s\S]*?@click="saveDraftField"/)
  assert.match(source, /<el-checkbox[\s\S]*?v-if="!isDraftField\(ff\)"/)
  assert.match(source, /@click="onSelectFieldClick\(ff\)"/)
})

test('模板：草稿字段在属性面板固定底部动作栏显示保存和取消按钮', () => {
  assert.match(source, /v-else-if="selectedFieldId === DRAFT_FIELD_ID"[\s\S]*?data-test="designer-draft-cancel"[\s\S]*?@click="removeDraftFromState"/)
  assert.match(source, /v-else-if="selectedFieldId === DRAFT_FIELD_ID"[\s\S]*?data-test="designer-draft-save"[\s\S]*?@click="saveDraftField"/)
})

test('组件边界 guard：快编/inline/拖入/log 均对草稿短路', () => {
  // openQuickEdit 草稿早退，避免预览双击触发 PUT /form-fields/__draft__
  assert.match(source, /function openQuickEdit\(ff\) \{\s*if \(isDraftField\(ff\)\) return;/)
  // toggleInline 草稿早退（纵深防御，按钮虽已隐藏）
  assert.match(source, /async function toggleInline\(ff\) \{\s*if \(isDraftField\(ff\)\) return;/)
  // newField / addLogRow 落库前先确认草稿，避免 loadFormFields 覆盖丢失
  assert.match(fnBody('newField'), /if \(hasDraft\.value\) \{[\s\S]*?confirmDiscardDraft\(\)/)
  assert.match(fnBody('addLogRow'), /if \(hasDraft\.value\) \{[\s\S]*?confirmDiscardDraft\(\)/)
})

test('saveDraftField 有 savingDraft 重入保护', () => {
  assert.match(fnBody('saveDraftField'), /if \(savingDraft\.value\) return false/)
})

test('newField 草稿对象形状正确', () => {
  const body = fnBody('newField')
  assert.match(body, /id: DRAFT_FIELD_ID/)
  assert.match(body, /field_definition_id: null/)
  assert.match(body, /order_index: maxOrder \+ 1/)
  assert.match(body, /field_type: '文本'/)
  assert.match(body, /field_definition: \{/)
})

test('键盘空格批量选择对草稿短路', () => {
  assert.match(fnBody('handleFieldKeydown'), /if \(isDraftField\(field\)\) return/)
})

test('字段行不再直接绑定 selectField，统一走草稿守卫入口', () => {
  assert.doesNotMatch(source, /@click="selectField\(ff\)"/)
})
