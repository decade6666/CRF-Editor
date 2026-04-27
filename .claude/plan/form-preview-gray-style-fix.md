## 📋 实施计划：表单预览灰底样式修复

### 任务类型
- [x] 前端 (→ gemini)
- [ ] 后端 (→ codex)
- [ ] 全栈 (→ 并行)

### 技术方案
本次采用**最小改动**方案，只修复截图对应的两条主预览路径：

1. `frontend/src/styles/main.css` 驱动的表单设计器 Word 预览；
2. `frontend/src/components/TemplatePreviewDialog.vue` 的导入预览。

核心原则：
- **不改** `frontend/src/composables/formFieldPresentation.js` 的 helper 语义；
- 普通非表格字段左侧标签单元格去掉默认灰底；
- 仍需保留灰底的结构性区域（横向表头、日志行 / 整行表头）统一改为 `#BFBFBF`；
- 保留 `bg_color` 自定义覆盖能力，避免扩大影响面；
- `SimulatedCRFForm.vue`、`VisitsTab.vue` 不纳入首轮修复，防止超出用户截图对应范围。

原因：
- 当前普通字段左侧灰底主要来自 CSS 默认样式，而不是 helper 默认返回值；
- helper `getFormFieldPreviewStyle()` 负责 `bg_color` 优先 + fallback 背景拼接，直接改它会把语义问题扩大成全局行为变更；
- 最小安全修复点是：**CSS 默认背景 + 日志行 fallback 字面量**。

### 实施步骤
1. **收口表单设计器预览默认样式**
   - 修改 `frontend/src/styles/main.css:190-199`
   - 处理项：
     - `.word-page .wp-label` 去掉默认灰底；
     - `.word-page .unified-label` 去掉默认灰底；
     - `.word-page .wp-inline-header` 的背景统一改为 `#BFBFBF`。
   - 预期结果：
     - 普通非表格字段左侧标签不再发灰；
     - 横向表头灰底统一。

2. **收口模板导入预览 scoped 样式**
   - 修改 `frontend/src/components/TemplatePreviewDialog.vue:375-395`
   - 处理项：
     - `.wp-label` 去掉默认灰底；
     - `.unified-label` 去掉默认灰底；
     - `.wp-inline-header` 背景改为 `#BFBFBF`。
   - 预期结果：
     - 导入预览与设计器预览保持一致；
     - 不再依赖当前有色差的 subtle 背景值。

3. **统一日志行 / 整行表头 fallback 灰色**
   - 修改 `frontend/src/components/FormDesignerTab.vue:997,1008`
   - 修改 `frontend/src/components/TemplatePreviewDialog.vue:39,51`
   - 处理项：
     - 把 `getFormFieldPreviewStyle(..., 'background:#d9d9d9;')`
       统一替换为
       `getFormFieldPreviewStyle(..., 'background:#BFBFBF;')`
   - 预期结果：
     - 日志行与结构性表头灰底一致；
     - 仍保留 helper 的“字段自定义底纹优先于 fallback”规则。

4. **保持普通字段动态样式调用不变**
   - 保持以下调用不动：
     - `frontend/src/components/FormDesignerTab.vue:993-1000,1009,1013-1014`
     - `frontend/src/components/TemplatePreviewDialog.vue:35-36,42-43,52,57-58`
   - 原因：
     - 这些调用目前仍需保留 `bg_color` / `text_color` 的动态覆盖；
     - 用户要求的是去掉“默认灰底”，不是禁用所有字段底纹。

5. **补充窄范围回归断言**
   - 修改 `frontend/tests/formFieldPresentation.test.js`
   - 建议做法：沿用当前 `readFileSync` + 源码断言模式，增加以下断言：
     - `main.css` 中 `.wp-label` / `.unified-label` 不再出现旧默认灰底；
     - `.wp-inline-header` 默认背景为 `#BFBFBF`；
     - `FormDesignerTab.vue` 与 `TemplatePreviewDialog.vue` 的日志行 fallback 已改为 `background:#BFBFBF;`。
   - 不建议把该语义塞回 helper 单测，因为 helper 本身不是本次问题根因。

### 伪代码
```css
/* frontend/src/styles/main.css */
.word-page .wp-label {
  font-weight: bold;
  /* remove default background */
}

.word-page .unified-label {
  font-weight: bold;
  /* remove default background */
}

.word-page .wp-inline-header {
  background: #BFBFBF;
  font-weight: bold;
  text-align: center;
}
```

```vue
<!-- FormDesignerTab.vue / TemplatePreviewDialog.vue -->
<td :colspan="..." :style="'font-weight:bold;' + getFormFieldPreviewStyle(field, 'background:#BFBFBF;')">
```

```js
// tests/formFieldPresentation.test.js
assert.match(mainCssSource, /\.word-page \.wp-inline-header \{ background: #BFBFBF;/)
assert.doesNotMatch(mainCssSource, /\.word-page \.wp-label \{[^}]*background:/s)
assert.match(templatePreviewSource, /background:#BFBFBF;/)
assert.match(formDesignerSource, /background:#BFBFBF;/)
```

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/styles/main.css:190-199` | 修改 | 去掉普通标签默认灰底，并统一横向表头灰底 |
| `frontend/src/components/TemplatePreviewDialog.vue:39,51,375-395` | 修改 | 统一日志行 fallback 灰色，并去掉 scoped 预览中的普通标签默认灰底 |
| `frontend/src/components/FormDesignerTab.vue:997,1008` | 修改 | 统一日志行 / 整行表头 fallback 灰色 |
| `frontend/tests/formFieldPresentation.test.js:15-16,35-47` | 修改 | 新增窄范围源码断言，锁住颜色与样式语义 |

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| 误伤 `bg_color` 自定义底纹 | 不改 helper 调用语义，只移除 CSS 默认背景 |
| 横向表格数据单元格也被刷成灰色 | 只改 `.wp-inline-header`，不改 `.wp-ctrl` |
| 日志行丢失字段自定义底纹优先级 | 只替换 fallback 字面量，继续通过 helper 合成最终样式 |
| 其他预览页面仍保留旧灰值 | 明确首轮仅覆盖截图主路径；若用户需要，再追加第二阶段一致性清理 |
| `TemplatePreviewDialog.vue` scoped 样式与全局样式再次漂移 | 同时修改 scoped CSS 与全局 CSS，避免只修一侧 |

### 验证顺序
1. 运行窄范围测试：
   - `node --test frontend/tests/formFieldPresentation.test.js`
2. 运行前端构建验证：
   - `cd frontend && npm run build`
3. 手工核对 5 个场景：
   - 普通非表格字段：左侧标签无灰底；
   - unified regular field：左侧标签无灰底；
   - inline header：灰底为 `#BFBFBF`；
   - 日志行 / 整行表头：灰底为 `#BFBFBF`；
   - 带 `bg_color` 的字段：自定义底纹仍可生效。

### 范围外（本轮不做）
- `frontend/src/components/SimulatedCRFForm.vue`
- `frontend/src/components/VisitsTab.vue`

如果用户后续要求“所有预览面统一灰底语义”，可在第二阶段把这两个入口一并收口到同一规则。

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019d9423-2cec-7513-8917-5fe50bc8bdd6`
- GEMINI_SESSION: `fa2ce114-7a29-4df8-a72f-9cd33adfd700`
