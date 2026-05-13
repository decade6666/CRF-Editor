# Cross-Stack Contracts

> **Purpose**: Index of all cross-stack contracts between backend and frontend.

---

## What is a Cross-Stack Contract?

A cross-stack contract is a **shared agreement** between backend and frontend that must be maintained synchronously. Changes to one side require changes to the other.

**Key Characteristics**:
- Shared fixtures or test data
- Synchronized code changes required
- Breaking changes affect both stacks

---

## Active Cross-Stack Contracts

### 1. Column Width Planning

**Contract ID**: `width-planning`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **File** | `backend/src/services/width_planning.py` | `frontend/src/composables/useCRFRenderer.js` |
| **Purpose** | Calculate column widths for Word export | Render CRF form preview |
| **Shared Fixture** | `backend/tests/fixtures/planner_cases.json` | `frontend/tests/columnWidthPlanning.test.js` |

**Shared Constants**:

```python
# Backend (width_planning.py)
WEIGHT_CHINESE = 2      # CJK character weight
WEIGHT_ASCII = 1        # English/number/punctuation weight
FILL_LINE_WEIGHT = 6    # Fill-line field weight
AVAILABLE_CM = 14.66    # Available width for normal tables
```

```javascript
// Frontend (useCRFRenderer.js)
const WEIGHT_CHINESE = 2
const WEIGHT_ASCII = 1
const FILL_LINE_WEIGHT = 6
const AVAILABLE_CM = 14.66
```

**Contract Rules**:
1. Any change to weight constants must update both files
2. New test cases must be added to shared fixture
3. Both backend and frontend tests must pass

**Synchronization Checklist**:
- [ ] Update `width_planning.py` constants
- [ ] Update `useCRFRenderer.js` constants
- [ ] Add test case to `planner_cases.json`
- [ ] Run `backend/tests/test_width_planning.py`
- [ ] Run `frontend/tests/columnWidthPlanning.test.js`

---

### 2. Two-Phase Ordering Algorithm

**Contract ID**: `ordering-algorithm`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **File** | `backend/src/services/order_service.py` | `frontend/src/composables/useOrderableList.js` |
| **Purpose** | Reorder items avoiding SQLite conflicts | Trigger reorder API calls |

**Algorithm**:

```python
# Backend (order_service.py)
SAFE_OFFSET = 100000  # Avoids unique constraint conflicts

def reorder_items(items: list[dict], target_id: int, new_index: int):
    """
    Phase 1: Shift all items by SAFE_OFFSET
    Phase 2: Set target item to new position
    """
    # Phase 1: Shift
    for item in items:
        item.order_index += SAFE_OFFSET

    # Phase 2: Position
    items[target_id].order_index = new_index
```

**Contract Rules**:
1. Frontend calls `/reorder` endpoint with item ID and new index
2. Backend handles all collision avoidance
3. Frontend receives updated order on success

**API Contract**:

```typescript
// Request
POST /api/forms/{form_id}/fields/reorder
{
  "field_id": 123,
  "new_index": 0
}

// Response
{
  "success": true,
  "fields": [...]  // Updated field list in new order
}
```

---

### 3. Authentication Token Schema

**Contract ID**: `auth-token`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **File** | `backend/src/services/auth_service.py` | `frontend/src/App.vue` |
| **Purpose** | JWT generation/validation | Token storage and API attachment |

**Token Payload**:

```python
# Backend JWT payload
{
    "sub": "username",      # Subject (username)
    "user_id": 1,           # User ID
    "auth_version": 1,      # For token invalidation
    "exp": 1714022400       # Expiration timestamp
}
```

**Contract Rules**:
1. Frontend stores token in `localStorage`
2. Frontend attaches token as `Authorization: Bearer <token>`
3. Backend validates token on protected routes
4. Backend rejects token if `auth_version` mismatched

---

### 4. Word Preview / Export Visual Parity

**Contract ID**: `preview-export-parity`

| Aspect | Backend (Word export) | Frontend (Word preview) |
|--------|----------------------|-------------------------|
| **File** | `backend/src/services/export_service.py` | `frontend/src/composables/useCRFRenderer.js`, `frontend/src/styles/main.css` |
| **Purpose** | Render the authoritative Word document | Render an on-screen preview that matches what the user will get in `.docx` |
| **Shared Constants** | `FILL_LINE_WEIGHT = 6`, trailing-underscore literal length **6**, default text fill-line length **16**, page font **SimSun 10.5pt** | Same |

**Shared Literals** (must be kept in lock-step):

```python
# Backend (export_service.py)
# trailing_underscore option:
atom_text = label + " " + "_" * 6           # _render_choice_field
return f"{label}______" if has_trailing ...      # _get_option_labels
# default text placeholder:
run = paragraph.add_run("________________")      # 16 `_`
# planner weight:
FILL_LINE_WEIGHT = 6                              # width_planning.py
```

```javascript
// Frontend (useCRFRenderer.js)
const FILL_LINE_WEIGHT = 6                                       // planner weight
option.trailingUnderscore ? `${option.text}______` : option.text // 6 `_` literal
return '________________' + unit                                  // 16 `_` placeholder
const minWidth = (safeLength * 0.5).toFixed(1)                    // 0.5em/char visual estimator
```

```css
/* main.css — page font that calibrates the 0.5em estimator */
.word-page { font-size: 10.5pt; font-family: 'SimSun', serif; }
```

**Contract Rules**:
1. **Character counts are the contract**: trailing underscore = 6, default text fill-line = 16. Changing one side requires changing the other and the planner constant if it pulls weight from the count.
2. **`FILL_LINE_WEIGHT = 6` is the planner contract**, not the visual width. Adjusting only the preview's em-estimator (e.g. `0.5em` factor) is a **frontend-only visual change** and MUST NOT bump the constant.
3. **Page font size is part of the contract**: `.word-page { font-size: 10.5pt }` calibrates the `0.5em` factor. Switching to `px` / `rem` invalidates the calibration.
4. **Two render paths on the frontend**: `renderCtrlHtml → renderChoiceHtml` and `renderCtrl → toHtml`. Both produce DOM and BOTH must be updated together. See `.trellis/spec/frontend/component-guidelines.md` → "Scenario: Word Preview ↔ Word Export Visual Parity".

**Synchronization Checklist**:
- [ ] Update `export_service.py` `_render_choice_field` / `_get_option_labels` literals
- [ ] Update `useCRFRenderer.js` `renderCtrl` literal (path A)
- [ ] Update `useCRFRenderer.js` `renderChoiceHtml` `buildFillLineHtml(N)` (path B)
- [ ] If changing the planner weight, update **both** `FILL_LINE_WEIGHT` constants
- [ ] If retuning the visual estimator, **do not** touch any character count or planner weight
- [ ] Run `backend/tests/test_export_unified.py`, `tests/test_width_planning.py`
- [ ] Run `frontend/tests/columnWidthPlanning.test.js`, `tests/wordPageGeometry.test.js`, `tests/formFieldPresentation.test.js`
- [ ] Manual: side-by-side A4 zoom 100% preview vs exported `.docx` at Word 100% zoom

**Common Pitfall** (recorded incident):
> Only `renderChoiceHtml` was patched; `renderCtrl` (path A) still produced 20 `_`,
> so the `访视` (Visits) tab inline table and the designer's own `getInlineRows`
> kept showing wide fill-lines. The user reported "硬刷新后无变化". Always check
> BOTH render paths plus the visual estimator before declaring the fix done.

---

### 5. Form Paper Orientation

**Contract ID**: `form-paper-orientation`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Files** | `backend/src/models/form.py`, `backend/src/schemas/form.py`, `backend/src/database.py`, `backend/src/routers/forms.py`, `backend/src/services/project_clone_service.py`, `backend/src/services/project_import_service.py`, `backend/src/services/export_service.py` | `frontend/src/components/FormDesignerTab.vue`, `frontend/src/components/VisitsTab.vue` |
| **Purpose** | Persist per-form `paper_orientation`; honor it in Word export | Edit per-form orientation; render designer & visit preview with correct A4 geometry |

**Schema**:

```python
# Backend (models/form.py + schemas/form.py)
paper_orientation: Literal["auto", "landscape", "portrait"] = "auto"
```

- Lightweight migration in `backend/src/database.py` adds the column to legacy DBs with default `"auto"`.
- `project_clone_service.py` and `project_import_service.py` preserve / default the field when copying or importing old `.db` files.
- `export_service.py` consults the value to decide A4 landscape vs portrait per form section.

**Frontend resolution**:

```javascript
// FormDesignerTab.vue  /  VisitsTab.vue
const landscapeMode = resolveLandscape(form.paper_orientation, autoFallbackFlag)
// 'auto'      → fall back to content-driven decision
// 'landscape' → force landscape
// 'portrait'  → force portrait
```

- Designer: `selectedFormPaperOrientation` + `resolveLandscape` drive `.designer-scaled-word-page.landscape`.
- Visits preview: `resolvePreviewLandscape` + `previewLandscapeMode` drive the same CSS class on inline preview.
- Legacy `localStorage['crf_forceLandscape']` is migrated **once** to per-form settings on first load; do not reintroduce reads of the legacy global flag after migration.

**Contract Rules**:
1. The string set is closed: only `"auto" | "landscape" | "portrait"`. Adding a new value requires schema + migration + both UI sites + export.
2. Export decision MUST match the frontend `resolveLandscape` semantics for the same value; do not diverge "auto" behavior between preview and export.
3. CSS class is `.word-page.landscape` / `.designer-scaled-word-page.landscape` (see `frontend/src/styles/main.css` and `wordPageGeometry.test.js`). Renaming the class breaks the geometry contract.
4. Project clone / Word-`.docx` import / legacy `.db` import paths must preserve or default the field, never drop it.

**Synchronization Checklist**:
- [ ] Update `Form` model column + Pydantic schema
- [ ] Extend `database.py` lightweight migration for the new value (if expanding the enum)
- [ ] Update `forms.py` create/update routes
- [ ] Update `project_clone_service.py` & `project_import_service.py` field carry-over
- [ ] Update `export_service.py` orientation branch
- [ ] Update `FormDesignerTab.vue` (`selectedFormPaperOrientation`, `resolveLandscape`, edit radio-group)
- [ ] Update `VisitsTab.vue` (`resolvePreviewLandscape`, `previewLandscapeMode`)
- [ ] Run `backend/tests/test_form_paper_orientation.py`, `test_export_paper_orientation.py`, `test_project_copy.py`
- [ ] Run `frontend/tests/visitPreviewLandscape.test.js`, `wordPageGeometry.test.js`

---

## How to Maintain Cross-Stack Contracts

### Before Changing Contract Code

1. **Search both stacks**:

```bash
# Search for the constant/function name
grep -r "WEIGHT_CHINESE" backend/ frontend/
grep -r "SAFE_OFFSET" backend/ frontend/
```

2. **Read both implementations**:

```bash
cat backend/src/services/width_planning.py
cat frontend/src/composables/useCRFRenderer.js
```

3. **Run tests on both sides**:

```bash
cd backend && python -m pytest tests/test_width_planning.py
cd frontend && node --test tests/columnWidthPlanning.test.js
```

### After Changing Contract Code

1. **Update shared fixtures** (if applicable)
2. **Run full test suite on both stacks**
3. **Update this index if contract changes**

---

## Adding New Cross-Stack Contracts

When creating a new cross-stack contract:

1. **Create shared fixture** in `backend/tests/fixtures/`
2. **Document in this index** with:
   - Contract ID
   - Backend file
   - Frontend file
   - Shared constants/functions
   - Synchronization checklist
3. **Add tests** that use shared fixture on both sides

---

## Quick Reference

| Contract | Backend File | Frontend File | Shared Fixture |
|----------|--------------|---------------|----------------|
| Width Planning | `services/width_planning.py` | `useCRFRenderer.js` | `planner_cases.json` |
| Ordering | `services/order_service.py` | `useOrderableList.js` | None |
| Auth Token | `services/auth_service.py` | `App.vue` | None |
| Preview / Export Parity | `services/export_service.py` | `useCRFRenderer.js`, `styles/main.css` | None (manual A4 side-by-side) |
| Form Paper Orientation | `models/form.py`, `schemas/form.py`, `database.py`, `routers/forms.py`, `services/export_service.py` (+ clone/import) | `components/FormDesignerTab.vue`, `components/VisitsTab.vue` | None |

---

## Common Mistakes

### 1. Updating Only One Side

```python
# WRONG - Only backend updated
WEIGHT_CHINESE = 3  # Changed in backend only
```

```javascript
// Frontend still has old value
const WEIGHT_CHINESE = 2  // MISMATCH!
```

### 2. Not Running Tests on Both Stacks

```bash
# WRONG - Only backend tests
cd backend && python -m pytest

# CORRECT - Both stacks
cd backend && python -m pytest tests/test_width_planning.py
cd frontend && node --test tests/columnWidthPlanning.test.js
```

### 3. Changing Shared Fixture Format Without Updating Tests

```json
// WRONG - Changed fixture format
{ "name": "case1", "input": [...], "expected": [...] }

// Tests still expect old format
const { fields, expectedFractions } = testCase  // FAILS
```

---

## Tests Required

When modifying cross-stack contracts, run:

| Contract | Backend Test | Frontend Test |
|----------|--------------|---------------|
| Width Planning | `tests/test_width_planning.py` | `tests/columnWidthPlanning.test.js` |
| Ordering | `tests/test_ordering.py` | Manual E2E verification |
| Auth Token | `tests/test_auth.py` | `tests/App.test.js` |
| Preview / Export Parity | `tests/test_export_unified.py`, `tests/test_width_planning.py` | `tests/columnWidthPlanning.test.js`, `tests/wordPageGeometry.test.js`, `tests/formFieldPresentation.test.js` + manual A4 side-by-side |
| Form Paper Orientation | `tests/test_form_paper_orientation.py`, `tests/test_export_paper_orientation.py`, `tests/test_project_copy.py` | `tests/visitPreviewLandscape.test.js`, `tests/wordPageGeometry.test.js` |
