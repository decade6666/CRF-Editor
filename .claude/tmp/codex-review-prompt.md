ROLE_FILE: C:/Users/93975/.claude/.ccg/prompts/codex/reviewer.md
<TASK>
Scope: Audit the code changes made by Codex for the VisitsTab form preview security and quality fix.

Inputs:
- The git diff of applied changes (run `git diff HEAD` in the working directory to see them)
- The implementation plan at .claude/plan/review-fix-visits-preview.md

The changes cover:
1. VisitsTab.vue: Import useCRFRenderer, rewrite renderCellHtml/getInlineRows/previewRenderGroups to reuse safe rendering composable, add error handling with ElMessage, responsive dialog width, template aligned with FormDesignerTab
2. App.vue: Replace emoji buttons with Element Plus icon components, unify class to header-icon-btn
3. main.css: Replace glassmorphism button styles with simplified header-icon-btn styles, remove !important

Focus your review on:
- Security: XSS prevention completeness, any remaining unsafe v-html usage
- Correctness: Property name mapping (inline_mark, field_definition, label_override), edge cases (null field_definition, missing codelist)
- Performance: Any unnecessary re-renders in computed/template
- Logic: Does renderCellHtml correctly handle all field types (text, number, date, single-choice, multi-choice, vertical variants)?
- DRY: Is the rendering logic properly delegated to useCRFRenderer without duplication?

Constraints:
- Do NOT modify any files.
- Output a prioritized list of issues (severity, file, rationale).
- If code changes are needed, include a Unified Diff Patch in a fenced code block.
</TASK>
OUTPUT:
1) A prioritized list of issues (severity, file, rationale)
2) If code changes are needed, include a Unified Diff Patch in a fenced code block.
