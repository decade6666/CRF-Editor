import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REFERENCE_DELETE_BOX_CLASS,
  REFERENCE_LIST_MAX,
  buildPartialDeleteMessage,
  confirmReferenceAwareBatchDelete,
  formatFieldReference,
  partitionByReferences,
  showReferenceBlockedAlert,
} from '../src/composables/referenceDeleteGuard.js'

function createFakeMessageBox() {
  const calls = []
  const box = {
    calls,
    alert: (...args) => {
      calls.push(['alert', ...args])
      return Promise.resolve('confirm')
    },
    confirm: (...args) => {
      calls.push(['confirm', ...args])
      return Promise.resolve('confirm')
    },
  }
  return box
}

const describeRefsByFormat = (refs) => refs.map(formatFieldReference).join('、')

test('exposes the shared dialog class and list cap', () => {
  assert.equal(REFERENCE_DELETE_BOX_CLASS, 'reference-delete-box')
  assert.equal(REFERENCE_LIST_MAX, 10)
})

test('formatFieldReference renders form name with OID, field label and variable name', () => {
  assert.equal(
    formatFieldReference({ form_name: '筛选表', form_code: 'SCR', field_label: '体重', field_var: 'WT' }),
    '筛选表(SCR)-体重(WT)',
  )
})

test('formatFieldReference omits the OID segment when form_code is missing', () => {
  assert.equal(
    formatFieldReference({ form_name: '筛选表', form_code: null, field_label: '体重', field_var: 'WT' }),
    '筛选表-体重(WT)',
  )
})

test('formatFieldReference renders unplaced library fields with the 字段库 prefix', () => {
  assert.equal(
    formatFieldReference({ form_name: null, form_code: null, field_label: '身高', field_var: 'HT' }),
    '字段库-身高(HT)',
  )
})

test('partitionByReferences keeps input order in both groups', () => {
  const a = { id: 1, name: 'a' }
  const b = { id: 2, name: 'b' }
  const c = { id: 3, name: 'c' }
  const d = { id: 4, name: 'd' }
  const refs = [{ form_name: 'F', form_code: 'FC', field_label: '字段', field_var: 'V' }]
  const result = partitionByReferences([a, b, c, d], { 1: refs, 3: [] })
  assert.deepEqual(result.blocked, [{ item: a, refs }])
  assert.deepEqual(result.deletable, [b, c, d])
})

test('partitionByReferences accepts string keys from JSON batch responses', () => {
  const a = { id: 7, name: 'a' }
  const refs = [{ form_name: null, form_code: null, field_label: '身高', field_var: 'HT' }]
  const result = partitionByReferences([a], { 7: refs })
  assert.equal(result.blocked.length, 1)
  assert.deepEqual(result.blocked[0].refs, refs)
  assert.equal(result.deletable.length, 0)
})

test('partitionByReferences treats missing, empty and non-array refs as deletable', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const result = partitionByReferences(items, { 1: [], 2: null, 4: 'oops' })
  assert.equal(result.blocked.length, 0)
  assert.deepEqual(result.deletable, items)
})

test('partitionByReferences never mutates its inputs', () => {
  const items = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
  const refsMap = { 1: [{ form_name: 'F', form_code: 'FC', field_label: '字段', field_var: 'V' }] }
  const itemsSnapshot = JSON.stringify(items)
  const refsSnapshot = JSON.stringify(refsMap)
  partitionByReferences(items, refsMap)
  assert.equal(JSON.stringify(items), itemsSnapshot)
  assert.equal(JSON.stringify(refsMap), refsSnapshot)
})

test('partitionByReferences returns empty groups for empty input', () => {
  assert.deepEqual(partitionByReferences([], {}), { blocked: [], deletable: [] })
})

test('showReferenceBlockedAlert opens a warning alert with the shared box class', async () => {
  const box = createFakeMessageBox()
  const message = '该字典被以下字段引用，需先解除相关字段的引用：\n筛选表(SCR)-体重(WT)'
  await showReferenceBlockedAlert(box, message)
  assert.deepEqual(box.calls, [
    [
      'alert',
      message,
      '无法删除',
      { type: 'warning', confirmButtonText: '知道了', customClass: REFERENCE_DELETE_BOX_CLASS },
    ],
  ])
})

test('showReferenceBlockedAlert swallows cancel and close dismissal but propagates real errors', async () => {
  for (const dismissal of ['cancel', 'close']) {
    const box = createFakeMessageBox()
    box.alert = () => Promise.reject(dismissal)
    await showReferenceBlockedAlert(box, 'message')
  }
  const box = createFakeMessageBox()
  box.alert = () => Promise.reject(new Error('boom'))
  await assert.rejects(showReferenceBlockedAlert(box, 'message'), (e) => e.message === 'boom')
})

test('buildPartialDeleteMessage reports deleted and blocked counts', () => {
  assert.equal(buildPartialDeleteMessage('字典', 2, 3), '已删除 2 个字典，3 个被引用的字典未删除')
  assert.equal(buildPartialDeleteMessage('表单', 5, 1), '已删除 5 个表单，1 个被引用的表单未删除')
})

test('confirmReferenceAwareBatchDelete resolves without any dialog when nothing is selected', async () => {
  const box = createFakeMessageBox()
  const toDelete = await confirmReferenceAwareBatchDelete(box, {
    items: [],
    refsMap: {},
    noun: '字典',
    nameOf: (x) => x.name,
    describeRefs: describeRefsByFormat,
  })
  assert.deepEqual(toDelete, [])
  assert.deepEqual(box.calls, [])
})

test('confirmReferenceAwareBatchDelete only alerts when every selected item is referenced', async () => {
  const box = createFakeMessageBox()
  const a = { id: 1, name: '字典A' }
  const b = { id: 2, name: '字典B' }
  const refsMap = {
    1: [{ form_name: '筛选表', form_code: 'SCR', field_label: '体重', field_var: 'WT' }],
    2: [{ form_name: null, form_code: null, field_label: '身高', field_var: 'HT' }],
  }
  const toDelete = await confirmReferenceAwareBatchDelete(box, {
    items: [a, b],
    refsMap,
    noun: '字典',
    nameOf: (x) => x.name,
    describeRefs: describeRefsByFormat,
  })
  assert.deepEqual(toDelete, [])
  assert.deepEqual(box.calls, [
    [
      'alert',
      '选中的 2 个字典均已被引用，不能删除（需先解除引用）：\n【字典A】：筛选表(SCR)-体重(WT)\n【字典B】：字段库-身高(HT)',
      '无法删除',
      { type: 'warning', confirmButtonText: '知道了', customClass: REFERENCE_DELETE_BOX_CLASS },
    ],
  ])
  assert.ok(!box.calls.some(([kind]) => kind === 'confirm'))
})

test('confirmReferenceAwareBatchDelete swallows alert dismissal when everything is referenced', async () => {
  for (const dismissal of ['cancel', 'close']) {
    const box = createFakeMessageBox()
    box.alert = () => Promise.reject(dismissal)
    const toDelete = await confirmReferenceAwareBatchDelete(box, {
      items: [{ id: 1, name: '单位A' }],
      refsMap: { 1: [{ form_name: 'F', form_code: 'FC', field_label: '字段', field_var: 'V' }] },
      noun: '单位',
      nameOf: (x) => x.name,
      describeRefs: describeRefsByFormat,
    })
    assert.deepEqual(toDelete, [])
  }
})

test('confirmReferenceAwareBatchDelete propagates unexpected alert errors', async () => {
  const box = createFakeMessageBox()
  box.alert = () => Promise.reject(new Error('boom'))
  await assert.rejects(
    confirmReferenceAwareBatchDelete(box, {
      items: [{ id: 1, name: '单位A' }],
      refsMap: { 1: [{ form_name: 'F', form_code: 'FC', field_label: '字段', field_var: 'V' }] },
      noun: '单位',
      nameOf: (x) => x.name,
      describeRefs: describeRefsByFormat,
    }),
    (e) => e.message === 'boom',
  )
})

test('confirmReferenceAwareBatchDelete keeps the plain confirm when nothing is referenced', async () => {
  const box = createFakeMessageBox()
  const a = { id: 1, name: 'A' }
  const b = { id: 2, name: 'B' }
  const toDelete = await confirmReferenceAwareBatchDelete(box, {
    items: [a, b],
    refsMap: {},
    noun: '字典',
    nameOf: (x) => x.name,
    describeRefs: describeRefsByFormat,
  })
  assert.deepEqual(toDelete, [a, b])
  assert.deepEqual(box.calls, [['confirm', '确认删除选中的 2 个字典？', '批量删除', { type: 'warning' }]])
})

test('confirmReferenceAwareBatchDelete shows a two-section dialog for a mixed selection', async () => {
  const box = createFakeMessageBox()
  const blocked1 = { id: 1, name: '字典A' }
  const blocked2 = { id: 2, name: '字典B' }
  const free1 = { id: 3, name: '字典C' }
  const refsMap = {
    1: [{ form_name: '筛选表', form_code: 'SCR', field_label: '体重', field_var: 'WT' }],
    2: [{ form_name: null, form_code: null, field_label: '身高', field_var: 'HT' }],
  }
  const toDelete = await confirmReferenceAwareBatchDelete(box, {
    items: [blocked1, blocked2, free1],
    refsMap,
    noun: '字典',
    nameOf: (x) => x.name,
    describeRefs: describeRefsByFormat,
  })
  assert.deepEqual(toDelete, [free1])
  assert.deepEqual(box.calls, [
    [
      'confirm',
      [
        '以下 2 个字典已被引用，不能删除（需先解除引用）：',
        '【字典A】：筛选表(SCR)-体重(WT)',
        '【字典B】：字段库-身高(HT)',
        '',
        '以下 1 个字典未被引用，确认删除？',
        '字典C',
      ].join('\n'),
      '批量删除',
      {
        type: 'warning',
        confirmButtonText: '删除 1 个字典',
        cancelButtonText: '取消',
        customClass: REFERENCE_DELETE_BOX_CLASS,
      },
    ],
  ])
})

test('confirmReferenceAwareBatchDelete propagates confirm cancellation', async () => {
  const box = createFakeMessageBox()
  box.confirm = () => Promise.reject('cancel')
  await assert.rejects(
    confirmReferenceAwareBatchDelete(box, {
      items: [{ id: 1, name: '字段A' }],
      refsMap: {},
      noun: '字段',
      nameOf: (x) => x.name,
      describeRefs: describeRefsByFormat,
    }),
    (e) => e === 'cancel',
  )
})

test('confirmReferenceAwareBatchDelete propagates mixed-path confirm dismissal without returning the deletable items', async () => {
  for (const dismissal of ['cancel', 'close']) {
    const box = createFakeMessageBox()
    box.confirm = () => Promise.reject(dismissal)
    await assert.rejects(
      confirmReferenceAwareBatchDelete(box, {
        items: [{ id: 1, name: '字典A' }, { id: 2, name: '字典B' }],
        refsMap: { 1: [{ form_name: '筛选表', form_code: 'SCR', field_label: '体重', field_var: 'WT' }] },
        noun: '字典',
        nameOf: (x) => x.name,
        describeRefs: describeRefsByFormat,
      }),
      (e) => e === dismissal,
    )
  }
})

test('confirmReferenceAwareBatchDelete truncates long blocked and deletable lists', async () => {
  const box = createFakeMessageBox()
  const items = []
  const refsMap = {}
  for (let i = 1; i <= REFERENCE_LIST_MAX * 2 + 4; i += 1) {
    items.push({ id: i, name: `字典${i}` })
    if (i % 2 === 1) {
      refsMap[i] = [{ form_name: `表${i}`, form_code: `F${i}`, field_label: '字段', field_var: 'V' }]
    }
  }
  await confirmReferenceAwareBatchDelete(box, {
    items,
    refsMap,
    noun: '字典',
    nameOf: (x) => x.name,
    describeRefs: describeRefsByFormat,
  })
  const message = box.calls[0][1]
  const lines = message.split('\n')
  const blockedCount = REFERENCE_LIST_MAX + 2
  assert.equal(lines[0], `以下 ${blockedCount} 个字典已被引用，不能删除（需先解除引用）：`)
  assert.equal(lines[1], '【字典1】：表1(F1)-字段(V)')
  assert.equal(lines[REFERENCE_LIST_MAX], `【字典${REFERENCE_LIST_MAX * 2 - 1}】：表${REFERENCE_LIST_MAX * 2 - 1}(F${REFERENCE_LIST_MAX * 2 - 1})-字段(V)`)
  assert.equal(lines[REFERENCE_LIST_MAX + 1], `...等共${blockedCount}个字典`)
  assert.equal(lines[REFERENCE_LIST_MAX + 2], '')
  assert.equal(lines[REFERENCE_LIST_MAX + 3], `以下 ${blockedCount} 个字典未被引用，确认删除？`)
  const deletableNames = Array.from({ length: REFERENCE_LIST_MAX }, (_, idx) => `字典${(idx + 1) * 2}`).join('、')
  assert.equal(lines[REFERENCE_LIST_MAX + 4], `${deletableNames}、...等共${blockedCount}个字典`)
})

test('confirmReferenceAwareBatchDelete keeps only the blocked section when everything is referenced beyond the cap', async () => {
  const box = createFakeMessageBox()
  const items = []
  const refsMap = {}
  for (let i = 1; i <= REFERENCE_LIST_MAX + 1; i += 1) {
    items.push({ id: i, name: `字典${i}` })
    refsMap[i] = [{ form_name: null, form_code: null, field_label: '字段', field_var: 'V' }]
  }
  const toDelete = await confirmReferenceAwareBatchDelete(box, {
    items,
    refsMap,
    noun: '字典',
    nameOf: (x) => x.name,
    describeRefs: describeRefsByFormat,
  })
  assert.deepEqual(toDelete, [])
  const message = box.calls[0][1]
  assert.equal(
    message,
    [
      `选中的 ${REFERENCE_LIST_MAX + 1} 个字典均已被引用，不能删除（需先解除引用）：`,
      ...Array.from({ length: REFERENCE_LIST_MAX }, (_, idx) => `【字典${idx + 1}】：字段库-字段(V)`),
      `...等共${REFERENCE_LIST_MAX + 1}个字典`,
    ].join('\n'),
  )
})
