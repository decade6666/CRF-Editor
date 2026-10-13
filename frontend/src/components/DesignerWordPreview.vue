<script setup>
// Word 预览页（word-page）：主画布预览与全屏设计器预览共用同一份模板，
// 由父组件 FormDesignerTab 渲染两次，仅通过 props 表达模式差异（design.md §3）。
// 状态、resizer 缓存与全部保存/撤销/会话逻辑仍归父组件；本组件只读 props 并调用父组件闭包。
import DesignerAcrfAnnotation from './DesignerAcrfAnnotation.vue';
import FormPreviewOid from './FormPreviewOid.vue';
import {
  ANNOTATION_KIND_FIELD,
  ANNOTATION_KIND_FORM,
  ANNOTATION_KIND_INLINE_HEADER,
} from '../composables/acrfAnnotationGeometry.js';
import {
  getFormFieldDisplayLabel,
  getFormFieldLabelPreviewStyle,
  getFormFieldPreviewStyle,
} from '../composables/formFieldPresentation';
import {
  getNormalRowKey,
  getInlineHeaderRowKey,
  getInlineDataRowKey,
  getUnifiedRegularRowKey,
  getUnifiedFullRowKey,
  getUnifiedInlineHeaderRowKey,
  getUnifiedInlineDataRowKey,
} from '../composables/useRowResize';

defineProps({
  selectedForm: { type: Object, default: null },
  groupsView: { type: Array, required: true },
  scope: {
    type: String,
    required: true,
    validator: (value) => value === 'main' || value === 'designer',
  },
  landscapeMode: { type: Boolean, required: true },
  noFields: { type: Boolean, required: true },
  showAcrfAnnotations: { type: Boolean, required: true },
  // 完全编辑模式下的纸面标题表单 OID 元数据（独立于 aCRF 视图开关；6→7 个 mode/data props）。
  showFormOid: { type: Boolean, required: true },
  // 父组件闭包：resizer 缓存 / 渲染适配器 / 注释拖拽接线都留在 FormDesignerTab，
  // 按引用透传，模板沿用原调用名。
  getResizer: { type: Function, required: true },
  getRowResizer: { type: Function, required: true },
  renderCellHtml: { type: Function, required: true },
  normalFillChars: { type: Function, required: true },
  openQuickEdit: { type: Function, required: true },
  getFormDomainAnnotationText: { type: Function, required: true },
  getFieldOidAnnotationText: { type: Function, required: true },
  getFormAnnotationTarget: { type: Function, required: true },
  getFieldAnnotationTarget: { type: Function, required: true },
  isAnnotationDraggable: { type: Function, required: true },
  hasAnnotationOverrideForTarget: { type: Function, required: true },
  getAnnotationStyle: { type: Function, required: true },
  onAnnotationPointerDown: { type: Function, required: true },
  resetAnnotationPosition: { type: Function, required: true },
});

function cumRatio(ratios, boundaryIdx) {
  let sum = 0;
  for (let i = 0; i <= boundaryIdx; i += 1) sum += ratios[i];
  return sum;
}

function getRowHeightStyle(rowResizer, rowKey) {
  return rowResizer?.getRowHeightStyle(rowKey) || null;
}
</script>

<template>
  <div :class="['word-page', 'form-designer-word-page', 'designer-scaled-word-page', { landscape: landscapeMode }]">
    <div v-if="!selectedForm" class="wp-empty">← 请选择表单</div>
    <template v-else>
      <div class="wp-form-title-row">
        <div class="wp-form-title">{{ selectedForm.name }}</div>
        <FormPreviewOid v-if="showFormOid" :code="selectedForm.code" />
        <DesignerAcrfAnnotation
          v-if="showAcrfAnnotations && getFormDomainAnnotationText(selectedForm)"
          kind="form"
          :text="getFormDomainAnnotationText(selectedForm)"
          :interactive="isAnnotationDraggable(getFormAnnotationTarget(selectedForm))"
          :has-override="hasAnnotationOverrideForTarget(getFormAnnotationTarget(selectedForm))"
          :annotation-style="
            getAnnotationStyle(
              getFormDomainAnnotationText(selectedForm),
              ANNOTATION_KIND_FORM,
              getFormAnnotationTarget(selectedForm),
            )
          "
          @pointerdown="(event) => onAnnotationPointerDown(getFormAnnotationTarget(selectedForm), event)"
          @reset="resetAnnotationPosition(getFormAnnotationTarget(selectedForm))"
        />
      </div>
      <div v-if="noFields" class="wp-empty">暂无字段</div>
      <div class="wp-body">
        <div class="wp-main">
          <template v-for="(gv, gi) in groupsView" :key="gi">
            <div v-if="gv.type === 'unified'" class="col-resize-host unified-host">
              <table class="unified-table">
                <colgroup v-if="getResizer('unified', gv.colCount, gi, gv, scope)">
                  <col
                    v-for="(r, ci) in getResizer('unified', gv.colCount, gi, gv, scope).colRatios"
                    :key="ci"
                    :style="{ width: r * 100 + '%' }"
                  />
                </colgroup>
                <template v-for="seg in gv.segments" :key="seg.fields[0]?.id">
                  <tr
                    v-if="seg.type === 'regular_field'"
                    class="row-resize-host"
                    :style="getRowHeightStyle(getRowResizer('unified', gv), getUnifiedRegularRowKey(seg.fields[0]))"
                    @dblclick="openQuickEdit(seg.fields[0])"
                  >
                    <td
                      class="unified-label row-resize-anchor"
                      :colspan="gv.labelValueSpans.labelSpan"
                      :style="getFormFieldLabelPreviewStyle(seg.fields[0])"
                    >
                      {{ getFormFieldDisplayLabel(seg.fields[0]) }}
                      <span
                        class="row-resizer-handle"
                        @pointerdown="
                          (e) => getRowResizer('unified', gv).onResizeStart(getUnifiedRegularRowKey(seg.fields[0]), e)
                        "
                      ></span>
                    </td>
                    <td
                      class="unified-value row-resize-anchor"
                      :colspan="gv.labelValueSpans.valueSpan"
                      :style="getFormFieldPreviewStyle(seg.fields[0])"
                    >
                      <span v-html="renderCellHtml(seg.fields[0])"></span>
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                        kind="field"
                        :text="getFieldOidAnnotationText(seg.fields[0])"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(seg.fields[0]))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(seg.fields[0]),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(seg.fields[0]),
                          )
                        "
                        @pointerdown="
                          (event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)
                        "
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="
                          (e) => getRowResizer('unified', gv).onResizeStart(getUnifiedRegularRowKey(seg.fields[0]), e)
                        "
                      ></span>
                    </td>
                  </tr>
                  <tr
                    v-else-if="seg.type === 'full_row'"
                    class="row-resize-host"
                    :style="getRowHeightStyle(getRowResizer('unified', gv), getUnifiedFullRowKey(seg.fields[0]))"
                    @dblclick="openQuickEdit(seg.fields[0])"
                  >
                    <td
                      :class="{
                        'wp-structure-label--multiline': seg.fields[0].field_definition?.field_type === '标签',
                        'row-resize-anchor': true,
                      }"
                      :colspan="gv.colCount"
                      :style="getFormFieldLabelPreviewStyle(seg.fields[0], { structure: true })"
                    >
                      {{ getFormFieldDisplayLabel(seg.fields[0]) || '以下为log行' }}
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"
                        kind="field"
                        :text="getFieldOidAnnotationText(seg.fields[0])"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(seg.fields[0]))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(seg.fields[0]))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(seg.fields[0]),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(seg.fields[0]),
                          )
                        "
                        @pointerdown="
                          (event) => onAnnotationPointerDown(getFieldAnnotationTarget(seg.fields[0]), event)
                        "
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(seg.fields[0]))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="
                          (e) => getRowResizer('unified', gv).onResizeStart(getUnifiedFullRowKey(seg.fields[0]), e)
                        "
                      ></span>
                    </td>
                  </tr>
                  <template v-else-if="seg.type === 'inline_block'">
                    <tr
                      class="row-resize-host"
                      :style="getRowHeightStyle(getRowResizer('unified', gv), getUnifiedInlineHeaderRowKey(seg.fields))"
                    >
                      <td
                        v-for="(ff, idx) in seg.fields"
                        :key="ff.id"
                        class="wp-inline-header row-resize-anchor"
                        :colspan="seg.mergeSpans[idx]"
                        :style="getFormFieldLabelPreviewStyle(ff)"
                        @dblclick="openQuickEdit(ff)"
                      >
                        {{ getFormFieldDisplayLabel(ff) }}
                        <DesignerAcrfAnnotation
                          v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                          kind="inline-header"
                          :text="getFieldOidAnnotationText(ff)"
                          :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                          :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                          :annotation-style="
                            getAnnotationStyle(
                              getFieldOidAnnotationText(ff),
                              ANNOTATION_KIND_INLINE_HEADER,
                              getFieldAnnotationTarget(ff),
                            )
                          "
                          @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                          @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                        />
                        <span
                          class="row-resizer-handle"
                          @pointerdown="
                            (e) =>
                              getRowResizer('unified', gv).onResizeStart(getUnifiedInlineHeaderRowKey(seg.fields), e)
                          "
                        ></span>
                      </td>
                    </tr>
                    <tr
                      v-for="(row, ri) in seg.inlineRows"
                      :key="ri"
                      class="row-resize-host"
                      :style="
                        getRowHeightStyle(getRowResizer('unified', gv), getUnifiedInlineDataRowKey(seg.fields, ri))
                      "
                    >
                      <td
                        v-for="(cell, ci) in row"
                        :key="ci"
                        class="wp-ctrl row-resize-anchor"
                        :colspan="seg.mergeSpans[ci]"
                        :style="getFormFieldPreviewStyle(seg.fields[ci])"
                        @dblclick="openQuickEdit(seg.fields[ci])"
                      >
                        <span v-html="cell"></span>
                        <span
                          class="row-resizer-handle"
                          @pointerdown="
                            (e) =>
                              getRowResizer('unified', gv).onResizeStart(getUnifiedInlineDataRowKey(seg.fields, ri), e)
                          "
                        ></span>
                      </td>
                    </tr>
                  </template>
                </template>
              </table>
              <template v-if="getResizer('unified', gv.colCount, gi, gv, scope)"
                ><div
                  v-for="bi in getResizer('unified', gv.colCount, gi, gv, scope).colRatios.length - 1"
                  :key="bi"
                  class="resizer-handle"
                  :style="{
                    left: cumRatio(getResizer('unified', gv.colCount, gi, gv, scope).colRatios, bi - 1) * 100 + '%',
                  }"
                  @pointerdown="(e) => getResizer('unified', gv.colCount, gi, gv, scope).onResizeStart(bi - 1, e)"
                ></div>
                <div
                  v-if="getResizer('unified', gv.colCount, gi, gv, scope).snapGuideX !== null"
                  class="snap-guide"
                  :style="{ left: getResizer('unified', gv.colCount, gi, gv, scope).snapGuideX + 'px' }"
                ></div
              ></template>
            </div>
            <div v-else-if="gv.type === 'normal'" class="col-resize-host">
              <table>
                <colgroup v-if="getResizer('normal', 2, gi, gv, scope)">
                  <col
                    v-for="(r, ci) in getResizer('normal', 2, gi, gv, scope).colRatios"
                    :key="ci"
                    :style="{ width: r * 100 + '%' }"
                  />
                </colgroup>
                <template v-for="ff in gv.fields" :key="ff.id">
                  <tr
                    v-if="ff.field_definition?.field_type === '标签'"
                    class="row-resize-host"
                    :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                    @dblclick="openQuickEdit(ff)"
                  >
                    <td
                      class="wp-structure-label--multiline row-resize-anchor"
                      colspan="2"
                      :style="getFormFieldLabelPreviewStyle(ff, { structure: true })"
                    >
                      {{ getFormFieldDisplayLabel(ff) }}
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        kind="field"
                        :text="getFieldOidAnnotationText(ff)"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                  <tr
                    v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'"
                    class="row-resize-host"
                    :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                    @dblclick="openQuickEdit(ff)"
                  >
                    <td
                      colspan="2"
                      class="row-resize-anchor"
                      :style="getFormFieldLabelPreviewStyle(ff, { structure: true })"
                    >
                      {{ getFormFieldDisplayLabel(ff) || '以下为log行' }}
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        kind="field"
                        :text="getFieldOidAnnotationText(ff)"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                  <tr
                    v-else
                    class="row-resize-host"
                    :style="getRowHeightStyle(getRowResizer('normal', gv), getNormalRowKey(ff))"
                    @dblclick="openQuickEdit(ff)"
                  >
                    <td class="wp-label row-resize-anchor" :style="getFormFieldLabelPreviewStyle(ff)">
                      {{ getFormFieldDisplayLabel(ff) }}
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                    <td class="wp-ctrl row-resize-anchor" :style="getFormFieldPreviewStyle(ff)">
                      <span v-html="renderCellHtml(ff, normalFillChars(gi, gv, scope))"></span>
                      <DesignerAcrfAnnotation
                        v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                        kind="field"
                        :text="getFieldOidAnnotationText(ff)"
                        :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                        :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                        :annotation-style="
                          getAnnotationStyle(
                            getFieldOidAnnotationText(ff),
                            ANNOTATION_KIND_FIELD,
                            getFieldAnnotationTarget(ff),
                          )
                        "
                        @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                        @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                      />
                      <span
                        class="row-resizer-handle"
                        @pointerdown="(e) => getRowResizer('normal', gv).onResizeStart(getNormalRowKey(ff), e)"
                      ></span>
                    </td>
                  </tr>
                </template>
              </table>
              <template v-if="getResizer('normal', 2, gi, gv, scope)"
                ><div
                  v-for="bi in getResizer('normal', 2, gi, gv, scope).colRatios.length - 1"
                  :key="bi"
                  class="resizer-handle"
                  :style="{
                    left: cumRatio(getResizer('normal', 2, gi, gv, scope).colRatios, bi - 1) * 100 + '%',
                  }"
                  @pointerdown="(e) => getResizer('normal', 2, gi, gv, scope).onResizeStart(bi - 1, e)"
                ></div>
                <div
                  v-if="getResizer('normal', 2, gi, gv, scope).snapGuideX !== null"
                  class="snap-guide"
                  :style="{ left: getResizer('normal', 2, gi, gv, scope).snapGuideX + 'px' }"
                ></div
              ></template>
            </div>
            <div v-else class="col-resize-host inline-host">
              <table class="inline-table">
                <colgroup v-if="getResizer('inline', gv.fields.length, gi, gv, scope)">
                  <col
                    v-for="(r, ci) in getResizer('inline', gv.fields.length, gi, gv, scope).colRatios"
                    :key="ci"
                    :style="{ width: r * 100 + '%' }"
                  />
                </colgroup>
                <tr
                  class="row-resize-host"
                  :style="getRowHeightStyle(getRowResizer('inline', gv), getInlineHeaderRowKey(gv.fields))"
                >
                  <td
                    v-for="ff in gv.fields"
                    :key="ff.id"
                    class="wp-inline-header row-resize-anchor"
                    :style="getFormFieldLabelPreviewStyle(ff)"
                    @dblclick="openQuickEdit(ff)"
                  >
                    {{ getFormFieldDisplayLabel(ff) }}
                    <DesignerAcrfAnnotation
                      v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
                      kind="inline-header"
                      :text="getFieldOidAnnotationText(ff)"
                      :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
                      :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
                      :annotation-style="
                        getAnnotationStyle(
                          getFieldOidAnnotationText(ff),
                          ANNOTATION_KIND_INLINE_HEADER,
                          getFieldAnnotationTarget(ff),
                        )
                      "
                      @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
                      @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
                    />
                    <span
                      class="row-resizer-handle"
                      @pointerdown="
                        (e) => getRowResizer('inline', gv).onResizeStart(getInlineHeaderRowKey(gv.fields), e)
                      "
                    ></span>
                  </td>
                </tr>
                <tr
                  v-for="(row, ri) in gv.inlineRows"
                  :key="ri"
                  class="row-resize-host"
                  :style="getRowHeightStyle(getRowResizer('inline', gv), getInlineDataRowKey(gv.fields, ri))"
                >
                  <td
                    v-for="(cell, ci) in row"
                    :key="ci"
                    class="wp-ctrl row-resize-anchor"
                    :style="getFormFieldPreviewStyle(gv.fields[ci])"
                    @dblclick="openQuickEdit(gv.fields[ci])"
                  >
                    <span v-html="cell"></span>
                    <span
                      class="row-resizer-handle"
                      @pointerdown="
                        (e) => getRowResizer('inline', gv).onResizeStart(getInlineDataRowKey(gv.fields, ri), e)
                      "
                    ></span>
                  </td>
                </tr>
              </table>
              <template v-if="getResizer('inline', gv.fields.length, gi, gv, scope)"
                ><div
                  v-for="bi in getResizer('inline', gv.fields.length, gi, gv, scope).colRatios.length - 1"
                  :key="bi"
                  class="resizer-handle"
                  :style="{
                    left: cumRatio(getResizer('inline', gv.fields.length, gi, gv, scope).colRatios, bi - 1) * 100 + '%',
                  }"
                  @pointerdown="(e) => getResizer('inline', gv.fields.length, gi, gv, scope).onResizeStart(bi - 1, e)"
                ></div>
                <div
                  v-if="getResizer('inline', gv.fields.length, gi, gv, scope).snapGuideX !== null"
                  class="snap-guide"
                  :style="{ left: getResizer('inline', gv.fields.length, gi, gv, scope).snapGuideX + 'px' }"
                ></div
              ></template>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.designer-scaled-word-page {
  width: 21cm;
  min-height: 29.7cm;
  max-width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.designer-scaled-word-page.landscape {
  width: 29.7cm;
  min-height: 21cm;
}

.wp-form-title-row {
  position: relative;
  min-height: 0.7cm;
  margin-bottom: 24px;
  padding-right: 4.8cm;
  /* 表单 OID 元数据与名称同行基线排列；超长时在行内换行，右侧 4.8cm 仍为 domain 标注保留区。 */
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.wp-form-title-row .wp-form-title {
  margin-bottom: 0;
}

/* 预览表格列宽拖拽（R5） */
.col-resize-host {
  position: relative;
  margin-bottom: 4px;
}
/* !important 确保设计器拖拽场景下始终固定布局 */
.col-resize-host > table,
.col-resize-host > table.inline-table {
  width: 100% !important;
  table-layout: fixed !important;
  margin: 0;
}
.resizer-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  transform: translateX(-5px);
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
}
.resizer-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 2px;
  background: transparent;
  pointer-events: none;
  transition: background 0.15s;
}
.resizer-handle:hover::after,
.resizer-handle:active::after {
  background: var(--color-primary);
}
.snap-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-primary);
  pointer-events: none;
  z-index: 1;
}
</style>
