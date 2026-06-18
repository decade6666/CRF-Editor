ROLE_FILE: C:/Users/93975/.claude/.ccg/prompts/gemini/reviewer.md
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
- Code readability and naming conventions
- Design consistency with existing FormDesignerTab patterns
- Maintainability: Is the code easy to understand and modify?
- Template structure: Proper Vue 3 patterns, correct v-for key usage, accessibility
- CSS: Is the simplified header-icon-btn style sufficient? Any missing states (focus, active, dark mode)?

Constraints:
- Do NOT modify any files.
- Output a prioritized list of issues (severity, file, rationale).
- If code changes are needed, include a Unified Diff Patch in a fenced code block.
</TASK>
OUTPUT:
1) A prioritized list of issues (severity, file, rationale)
2) If code changes are needed, include a Unified Diff Patch in a fenced code block.
