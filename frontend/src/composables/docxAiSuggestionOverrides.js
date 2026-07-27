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
      const hasSuggestedFields =
        Array.isArray(suggestion.suggested_fields) && suggestion.suggested_fields.length > 0;

      // 一对多替换允许首项为「复选」（不在 VALID_FIELD_TYPES 内）
      if (!hasSuggestedFields && !VALID_FIELD_TYPE_SET.has(suggestion.suggested_type)) continue;

      const field = fieldsByIndex.get(suggestion.index);
      if (!field) continue;
      if (!hasSuggestedFields && field.field_type === suggestion.suggested_type) continue;

      const entry = {
        index: suggestion.index,
        field_type: suggestion.suggested_type,
      };
      if (hasSuggestedFields) {
        entry.suggested_fields = suggestion.suggested_fields.map((sf) => ({
          label: sf.label,
          field_type: sf.field_type,
          ...(sf.inline_mark ? { inline_mark: true } : {}),
        }));
      }
      overrides.push(entry);
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

/** 将一对多 AI 建议展开到预览字段列表（仅用于 SimulatedCRFForm ai 模式）。 */
export function expandFieldsWithAcceptedSuggestions(fields, acceptedSuggestions) {
  const byIndex = new Map();
  for (const sug of acceptedSuggestions || []) {
    byIndex.set(sug.index, sug);
  }
  const out = [];
  for (const field of fields || []) {
    const sug = byIndex.get(field.index);
    if (!sug) {
      out.push({ ...field, _aiModified: false });
      continue;
    }
    if (Array.isArray(sug.suggested_fields) && sug.suggested_fields.length) {
      sug.suggested_fields.forEach((sf, i) => {
        out.push({
          ...field,
          index: `${field.index}:${i}`,
          label: sf.label,
          field_type: sf.field_type,
          options: undefined,
          inline_mark: sf.inline_mark ? 1 : field.inline_mark,
          _aiModified: true,
        });
      });
    } else {
      out.push({ ...field, field_type: sug.suggested_type, _aiModified: true });
    }
  }
  return out;
}
