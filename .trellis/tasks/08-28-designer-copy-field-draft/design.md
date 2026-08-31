# Technical Design

## Scope and behavior split

`FormDesignerTab.vue` already has two distinct copy paths:

- Regular field: the current implementation calls the field-definition copy endpoint and then creates a form-field instance.
- Log row: the current implementation creates only a form-field instance with `field_definition_id: null`.

Only the regular-field path changes. Log-row copy stays immediate and keeps its existing history replay behavior.

## Data flow

Regular-field copy:

```text
persisted FormField + FieldDefinition
  -> local OID collision ladder
  -> local __draft__ FormField with copied definition and instance values
  -> existing draft editor / guards
  -> saveDraftField
  -> POST /api/forms/{form_id}/field-profile
       { definition_operation, binding, instance, order_index }
  -> backend create_field_profile
       -> create definition + insert FormField at order_index in one transaction
  -> reload/select + record `复制字段` history
```

The backend already accepts `FieldProfileCommand.order_index` and calls `OrderService.insert_at` for non-null values. No backend production code or schema change is needed.

## Local draft representation

Reuse `DRAFT_FIELD_ID = '__draft__'` and `__draft: true`. Add copy-only metadata:

- `__draftOrigin: 'copy'` selects the history label `复制字段` at save time.
- `__draftOrderIndex: source.order_index + 1` is the integer persistence target.
- `order_index: source.order_index + 0.5` is local-only display ordering, so the draft renders immediately after its source while subsequent persisted rows retain their integer order.

The draft embeds a new complete `field_definition` object. Its definition values are copied immutably from the source, with only `variable_name` replaced by the locally generated candidate. Instance presentation values are copied using the same field-instance whitelist already used by replay payload construction.

## OID generation

Add a pure helper in `fieldDefinitionAutocomplete.js`:

```js
buildCopyVariableName(existingNames, sourceVariableName)
```

It normalizes the source to a string, prefers `<source>_copy`, and appends the smallest numeric suffix beginning at `1` while the candidate is present. Callers pass every `fieldDefs.value` variable name, not only visible field-library definitions, because the backend project-level unique constraint includes hidden definitions.

## Component changes

Keep all existing guards in `copyFormField` (draft, history busy, reorder, row lock, property/form leave, draft confirmation, and history context). After those guards:

- Re-read the source row from `formFields.value` by id because a draft confirmation may have saved/reloaded state.
- For a regular field, build and insert the local copy draft, select it, and return without membership mutation bookkeeping, cache invalidation, reload, or history recording.
- For a log row, retain the existing network path and history entry. Extracting the path into a helper is optional only if it keeps the component readable and does not change the current runtime/test contract.

In `saveDraftField`:

- Add `order_index` to the command only for copied drafts with an integer `__draftOrderIndex`.
- Add `is_multi_record` and `table_type` to `editorState` only when present on the draft definition. New-field drafts intentionally omit these keys so candidate-link behavior does not overwrite a candidate's structural values with defaults.
- Select the history label based on `draft.__draftOrigin`, while leaving new-field drafts labeled `新建字段`.
- Preserve the existing redo command construction; spreading the command carries `order_index` into redo.

## Error and compatibility behavior

A stale field-definition list can still produce a server-side OID conflict. The existing save validation/API error path keeps the draft and displays the existing actionable error. No definition is created before the atomic field-profile request, so regular copy no longer has a copy-definition/orphan window.

The local fractional order is never sent to the backend. Only `__draftOrderIndex` is sent, and the backend performs the authoritative shift/insert.

## Test design

Extend the source/runtime contract tests around `copyFormField` and `saveDraftField`:

- regular copy has zero requests and creates a selected draft;
- copied values and OID ladder, including hidden definitions, are preserved;
- draft cancellation/guards remain active;
- copied save carries integer `order_index`, structural keys, and `复制字段` history label;
- log-row copy remains immediate;
- backend field-profile order insertion is covered by a route regression.

Update only the relevant frontend draft/history contracts and the user-facing module/spec notes. No shared width, rendering, authentication, or import/export contract is changed.
