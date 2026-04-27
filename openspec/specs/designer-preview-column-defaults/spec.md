## ADDED Requirements

### Requirement: useColumnResize accepts a defaults source that can be re-evaluated
The `useColumnResize(formIdRef, tableKindRef, defaultsSource)` composable SHALL accept `defaultsSource` as any of: a plain `number[]` array, a zero-argument function returning `number[]`, a Vue `Ref<number[]>`, or a `ComputedRef<number[]>`. The composable SHALL resolve `defaultsSource` on initialization, on `rehydrate()`, and on `resetToEven()` — not only once at composable creation.

#### Scenario: Defaults source as array (backward compatibility)
- **WHEN** `useColumnResize(idRef, keyRef, [0.3, 0.7])` is invoked
- **THEN** the composable stores `[0.3, 0.7]` as the fallback defaults
- **AND** all existing call sites that pass a static array continue to work without modification

#### Scenario: Defaults source as function is called on rehydrate
- **WHEN** `useColumnResize(idRef, keyRef, () => planInlineColumnFractions(fields))` is invoked
- **AND** `formIdRef.value` or `tableKindRef.value` changes
- **THEN** the composable calls the function again to obtain fresh defaults
- **AND** `colRatios.value` is updated based on the new defaults (if localStorage has no valid saved value)

#### Scenario: Defaults source as ref/computed is resolved lazily
- **WHEN** `defaultsSource` is a Vue ref or computed ref
- **THEN** the composable reads `defaultsSource.value` each time it needs defaults (via an internal `resolveValue` helper)

### Requirement: localStorage-saved ratios take precedence over content-driven defaults
When a valid ratio array is persisted at `crf:designer:col-widths:<form_id>:<table_kind>`, `useColumnResize` SHALL restore that array instead of calling `resolveDefaults()`. A ratio array is valid when: (a) it is a JSON-parsed array of finite numbers, (b) length matches the current defaults length, (c) each value is within `[0.1, 0.9]`, and (d) the sum is within `1e-3` of 1.

#### Scenario: Valid localStorage wins over content-driven defaults
- **WHEN** `localStorage.getItem(key)` returns `[0.4, 0.6]` for a `normal` table
- **AND** content-driven defaults would be `[0.3, 0.7]`
- **THEN** `colRatios.value` equals `[0.4, 0.6]` on composable creation
- **AND** `colRatios.value` equals `[0.4, 0.6]` after `rehydrate()`

#### Scenario: Invalid localStorage falls back to content-driven defaults
- **WHEN** `localStorage.getItem(key)` returns an array that violates any validity rule
- **THEN** the composable discards the stored value and uses `resolveDefaults()`
- **AND** the invalid stored value is NOT automatically overwritten
- **AND** the next successful drag-end writes a valid value

#### Scenario: Column count change invalidates old stored value
- **WHEN** a table transitions from N columns to M columns (N ≠ M)
- **AND** the localStorage key changes (because `tableKind` embeds `colCount`)
- **THEN** the old stored ratios are left as orphan data (not deleted, not applied)
- **AND** the new key's defaults use content-driven initial ratios

### Requirement: resetToEven() clears storage and returns to content-driven defaults
The `resetToEven()` function (name preserved for backward compatibility) SHALL remove the current localStorage entry and set `colRatios.value` to the result of `resolveDefaults()` — NOT to equal distribution.

#### Scenario: Reset clears localStorage
- **WHEN** the user clicks "重置" triggering `resetToEven()`
- **THEN** `localStorage.removeItem(key)` is invoked for the current key
- **AND** `colRatios.value` is set to the latest `resolveDefaults()` output

#### Scenario: Reset is idempotent
- **WHEN** `resetToEven()` is called twice in succession
- **THEN** the second call produces the same `colRatios.value` as the first
- **AND** localStorage still has no entry for the key

### Requirement: FormDesignerTab getResizer passes reactive refs and per-kind factories
`FormDesignerTab.vue` SHALL invoke `useColumnResize` with a `computed` ref for `formId`, a `computed` ref for `tableKind`, and a factory closure whose body reads the current group fields and dispatches to the correct planner (`normal` → `planNormalColumnFractions`, `inline` → `planInlineColumnFractions`, `unified` → `planUnifiedColumnFractions`).

#### Scenario: formIdRef triggers rehydrate on form switch
- **WHEN** the user switches from form A to form B in the designer
- **AND** the watcher inside `useColumnResize` fires on `formIdRef` change
- **THEN** `rehydrate()` is called, reading form B's localStorage key
- **AND** `colRatios.value` reflects form B's saved or content-driven values

#### Scenario: Kind-specific factory dispatches to correct planner
- **WHEN** `getResizer('normal', 2, groupIndex)` is invoked
- **THEN** the factory returns `planNormalColumnFractions(group.fields)`
- **WHEN** `getResizer('inline', colCount, groupIndex)` is invoked
- **THEN** the factory returns `planInlineColumnFractions(group.fields)`
- **WHEN** `getResizer('unified', colCount, groupIndex)` is invoked
- **THEN** the factory constructs segments via `buildFormDesignerUnifiedSegments` and returns `planUnifiedColumnFractions(segments, group.colCount)`

### Requirement: Drag interaction and snap behavior remain unchanged
The drag threshold (±4px), snap anchors (25%, 33%, 50%, 67%, 75% plus sibling boundaries), MIN_RATIO (0.1), MAX_RATIO (0.9), and on-drag-end localStorage persistence SHALL remain unchanged from the prior behavior.

#### Scenario: Drag threshold preserved
- **WHEN** a user drags a column separator
- **THEN** snap occurs within ±4 pixels of any anchor
- **AND** MIN_RATIO clamping prevents any column below 0.1

#### Scenario: Snap anchors unchanged
- **WHEN** the user drags near 25%, 33%, 50%, 67%, or 75%
- **THEN** the separator snaps to that anchor
- **AND** a visual guide appears while snapped
