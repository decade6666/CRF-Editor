import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const codelistsSource = readFileSync(path.resolve(currentDir, '../src/components/CodelistsTab.vue'), 'utf8');
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8');
const fieldsSource = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8');
const formsSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8');
const mainCssSource = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8');
const sortableSource = readFileSync(path.resolve(currentDir, '../src/composables/useSortableTable.js'), 'utf8');

function extractBlockAfter(source, needle) {
  const start = source.indexOf(needle);
  assert.notEqual(start, -1, `should locate ${needle}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }
  assert.fail(`${needle} should have a complete body`);
}

test('CodelistsTab wires left list drag sorting through useSortableTable', () => {
  assert.match(codelistsSource, /const codelistsTableRef = ref\(null\)/);
  assert.match(
    codelistsSource,
    /const codelistsReorderUrl = computed\(\(\) => `\/api\/projects\/\$\{props\.projectId\}\/codelists\/reorder`\)/,
  );
  assert.match(codelistsSource, /useSortableTable\(/);
  assert.match(codelistsSource, /ref="codelistsTableRef"/);
  assert.match(codelistsSource, /<el-table-column width="32" v-if="!isCodelistsFiltered">/);
});

test('CodelistsTab wires option list drag sorting through useSortableTable', () => {
  assert.match(codelistsSource, /const optionsTableRef = ref\(null\)/);
  assert.match(codelistsSource, /const isOptionsFiltered = computed\(\(\) => searchOpt\.value\.trim\(\)\.length > 0\)/);
  assert.match(
    codelistsSource,
    /const optionsReorderUrl = computed\(\(\) => selected\.value \? `\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{selected\.value\.id\}\/options\/reorder` : ''\)/,
  );
  assert.match(codelistsSource, /useSortableTable\(\s*optionsTableRef,\s*optionSourceList,\s*optionsReorderUrl,/s);
  assert.match(codelistsSource, /renderList: visibleOptions/);
  assert.match(codelistsSource, /ref="optionsTableRef"/);
  assert.match(codelistsSource, /<el-table-column width="32" v-if="!isOptionsFiltered">/);
});

test('VisitsTab wires visit form drag sorting through useSortableTable', () => {
  assert.doesNotMatch(visitsSource, /import draggable from 'vuedraggable'/);
  assert.match(visitsSource, /const visitFormsTableRef = ref\(null\)/);
  assert.match(
    visitsSource,
    /const visitFormReorderUrl = computed\(\(\) => selectedVisit\.value \? `\/api\/visits\/\$\{selectedVisit\.value\.id\}\/forms\/reorder` : ''\)/,
  );
  assert.match(
    visitsSource,
    /const \{ initSortable: initVisitFormsSortable \} = useSortableTable\(visitFormsTableRef, visitForms, visitFormReorderUrl,/,
  );
  assert.match(
    visitsSource,
    /watch\(\[selectedVisit, visitForms\], \(\) => \{\s*nextTick\(\(\) => initVisitFormsSortable\(\)\)\s*\}\)/,
  );
  assert.match(visitsSource, /ref="visitFormsTableRef"/);
  assert.match(
    visitsSource,
    /<el-table[\s\S]*:data="visitForms"[\s\S]*border[\s\S]*highlight-current-row[\s\S]*row-key="id"/,
  );
  assert.doesNotMatch(visitsSource, /<draggable v-else v-model="visitForms"/);
});

// ===== Task 2.3: FieldsTab 排序一致性 =====

test('FieldsTab wires drag sorting through useSortableTable with isFiltered option', () => {
  // 使用 useSortableTable 并传入 isFiltered
  assert.match(fieldsSource, /const isFiltered = computed\(\(\) => searchField\.value\.trim\(\)\.length > 0\)/);
  assert.match(
    fieldsSource,
    /const reorderUrl = computed\(\(\) => `\/api\/projects\/\$\{props\.projectId\}\/field-definitions\/reorder`\)/,
  );
  assert.match(fieldsSource, /useSortableTable\(fieldsTableRef, fields, reorderUrl/);
  assert.match(fieldsSource, /isFiltered/);
});

test('FieldsTab drag handle is hidden when filtered', () => {
  // 拖拽手柄列在过滤态下隐藏
  assert.match(fieldsSource, /<el-table-column width="32" v-if="!isFiltered">/);
});

test('FieldsTab keeps field list sorted by order_index after reload', () => {
  assert.match(fieldsSource, /const orderedFields = \[\.\.\.fields\.value\]\.sort\(/);
  assert.match(fieldsSource, /const orderA = a\?\.order_index \?\? Number\.MAX_SAFE_INTEGER/);
  assert.match(fieldsSource, /return \(a\?\.id \?\? 0\) - \(b\?\.id \?\? 0\)/);
  assert.match(
    fieldsSource,
    /<el-table ref="fieldsTableRef" :data="visibleFields" size="small" border height="100%" row-key="id"/,
  );
});

test('FieldsTab ordinal column wires double-click quick edit through useOrdinalQuickEdit', () => {
  assert.match(fieldsSource, /import \{ useOrdinalQuickEdit \} from '\.\.\/composables\/useOrdinalQuickEdit'/);
  assert.match(fieldsSource, /startEdit: startFieldOrdinalEdit/);
  assert.match(fieldsSource, /@dblclick\.stop="startFieldOrdinalEdit\(row\)"/);
  assert.match(fieldsSource, /v-if="editingFieldId === row\.id"/);
  assert.match(fieldsSource, /@keyup\.enter\.stop="commitFieldOrdinalEdit"/);
  assert.match(fieldsSource, /@keydown\.esc\.stop\.prevent="cancelFieldOrdinalEdit"/);
  assert.match(fieldsSource, /@blur="cancelFieldOrdinalEdit"/);
});

test('FieldsTab has no imperative updateOrder handler after R1', () => {
  // R1：updateOrder handler 删除，排序只保留 drag-end 路径
  assert.doesNotMatch(fieldsSource, /async function updateOrder\(row, newValue\)/);
  assert.match(fieldsSource, /\/api\/projects\/\$\{props\.projectId\}\/field-definitions\/reorder/);
});

// ===== Task 2.3: FormDesignerTab 排序一致性 =====

test('FormDesignerTab wires form drag sorting through useSortableTable with isFiltered option', () => {
  // 使用 useSortableTable 并传入 isFormsFiltered（多变量可能合并在一行）
  assert.match(formsSource, /isFormsFiltered = computed\(\(\) => searchForm\.value\.trim\(\)\.length > 0\)/);
  assert.match(
    formsSource,
    /formsReorderUrl = computed\(\(\) => `\/api\/projects\/\$\{props\.projectId\}\/forms\/reorder`\)/,
  );
  assert.match(formsSource, /useSortableTable\(formsTableRef, forms, formsReorderUrl/);
  assert.match(formsSource, /isFiltered: isFormsFiltered/);
});

test('FormDesignerTab drag handle is hidden only when filtered after R3 brief-mode unlock', () => {
  // R3：editMode 门禁移除，拖拽把手列仅依赖过滤态
  assert.match(formsSource, /<el-table-column v-if="!isFormsFiltered" width="32"[\s\S]*?<span class="drag-handle"/);
  assert.doesNotMatch(formsSource, /<el-table-column width="32" v-if="editMode && !isFormsFiltered">/);
});

test('FormDesignerTab keeps form list sorted by order_index after reload', () => {
  assert.match(formsSource, /const orderedForms = \[\.\.\.forms\.value\]\.sort\(/);
  assert.match(formsSource, /const selectedFormId = selectedForm\.value\?\.id \?\? null/);
  assert.match(formsSource, /selectedForm\.value = forms\.value\.find\(\(f\) => f\.id === selectedFormId\) \|\| null/);
  assert.match(formsSource, /ref="formsTableRef"/);
  assert.match(formsSource, /:data="filteredForms"/);
  assert.match(formsSource, /highlight-current-row/);
  assert.match(formsSource, /row-key="id"/);
});

test('FormDesignerTab form order column wires double-click quick edit through useOrdinalQuickEdit', () => {
  assert.match(formsSource, /import \{ useOrdinalQuickEdit \} from '\.\.\/composables\/useOrdinalQuickEdit'/);
  assert.match(formsSource, /startEdit: startFormOrdinalEdit/);
  assert.match(formsSource, /@dblclick\.stop="startFormOrdinalEdit\(row\)"/);
  assert.match(formsSource, /v-if="editingFormId === row\.id"/);
  assert.match(formsSource, /@keyup\.enter\.stop="commitFormOrdinalEdit"/);
  assert.match(formsSource, /@keydown\.esc\.stop\.prevent="cancelFormOrdinalEdit"/);
  assert.match(formsSource, /@blur="cancelFormOrdinalEdit"/);
});

test('FormDesignerTab has no imperative updateFormOrder handler after R1', () => {
  // R1：updateFormOrder handler 删除，排序只保留 drag-end 路径
  assert.doesNotMatch(formsSource, /async function updateFormOrder\(row, newValue\)/);
  assert.match(formsSource, /\/api\/projects\/\$\{props\.projectId\}\/forms\/reorder/);
});

test('FormDesignerTab field reorder dragover advertises a move drop target for the whole row', () => {
  const onDragOverBody = extractBlockAfter(formsSource, 'function onDragOver(');
  assert.match(onDragOverBody, /e\.preventDefault\(\)/);
  assert.match(onDragOverBody, /e\.dataTransfer\.dropEffect = 'move'/);
  assert.match(formsSource, /@dragover\.prevent="onDragOver\(\$event, idx\)"/);
  assert.match(formsSource, /function onDragStart\(ff, e\)/);
  assert.match(formsSource, /if \(designerHistory\.busy\.value \|\| isReordering\.value\) \{/);
  assert.match(formsSource, /e\.dataTransfer\.effectAllowed = 'move'/);
  assert.match(formsSource, /<el-checkbox[\s\S]*?draggable="false"[\s\S]*?@click\.stop/);
  assert.match(formsSource, /data-test="designer-copy-field"[\s\S]*?draggable="false"[\s\S]*?@click\.stop="copyFormField\(ff\)"/);
  assert.match(formsSource, /data-test="designer-delete-field"[\s\S]*?draggable="false"[\s\S]*?@click\.stop="removeField\(ff\)"/);
});

test('FormDesignerTab field reorder keeps optimistic order on success and reloads only after failure', () => {
  // R1 删除了 updateFormFieldOrder 手动路径；仅剩 onDrop + keyboard move 两条路径
  // G1：成功路径不再二次 loadFormFields 覆盖乐观顺序；失败时回滚本地顺序并刷新。
  assert.match(formsSource, /async function onDrop\(/);
  assert.match(formsSource, /const move = async \(from, to\) => \{/);
  assert.match(formsSource, /const isReordering = ref\(false\)/);
  assert.match(formsSource, /async function persistFieldReorder\(historyContext, previousFields, normalized\)/);
  assert.match(formsSource, /if \(isReordering\.value\) return false/);
  assert.match(formsSource, /isReordering\.value = true/);
  assert.match(formsSource, /\/api\/forms\/\$\{formId\}\/fields\/reorder/);
  assert.match(formsSource, /const nextOrder = normalized\.map\(\(f\) => f\.id\)/);
  assert.match(formsSource, /api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\)/);
  assert.match(formsSource, /if \(isCurrentDesignerHistoryContext\(historyContext\)\) \{[\s\S]*?formFields\.value = previousFields[\s\S]*?loadFormFields\(\)/);
  assert.match(formsSource, /finally \{[\s\S]*?isReordering\.value = false/);
  assert.match(formsSource, /if \(designerHistory\.busy\.value \|\| isReordering\.value\) return/);
  assert.match(formsSource, /if \(ctrlKey && \(designerHistory\.busy\.value \|\| isReordering\.value\)\) return/);
  assert.match(formsSource, /:draggable="!designerHistory\.busy\.value && !isReordering"/);
  assert.match(mainCssSource, /\.ff-item \{[^}]*user-select: none;[^}]*-webkit-user-select: none;/);
  assert.doesNotMatch(formsSource, /async function updateFormFieldOrder/);
  const persistBody = extractBlockAfter(formsSource, 'async function persistFieldReorder(');
  const successBranch = persistBody.slice(0, persistBody.indexOf('} catch'));
  assert.doesNotMatch(successBranch, /loadFormFields\(/);
  const dropBody = extractBlockAfter(formsSource, 'async function onDrop(');
  const moveBody = extractBlockAfter(formsSource, 'const move = async (from, to) =>');
  assert.doesNotMatch(dropBody, /await loadFormFields\(/);
  assert.doesNotMatch(moveBody, /await loadFormFields\(/);
  const reorderRecordCalls =
    (formsSource.match(/recordReorderHistory\(historyContext, previousOrder, nextOrder\);/g) || []).length;
  assert.equal(reorderRecordCalls, 1);
});

test('FormDesignerTab keeps designer entry visible for selected form outside edit mode gate', () => {
  assert.match(
    formsSource,
    /<el-button v-if="selectedForm" size="small" type="primary" @click="openDesigner">设计表单<\/el-button>/,
  );
  assert.doesNotMatch(
    formsSource,
    /<el-button v-if="editMode && selectedForm" size="small" type="primary" @click="openDesigner">设计表单<\/el-button>/,
  );
  // R3：新建表单按钮不再被 editMode 门禁包裹
  assert.match(formsSource, /<el-button type="primary" size="small" @click="openAddForm">新建表单<\/el-button>/);
  assert.doesNotMatch(
    formsSource,
    /<el-button v-if="editMode" type="primary" size="small" @click="openAddForm">新建表单<\/el-button>/,
  );
});

test('FormDesignerTab unlocks all editing surfaces after R3 brief-mode unlock', () => {
  // R3：以下门禁全部移除，简要模式也可用
  assert.doesNotMatch(
    formsSource,
    /<el-button v-if="editMode" type="danger" size="small" :disabled="!selForms\.length" @click="batchDelForms"/,
  );
  assert.match(formsSource, /批量删除\(\{\{ selForms\.length \}\}\)/);
  assert.doesNotMatch(formsSource, /<el-table-column width="32" v-if="editMode && !isFormsFiltered">/);
  assert.doesNotMatch(formsSource, /<el-table-column type="selection" width="40" v-if="editMode" \/>/);
  assert.doesNotMatch(formsSource, /<el-table-column v-if="editMode" label="操作" width="150" fixed="right">/);
  assert.doesNotMatch(formsSource, /designer-shell--readonly/);
  assert.doesNotMatch(formsSource, /<div v-if="editMode" class="fd-library designer-library-pane"/);
  assert.match(formsSource, /class="fd-library designer-library-pane"/);
  assert.doesNotMatch(formsSource, /<div v-if="editMode" class="fd-panel-resizer"/);
  assert.match(formsSource, /class="fd-panel-resizer"/);
  assert.match(formsSource, /aria-label="调整字段库宽度"/);
  assert.doesNotMatch(formsSource, /:draggable="editMode"/);
  assert.match(formsSource, /:draggable="!designerHistory\.busy\.value && !isReordering"/);
  assert.doesNotMatch(formsSource, /<el-checkbox v-if="editMode" v-model="selectedIds"/);
  assert.doesNotMatch(formsSource, /<el-tooltip v-if="editMode && canToggleInline\(ff\)"/);
  assert.match(formsSource, /<el-tooltip v-if="canToggleInline\(ff\) && !isDraftField\(ff\)"/);
  assert.doesNotMatch(
    formsSource,
    /<el-button v-if="editMode" type="danger" size="small" link @click\.stop="removeField\(ff\)"/,
  );
  assert.match(
    formsSource,
    /data-test="designer-delete-field"[\s\S]*?@click\.stop="removeField\(ff\)"[\s\S]*?>删除<\/el-button/,
  );
  assert.doesNotMatch(formsSource, /<div v-else-if="!editMode" class="designer-empty-state">简要模式下仅支持预览/);
  assert.doesNotMatch(formsSource, /<div v-if="!editMode" class="designer-notes-readonly">/);
  // 脚本端：所有函数首行的 !editMode.value 守卫清零
  assert.doesNotMatch(formsSource, /if \(!editMode\.value\) return/);
  assert.doesNotMatch(formsSource, /if \(!editMode\.value \|\|/);
});

test('FormDesignerTab designer dialog uses center-bottom preview and right-side notes layout', () => {
  assert.match(formsSource, /const designerVisibleFields = computed\(\(\) => \{/);
  assert.match(formsSource, /_displayOrder: index \+ 1/);
  assert.match(formsSource, /v-for="\(ff, idx\) in designerVisibleFields"/);
  // R1：_displayOrder 由 ordinal-cell span 展示
  assert.match(formsSource, /class="ordinal-cell"/);
  assert.match(formsSource, /ff\._displayOrder/);
  assert.match(
    formsSource,
    /<el-dialog[\s\S]*v-model="showDesigner"[\s\S]*:before-close="handleDesignerBeforeClose"[\s\S]*:close-on-click-modal="false"[\s\S]*fullscreen[\s\S]*class="designer-dialog"[\s\S]*>[\s\S]*<template #header="\{ titleId, titleClass \}">[\s\S]*:id="titleId"[\s\S]*:class="\[titleClass, 'designer-dialog-title'\]"[\s\S]*设计：\{\{ selectedForm\?\.name \|\| '' \}\}[\s\S]*<\/template>/,
  );
  assert.match(formsSource, /\.designer-dialog-header \{[\s\S]*padding-right: 32px;[\s\S]*\}/);
  assert.match(formsSource, /class="designer-shell"/);
  assert.match(formsSource, /class="designer-workspace"/);
  assert.match(formsSource, /class="designer-workspace-top"/);
  assert.match(formsSource, /class="designer-workspace-bottom"/);
  assert.match(formsSource, /class="designer-preview-pane"/);
  assert.match(formsSource, /class="designer-side-pane"/);
  assert.match(formsSource, /class="designer-editor-card"/);
  assert.match(formsSource, /class="designer-notes-card"/);
  assert.match(formsSource, /width: propWidth \+ 'px'/);
  assert.doesNotMatch(formsSource, /class="designer-side-pane"[\s\S]*class="designer-preview-pane"/);
  assert.doesNotMatch(formsSource, /designer-editor-stack/);
  assert.doesNotMatch(formsSource, /const designerHasPreviewNotes = computed\(\(\) => false\)/);
  assert.match(formsSource, /const previewPaneWidth = 460/);
  assert.match(
    formsSource,
    /<style>[\s\S]*\.designer-dialog \.el-dialog__body \{[\s\S]*height: calc\(100vh - 54px\);[\s\S]*overflow: hidden;[\s\S]*<\/style>/,
  );
  assert.doesNotMatch(formsSource, /\.designer-dialog :deep\(\.el-dialog__body\)/);
  assert.match(formsSource, /grid-template-columns: auto 4px minmax\(320px, 1fr\) 460px;/);
  assert.match(formsSource, /\.designer-shell \{[\s\S]*grid-template-rows: minmax\(0, 1fr\);[\s\S]*overflow: hidden;/);
  assert.match(
    formsSource,
    /\.designer-library-pane \{[\s\S]*min-height: 0;[\s\S]*height: 100%;[\s\S]*overflow: hidden;/,
  );
  assert.match(formsSource, /\.fd-library \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;/);
  assert.match(formsSource, /\.fd-library-list \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;/);
  assert.match(formsSource, /\.designer-workspace \{[\s\S]*row-gap: 0;/);
  assert.match(formsSource, /gridTemplateRows: workspaceRows/);
  assert.match(formsSource, /\.designer-workspace-bottom \{[\s\S]*display: flex;[\s\S]*overflow: hidden;[\s\S]*min-height: 200px;/);
  assert.match(formsSource, /\.designer-side-pane \{[\s\S]*row-gap: 0;/);
  assert.match(formsSource, /gridTemplateRows: sideRows/);
  assert.match(formsSource, /width: 56px; margin-left: 2px/);
  assert.match(formsSource, /\.ff-item \{/);
  assert.match(formsSource, /display: flex;/);
  assert.match(formsSource, /align-items: center;/);
  assert.match(formsSource, /gap: 6px;/);
  assert.match(formsSource, /cursor: pointer;/);
  assert.match(formsSource, /data-test="designer-canvas-notes-summary"/);
  assert.doesNotMatch(formsSource, /@mousedown="startPropResize"/);
  assert.doesNotMatch(formsSource, /function startPropResize\(/);
});

// ===== useSortableTable 契约验证 =====

test('useSortableTable disables Sortable when isFiltered is true', () => {
  // Sortable 初始化时禁用态基于 isFiltered
  assert.match(sortableSource, /disabled: unref\(isFiltered\) || false/);
});

test('useSortableTable watches isFiltered to toggle disabled state', () => {
  // 监听 isFiltered 变化动态切换禁用态
  assert.match(sortableSource, /watch\(\(\) => unref\(isFiltered\)/);
  assert.match(sortableSource, /instance\.option\('disabled', disabled\)/);
});

test('useSortableTable onEnd posts to reorder API', () => {
  // 拖拽结束提交 reorder
  assert.match(sortableSource, /await api\.post\(unref\(reorderUrl\)/);
});

test('useSortableTable recalculates order_index after drag', () => {
  // 拖拽后重算连续序号 - 注意实际代码格式
  assert.match(sortableSource, /arr\.forEach\(\(it, i\) => \{ it\.order_index = i \+ 1 \}\)/);
});

test('useSortableTable reloads after reorder to align with backend truth', () => {
  // reorder 后 reload 对齐后端真值
  assert.match(sortableSource, /if \(reloadFn\) await reloadFn/);
});

test('FormDesignerTab keeps main preview and designer preview resizers scoped separately', () => {
  assert.match(formsSource, /function getResizer\(kind, colCount, groupIndex, group, scope = 'main'\)/);
  assert.match(formsSource, /const mapKey = `\$\{scope\}:\$\{kind\}:\$\{colCount\}:\$\{tableInstanceId\}`/);
  // 预览模板遍历派生视图模型 gv（与原始 renderGroups/designerRenderGroups 等价），
  // 主预览与设计器预览仍分别传入 'main' / 'designer' 作用域，保持 resizer 隔离。
  assert.match(formsSource, /getResizer\('normal', 2, gi, gv, 'main'\)/);
  assert.match(formsSource, /getResizer\('normal', 2, gi, gv, 'designer'\)/);
  assert.match(formsSource, /getResizer\('inline', gv\.fields\.length, gi, gv, 'main'\)/);
  assert.match(formsSource, /getResizer\('inline', gv\.fields\.length, gi, gv, 'designer'\)/);
});
