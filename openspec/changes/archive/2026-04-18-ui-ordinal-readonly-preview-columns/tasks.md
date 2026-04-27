# Tasks: UI 序号只读化 / 访视预览下线 / 简要模式解锁 / Word 导出增强 / 预览列宽可调

> 零决策粒度；checkbox 格式；每条任务标注 file:line + 精确 token 变化。
> 并行轨道：A（后端 R4）、B（前端 R1/R2/R3 FormDesignerTab）、C（前端 R5 依赖 B 内 R3）。

## R1 — 列表序号只读化

- [x] 1.1 `frontend/src/components/UnitsTab.vue:127` — 将 `<el-input-number :model-value="element.order_index" @change="v => updateOrder(element, v)" ... />` 替换为 `<span class="ordinal-cell">{{ element.order_index }}</span>`
- [x] 1.2 `frontend/src/components/CodelistsTab.vue:266` — 将 `<el-input-number :model-value="row.order_index ?? ($index + 1)" @change="v => updateClOrder(row, v, $index + 1)" ... />` 替换为 `<span class="ordinal-cell">{{ row.order_index ?? ($index + 1) }}</span>`
- [x] 1.3 `frontend/src/components/CodelistsTab.vue:322` — 将 `<el-input-number :model-value="element.order_index ?? (index + 1)" @change="v => updateOptOrder(element, v, index + 1)" ... />` 替换为 `<span class="ordinal-cell">{{ element.order_index ?? (index + 1) }}</span>`
- [x] 1.4 `frontend/src/components/VisitsTab.vue:376` — 将访视列表 `<el-input-number :model-value="row.sequence" @change="v => updateSequence(row, v)" ... />` 替换为 `<span class="ordinal-cell">{{ row.sequence }}</span>`
- [x] 1.5 `frontend/src/components/VisitsTab.vue:420` — 将访视内表单 `<el-input-number :model-value="f.sequence" @change="v => updateFormSequence(f.id, v)" ... />` 替换为 `<span class="ordinal-cell">{{ f.sequence }}</span>`
- [x] 1.6 `frontend/src/components/FormDesignerTab.vue:1162` — 将表单列表 `<el-input-number :model-value="row.order_index" @change="v => updateFormOrder(row, v)" ... :disabled="isFormsFiltered || !editMode" ... />` 替换为 `<span class="ordinal-cell">{{ row.order_index }}</span>`
- [x] 1.7 `frontend/src/components/FormDesignerTab.vue:1237` — 将字段实例 `<el-input-number :model-value="ff._displayOrder" @change="v => updateFormFieldOrder(ff, v)" ... />` 替换为 `<span class="ordinal-cell">{{ ff._displayOrder }}</span>`
- [x] 1.8 `frontend/src/components/FieldsTab.vue:203` — 将字段定义 `<el-input-number :model-value="row.order_index" @change="v => updateOrder(row, v)" ... />` 替换为 `<span class="ordinal-cell">{{ row.order_index }}</span>`
- [x] 1.9 新增全局/本地 CSS `.ordinal-cell { display:inline-block; width:80px; text-align:center; color:var(--color-text-secondary); font-variant-numeric:tabular-nums; }`
- [x] 1.10 删除已无引用的 handler：`UnitsTab.updateOrder`、`CodelistsTab.updateClOrder`、`CodelistsTab.updateOptOrder`、`VisitsTab.updateSequence`、`VisitsTab.updateFormSequence`、`FormDesignerTab.updateFormOrder`、`FormDesignerTab.updateFormFieldOrder`、`FieldsTab.updateOrder`（保留拖拽 drag-end 路径）
- [x] 1.11 Grep 校验：`grep -rn "updateOrder\|updateSequence\|updateClOrder\|updateOptOrder\|updateFormOrder\|updateFormFieldOrder\|updateFormSequence" frontend/src` 只剩拖拽 drag-end 调用

## R2 — 访视预览按钮与弹窗下线

- [x] 2.1 `frontend/src/components/VisitsTab.vue:31` — 删除 `const showVisitPreview = ref(false)`
- [x] 2.2 `frontend/src/components/VisitsTab.vue:396` — 删除 `<el-button ... @click="showVisitPreview = true" ...>预览</el-button>`
- [x] 2.3 `frontend/src/components/VisitsTab.vue:436-446` — 删除 `<el-dialog v-model="showVisitPreview" ...>` 整段
- [x] 2.4 保留 `previewRenderGroups`（259）、`previewNeedsLandscape`（278）、`previewLandscapeMode`（281）、`formPreviewTitle`（34）——per-row 表单预览 `showFormPreview`（514）仍在使用
- [x] 2.5 保留 `showPreview`（29）——访视矩阵批量预览（448）仍在使用
- [x] 2.6 Grep 校验：`grep -n "showVisitPreview" frontend/src/components/VisitsTab.vue` 无输出

## R3 — 简要模式解锁 FormDesignerTab

- [x] 3.1 `frontend/src/components/FormDesignerTab.vue:108` — 删除 `if (!editMode.value) return`
- [x] 3.2 `frontend/src/components/FormDesignerTab.vue:119` — 删除 `if (!editMode.value) return`
- [x] 3.3 `frontend/src/components/FormDesignerTab.vue:140` — 删除 `if (!editMode.value) return`
- [x] 3.4 `frontend/src/components/FormDesignerTab.vue:160` — 删除 `if (!editMode.value) return`
- [x] 3.5 `frontend/src/components/FormDesignerTab.vue:166` — 改 `if (!editMode.value || newValue == null || newValue === row.order_index) return` 为 `if (newValue == null || newValue === row.order_index) return`
- [x] 3.6 `frontend/src/components/FormDesignerTab.vue:183` — 删除 `if (!editMode.value) return`
- [x] 3.7 `frontend/src/components/FormDesignerTab.vue:189` — 删除 `if (!editMode.value) return`
- [x] 3.8 `frontend/src/components/FormDesignerTab.vue:212` — 删除 `if (!editMode.value) return`
- [x] 3.9 `frontend/src/components/FormDesignerTab.vue:219` — 改 `if (!editMode.value || deletingFieldIds.value.has(ff.id)) return` 为 `if (deletingFieldIds.value.has(ff.id)) return`
- [x] 3.10 `frontend/src/components/FormDesignerTab.vue:236` — 改 `if (!editMode.value || !selectedIds.value.length) return` 为 `if (!selectedIds.value.length) return`
- [x] 3.11 `frontend/src/components/FormDesignerTab.vue:251` — 删除 `if (!editMode.value) return`
- [x] 3.12 `frontend/src/components/FormDesignerTab.vue:275` — 删除 `if (!editMode.value) return`
- [x] 3.13 `frontend/src/components/FormDesignerTab.vue:297` — 删除 `if (!editMode.value) return`
- [x] 3.14 `frontend/src/components/FormDesignerTab.vue:621` — 删除 `if (!editMode.value) return`
- [x] 3.15 `frontend/src/components/FormDesignerTab.vue:634` — 改 `if (!editMode.value || !quickEditField.value) return` 为 `if (!quickEditField.value) return`
- [x] 3.16 `frontend/src/components/FormDesignerTab.vue:657` — 改 `if (!editMode.value || !selectedForm.value || !canToggleInline(ff)) return` 为 `if (!selectedForm.value || !canToggleInline(ff)) return`
- [x] 3.17 `frontend/src/components/FormDesignerTab.vue:966` — 改 `if (!editMode.value || !selectedForm.value) return` 为 `if (!selectedForm.value) return`
- [x] 3.18 `frontend/src/components/FormDesignerTab.vue:977` — 改 `if (!editMode.value || !selectedForm.value) return` 为 `if (!selectedForm.value) return`
- [x] 3.19 `frontend/src/components/FormDesignerTab.vue:1154` — 删除 `<el-button v-if="editMode" ...>新建表单</el-button>` 的 `v-if="editMode"`
- [x] 3.20 `frontend/src/components/FormDesignerTab.vue:1155` — 删除 `<el-button v-if="editMode" ...>批量删除</el-button>` 的 `v-if="editMode"`
- [x] 3.21 `frontend/src/components/FormDesignerTab.vue:1159` — 将 `v-if="editMode && !isFormsFiltered"` 改为 `v-if="!isFormsFiltered"`
- [x] 3.22 `frontend/src/components/FormDesignerTab.vue:1160` — 删除 selection 列的 `v-if="editMode"`
- [x] 3.23 `frontend/src/components/FormDesignerTab.vue:1165` — 删除操作列的 `v-if="editMode"`
- [x] 3.24 `frontend/src/components/FormDesignerTab.vue:1225` — 删除 fd-library 的 `v-if="editMode"`
- [x] 3.25 `frontend/src/components/FormDesignerTab.vue:1230` — 删除 panel-resizer 的 `v-if="editMode"`
- [x] 3.26 `frontend/src/components/FormDesignerTab.vue:1280` — 删除 `<div v-else-if="!editMode" class="designer-empty-state">简要模式下仅支持预览...</div>` 整行
- [x] 3.27 `frontend/src/components/FormDesignerTab.vue:1372` — 删除 `<div v-if="!editMode" class="designer-notes-readonly">...简要模式下仅支持预览...</div>` 整行
- [x] 3.28 Grep 校验：`grep -n "!editMode\\.value\\|v-if=\"editMode\"\\|:disabled=\"!editMode\"\\|:draggable=\"editMode\"" frontend/src/components/FormDesignerTab.vue` 剩余引用仅限 App 层协同（本文件应为 0 条）
- [x] 3.29 保留 `frontend/src/components/FormDesignerTab.vue:19` 的 `const editMode = inject('editMode', ref(false))`（App.vue Tab 守卫仍使用同一 provide）
- [ ] 3.30 手动验证：关闭 App.vue 完整模式开关 → FormDesignerTab 所有操作仍可用

## R4 — Word 导出增强

- [x] 4.1 `backend/src/services/export_service.py:773` — 修改 `_add_visit_flow_diagram` 中 `sorted_visits = sorted(project.visits, key=lambda v: v.sequence)` 为 `sorted_visits = sorted(project.visits, key=lambda v: (v.sequence, v.id))`
- [x] 4.2 `backend/src/services/export_service.py:783` 后插入 tblHeader 注入块（find-or-append，不替换 trPr）：
  ```python
  header_tr = table.rows[0]._tr
  tr_pr = header_tr.trPr
  if tr_pr is None:
      tr_pr = OxmlElement('w:trPr')
      header_tr.insert(0, tr_pr)
  tbl_header = tr_pr.find(qn('w:tblHeader'))
  if tbl_header is None:
      tbl_header = OxmlElement('w:tblHeader')
      tr_pr.append(tbl_header)
  tbl_header.set(qn('w:val'), 'true')
  ```
- [x] 4.3 `backend/src/services/export_service.py:885` 后插入反向索引构建：
  ```python
  sorted_visits = sorted(project.visits, key=lambda v: (v.sequence, v.id))
  form_to_visits = {}
  for visit in sorted_visits:
      for visit_form in visit.visit_forms:
          form_to_visits.setdefault(visit_form.form_id, []).append(visit)
  ```
- [x] 4.4 `backend/src/services/export_service.py:914` — unified 路径插入 footer 调用（早于 `917` 的 portrait section 切回）：`self._add_applicable_visits_paragraph(doc, form_to_visits.get(form.id, []))`
- [x] 4.5 `backend/src/services/export_service.py:979` — legacy 路径 form 最后一张主体表之后、`985` 分页符之前插入相同 helper 调用
- [x] 4.6 `backend/src/services/export_service.py:991` 前新增 helper：
  ```python
  def _add_applicable_visits_paragraph(self, doc, visits):
      if not visits:
          return
      para = doc.add_paragraph(style='ApplicableVisits')
      prefix_run = para.add_run('适用访视：')
      self._set_run_font(prefix_run, size=Pt(10.5), bold=True)
      names_run = para.add_run('、'.join(visit.name for visit in visits))
      self._set_run_font(names_run, size=Pt(10.5))
  ```
- [x] 4.7 `backend/src/services/export_service.py:2623` 前在 `_apply_document_style` 内注册段落样式 `ApplicableVisits`：10.5pt，`ascii/hAnsi=Times New Roman`，`eastAsia=SimSun`，`space_before=space_after=Pt(5.25)`，`line_spacing=1.0`，`alignment=WD_ALIGN_PARAGRAPH.LEFT`
- [x] 4.8 `backend/tests/test_export_service.py:236` 后新增 `test_export_project_visit_flow_header_row_sets_tblHeader`：断言 `doc.tables[1].rows[0]._tr.xpath('./w:trPr/w:tblHeader[@w:val="true"]')` 长度为 1
- [x] 4.9 `backend/tests/test_export_service.py:236` 后新增 `test_export_project_no_visits_skeleton_header_row_still_sets_tblHeader`：空访视项目同样断言
- [x] 4.10 `backend/tests/test_export_service.py:236` 后新增 `test_export_project_applicable_visits_footer_uses_sequence_order_and_matches_header_order`：3 个乱序 visit + 乱序 `VisitForm.sequence`；断言 header cell 文本与 footer 文本均按 `Visit.sequence` 排序且用 `、` 连接
- [x] 4.11 `backend/tests/test_export_service.py:236` 后新增 `test_export_project_skips_applicable_visits_footer_for_orphan_form`：orphan form 无 footer 段落
- [x] 4.12 `backend/tests/test_export_service.py:236` 后新增 `test_export_project_applicable_visits_footer_prefix_bold_and_names_run_use_expected_fonts`：`footer.style.name == 'ApplicableVisits'`、前缀 run bold、名称 run 非 bold、rFonts eastAsia=SimSun

## R5 — 预览列宽可调 + 吸附

- [x] 5.1 新增 `frontend/src/composables/useColumnResize.js`，签名 `useColumnResize(formId, tableKind, initialRatios) -> { colRatios, onResizeStart, snapGuideX, resetToEven }`
- [x] 5.2 `useColumnResize.js` 实现：`pointerdown/pointermove/pointerup` 驱动；drag 过程中相邻两列等量对冲；吸附锚点 `[0.25, 0.33, 0.5, 0.67, 0.75] × containerWidth ∪ otherBoundaries`；阈值 4px；吸附激活时设置 `snapGuideX`
- [x] 5.3 `useColumnResize.js` 持久化：key `crf:designer:col-widths:${formId}:${tableKind}`；值 `JSON.stringify(ratios)`；读回校验 `Array.isArray && length === expected && every(r => r >= 0.1 && r <= 0.9) && |sum − 1| < 1e-3`；不通过则 `resetToEven()`
- [x] 5.4 `frontend/src/components/FormDesignerTab.vue` normal 表格（`designerRenderGroups` 的 `normal` 分支）插入 `<colgroup><col v-for="(r, i) in colRatios" :key="i" :style="{ width: (r * 100) + '%' }" /></colgroup>`
- [x] 5.5 同文件 `inline-table` 分支同样插入 `<colgroup>` + `<col>`
- [x] 5.6 在 normal / inline-table 相邻列边界注入 `<div class="resizer-handle" @pointerdown="onResizeStart(i, $event)"></div>`
- [x] 5.7 `unified-table` 分支不加 `<colgroup>` 与 `.resizer-handle`；css 确保 `.unified-table td` 边界 `cursor: default`
- [x] 5.8 新增样式 `.resizer-handle { position:absolute; top:0; bottom:0; right:-2px; width:4px; cursor:col-resize; z-index:2 }` 与 `.snap-guide { position:absolute; top:0; bottom:0; width:1px; background:var(--color-primary); pointer-events:none }`
- [x] 5.9 行高不实现：不新增 `row-resize` cursor、不在任何 `<tr>` 上挂 resize handler
- [ ] 5.10 手动验证：拖动分隔线接近 25/33/50/67/75% 时吸附；跨列与跨表单切换时 localStorage 独立；reload 后列宽保留

## 交付与验证

- [x] 6.1 `cd frontend && npm run build`
- [x] 6.2 `cd frontend && node --test tests/*.test.js`
- [x] 6.3 `cd backend && python -m pytest`
- [ ] 6.4 手动在 MS Word 与 WPS 打开导出文档：分布图跨页标题行重复；各 form 末尾"适用访视：…"位置正确
- [ ] 6.5 手动对照 proposal.md 验收标准逐项勾选
- [ ] 6.6 运行 `/ccg:spec-impl` 完成实现；完成后 `openspec archive ui-ordinal-readonly-preview-columns`
