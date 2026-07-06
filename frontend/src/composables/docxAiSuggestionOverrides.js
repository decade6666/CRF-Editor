// 必须与 backend ai_review_service.VALID_FIELD_TYPES 同步。
export const VALID_FIELD_TYPES = Object.freeze([
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

const VALID_FIELD_TYPE_SET = new Set(VALID_FIELD_TYPES);

function getSuggestions(form) {
  return Array.isArray(form?.ai_suggestions) ? form.ai_suggestions : [];
}

function getAcceptedForForm(accepted, formIndex) {
  const formAccepted = accepted?.[formIndex];
  return formAccepted && typeof formAccepted === 'object' ? formAccepted : null;
}

function getAcceptedCount(form, accepted) {
  const suggestions = getSuggestions(form);
  const formAccepted = getAcceptedForForm(accepted, form?.index);
  if (!suggestions.length || !formAccepted) return 0;

  let acceptedCount = 0;
  for (const suggestion of suggestions) {
    if (formAccepted[suggestion.index] === suggestion.suggested_type) {
      acceptedCount += 1;
    }
  }
  return acceptedCount;
}

export function reconcileAcceptedOverrides(nextForms, accepted) {
  const reconciled = {};

  for (const form of nextForms || []) {
    const formAccepted = getAcceptedForForm(accepted, form?.index);
    if (!formAccepted) continue;

    const kept = {};
    for (const suggestion of getSuggestions(form)) {
      if (formAccepted[suggestion.index] === suggestion.suggested_type) {
        kept[suggestion.index] = suggestion.suggested_type;
      }
    }

    if (Object.keys(kept).length) {
      reconciled[form.index] = kept;
    }
  }

  return reconciled;
}

export function getAcceptedSuggestionsForForm(form, accepted) {
  const formAccepted = getAcceptedForForm(accepted, form?.index);
  if (!formAccepted) return [];

  return getSuggestions(form)
    .filter((suggestion) => formAccepted[suggestion.index] === suggestion.suggested_type)
    .map((suggestion) => ({ ...suggestion }));
}

export function isFormFullyAccepted(form, accepted) {
  const suggestionCount = getSuggestions(form).length;
  if (!suggestionCount) return false;
  return getAcceptedCount(form, accepted) === suggestionCount;
}

export function isFormIndeterminate(form, accepted) {
  const suggestionCount = getSuggestions(form).length;
  if (!suggestionCount) return false;
  const acceptedCount = getAcceptedCount(form, accepted);
  return acceptedCount > 0 && acceptedCount < suggestionCount;
}

export function isAllAccepted(forms, accepted) {
  const formsWithSuggestions = (forms || []).filter((form) => getSuggestions(form).length > 0);
  if (!formsWithSuggestions.length) return false;
  return formsWithSuggestions.every((form) => isFormFullyAccepted(form, accepted));
}

export function isAllIndeterminate(forms, accepted) {
  const formsWithSuggestions = (forms || []).filter((form) => getSuggestions(form).length > 0);
  if (!formsWithSuggestions.length) return false;

  let totalSuggestions = 0;
  let totalAccepted = 0;
  for (const form of formsWithSuggestions) {
    totalSuggestions += getSuggestions(form).length;
    totalAccepted += getAcceptedCount(form, accepted);
  }

  return totalAccepted > 0 && totalAccepted < totalSuggestions;
}

export function buildAiOverridesPayload({ forms, accepted, selectedFormIndices }) {
  const selected = new Set(selectedFormIndices || []);
  const payload = [];

  for (const form of forms || []) {
    if (!selected.has(form?.index)) continue;

    const fieldsByIndex = new Map(
      (Array.isArray(form?.fields) ? form.fields : []).map((field) => [field.index, field]),
    );
    const overrides = [];

    for (const suggestion of getAcceptedSuggestionsForForm(form, accepted)) {
      if (!VALID_FIELD_TYPE_SET.has(suggestion.suggested_type)) continue;

      const field = fieldsByIndex.get(suggestion.index);
      if (!field) continue;
      if (field.field_type === suggestion.suggested_type) continue;

      overrides.push({
        index: suggestion.index,
        field_type: suggestion.suggested_type,
      });
    }

    if (overrides.length) {
      payload.push({
        form_index: form.index,
        overrides,
      });
    }
  }

  return payload;
}
