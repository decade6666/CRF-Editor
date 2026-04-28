## 📋 实施计划：表单设计器自动调整列宽

### 任务类型
- [x] 前端 (→ gemini)
- [ ] 后端 (→ codex)
- [ ] 全栈 (→ 并行)

### 需求摘要
在 `frontend/src/components/FormDesignerTab.vue` 的设计器预览区域增加“自动列宽”按钮。点击后，对当前选中表单的所有可调预览表格执行一次智能列宽计算：
- `normal` 分组：智能调整两列（标签列 / 值列）比例
- `inline` 分组：智能调整多列横向表格比例
- `unified` 分组：保持现状，不参与本次自动列宽

要求保留现有拖拽调宽能力与 `localStorage` 持久化行为，且自动列宽后界面立即刷新。

### 技术方案
采用“**在现有列宽 composable 上增加编程式设置接口，由 FormDesignerTab 统一编排**”的方案，避免绕过现有缓存与持久化逻辑。

#### 核心思路
1. 在 `useColumnResize` 中新增一个可复用的“设置比例并持久化”方法（例如 `setRatios` / `applyRatios`）。
2. 在 `useCRFRenderer` 中新增普通两列表格的列宽规划函数，复用已有文本权重能力：
   - 标签列根据字段标签权重估算
   - 值列保持更大空间
   - 对结果做最小/最大比例约束，防止极端文本挤压
3. 在 `FormDesignerTab.vue` 中新增 `autoFitAllColumns()`：遍历 `renderGroups` / `designerRenderGroups` 对应分组，为每个 group 调用对应规划函数后写入对应 resizer。
4. 在设计器“实时预览”区域标题栏旁新增“自动列宽”按钮；只在存在 `selectedForm` 时可用。

### 实施步骤
1. **扩展列宽 composable**
   - 文件：`frontend/src/composables/useColumnResize.js`
   - 新增公共方法：接收外部比例数组，校验长度、数值、总和后写入 `colRatios.value`
   - 同步复用当前 `localStorage` key 持久化逻辑
   - 预期产物：拖拽与自动设置共用同一套状态/持久化通道

2. **补充 normal 两列表格智能规划函数**
   - 文件：`frontend/src/composables/useCRFRenderer.js`
   - 新增函数，例如：`planNormalColumnFractions(fields)`
   - 规划规则：
     - 读取 `getFormFieldDisplayLabel` 或等效标签文本
     - 结合 `computeTextWeight` 估算标签列需求
     - 值列保留默认主导宽度
     - 限制标签列范围（建议 `0.2 ~ 0.45`）
     - 返回 `[labelRatio, valueRatio]`
   - 预期产物：normal 与 inline 都拥有“智能比例规划”入口

3. **在 FormDesignerTab 中接入自动列宽动作**
   - 文件：`frontend/src/components/FormDesignerTab.vue`
   - 新增函数：`autoFitAllColumns()`
   - 遍历当前预览使用的分组（建议直接基于 `designerRenderGroups.value`，保证与设计器实时预览一致）
   - 对每个 group：
     - `normal` → `getResizer('normal', 2, gi)` + `planNormalColumnFractions(g.fields)`
     - `inline` → `getResizer('inline', g.fields.length, gi)` + `planInlineColumnFractions(g.fields)`
     - `unified` → 跳过
   - 将规划结果通过新的 composable API 写回
   - 预期产物：点击一次即可更新当前表单全部可调表格列宽

4. **新增按钮并绑定交互**
   - 文件：`frontend/src/components/FormDesignerTab.vue`
   - 在“实时预览”区域标题 `designer-section-title` 附近增加按钮
   - 文案建议：`自动列宽`
   - 交互建议：
     - `:disabled="!selectedForm || !designerRenderGroups.length"`
     - 可附 Tooltip：`按内容智能调整当前表单预览中的表格列宽`
   - 预期产物：操作入口清晰，作用范围明确

5. **补充测试**
   - 优先文件：
     - `frontend/tests/formFieldPresentation.test.js`
     - 新增或补充 `frontend/tests/*` 中与设计器结构相关测试
   - 建议覆盖：
     1. normal 分组规划函数在短标签 / 长标签 / 混合标签下返回合法比例
     2. inline 分组自动列宽仍复用既有 `planInlineColumnFractions`
     3. `FormDesignerTab.vue` 中存在“自动列宽”入口与 `autoFitAllColumns` 调用链
     4. 新的 composable API 被导出并用于持久化路径
   - 如允许运行前端验证：执行 `node --test frontend/tests/*.test.js`
   - 预期产物：结构回归与核心规划逻辑有自动化保护

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/FormDesignerTab.vue:460-474` | 修改 | 扩展当前 `resizerCache` 方案，接入自动列宽动作 |
| `frontend/src/components/FormDesignerTab.vue:1223-1266` | 修改 | 在设计器实时预览区域增加按钮入口 |
| `frontend/src/composables/useColumnResize.js:46-156` | 修改 | 增加程序化设置列宽并持久化的方法 |
| `frontend/src/composables/useCRFRenderer.js:43-164` | 修改 | 补充 normal 两列表格的智能列宽规划函数 |
| `frontend/tests/formFieldPresentation.test.js` | 修改 | 为分组与列宽规划补充测试 |
| `frontend/tests/quickEditBehavior.test.js` 或新测试文件 | 修改/新增 | 为设计器入口与调用链补充回归测试 |

### 伪代码
```js
// useColumnResize.js
function persistRatios(nextRatios) {
  colRatios.value = [...nextRatios]
  const k = getKey()
  if (k) localStorage.setItem(k, JSON.stringify(colRatios.value))
}

function setRatios(nextRatios) {
  if (!Array.isArray(nextRatios) || nextRatios.length !== n) return
  const sum = nextRatios.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1) > 1e-3) return
  persistRatios(nextRatios)
}
```

```js
// useCRFRenderer.js
export function planNormalColumnFractions(fields) {
  const maxLabelWeight = Math.max(...fields.map(ff => computeTextWeight(labelOf(ff))), 0)
  const estimatedLabelRatio = maxLabelWeight / (maxLabelWeight + BASE_VALUE_WEIGHT)
  const labelRatio = clamp(estimatedLabelRatio, 0.2, 0.45)
  return [labelRatio, 1 - labelRatio]
}
```

```js
// FormDesignerTab.vue
function autoFitAllColumns() {
  designerRenderGroups.value.forEach((group, gi) => {
    if (group.type === 'normal') {
      const resizer = getResizer('normal', 2, gi)
      if (resizer) resizer.setRatios(planNormalColumnFractions(group.fields))
      return
    }
    if (group.type === 'inline') {
      const resizer = getResizer('inline', group.fields.length, gi)
      if (resizer) resizer.setRatios(planInlineColumnFractions(group.fields))
    }
  })
}
```

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| `groupIndex` 作为 resizer key，在分组变化后可能导致历史列宽映射漂移 | 本次先沿用现有 key 方案，自动列宽本身会覆盖当前 group 的最新比例；若后续发现问题，再单独重构为稳定 group key |
| 极长标签导致标签列过宽，挤压值列 | 在 normal 规划函数中做上下界约束（如 20%-45%） |
| unified 分组没有现成列宽可调模型 | 明确本期跳过 unified，避免引入额外布局语义变更 |
| 自动列宽覆盖用户手工拖拽结果，可能引起意外 | 按钮命名明确为主动动作，不做自动触发；仅用户点击时覆盖 |
| 自动列宽只作用于设计器预览，主预览区未同步 | 如需两处一致，可复用同一函数分别作用于 `renderGroups` 与 `designerRenderGroups`；实施时需确认产品预期 |

### 需求边界与决策
- **做**：设计器实时预览中的 normal / inline 表格一键智能列宽
- **不做**：unified 表格重排、额外的逐表格按钮、后端接口变更
- **默认范围**：优先覆盖设计器弹窗内“实时预览”区域
- **可选扩展**：若希望主页面预览区也一起更新，可在实施时同步遍历 `renderGroups.value`

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: unavailable (codex CLI config/auth failure: invalid mcp transport, then 401 unauthorized after isolated retry)
- GEMINI_SESSION: cb259e6f-b83e-4fa6-9d59-473c13f8d7bf
