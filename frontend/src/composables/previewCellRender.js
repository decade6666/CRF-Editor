/**
 * 共享的 Word 预览单元格纯函数：FormDesignerTab / VisitsTab / TemplatePreviewDialog
 * 的历史三份拷贝收拢于此。算法零拷贝——转义、填写线、控件渲染复用 useCRFRenderer，
 * inline 列宽的可用宽度复用 visitPreviewLandscape。各组件的默认值策略（cell / inline
 * 两条路径）与渲染分组来源不同，经 createPreviewCellRenderers 的适配器注入；
 * 行为等价由 tests/previewCellRender.test.js 的黄金参考矩阵锁定。
 */
import {
  computeFillLineCharCount,
  isDefaultValueSupported,
  normalizeDefaultValue,
  planInlineColumnFractions,
  renderCtrlHtml,
  toHtml,
} from './useCRFRenderer.js';
import { resolveInlineTableAvailableCm } from './visitPreviewLandscape.js';

/** 字段实例默认值（inline_mark 感知）：FD/VT 历史实现逐字上移；TP 两条谓词语义不同，不采用。 */
export function getScopedDefaultValue(ff, singleLine = false) {
  const fieldType = ff?.field_definition?.field_type;
  const inlineMark = Boolean(ff?.inline_mark);
  if (!fieldType || !ff?.default_value) return '';
  if (!isDefaultValueSupported(fieldType, inlineMark)) return '';
  return normalizeDefaultValue(ff.default_value, singleLine);
}

/** unified 表合并列跨度（三份历史拷贝逐字一致）。 */
export function computeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1);
  const base = Math.floor(N / M);
  const extra = N % M;
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0));
}

/** unified 表 label / value 列跨度（三份历史拷贝逐字一致）。 */
export function computeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)));
  return { labelSpan, valueSpan: N - labelSpan };
}

// inline 多行默认值逐行转义（三份历史拷贝一致）。与 useCRFRenderer 的 escapeHtml
// 不同：这里不转义引号，保持渲染输出逐字节不变。
function escapeLineText(line) {
  return line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// inline 整格文本填写线：每列按其规划宽度（cm）自适应根数，与后端 _add_inline_table
// 共享 compute_fill_line_char_count 公式。仅独立 inline 组使用（unified band 不传）；
// 宿主分组与纸张方向由调用方适配器按次解析（保持惰性读取）。
function inlineColumnCms(fields, resolveHostGroups, getPaperOrientation) {
  const fractions = planInlineColumnFractions(fields);
  const availableCm = resolveInlineTableAvailableCm(
    resolveHostGroups(fields),
    { type: 'inline', fields },
    getPaperOrientation(),
  );
  return fractions.map((f) => f * availableCm);
}

/**
 * 按组件适配器构造绑定到该组件状态的预览渲染函数。
 *
 * @param {object} adapters 全部为普通函数，组件的 ref / computed 在调用时才读取：
 *   - toRendererField(ff)      渲染器扁平字段（FD: getPreviewField；VT: 解包
 *                              field_definition；TP: 恒等）
 *   - getCellValue(ff)         CELL 默认值策略 → '' | 默认值字符串
 *   - getInlineValue(ff)       INLINE 默认值策略 → '' | 默认值字符串
 *   - renderFallback(field, fillChars)  inline 默认值行的回退渲染
 *   - resolveHostGroups(fields)        inline 列宽的宿主渲染分组
 *   - getPaperOrientation()            'auto' | 'portrait' | 'landscape'
 * @returns {{ renderCellHtml, getInlineRows, getInlineColumnCms, getInlineFillChars }}
 */
export function createPreviewCellRenderers(adapters) {
  const { toRendererField, getCellValue, getInlineValue, renderFallback, resolveHostGroups, getPaperOrientation } =
    adapters;

  // 普通表单元格：守卫与三份历史实现逐字一致；默认值分支经 toHtml（转义 + \n→<br> + 填写线 span）。
  function renderCellHtml(ff, fillLineChars = null) {
    if (!ff?.field_definition) return '<span class="fill-line"></span>';
    const defaultValue = getCellValue(ff);
    if (defaultValue) return toHtml(defaultValue);
    return renderCtrlHtml(toRendererField(ff), fillLineChars);
  }

  // 横向 inline 行：转义 → 去尾部空行 → repeat/fallback/maxRows 为不变内核；默认值与回退渲染走适配器。
  function getInlineRows(fields, fillCharsByCol = null) {
    const cols = fields.map((ff, i) => {
      const fillChars = fillCharsByCol ? (fillCharsByCol[i] ?? null) : null;
      const defaultValue = getInlineValue(ff);
      if (defaultValue) {
        const lines = normalizeDefaultValue(defaultValue).split('\n');
        while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
        return {
          lines: lines.map((l) => escapeLineText(l)),
          repeat: false,
          fallback: renderFallback(toRendererField(ff), fillChars),
        };
      }
      // 选项类用结构化渲染（renderCtrlHtml→renderChoiceHtml 产出 .choice-atom），
      // 非选项类等价于 renderCtrlTextHtml（自动生成填写线带视觉宽度上限）。
      const ctrl = renderCtrlHtml(toRendererField(ff), fillChars);
      return { lines: [ctrl], repeat: true, fallback: ctrl };
    });
    const maxRows = Math.max(1, ...cols.filter((c) => !c.repeat).map((c) => c.lines.length));
    return Array.from({ length: maxRows }, (_, i) =>
      cols.map((col) => (col.repeat ? col.lines[0] : (col.lines[i] ?? col.fallback))),
    );
  }

  function getInlineColumnCms(fields) {
    return inlineColumnCms(fields, resolveHostGroups, getPaperOrientation);
  }

  function getInlineFillChars(fields) {
    return getInlineColumnCms(fields).map((columnCm) => computeFillLineCharCount(columnCm));
  }

  return { renderCellHtml, getInlineRows, getInlineColumnCms, getInlineFillChars };
}
