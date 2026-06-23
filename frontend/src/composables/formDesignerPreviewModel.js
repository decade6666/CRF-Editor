/**
 * 表单设计器预览视图模型构建器。
 *
 * 目的：把原本在模板表达式里按单元格反复调用的确定性纯函数
 * （buildFormDesignerUnifiedSegments / getInlineRows / computeMergeSpans /
 * computeLabelValueSpans）提前算好，挂到每个 group 的视图模型上，
 * 模板只读属性、不再在表达式里调用函数，从而消除 inline 表 colspan 的 O(M²) 重建。
 *
 * 行为等价契约：本模块不改变任何输出值。它仅复用调用方注入的同名纯函数，
 * 逐 group / 逐 segment 缓存其结果，渲染所读取的 segments / inlineRows /
 * mergeSpans / labelValueSpans 必须与“模板直接调用原纯函数”逐元素相等。
 *
 * 注意：本模块对 group / field 对象只读，不就地修改；视图模型为全新对象。
 */

/**
 * 为单个 group 构建视图模型。
 *
 * @param {{ type: string, fields: Array, colCount?: number }} group 原始渲染分组
 * @param {object} helpers 注入的纯函数集合
 * @param {(fields: Array) => Array} helpers.buildSegments 统一表分段（含排序）
 * @param {(fields: Array) => Array<Array<string>>} helpers.getInlineRows 横向表多行渲染
 * @param {(n: number, m: number) => number[]} helpers.computeMergeSpans 合并列跨度
 * @param {(n: number) => { labelSpan: number, valueSpan: number }} helpers.computeLabelValueSpans 标签/值列跨度
 * @returns {object} group 视图模型
 */
export function buildGroupViewModel(group, helpers) {
  const { buildSegments, getInlineRows, computeMergeSpans, computeLabelValueSpans } = helpers;
  const colCount = group.colCount;

  if (group.type === 'unified') {
    const labelValueSpans = computeLabelValueSpans(colCount);
    const segments = buildSegments(group.fields).map((seg) => {
      if (seg.type === 'inline_block') {
        return {
          ...seg,
          mergeSpans: computeMergeSpans(colCount, seg.fields.length),
          inlineRows: getInlineRows(seg.fields),
        };
      }
      return { ...seg };
    });
    return { type: group.type, fields: group.fields, colCount, labelValueSpans, segments };
  }

  if (group.type === 'inline') {
    // 仅独立 inline 组传入按列宽自适应的填写线根数；unified 内的 inline band 不传（维持旧固定 16）。
    const fillCharsByCol = helpers.getInlineFillChars
      ? helpers.getInlineFillChars(group.fields)
      : null;
    return {
      type: group.type,
      fields: group.fields,
      inlineRows: getInlineRows(group.fields, fillCharsByCol),
    };
  }

  // normal：模板不调用上述纯函数，直接逐字段渲染，透传即可。
  return { type: group.type, fields: group.fields };
}

/**
 * 为一组渲染分组构建视图模型数组。
 *
 * @param {Array} groups 原始渲染分组数组（buildFormDesignerRenderGroups 输出）
 * @param {object} helpers 注入的纯函数集合，见 buildGroupViewModel
 * @returns {Array} 视图模型数组，与 groups 一一对应、顺序一致
 */
export function buildPreviewGroupViewModels(groups, helpers) {
  return groups.map((group) => buildGroupViewModel(group, helpers));
}
