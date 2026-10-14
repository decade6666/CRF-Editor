# 修复设计：字段拖拽落点与可见提示保持一致

## 设计结论

保留现有“蓝线表示插入到目标行上方”的交互。按**字段 ID 定位目标、按插入边界计算位置**，在移除源字段后有条件地修正边界；为列表最后增加明确的末尾落点。继续复用当前乐观排序、保存与撤销／重做链路。

“插入边界”指两行之间的缝隙，不是拖动完成后的最终行号。`N` 行有 `N + 1` 个边界：第一行之前、相邻行之间、最后一行之后。

## 根因与证据

- 显示契约：字段列表的提示是目标行的 `border-top`，见 `frontend/src/components/FormDesignerTab.vue:3342-3351`。
- 错误计算：当前 `onDrop` 先移除源行，再把字段插入未经修正的目标行下标，见 `FormDesignerTab.vue:1164-1178`。
- 已执行原函数复现：首次加载、模拟新增后加载、连续向下拖动和紧邻下一行四个场景 RED；向上拖动、加载后的源／显示顺序一致、保存／历史链路三个对照 PASS。完整条件和局限见 `research/drag-root-cause.md`。
- 首次进入已有排序：`loadFormFields` 与 `designerVisibleFields` 都使用同一排序规则（`FormDesignerTab.vue:387-407,1379-1384`）。不能把普遍的偏移解释为“首次加载没有排序”。

## 改动边界

### 产品代码

主改动限制在 `frontend/src/components/FormDesignerTab.vue`：

1. `onDrop` 的目标参数从可见列表下标改为目标字段 ID；字段行调用同步更新。
2. 明确目标是“该字段之前”；末尾落点使用单独的末尾语义，不伪造字段 ID。
3. 保留 `onDragOver` 的可见位置用于画提示线；不要把这个位置直接当成 backing array 的下标。
4. 复用 `sortFormFieldsByOrder` 获得与屏幕一致的逻辑顺序，在这份数组上同时定位源 ID 和目标 ID。
5. 继续通过 `normalizeFormFieldOrder` 和 `persistFieldReorder` 保存，不复制新的 API／历史处理。
6. 列表末尾加入小型、可识别的落点，复用已有拖放处理与提示样式。仅补足末尾边界，不重设计整个字段列表。

优先使用组件内的小型纯函数或现有 `onDrop` 中的最小局部逻辑。没有必要抽取整个设计器、创建通用拖拽框架或改用 SortableJS。

### 测试

- 新增字段拖放行为测试，建议 `frontend/tests/designerFieldReorder.test.js`，沿现有函数提取／运行时 harness 的惯例测试实际组件处理函数。
- 集成层测试实际 `onDrop → persistFieldReorder → recordReorderHistory` 路径，仅 mock API 等外部边界，不 mock 被测排序逻辑。
- 必要的模板接线检查可以放入现有 `orderingStructure.test.js`，但不能用源码字符串断言替代落点行为断言。
- 如增加组件挂载测试，沿现有 vitest / happy-dom / Vue-warning gate；不新增测试运行器或依赖。

## 数据流与算法

```text
GET fields / 草稿保存后的列表刷新
  → sortFormFieldsByOrder（可见逻辑顺序）
  → dragstart 保存 sourceId
  → row drop 提供 targetId（目标行之前）／末尾 drop 提供 end boundary
  → 在同一逻辑数组中计算 sourceIndex 与 boundaryIndex
  → 删除源字段后换算 insertIndex
  → 同位不保存；变化则 normalizeFormFieldOrder
  → persistFieldReorder
  → POST ordered_ids + cache invalidation + history record
```

### 核心换算

```text
row-before boundaryIndex = target 字段在逻辑顺序中的下标
end boundaryIndex        = 字段总数
insertIndex              = boundaryIndex - (sourceIndex < boundaryIndex ? 1 : 0)
```

- 仅在源字段位于边界前方时减一。
- 源 ID 不存在、目标 ID 不存在、拖到自己、计算后的插入位置等于原位置：不发 POST，不产生历史记录。
- `[A,B,C,D]` 的 `A → C 上方`：`sourceIndex=0`，`boundaryIndex=2`，`insertIndex=1`，结果 `[B,A,C,D]`。
- `[A,B,C,D]` 的 `D → B 上方`：`sourceIndex=3`，`boundaryIndex=1`，`insertIndex=1`，结果 `[A,D,B,C]`。
- `A → B 上方`：`insertIndex=0`，是 no-op（顺序不变）。
- `A → end`：`boundaryIndex=4`，移除后 `insertIndex=3`，结果 `[B,C,D,A]`。

### 快照与顺序一致性

以**实际可见逻辑顺序**构造本次 `previousFields`、previous-order 历史及 next-order 计算。数组复制，不原地改变共享字段对象；连续序号由现有 `normalizeFormFieldOrder` 生成新对象。失败恢复仍恢复此次拖动之前的可见顺序和字段内容。

ID 定位的兼容性意义：普通复制草稿会追加到 backing array 尾部，但用 `sourceOrder + 0.5` 在可见列表中显示在源字段之后（`FormDesignerTab.vue:767-794,949-956`）；保存遇到重载失败／被守卫跳过时可能原位转正（`2692-2707`）。这不是本次首次加载偏移的已证实根因，但修复不能继续依赖两个列表的下标天然一致。

## 必须保留的契约

- `POST /api/forms/{formId}/fields/reorder` 请求仍是 `{ ordered_ids: [...] }`，成功仍为 HTTP 204；不改后端索引、作用域检查或两阶段重排。
- 提交 ID 必须是当前表单字段的完整排列，不能漏日志行或标签字段。
- 排序成功保留乐观结果，失效字段缓存并只记录一次排序历史；不要重新加载旧列表覆盖乐观顺序。
- 排序失败恢复旧顺序，提示 `排序保存失败，已恢复`，按现有路径重载；失败不入历史。
- 历史回放、字段增删、草稿保存和属性保存的 busy／会话守卫保持，草稿存在时仍不能持久化排序。
- 撤销／重做重放 previous／next ID 列表，继续保留跨表单会话隔离与 ID remap 行为。
- Ctrl+↑／↓ 是“移动一行”，不是“插入到目标行上方”；不得对键盘排序盲套 drag-boundary 的减一公式。普通方向键焦点行为不变。
- 不改列宽／行高、预览分组、aCRF 标注、表单左侧 SortableJS 列表或其他页面排序。

## 方案选择与不采用的方式

| 方式 | 结论与理由 |
| --- | --- |
| 目标 ID + 统一插入边界 + 显式末尾落点 | 推荐：与现有提示吻合，能保留末尾拖放，并隔离可见／源数组下标差异。 |
| 全部 `targetIdx - 1` | 拒绝：向上拖动原本正确，会被改错。 |
| 只在第一次拖放时减一 | 拒绝：复现证明连续向下拖放仍错；会把状态猜测写进业务逻辑。 |
| 初始化／新增后延时、强制二次刷新、成功后重载 | 拒绝：不能修正“行上边界”和删除后数组位置的数学差异；还可能破坏乐观排序。 |
| 只改为 before-target 而不提供 end boundary | 拒绝：无法再把字段拖到绝对末尾。 |
| 增加上下半行 before/after 命中区 | 暂不采用：需要改变现有提示与命中规则，改动比显式末尾落点大；没有本次必要性。 |
| 改后端 order_index 或修改通用 SortableJS composable | 拒绝：原生字段拖放在前端计算错误；后端忠实保存收到的排列。 |

## 兼容与迁移

不需要数据迁移、服务配置、依赖升级或 API 合同变更。旧字段内容、ID、顺序值和历史回放端点不变。正确排列提交后仍由现有后端重排为连续 `1..n`。

交叉栈规范 §2 的旧 `{field_id,new_index}`／JSON 响应示例与实际代码不符（`.trellis/spec/guides/cross-stack-contracts.md:114-133`）。实施时以已验证的 `{ordered_ids}`／204 为准，后续以独立 Trellis 文档改动纠正示例；本次规划不改原规范。

## 验证边界与回退

- 当前仅完成原函数的运行时复现和现有回归基线，未完成真实浏览器拖放；“只在首次”的专属性仍未验证。
- 浏览器验收使用明确授权的非生产测试数据／登录方案。不读取临床数据、实际 token 或密码，不主动生成凭据。
- 首次、真实新增保存后、连续操作三个阶段都比较标记边界、松手位置、POST 排列、预览和重新打开后的顺序。
- 如修正后向上拖放仍下移，或仅首次的现象仍存在，先保存行 ID／目标标记／释放目标／请求排列证据，再沿真实事件时序继续定位；不得直接加延时补丁。
- 代码回退只涉及组件排序／末尾落点和新增测试；无数据库回退或发布流程改动。回退操作仍须用户明确授权。
