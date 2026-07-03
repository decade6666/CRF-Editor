你是资深前端 + CSS 审查专家。请审查一份 bug 修复 PRD 的技术正确性与完整性。只做只读审查，不要修改任何文件。

## 待审查 PRD
文件路径：`.trellis/tasks/06-30-acrf-reset-button-hover-only/prd.md`

## 需要你独立核实的源码事实
1. `frontend/src/components/FormDesignerTab.vue` 第 5241-5285 行的 `.wp-acrf-annotation-reset` 相关 CSS。
2. `frontend/src/components/VisitsTab.vue` 第 1461-1499 行的同名 CSS（应与上面完全一致）。
3. 复位按钮模板绑定：`:disabled="!hasAnnotationOverrideForTarget(...)"`（VisitsTab.vue ~L998-1007，FormDesignerTab 多处）。

## 审查重点（逐条给结论）
1. **根因是否成立**：PRD 断言「`.wp-acrf-annotation-reset:disabled` 特异性 (0,2,0) 高于基础隐藏规则 `.wp-acrf-annotation-reset` (0,1,0)，导致禁用态复位按钮无条件常显 0.45」。请用 CSS 特异性规则独立验证这个链条是否正确，包括禁用态与 `:hover` 揭示规则 (0,2,0) 在 hover 时的胜负关系。
2. **修复方案是否正确且最小**：PRD 方案是把 `:disabled{opacity:0.45}` 拆成「`:disabled` 只留 cursor」+「`.wp-acrf-annotation:hover/:focus-within .wp-acrf-annotation-reset:disabled { opacity:0.45 }`（特异性 0,3,0）」。请验证：
   - 非 hover 时禁用态/启用态是否都回到 `opacity:0`；
   - hover 时禁用态 0.45、启用态 1 是否都成立（特异性优先级是否正确）；
   - 是否存在更简洁或更稳妥的等价写法（例如直接 `.wp-acrf-annotation-reset:disabled { opacity: 0 }` 是否会破坏 hover 揭示）。
3. **遗漏项**：验收标准是否覆盖所有必要场景？是否遗漏了 `:focus-within` 点击复位后按钮保持焦点导致标注驻留可见的次要问题（PRD 已列为 Out of Scope，判断这个划分是否合理）？
4. **架构建议**：两个组件维护完全相同的 scoped CSS 属于重复。判断本次修复是否应顺带把这段 CSS 抽到 `frontend/src/styles/main.css` 统一，还是保持两处同步修改（考虑改动范围/风险/项目现有约定）。给出你的推荐并说明理由。
5. **测试策略**：PRD 计划新增源码级回归锁定「基础态 opacity:0 + 禁用置灰限定在 hover/focus 上下文」。判断这个断言是否足以防回退，是否需要补充其他断言。

## 输出格式
- 结论：PASS（可直接实施）/ REVISE（需修改后实施），一句话理由。
- 逐条问题列表：severity(Critical/Warning/Info) + 具体位置 + 建议。
- 若发现 PRD 根因或方案有错，明确指出并给出正确结论。
