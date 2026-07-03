import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fieldsSource = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')

// Bug 1: 序号列显示 order_index（含被隐藏的标签/日志行字段），而快速编辑框用的是
// visibleFields 的位置（renderedIndex + 1）。两者基准不一致会让编辑框比显示值小 N
// （N = 该行之前被隐藏的结构性字段数）。显示列必须改用可见列表位置。
test('FieldsTab 序号 cell renders visible-list position, not raw order_index', () => {
  // 序号列的双击输入与 :max 都基于 visibleFields，显示也必须基于同一基准。
  assert.match(fieldsSource, /label="序号"[\s\S]*?#default="\{ row, \$index \}"/)
  assert.match(fieldsSource, /<span class="ordinal-cell">\{\{ \$index \+ 1 \}\}<\/span>/)
  // 不得再用 order_index 数据字段作为序号显示，否则与编辑框/reorder 基准偏移。
  assert.doesNotMatch(fieldsSource, /<span class="ordinal-cell">\{\{ row\.order_index \}\}<\/span>/)
  // 输入上限与显示基准一致（可见列表长度）。
  assert.match(fieldsSource, /:max="visibleFields\.length"/)
})

// Bug 2: openEdit 用 { ...f } 把 order_index 灌进 editProp；快速编辑改动序号后，
// editProp.order_index 变成旧值，属性保存 PUT { ...editProp } 会带着旧 order_index
// 触发后端 OrderService.move_to，把刚改好的序号回退。editProp 必须只保留可编辑属性。
test('FieldsTab property editor never carries order_index into the field payload', () => {
  // 可编辑键集合不含排序/身份字段。
  assert.match(fieldsSource, /const EDITABLE_PROP_KEYS = \[/)
  const keysBlock = fieldsSource.match(/const EDITABLE_PROP_KEYS = \[([\s\S]*?)\]/)
  assert.ok(keysBlock, 'EDITABLE_PROP_KEYS 应存在')
  assert.doesNotMatch(keysBlock[1], /order_index|'id'|project_id/)

  // openEdit 及保存后的回填都必须经过 pickEditableProps，避免把整行字段（含 order_index）灌入。
  assert.match(fieldsSource, /function openEdit\(f\) \{ resetProp\(pickEditableProps\(f\)\)/)
  assert.doesNotMatch(fieldsSource, /resetProp\(\{ \.\.\.f \}\)/)
  assert.doesNotMatch(fieldsSource, /resetProp\(\{ \.\.\.latest \}\)/)

  // pickEditableProps 只挑白名单键。
  assert.match(fieldsSource, /function pickEditableProps\(source\)/)
})
