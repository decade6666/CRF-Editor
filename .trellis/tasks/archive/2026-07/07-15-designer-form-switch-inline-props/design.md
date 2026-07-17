# Design: 设计器下拉切换 + 内联表单属性

## Architecture

全部 UI/状态落在 `FormDesignerTab.vue` 全屏设计器。可选纯函数进 `formDesignerPropertyEditor.js`：

- `buildFormPropState(form)` → `{ name, code, paper_orientation }`
- `sameFormPropState(a, b)` 脏比较

## State model

```
selectedFieldId == null  → 右侧「表单属性」 (editFormProp)
selectedFieldId != null  → 右侧「字段属性」 (editProp)  [现有]
```

新增：

| Symbol | Role |
|--------|------|
| `editFormProp` | reactive 编辑缓冲 `{name, code, paper_orientation}` |
| `formPropBaseline` | 最近保存/同步快照 |
| `isFormPropDirty` | 三字段对比基线 |
| `isSavingFormProp` | 保存 loading |
| `syncFormPropEditor(form)` | 缓冲 = form，基线刷新 |
| `saveFormProp()` | 显式保存 |
| `cancelFormProp()` | 还原缓冲 |
| `resolveFormPropLeave({actionText})` | 三态离开 |
| `persistFormProps({name,code,paper_orientation,targetForm})` | 弹窗+内联共享 PUT 路径 |
| `onSwitchFormFromDropdown(id)` | 下拉 change → selectForm |
| `onCanvasBlankClick(event)` | 空白取消字段选中 |

## Data flow

### 切换表单
`el-select @change(id)` → `onSwitchFormFromDropdown` → `selectForm(next)`  
`selectForm` 既有链：draft → annotation flush → notes flush → **field prop leave** → **form prop leave（新增）** → 赋值  
成功后 `syncFormPropEditor(selectedForm)`（watch `selectedForm.id` 或在 selectForm 末尾调用）。

### 保存表单属性
`saveFormProp` → `persistFormProps`：
1. OID `isValidOptionalOid`
2. name 非空
3. GET references → 影响确认
4. portrait + needsLandscape 警告
5. PUT `/api/forms/{id}`
6. `reloadForms()`（Object.assign identity）
7. `syncFormPropEditor(selectedForm)`

弹窗 `updateForm` 改为调用同一 `persistFormProps`，成功后关弹窗。

### 空白点击
`.fd-canvas-list.designer-field-list @click="onCanvasBlankClick"`  
若 `event.target.closest('.ff-item')` 则 return；否则 `resolveFieldPropLeave` + draft 守卫 → `selectedFieldId=null` +（可选）`syncFormPropEditor`。

## Leave order

`resolveDesignerLeave` / `selectForm`：

1. busy / reorder / savingDraft 拦截  
2. draft  
3. annotation / design-notes flush  
4. `resolveFieldPropLeave`  
5. `resolveFormPropLeave`  

## UI

### Header
```html
<span class="designer-dialog-title-prefix">设计：</span>
<el-select
  data-test="designer-form-switch"
  :model-value="selectedForm?.id"
  filterable
  @change="onSwitchFormFromDropdown"
>
  <el-option v-for="f in filteredForms" :key="f.id" :label="f.name" :value="f.id" />
</el-select>
```

### Side pane (no field selected)
表单属性 el-form + 保存/取消，`data-test="designer-form-property-*"`。

## Compatibility

- 后端零变更
- 左侧弹窗保留
- history clear on form id change 已有，不改
