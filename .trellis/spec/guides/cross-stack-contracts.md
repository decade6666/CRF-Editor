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
