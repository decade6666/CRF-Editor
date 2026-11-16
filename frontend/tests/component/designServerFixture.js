import { vi } from 'vitest';
import { api } from '../../src/composables/useApi.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
export function stageDesignServer() {
  let sequence = 1;
  let incarnation = 'a'.repeat(32);
  const state = {
    forms: [{ id: 7, project_id: 1, name: '知情同意', code: 'ICF', domain: 'dM',
      design_notes: '旧备注', order_index: 1, paper_orientation: 'landscape', annotation_positions: null }],
    definitions: [1, 2, 3].map((id) => ({ id: 200 + id, project_id: 1,
      variable_name: `FIELD_${id}`, label: `字段${id}`, field_type: '文本',
      integer_digits: null, decimal_digits: null, date_format: null, checkbox_label: null,
      codelist_id: null, unit_id: null, is_multi_record: 0, table_type: '固定行', order_index: id })),
    fields: [1, 2, 3].map((id) => ({ id: 100 + id, form_id: 7, field_definition_id: 200 + id,
      order_index: id, required: 0, is_log_row: 0, inline_mark: 0,
      label_override: null, help_text: null, default_value: null, bg_color: null, text_color: null,
      label_bold: 1, label_font_size: null })),
  };
  const calls = [];
  let rejectReads = false;
  let incoherent = false;
  let writeGate = null;
  let afterAccept = null;
  const revision = () => `"crf-design-v1:p1:${incarnation}:r${sequence}"`;
  const remote = (apply = () => {}) => { apply(state); sequence++; };
  const fieldResponse = (field) => ({ ...field,
    field_definition: field.field_definition_id == null ? null : {
      ...state.definitions.find((item) => item.id === field.field_definition_id), codelist: null, unit: null,
    },
  });
  function respond(data, status = 200, tag = revision()) {
    return new Response(status === 204 ? null : JSON.stringify(copy(data)), {
      status, headers: tag ? { 'X-CRF-Design-Revision': tag } : {},
    });
  }
  function read(url) {
    if (rejectReads) return respond({ detail: '读取暂不可用' }, 503, null);
    if (incoherent) sequence++;
    if (url.endsWith('/references')) return respond([]);
    if (url === '/api/projects/1/forms') return respond(state.forms);
    if (url === '/api/forms/7/fields') return respond([...state.fields].sort((a, b) => a.order_index - b.order_index).map(fieldResponse));
    if (url === '/api/projects/1/field-definitions') return respond(state.definitions);
    if (url.endsWith('/codelists') || url.endsWith('/units')) return respond([]);
    throw new Error(`未脚本化读取 ${url}`);
  }
  function mutate(url, method, body) {
    if (url === '/api/forms/7' && (method === 'PUT' || method === 'PATCH')) {
      Object.assign(state.forms[0], body);
      return respond(state.forms[0]);
    }
    const binding = url.match(/^\/api\/form-fields\/(\d+)\/binding-profile$/);
    if (binding) {
      const index = state.fields.findIndex((item) => item.id === Number(binding[1]));
      if (index < 0) return respond({ detail: '字段不存在' }, 404, null);
      const field = state.fields[index];
      if (body.definition_operation?.operation === 'update_shared') {
        const operation = body.definition_operation.update_shared;
        Object.assign(state.definitions.find((item) => item.id === operation.target_definition_id), operation.definition);
      }
      if (body.instance.mode === 'delete') {
        state.fields.splice(index, 1);
        return respond({ form_field: null, form_field_id: null, final_definition_id: field.field_definition_id, definition_created: false, cleanup: null });
      }
      if (body.binding?.mode === 'existing') field.field_definition_id = body.binding.target_field_definition_id;
      Object.assign(field, body.instance.upsert);
      return respond({ form_field: fieldResponse(field), form_field_id: field.id,
        final_definition_id: field.field_definition_id, definition_created: false, cleanup: null });
    }
    const fieldDelete = url.match(/^\/api\/form-fields\/(\d+)$/);
    if (fieldDelete && method === 'DELETE') {
      state.fields = state.fields.filter((item) => item.id !== Number(fieldDelete[1]));
      return respond(null, 204);
    }
    if (url === '/api/forms/7/fields/reorder') {
      for (const [index, id] of body.ordered_ids.entries()) state.fields.find((item) => item.id === id).order_index = index + 1;
      return respond(null, 204);
    }
    if (url === '/api/forms/7/fields/restore-batch') {
      const restored = body.items.map(({ form_field }) => ({ ...form_field, form_id: 7, id: 300 + sequence }));
      state.fields.push(...restored);
      return respond(restored.map(fieldResponse), 201);
    }
    const definition = url.match(/^\/api\/projects\/1\/field-definitions\/(\d+)$/);
    if (definition && method === 'PUT') {
      const row = state.definitions.find((item) => item.id === Number(definition[1]));
      Object.assign(row, body);
      return respond(row);
    }
    if (url === '/api/projects/1/field-definitions' && method === 'POST') {
      const row = { ...body, project_id: 1, id: 400 + sequence, order_index: state.definitions.length + 1 };
      state.definitions.push(row);
      return respond(row, 201);
    }
    if (url === '/api/projects/1/field-definitions/reorder') {
      for (const [index, id] of body.entries()) state.definitions.find((item) => item.id === id).order_index = index + 1;
      return respond(null, 204);
    }
    const definitionCopy = url.match(/^\/api\/field-definitions\/(\d+)\/copy$/);
    if (definitionCopy && method === 'POST') {
      const source = state.definitions.find((item) => item.id === Number(definitionCopy[1]));
      const row = { ...source, id: 400 + sequence, variable_name: `${source.variable_name}_COPY`,
        order_index: state.definitions.length + 1 };
      state.definitions.push(row);
      return respond(row, 201);
    }
    if (url === '/api/forms/7/field-profile' && method === 'POST') {
      const operation = body.definition_operation;
      const created = operation?.operation === 'create_or_restore';
      const definitionId = created ? 400 + sequence : body.binding?.target_field_definition_id;
      if (created) {
        state.definitions.push({ ...operation.create_or_restore.definition, id: definitionId, project_id: 1,
          order_index: state.definitions.length + 1 });
      }
      const field = { id: 300 + sequence, form_id: 7, field_definition_id: definitionId,
        order_index: state.fields.length + 1, required: 0, is_log_row: 0, inline_mark: 0, label_override: null,
        help_text: null, default_value: null, bg_color: null, text_color: null, label_bold: 1, label_font_size: null,
        ...(body.instance?.upsert || {}) };
      state.fields.push(field);
      return respond({ form_field: fieldResponse(field), form_field_id: field.id,
        final_definition_id: definitionId, definition_created: created, cleanup: null }, 201);
    }
    if (url === '/api/projects/1/forms' && method === 'POST') {
      const row = { ...body, project_id: 1, id: 50 + sequence, order_index: state.forms.length + 1 };
      state.forms.push(row);
      return respond(row, 201);
    }
    throw new Error(`未脚本化写入 ${method} ${url}`);
  }
  api.clearAllCache();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    const call = { url, method, body, revision: options.headers?.['If-Match'], accepted: false };
    calls.push(call);
    if (method === 'GET') return read(url);
    if (writeGate) await writeGate;
    if (call.revision !== revision()) return respond({ detail: '设计已更新，请核对', code: 'STALE_STATE' }, 409, null);
    call.accepted = true;
    sequence++;
    const response = mutate(url, method, body);
    afterAccept?.(call);
    return response;
  });
  return { state, calls, remote, revision,
    recreateProject: () => { incarnation = 'b'.repeat(32); sequence = 1; },
    writes: () => calls.filter((item) => item.method !== 'GET'),
    failReads: (value = true) => { rejectReads = value; },
    inconsistentReads: (value = true) => { incoherent = value; },
    onAccepted: (callback) => { afterAccept = callback; },
    holdWrites: () => {
      let release;
      writeGate = new Promise((resolve) => { release = resolve; });
      return () => { writeGate = null; release(); };
    },
  };
}
