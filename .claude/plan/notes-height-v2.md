# 计划：备注面板高度修复 v2

> 状态：READY_TO_EXECUTE
> 文件：`frontend/src/components/FormDesignerTab.vue`
> 目标：默认高度真正占右侧面板的 50%

---

## 根因分析

### Bug 1 — 百分比计算错误

| | 值 |
|---|---|
| Dialog 容器高度 | `80vh` = `window.innerHeight * 0.8` |
| Dialog 标题栏 | ~35px |
| 可用面板高度 | `window.innerHeight * 0.8 - 35` |
| 目标 50% | `(window.innerHeight * 0.8 - 35) * 0.5` ≈ `window.innerHeight * 0.4` |
| 当前代码 | `window.innerHeight * 0.35` = **~44% of panel** (不足) |

### Bug 2 — localStorage 旧值卡住

```js
// 当前（有 Bug）：
parseInt(localStorage.getItem('crf_notesHeight')) || getDefaultNotesHeight()
// 若旧值 "120" 存在：parseInt("120") = 120 (truthy) → getDefaultNotesHeight() 永不执行
// 结果：用户始终看到 120px 的小文本框

// 修复后：
const storedHeight = parseInt(localStorage.getItem('crf_notesHeight'))
const notesHeight = ref((storedHeight && storedHeight >= 200) ? storedHeight : getDefaultNotesHeight())
// 只有明确 >= 200px 的存储值才被复用，否则重新计算默认值
```

---

## 修改步骤（共 2 处，1 个文件）

### Step 1 — 修复 `getDefaultNotesHeight()` 百分比

**文件**：`frontend/src/components/FormDesignerTab.vue`
**行号**：Line 381

```diff
- return Math.floor(window.innerHeight * 0.35)
+ return Math.floor((window.innerHeight * 0.8 - 35) * 0.5)
```

**说明**：
- `window.innerHeight * 0.8` = 对话框内容区域高度（`height:80vh`）
- 减去 35px 对话框标题栏估算高度
- 乘以 0.5 = 真正的 50%
- 结果约为 `window.innerHeight * 0.4`，如 900px 视口 → 默认高度 362px

---

### Step 2 — 修复 localStorage 阈值判断

**文件**：`frontend/src/components/FormDesignerTab.vue`
**行号**：Line 385

```diff
- const notesHeight = ref(parseInt(localStorage.getItem('crf_notesHeight')) || getDefaultNotesHeight())
+ const storedHeight = parseInt(localStorage.getItem('crf_notesHeight'))
+ const notesHeight = ref((storedHeight && storedHeight >= 200) ? storedHeight : getDefaultNotesHeight())
```

**说明**：
- `storedHeight >= 200`：只有用户曾经主动将备注框拖大到 200px 以上，才视为有效的用户偏好
- 旧默认值 `120` 不满足 `>= 200`，将被忽略，使用新的动态默认值
- 用户手动拖大后仍会持久化（`onNotesResize` 中已有 `localStorage.setItem`）

---

## 无需修改的部分

- `onNotesResize` 逻辑：正确，保持不变
- `minHeight: '120px'`：合理下限，保持不变
- `maxHeight: '70vh'`：合理上限，保持不变
- `resize: 'vertical'`：已通过 Element Plus 样式继承，保持不变
- CSS 布局（`flex-shrink:0`、`flex:1`）：正确，不需改

---

## 验证方法

1. 清除 localStorage（浏览器 DevTools → Application → Local Storage → 删除 `crf_notesHeight`）
2. 刷新页面，打开表单设计器
3. 右侧备注框默认高度应约等于右侧面板高度的一半
4. 关闭后再打开，无 localStorage 时默认高度相同
5. 手动拖动备注框高度 → 关闭 → 重新打开 → 高度应恢复为用户拖动后的值（如果 >= 200px）

---

## 风险评估

| 风险 | 级别 | 说明 |
|------|------|------|
| 旧用户 localStorage 被忽略 | Low | 旧默认值 120 被新默认值替换，符合预期 |
| 用户曾设置 150px | Low | 150 < 200，会被重置为新默认值（合理） |
| 用户曾设置 250px | Low | 250 >= 200，保持用户偏好（正确） |
| 浏览器窗口极小 | Low | 如 400px 高：默认 = (400*0.8-35)*0.5 = 142px，受 minHeight:120px 保护 |

---

## 执行命令

```
/ccg:codex-exec .claude/plan/notes-height-v2.md
```
