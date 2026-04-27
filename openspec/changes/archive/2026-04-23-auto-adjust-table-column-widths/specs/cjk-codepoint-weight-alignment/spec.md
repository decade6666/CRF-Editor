## ADDED Requirements

### Requirement: Frontend computeCharWeight uses codePointAt for non-BMP CJK parity with backend
`frontend/src/composables/useCRFRenderer.js` `computeCharWeight(char)` SHALL use `char.codePointAt(0)` (not `char.charCodeAt(0)`) to obtain the code point for range comparison, ensuring CJK Extension B through Extension J characters are correctly classified as WEIGHT_CHINESE. This aligns with backend `backend/src/services/width_planning.py` `compute_char_weight` which uses `ord(char)`.

#### Scenario: Extension B character weighted as Chinese
- **WHEN** `computeCharWeight('𠮷')` is called (U+20BB7, Extension B)
- **THEN** the return value equals `WEIGHT_CHINESE` (2)
- **AND** the return value matches `compute_char_weight('𠮷')` from the backend

#### Scenario: Extension C+ character weighted as Chinese
- **WHEN** `computeCharWeight('𪚥')` is called (U+2A6A5, Extension C) OR any char in 0x2A700–0x2CEAF
- **THEN** the return value equals `WEIGHT_CHINESE` (2)

#### Scenario: ASCII characters unchanged
- **WHEN** `computeCharWeight(c)` is called for any `c` in ASCII printable range (0x20 – 0x7E)
- **THEN** the return value equals `WEIGHT_ASCII` (1)

#### Scenario: computeTextWeight iterates via for-of for correct code points
- **WHEN** `computeTextWeight('A𠮷中')` is called
- **THEN** the total weight equals `WEIGHT_ASCII + WEIGHT_CHINESE + WEIGHT_CHINESE` (1 + 2 + 2 = 5)
- **AND** the `for...of` iteration visits exactly 3 code points (NOT 4 UTF-16 code units)

### Requirement: Cross-stack parity fixture covers rare CJK characters
The parity fixture `backend/tests/fixtures/planner_cases.json` (or an equivalent location shared by both stacks) SHALL include at least one test case whose text contains Extension B+ CJK characters, ensuring the parity assertion fails if either stack regresses.

#### Scenario: Rare CJK fixture present
- **WHEN** the test fixture file is inspected
- **THEN** at least one fixture entry has a field label containing `𠮷` or another Extension B+ character
- **AND** the expected fraction output is derivable from both frontend `planInlineColumnFractions` and backend `plan_inline_table_width`

#### Scenario: Parity test catches regression
- **WHEN** the frontend regresses to `charCodeAt(0)` (or any method that undercounts non-BMP CJK)
- **THEN** a cross-stack parity test fails, pinpointing the divergent field

### Requirement: No behavioral change for BMP CJK and ASCII
The codePoint migration SHALL NOT change the weight of any character in the Basic Multilingual Plane (BMP). Existing CJK Basic (0x4E00–0x9FFF), CJK Extension A (0x3400–0x4DBF), compatibility ideographs (0xF900–0xFAFF), and ASCII characters SHALL produce identical weights before and after the change.

#### Scenario: BMP CJK characters unchanged
- **WHEN** `computeCharWeight` is called on any character in 0x4E00–0x9FFF, 0x3400–0x4DBF, or 0xF900–0xFAFF
- **THEN** the result equals `WEIGHT_CHINESE` (2) — same as before the change

#### Scenario: Existing tests pass unchanged
- **WHEN** all existing frontend unit tests in `frontend/tests/` that call `computeTextWeight` or `buildInlineColumnDemands` with BMP-only inputs are re-run
- **THEN** all of them pass without modification
