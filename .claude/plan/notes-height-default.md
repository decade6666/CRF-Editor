# 实施计划：表单设计备注窗口默认高度提升至占用一半

> 生成时间：2026-03-17
> 目标文件：`frontend/src/components/FormDesignerTab.vue`
> 影响范围：仅 1 个文件，3 处局部改动

---

## 背景与约束

- 当前默认高度：`120px`（约占 80vh 弹窗的 15%）
- 目标：默认占用面板高度的约 50%
- 弹窗尺寸：`width: 80vw`, `height: 80vh`, `top: 5vh`
- 右侧面板为 flex column；上方"属性编辑"区域 `flex:1; overflow-y:auto`
- **关键约束**：`localStorage` 中已保存的用户偏好（`crf_notesHeight`）**优先于**动态默认值，不得覆盖

---

## 双模型交叉验证结论

| 维度 | Codex 意见 | Gemini 意见 | 裁定 |
|------|-----------|------------|------|
| 实现方式 | Approach B（panel ref + watch(showDesigner) + nextTick） | Approach A 增强（window.innerHeight * 0.35） | **采用 Approach A 增强** |
| localStorage 问题 | 必须解耦 watch，仅在 onNotesResize 中保存 | 同意 | **两者一致，必须执行** |
| 计算公式 | 精确减去 header/padding 开销 | `Math.floor(window.innerHeight * 0.35)` 约等于 44% | **采用 window.innerHeight * 0.35，含 min/max 保护** |
| UX 增强 | 无额外建议 | 加 hint 文字、min/max 限制、表单区 min-height | **采用 Gemini 的 UX 增强** |

**最终技术方案**：
- 用 `getDefaultNotesHeight()` 函数替代硬编码 `120`，公式 `Math.floor(window.innerHeight * 0.35)`
- 仅当 `localStorage` 无存储值时使用动态默认
- 移除 `watch(notesHeight, ...)` 的 localStorage 自动写入，改为仅在 `onNotesResize` 中显式保存
- 对 textarea 加 `minHeight: '120px'`、`maxHeight: '70vh'`
- 对属性编辑区加 `minHeight: '200px'`
- label 旁加 hint 文字 `（可拖动边缘调整高度）`

---

## 成功判据

- [ ] 首次打开弹窗（无 localStorage 缓存）时，备注高度 ≈ 窗口高度 × 0.35
- [ ] 拖动调整后刷新，新高度被恢复
- [ ] 已保存的用户偏好不被默认值覆盖
- [ ] 属性编辑内容区不会被备注区挤压到消失
- [ ] 备注高度不超出 70vh，不低于 120px

---

## Step-by-step 实施计划

### Step 1：添加 `getDefaultNotesHeight` 辅助函数

**文件**：`frontend/src/components/FormDesignerTab.vue`
**位置**：第 379 行之前（`// ───────────────── 表单设计备注 ─────────────────` 注释上方）

```js
// 备注面板默认高度：约占弹窗高度的 50%（动态计算，不持久化）
function getDefaultNotesHeight() {
  return Math.floor(window.innerHeight * 0.35)
}
```

---

### Step 2：修改 `notesHeight` 初始化

**位置**：第 380 行

**修改前**：
```js
const notesHeight = ref(parseInt(localStorage.getItem('crf_notesHeight')) || 120)
```

**修改后**：
```js
const notesHeight = ref(parseInt(localStorage.getItem('crf_notesHeight')) || getDefaultNotesHeight())
```

---

### Step 3：移除 `watch(notesHeight, ...)` 的 localStorage 自动写入

**位置**：第 381 行

**修改前**：
```js
watch(notesHeight, v => localStorage.setItem('crf_notesHeight', v))
```

**修改后（整行删除）**：
```
// 删除此行 —— localStorage 写入改为在 onNotesResize 中显式执行
```

---

### Step 4：在 `onNotesResize` 中补充 localStorage 保存

**位置**：第 404-408 行（`onNotesResize` 函数）

**修改前**：
```js
function onNotesResize(evt) {
  const textarea = evt.target?.closest('.design-notes-wrap')?.querySelector('textarea')
  if (textarea) {
    notesHeight.value = textarea.offsetHeight
  }
}
```

**修改后**：
```js
function onNotesResize(evt) {
  const textarea = evt.target?.closest('.design-notes-wrap')?.querySelector('textarea')
  if (textarea) {
    notesHeight.value = textarea.offsetHeight
    // 仅在用户明确拖动时持久化，不自动同步默认值
    localStorage.setItem('crf_notesHeight', textarea.offsetHeight)
  }
}
```

---

### Step 5：更新 textarea 的 style，加 min/max 保护

**位置**：弹窗中 `el-input` 的 `:style` 绑定

**修改前**：
```html
:style="{ height: notesHeight + 'px', resize: 'vertical' }"
```

**修改后**：
```html
:style="{ height: notesHeight + 'px', resize: 'vertical', minHeight: '120px', maxHeight: '70vh' }"
```

---

### Step 6：更新备注 label，添加操作提示

**位置**：`design-notes-wrap` 内第一个 `div`（label 行）

**修改前**：
```html
<div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px;">表单设计备注</div>
```

**修改后**：
```html
<div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px;">
  表单设计备注
  <span style="margin-left: 6px; color: var(--el-text-color-placeholder); font-size: 11px;">（可拖动边缘调整高度）</span>
</div>
```

---

### Step 7：为属性编辑内容区加 min-height 保护

**位置**：`v-else` 属性编辑区（`flex:1; overflow-y:auto; padding:8px`）

**修改前**：
```html
<div v-else style="flex:1;overflow-y:auto;padding:8px">
```

**修改后**：
```html
<div v-else style="flex:1;overflow-y:auto;padding:8px;min-height:200px">
```

---

## 回滚方案

若功能异常：
1. 还原 `notesHeight` 初始化为 `... || 120`
2. 还原 `watch(notesHeight, v => localStorage.setItem(...))`
3. 还原 `onNotesResize`（移除 localStorage 写入行）
4. 还原 textarea `:style`（移除 minHeight/maxHeight）
5. 还原 label（移除 hint span）
6. 还原 属性编辑区（移除 min-height）

---

## 执行指令

```
/ccg:execute .claude/plan/notes-height-default.md
```
