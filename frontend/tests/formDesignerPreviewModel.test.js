import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildGroupViewModel,
  buildPreviewGroupViewModels,
} from '../src/composables/formDesignerPreviewModel.js'
import { buildFormDesignerUnifiedSegments } from '../src/composables/formFieldPresentation.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(
  path.resolve(currentDir, '../src/components/FormDesignerTab.vue'),
  'utf8',
)
const templatePreviewSource = readFileSync(
  path.resolve(currentDir, '../src/components/TemplatePreviewDialog.vue'),
  'utf8',
)
const visitsSource = readFileSync(
  path.resolve(currentDir, '../src/components/VisitsTab.vue'),
  'utf8',
)

// ---------------------------------------------------------------------------
// 原 FormDesignerTab.vue 模板里使用的纯函数副本（逐字符对照源码 516-547 行）。
// 用作“黄金参考”，断言视图模型构建器逐元素复现这些原始结果。
// ---------------------------------------------------------------------------
function refComputeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1)
  const base = Math.floor(N / M),
    extra = N % M
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0))
}

function refComputeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)))
  return { labelSpan, valueSpan: N - labelSpan }
}

// getInlineRows 的确定性替身：保留“repeat 列取首行、非 repeat 列按行索引取值并回退 fallback、
// maxRows 取所有非 repeat 列行数最大值”的核心结构，输出仅依赖入参，足以验证视图模型是否原样透传。
function refGetInlineRows(fields) {
  const cols = fields.map((ff) => {
    const dv = ff.default_value
    if (dv) {
      const lines = String(dv).split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return { lines, repeat: false, fallback: `fallback:${ff.id}` }
    }
    const ctrl = `ctrl:${ff.id}`
    return { lines: [ctrl], repeat: true, fallback: ctrl }
  })
  const maxRows = Math.max(1, ...cols.filter((c) => !c.repeat).map((c) => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map((col) => (col.repeat ? col.lines[0] : (col.lines[i] ?? col.fallback))),
  )
}

const helpers = {
  buildSegments: buildFormDesignerUnifiedSegments,
  getInlineRows: refGetInlineRows,
  computeMergeSpans: refComputeMergeSpans,
  computeLabelValueSpans: refComputeLabelValueSpans,
}

function field(overrides = {}) {
  return {
    id: 1,
    order_index: 1,
    inline_mark: 0,
    is_log_row: 0,
    default_value: null,
    field_definition: { label: `标签${overrides.id ?? 1}`, field_type: '文本' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. inline 分组：视图模型的 inlineRows 必须与原 getInlineRows 逐元素相等。
// ---------------------------------------------------------------------------
test('inline group view model precomputes inlineRows equal to direct getInlineRows', () => {
  const fields = [
    field({ id: 1, inline_mark: 1 }),
    field({ id: 2, inline_mark: 1, default_value: 'a\nb\nc' }),
    field({ id: 3, inline_mark: 1, default_value: 'x' }),
  ]
  const group = { type: 'inline', fields }
  const gv = buildGroupViewModel(group, helpers)

  assert.equal(gv.type, 'inline')
  assert.equal(gv.fields, fields, 'fields 数组引用透传，不复制')
  assert.deepStrictEqual(gv.inlineRows, refGetInlineRows(fields))
})

// ---------------------------------------------------------------------------
// 2. normal 分组：仅透传 type/fields，无额外派生字段。
// ---------------------------------------------------------------------------
test('normal group view model passes through fields without span computation', () => {
  const fields = [
    field({ id: 1, field_definition: { label: '普通', field_type: '文本' } }),
    field({ id: 2, is_log_row: 1, field_definition: { label: 'log', field_type: '日志行' } }),
  ]
  const group = { type: 'normal', fields }
  const gv = buildGroupViewModel(group, helpers)

  assert.deepStrictEqual(Object.keys(gv).sort(), ['fields', 'type'])
  assert.equal(gv.type, 'normal')
  assert.equal(gv.fields, fields)
})

// ---------------------------------------------------------------------------
// 3. unified 分组：segments / labelValueSpans / 每个 inline_block 的 mergeSpans 与 inlineRows
//    必须与“原模板逐表达式直算”完全一致。覆盖 regular_field / full_row / inline_block 三类 segment。
// ---------------------------------------------------------------------------
function assertUnifiedEquivalence(colCount, fields) {
  const group = { type: 'unified', fields, colCount }
  const gv = buildGroupViewModel(group, helpers)

  // labelValueSpans 等价（原模板：computeLabelValueSpans(g.colCount)）
  assert.deepStrictEqual(gv.labelValueSpans, refComputeLabelValueSpans(colCount))

  // segments 顺序与类型等价（原模板：buildFormDesignerUnifiedSegments(g.fields)）
  const refSegments = buildFormDesignerUnifiedSegments(fields)
  assert.deepStrictEqual(
    gv.segments.map((s) => s.type),
    refSegments.map((s) => s.type),
  )

  gv.segments.forEach((seg, i) => {
    const refSeg = refSegments[i]
    // fields 顺序/内容等价
    assert.deepStrictEqual(
      seg.fields.map((f) => f.id),
      refSeg.fields.map((f) => f.id),
    )
    if (seg.type === 'inline_block') {
      // 每个单元格原模板都重建 computeMergeSpans(g.colCount, seg.fields.length)，取 [idx]/[ci]
      assert.deepStrictEqual(seg.mergeSpans, refComputeMergeSpans(colCount, refSeg.fields.length))
      // 行数据等价（原模板：getInlineRows(seg.fields)）
      assert.deepStrictEqual(seg.inlineRows, refGetInlineRows(refSeg.fields))
    } else {
      // 非 inline_block 段不携带 mergeSpans / inlineRows
      assert.equal(seg.mergeSpans, undefined)
      assert.equal(seg.inlineRows, undefined)
    }
  })
}

test('unified group view model matches direct segment + span computation across column counts', () => {
  const fields = [
    field({ id: 1, order_index: 1, inline_mark: 0, field_definition: { label: '普通', field_type: '文本' } }),
    field({ id: 2, order_index: 2, inline_mark: 1, default_value: 'p\nq' }),
    field({ id: 3, order_index: 3, inline_mark: 1 }),
    field({ id: 4, order_index: 4, inline_mark: 1 }),
    field({ id: 5, order_index: 5, inline_mark: 0, is_log_row: 1, field_definition: { label: 'log行', field_type: '日志行' } }),
    field({ id: 6, order_index: 6, inline_mark: 0, field_definition: { label: '标签段', field_type: '标签' } }),
  ]
  // 覆盖整除（colCount=6, M=3）、非整除余数分配（colCount=7/5/4, M=3）、M>N 兜底（colCount=2, M=3）。
  for (const colCount of [6, 7, 5, 4, 2]) {
    assertUnifiedEquivalence(colCount, fields)
  }
})

test('unified inline_block mergeSpans distribute remainder identically to per-cell rebuild', () => {
  // 纯 inline 段：3 列分到 colCount=7 → [3,2,2]；逐单元格读 [idx] 必须与一次性数组一致。
  const fields = [
    field({ id: 10, order_index: 1, inline_mark: 1 }),
    field({ id: 11, order_index: 2, inline_mark: 1 }),
    field({ id: 12, order_index: 3, inline_mark: 1 }),
  ]
  const gv = buildGroupViewModel({ type: 'unified', fields, colCount: 7 }, helpers)
  const inlineSeg = gv.segments.find((s) => s.type === 'inline_block')
  assert.deepStrictEqual(inlineSeg.mergeSpans, [3, 2, 2])
  // 模拟原模板逐单元格访问 computeMergeSpans(...)[idx]
  for (let idx = 0; idx < inlineSeg.fields.length; idx += 1) {
    assert.equal(inlineSeg.mergeSpans[idx], refComputeMergeSpans(7, inlineSeg.fields.length)[idx])
  }
})

// ---------------------------------------------------------------------------
// 4. buildPreviewGroupViewModels：保持分组顺序与一一对应。
// ---------------------------------------------------------------------------
test('buildPreviewGroupViewModels preserves group order and one-to-one mapping', () => {
  const groups = [
    { type: 'normal', fields: [field({ id: 1 })] },
    { type: 'inline', fields: [field({ id: 2, inline_mark: 1 }), field({ id: 3, inline_mark: 1 })] },
    { type: 'normal', fields: [field({ id: 4 })] },
  ]
  const views = buildPreviewGroupViewModels(groups, helpers)
  assert.equal(views.length, groups.length)
  assert.deepStrictEqual(
    views.map((v) => v.type),
    ['normal', 'inline', 'normal'],
  )
  views.forEach((v, i) => assert.equal(v.fields, groups[i].fields))
})

// ---------------------------------------------------------------------------
// 5. 源码契约：两处预览模板改用派生视图模型，且模板不再在表达式里直接调用纯函数。
//    （renderGroups / designerRenderGroups 仍保留，由 quickEditBehavior / formFieldPresentation 测试守护）
// ---------------------------------------------------------------------------
test('form designer derives preview view models and stops calling pure fns in templates', () => {
  // 新增派生 computed
  assert.match(
    formDesignerSource,
    /const renderGroupsView = computed\(\(\) => buildPreviewGroupViewModels\(renderGroups\.value, previewModelHelpers\)\)/,
  )
  assert.match(
    formDesignerSource,
    /const designerRenderGroupsView = computed\(\([\s\S]*buildPreviewGroupViewModels\(designerRenderGroups\.value, previewModelHelpers\)/,
  )
  // 模板遍历视图模型
  assert.match(formDesignerSource, /v-for="\(gv, gi\) in renderGroupsView"/)
  assert.match(formDesignerSource, /v-for="\(gv, gi\) in designerRenderGroupsView"/)
  // 模板读取预派生属性
  assert.match(formDesignerSource, /v-for="seg in gv\.segments"/)
  assert.match(formDesignerSource, /:colspan="seg\.mergeSpans\[idx\]"/)
  assert.match(formDesignerSource, /:colspan="seg\.mergeSpans\[ci\]"/)
  assert.match(formDesignerSource, /:colspan="gv\.labelValueSpans\.labelSpan"/)
  assert.match(formDesignerSource, /:colspan="gv\.labelValueSpans\.valueSpan"/)
  assert.match(formDesignerSource, /v-for="\(row, ri\) in seg\.inlineRows"/)
  assert.match(formDesignerSource, /v-for="\(row, ri\) in gv\.inlineRows"/)
  // 模板表达式不再调用纯函数重建数组
  assert.doesNotMatch(formDesignerSource, /v-for="seg in buildFormDesignerUnifiedSegments\(g\.fields\)"/)
  assert.doesNotMatch(formDesignerSource, /computeMergeSpans\(g\.colCount, seg\.fields\.length\)\[/)
  assert.doesNotMatch(formDesignerSource, /computeLabelValueSpans\(g\.colCount\)/)
  assert.doesNotMatch(formDesignerSource, /v-for="\(row, ri\) in getInlineRows\(/)
})

test('template preview dialog derives a view model and stops calling pure fns in template', () => {
  assert.match(templatePreviewSource, /import \{ buildPreviewGroupViewModels \} from '..\/composables\/formDesignerPreviewModel'/)
  assert.match(
    templatePreviewSource,
    /const previewRenderGroupsView = computed\(\([\s\S]*buildPreviewGroupViewModels\(previewRenderGroups\.value, previewModelHelpers\)/,
  )
  assert.match(templatePreviewSource, /v-for="\(gv, gi\) in previewRenderGroupsView"/)
  assert.match(templatePreviewSource, /v-for="seg in gv\.segments"/)
  assert.match(templatePreviewSource, /:colspan="seg\.mergeSpans\[idx\]"/)
  assert.match(templatePreviewSource, /:colspan="seg\.mergeSpans\[ci\]"/)
  assert.match(templatePreviewSource, /:colspan="gv\.labelValueSpans\.labelSpan"/)
  assert.match(templatePreviewSource, /:colspan="gv\.labelValueSpans\.valueSpan"/)
  assert.match(templatePreviewSource, /v-for="\(row, ri\) in seg\.inlineRows"/)
  assert.match(templatePreviewSource, /v-for="\(row, ri\) in gv\.inlineRows"/)
  // 旧的逐单元格纯函数调用已移除
  assert.doesNotMatch(templatePreviewSource, /v-for="seg in buildFormDesignerUnifiedSegments\(g\.fields\)"/)
  assert.doesNotMatch(templatePreviewSource, /computeMergeSpans\(g\.colCount, seg\.fields\.length\)\[/)
  assert.doesNotMatch(templatePreviewSource, /computeLabelValueSpans\(g\.colCount\)/)
  assert.doesNotMatch(templatePreviewSource, /v-for="\(row, ri\) in getInlineRows\(/)
})

test('visits tab form preview derives a view model and stops calling pure fns in template', () => {
  assert.match(visitsSource, /import \{ buildPreviewGroupViewModels \} from '..\/composables\/formDesignerPreviewModel'/)
  assert.match(
    visitsSource,
    /const previewGroupsView = computed\(\([\s\S]*buildPreviewGroupViewModels\(previewRenderGroups\.value, previewModelHelpers\)/,
  )
  assert.match(visitsSource, /v-for="\(gv, gi\) in previewGroupsView"/)
  assert.match(visitsSource, /v-for="seg in gv\.segments"/)
  assert.match(visitsSource, /:colspan="seg\.mergeSpans\[idx\]"/)
  assert.match(visitsSource, /:colspan="seg\.mergeSpans\[ci\]"/)
  assert.match(visitsSource, /:colspan="gv\.labelValueSpans\.labelSpan"/)
  assert.match(visitsSource, /:colspan="gv\.labelValueSpans\.valueSpan"/)
  assert.match(visitsSource, /v-for="\(row, ri\) in seg\.inlineRows"/)
  assert.match(visitsSource, /v-for="\(row, ri\) in gv\.inlineRows"/)
  // 模板表达式不再逐单元格调用纯函数重建数组（getPreviewColumnFractions 内部仍可调用，与单元格级渲染无关）
  assert.doesNotMatch(visitsSource, /v-for="seg in buildFormDesignerUnifiedSegments\(group\.fields\)"/)
  assert.doesNotMatch(visitsSource, /computeMergeSpans\(group\.colCount, seg\.fields\.length\)\[/)
  assert.doesNotMatch(visitsSource, /computeLabelValueSpans\(group\.colCount\)/)
  assert.doesNotMatch(visitsSource, /v-for="\(row, ri\) in getInlineRows\(/)
})
