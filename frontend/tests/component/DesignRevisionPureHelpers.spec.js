// R3：applyOwnDesignWrite / advanceOwnSnapshot 纯函数补充分支（vitest 侧执行以计入覆盖）。
// 行为断言：不可精确推导的写入效果一律返回 null（宁可再审阅），字段库透传与
// 压缩/单删/空批删的精确推导形态逐一锁定。
import { describe, expect, it } from 'vitest';
import { applyOwnDesignWrite, advanceOwnSnapshot, createOwnDesignChain, upgradeOwnBaseline } from '../../src/composables/designRevision.js';

describe('R3：applyOwnDesignWrite 不可精确推导效果返回 null', () => {
  const forms = [
    { id: 7, name: '甲', order_index: 1 },
    { id: 8, name: '乙', order_index: 2 },
  ];

  it('表单 PUT 响应与目标不符或快照 forms 损坏时返回 null', () => {
    expect(applyOwnDesignWrite({ projectId: 1, formId: 7, forms }, { method: 'put', url: '/api/forms/7' })).toBeNull();
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, forms: '损坏' },
      { method: 'put', url: '/api/forms/7', result: { id: 7 } },
    )).toBeNull();
  });

  it('整表删除宿主自身返回 null；删除其他表单按单删前移序号', () => {
    expect(applyOwnDesignWrite({ projectId: 1, formId: 7, forms }, { method: 'del', url: '/api/forms/7' })).toBeNull();
    const afterDelete = applyOwnDesignWrite({ projectId: 1, formId: 7, forms }, { method: 'del', url: '/api/forms/8' });
    expect(afterDelete.forms.map((item) => [item.id, item.order_index])).toEqual([[7, 1]]);
  });

  it('批删包含宿主表单或 deleted 数与 ids 数不符时返回 null', () => {
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, forms },
      { method: 'post', url: '/api/projects/1/forms/batch-delete', body: { ids: [7] }, result: { deleted: 1 } },
    )).toBeNull();
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, forms },
      { method: 'post', url: '/api/projects/1/forms/batch-delete', body: {}, result: { deleted: 1 } },
    )).toBeNull();
  });

  it('字段重排目标表单不符或 ids 不完整时返回 null', () => {
    const fields = [{ id: 101, order_index: 1 }, { id: 102, order_index: 2 }];
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, fields },
      { method: 'post', url: '/api/forms/8/fields/reorder', body: { ordered_ids: [102, 101] } },
    )).toBeNull();
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, fields },
      { method: 'post', url: '/api/forms/7/fields/reorder', body: { ordered_ids: [102] } },
    )).toBeNull();
  });

  it('定义重排在字段库形态可推导；字段形态（fields 在场）拒绝', () => {
    const reordered = applyOwnDesignWrite(
      { projectId: 1, formId: null, definitions: [{ id: 201, order_index: 1 }] },
      { method: 'post', url: '/api/projects/1/field-definitions/reorder', body: [201] },
    );
    expect(reordered.definitions.map((item) => item.order_index)).toEqual([1]);
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, definitions: [{ id: 201, order_index: 1 }], fields: [{ id: 101, order_index: 1 }] },
      { method: 'post', url: '/api/projects/1/field-definitions/reorder', body: [201] },
    )).toBeNull();
  });

  it('字段/字段库命令不改 FormResponse 形态：无 fields/definitions 时原样透传', () => {
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7 },
      { method: 'post', url: '/api/field-definitions/201/copy' },
    )).toEqual({ projectId: 1, formId: 7 });
  });

  it('advanceOwnSnapshot 无快照时返回 null', () => {
    expect(advanceOwnSnapshot(null, { revision: '"r1"', baselineRevision: '"r0"', data: {} }, {})).toBeNull();
  });

  it('批删压缩 1..n、单删末位不移动其余序号、删不存在行返回 null、空批删原样保留', () => {
    const data = { projectId: 1, formId: 7, forms: [
      { id: 7, order_index: 1 },
      { id: 8, order_index: 2 },
      { id: 9, order_index: 3 },
    ] };
    const compacted = applyOwnDesignWrite(
      data,
      { method: 'post', url: '/api/projects/1/forms/batch-delete', body: { ids: [8] }, result: { deleted: 1 } },
    );
    expect(compacted.forms.map((item) => [item.id, item.order_index])).toEqual([[7, 1], [9, 2]]);
    const keptTail = applyOwnDesignWrite(data, { method: 'del', url: '/api/forms/9' });
    expect(keptTail.forms.map((item) => [item.id, item.order_index])).toEqual([[7, 1], [8, 2]]);
    expect(applyOwnDesignWrite(data, { method: 'del', url: '/api/forms/999' })).toBeNull();
    const emptyBatch = applyOwnDesignWrite(
      data,
      { method: 'post', url: '/api/projects/1/forms/batch-delete', body: { ids: [] }, result: { deleted: 0 } },
    );
    expect(emptyBatch.forms.map((item) => item.id)).toEqual([7, 8, 9]);
  });
});

describe('R3：applyOwnDesignWrite 缺省 url / 重复 id / 未知 id / 字段在场拒绝与基线默认', () => {
  it('无 url 的命令逐个正则短路，返回 null', () => {
    expect(applyOwnDesignWrite({ projectId: 1, formId: 7 }, { method: 'put' })).toBeNull();
  });

  it('重排 ids 重复或含未知 id 时拒绝；order_index 相同按 id 稳定排序', () => {
    const fields = [
      { id: 201, order_index: 1 },
      { id: 202, order_index: 1 },
    ];
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, fields },
      { method: 'post', url: '/api/forms/7/fields/reorder', body: { ordered_ids: [201, 201] } },
    )).toBeNull();
    const reordered = applyOwnDesignWrite(
      { projectId: 1, formId: 7, fields },
      { method: 'post', url: '/api/forms/7/fields/reorder', body: { ordered_ids: [202, 201] } },
    );
    expect(reordered.fields.map((item) => item.id)).toEqual([202, 201]);
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: null, definitions: [{ id: 201, order_index: 1 }] },
      { method: 'post', url: '/api/projects/1/field-definitions/reorder', body: [999] },
    )).toBeNull();
  });

  it('删除命令的 forms 非数组时返回 null；单删中间行时后序号前移一位', () => {
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, forms: '损坏' },
      { method: 'del', url: '/api/forms/8' },
    )).toBeNull();
    const shifted = applyOwnDesignWrite(
      { projectId: 1, formId: 7, forms: [
        { id: 7, order_index: 1 },
        { id: 8, order_index: 2 },
        { id: 9, order_index: 3 },
      ] },
      { method: 'del', url: '/api/forms/8' },
    );
    expect(shifted.forms.map((item) => [item.id, item.order_index])).toEqual([[7, 1], [9, 2]]);
  });

  it('字段命令在 definitions 在场时返回 null（不可精确推导）', () => {
    expect(applyOwnDesignWrite(
      { projectId: 1, formId: 7, definitions: [{ id: 201, order_index: 1 }] },
      { method: 'post', url: '/api/field-definitions/201/copy' },
    )).toBeNull();
  });

  it('upgradeOwnBaseline 缺省项目/表单身份时仅按写入链可达换基线，不可达保持原基线', () => {
    const chain = createOwnDesignChain();
    const baseline = { revision: '"x"', data: {} };
    const candidate = { revision: '"y"', data: { projectId: 1, formId: 7, forms: [] } };
    expect(upgradeOwnBaseline(baseline, [candidate], chain)).toEqual(baseline);
    chain.record('"x"', '"y"');
    const upgraded = upgradeOwnBaseline(baseline, [candidate], chain);
    expect(upgraded.revision).toBe('"y"');
    expect(upgraded.data.forms).toEqual([]);
  });
});
