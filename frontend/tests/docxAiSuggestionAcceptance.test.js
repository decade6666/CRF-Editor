import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_FIELD_TYPES,
  buildAiOverridesPayload,
  isAllAccepted,
  isAllIndeterminate,
  isFormFullyAccepted,
  isFormIndeterminate,
  reconcileAcceptedOverrides,
} from '../src/composables/docxAiSuggestionOverrides.js';

function buildForm({
  index,
  fields = [],
  ai_suggestions = [],
}) {
  return { index, fields, ai_suggestions };
}

test('VALID_FIELD_TYPES stays aligned with backend AI review field types', () => {
  assert.deepEqual(VALID_FIELD_TYPES, [
    '文本',
    '数值',
    '日期',
    '时间',
    '单选',
    '多选',
    '单选（纵向）',
    '多选（纵向）',
    '标签',
  ]);
});

test('reconcileAcceptedOverrides keeps only suggestions that still exist with the same suggested type', () => {
  const nextForms = [
    buildForm({
      index: 0,
      ai_suggestions: [
        { index: 0, suggested_type: '单选', reason: 'keep' },
        { index: 1, suggested_type: '时间', reason: 'changed type' },
      ],
    }),
    buildForm({
      index: 1,
      ai_suggestions: [{ index: 2, suggested_type: '日期', reason: 'new only' }],
    }),
  ];
  const accepted = {
    0: { 0: '单选', 1: '日期' },
    1: { 1: '文本' },
    2: { 0: '标签' },
  };

  assert.deepEqual(reconcileAcceptedOverrides(nextForms, accepted), {
    0: { 0: '单选' },
  });
});

test('form and global acceptance helpers derive unchecked, indeterminate, and fully accepted states', () => {
  const forms = [
    buildForm({
      index: 0,
      ai_suggestions: [
        { index: 0, suggested_type: '单选' },
        { index: 1, suggested_type: '日期' },
      ],
    }),
    buildForm({
      index: 1,
      ai_suggestions: [{ index: 0, suggested_type: '多选' }],
    }),
    buildForm({ index: 2, ai_suggestions: [] }),
  ];

  const partiallyAccepted = {
    0: { 0: '单选' },
  };
  const fullyAccepted = {
    0: { 0: '单选', 1: '日期' },
    1: { 0: '多选' },
  };

  assert.equal(isFormFullyAccepted(forms[0], partiallyAccepted), false);
  assert.equal(isFormIndeterminate(forms[0], partiallyAccepted), true);
  assert.equal(isFormFullyAccepted(forms[0], fullyAccepted), true);
  assert.equal(isFormIndeterminate(forms[0], fullyAccepted), false);
  assert.equal(isFormFullyAccepted(forms[2], fullyAccepted), false);
  assert.equal(isFormIndeterminate(forms[2], fullyAccepted), false);

  assert.equal(isAllAccepted(forms, partiallyAccepted), false);
  assert.equal(isAllIndeterminate(forms, partiallyAccepted), true);
  assert.equal(isAllAccepted(forms, fullyAccepted), true);
  assert.equal(isAllIndeterminate(forms, fullyAccepted), false);
});

test('buildAiOverridesPayload keeps only selected forms, active suggestions, valid types, and real type changes', () => {
  const forms = [
    buildForm({
      index: 0,
      fields: [
        { index: 0, field_type: '文本' },
        { index: 1, field_type: '文本' },
      ],
      ai_suggestions: [
        { index: 0, suggested_type: '文本', reason: 'same type' },
        { index: 1, suggested_type: '单选', reason: 'valid diff' },
      ],
    }),
    buildForm({
      index: 1,
      fields: [
        { index: 0, field_type: '单选' },
        { index: 1, field_type: '文本' },
      ],
      ai_suggestions: [
        { index: 0, suggested_type: '单选', reason: 'same type' },
        { index: 1, suggested_type: '日期', reason: 'valid diff' },
        { index: 2, suggested_type: '未知类型', reason: 'invalid type' },
      ],
    }),
    buildForm({
      index: 2,
      fields: [{ index: 0, field_type: '文本' }],
      ai_suggestions: [{ index: 0, suggested_type: '数值', reason: 'not selected' }],
    }),
  ];
  const accepted = {
    0: { 1: '单选' },
    1: { 0: '单选', 1: '日期', 2: '未知类型' },
    2: { 0: '数值' },
  };

  assert.deepEqual(
    buildAiOverridesPayload({
      forms,
      accepted,
      selectedFormIndices: [0, 1],
    }),
    [
      {
        form_index: 0,
        overrides: [{ index: 1, field_type: '单选' }],
      },
      {
        form_index: 1,
        overrides: [{ index: 1, field_type: '日期' }],
      },
    ],
  );
});

test('buildAiOverridesPayload returns an empty list when nothing valid is accepted', () => {
  const forms = [
    buildForm({
      index: 0,
      fields: [{ index: 0, field_type: '文本' }],
      ai_suggestions: [{ index: 0, suggested_type: '文本', reason: 'same type' }],
    }),
  ];

  assert.deepEqual(
    buildAiOverridesPayload({
      forms,
      accepted: { 0: { 0: '文本' } },
      selectedFormIndices: [0],
    }),
    [],
  );
  assert.deepEqual(
    buildAiOverridesPayload({
      forms,
      accepted: {},
      selectedFormIndices: [0],
    }),
    [],
  );
});
