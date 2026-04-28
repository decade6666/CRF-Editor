# Proposal: UI Fix — Dark Mode + Layout + Export

## Summary

Three independent fixes:
1. Dark mode: form preview panel background not adapting
2. Project info: move "Trial Name" to Cover Page Info section
3. Word export: cover page format alignment with reference template

## Requirements

### R1: Dark Mode Preview Window

The `.word-page` element in `FormDesignerTab` uses hardcoded colors (`#fff`, `#000`, `#333`, `#d9d9d9`) that don't respond to dark mode CSS variable overrides.

**Target**: Add `html[data-theme="dark"]` overrides for `.word-page` and its children.

**Files**: `frontend/src/styles/main.css`

### R2: Trial Name Field Position

Move `trial_name` field from "Project Info" section to first row of "Cover Page Info" section.

**Target**: Reorder `<el-form-item>` elements in template.

**Files**: `frontend/src/components/ProjectInfoTab.vue`

### R3: Word Cover Page Format

Align exported cover page formatting with reference doc `docs/XX项目-eCRF-V1.0-2026XXXX.docx`.

**Differences found**:
- Empty paragraph before cover table: missing `line_spacing=1.5`
- Sponsor / Data Management Unit paragraphs: missing `space_before=7.8pt, space_after=7.8pt`
- Cover table width: current 5cm (2+3), reference ~6.87cm (pct 46.9%)
- Post-content empty paragraph: missing `line_spacing=2.0`

**Files**: `backend/src/services/export_service.py`

## Constraints

| ID | Type | Constraint |
|----|------|-----------|
| HC-1 | Hard | Preview dark mode uses dark paper color, keeps page metaphor |
| HC-2 | Hard | Override via `html[data-theme="dark"]`, don't break light mode |
| HC-3 | Hard | `.fill-line` untouchable (C-01 red line) |
| HC-4 | Hard | Trial name move is frontend-only, no API change |
| HC-5 | Hard | Scope limited to ProjectInfoTab.vue |
| HC-6 | Hard | Cover table width matches reference (~6.87cm) |
| HC-7 | Hard | Sponsor/DMU paragraph spacing = 7.8pt before/after |
| HC-8 | Hard | Cover empty paragraphs line_spacing per reference |
| SC-1 | Soft | Version number Pt(11) visually equivalent, keep as-is |

## Success Criteria

1. Toggle dark mode → preview `.word-page` background changes to dark paper color
2. Project info page → "Trial Name" appears as first field under "Cover Page Info" divider
3. Export Word → cover page spacing, table width, paragraph formatting matches reference docx

## Dependencies

None. All three requirements are independent and parallelizable.

## Risk

Low. All changes are CSS/template/formatting adjustments with no logic or API impact.
