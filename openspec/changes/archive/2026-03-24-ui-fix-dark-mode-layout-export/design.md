# Design: ui-fix-dark-mode-layout-export

## 架构决策

### R1 — 暗色模式预览窗口

**目标**：`.word-page` 预览面板在暗色模式下适配暗纸风格。

**方案**：

在 `frontend/src/styles/main.css` 现有 `html[data-theme="dark"]` 块**之后**追加 `.word-page` 相关的暗色覆盖选择器。

**覆盖映射**：

| 选择器 | 亮色（当前） | 暗色覆盖 | 来源 |
|--------|-------------|----------|------|
| `.word-page` background | `#fff` | `var(--color-bg-card)` → `#1e293b` | 语义 token 复用 |
| `.word-page` color | 继承 | `var(--color-text-primary)` → `#f1f5f9` | 确保文本可读 |
| `.word-page td` border-color | `#000` | `var(--color-border)` → `#334155` | 语义 token 复用 |
| `.word-page .wp-ctrl` color | `#333` | `var(--color-text-primary)` | 继承页面文本色 |
| `.word-page .wp-inline-header` background | `#d9d9d9` | `var(--color-bg-hover)` → `#334155` | 语义 token 复用 |
| `.word-page .wp-label` | 继承 bold | 自动继承页面色 | 无需额外覆盖 |
| `.word-page .wp-empty` color | `#909399` | `var(--color-text-muted)` → `#64748b` | 语义 token 复用 |

**已知限制**：
- `.fill-line`（HC-3 红线）固定为 `border-bottom: 1px solid #333`，在 `#1e293b` 背景上对比度约 1.4:1
- 这是可接受的折衷：`.fill-line` 是装饰性边框，暗色模式下视觉弱化符合用户预期
- 不可通过改 `.fill-line` 解决（C-01 红线 + HC-3 约束）

**影响范围**：
- `.word-page` 被 `FormDesignerTab.vue` 和 `VisitsTab.vue` 共用，一次 CSS 修改同时覆盖两处预览
- `.word-page.landscape` 横向模式也会继承暗色覆盖

---

### R2 — 试验名称字段位置

**目标**：将"试验名称"从"项目信息"区移动到"封面页信息"区首行。

**方案**：

仅重排 `ProjectInfoTab.vue` 模板中 `<el-form-item>` 的 DOM 顺序。

**变更前**：
```
<el-divider>项目信息</el-divider>
├── 项目名称
├── 版本号
├── 试验名称  ← 当前位置
<el-divider>封面页信息</el-divider>
├── CRF版本
├── ...
```

**变更后**：
```
<el-divider>项目信息</el-divider>
├── 项目名称
├── 版本号
<el-divider>封面页信息</el-divider>
├── 试验名称  ← 移至此处
├── CRF版本
├── ...
```

**不改动**：
- `reactive(form)` 字段定义
- `watch(() => props.project)` 映射逻辑
- `save()` PUT payload 结构
- 后端 API / Pydantic schema / 数据库模型

---

### R3 — Word 封面页格式

**目标**：对齐导出封面与参考文档 `docs/XX项目-eCRF-V1.0-2026XXXX.docx` 的格式。

**方案**：

修改 `backend/src/services/export_service.py` 中的 `_add_cover_page()` 和 `_apply_cover_page_table_style()`。

**格式差异修正表**：

| 位置 | 当前代码 | 参考文档 | 修改方式 |
|------|---------|---------|---------|
| 表格前空段（L135） | 无 line_spacing | `line_spacing=1.5` | 保存变量，设置 `paragraph_format.line_spacing = 1.5` |
| 封面表格宽度（L847-849） | `Cm(2)` + `Cm(3)` = 5cm | pct 46.9% ≈ 6.87cm | 用 XML `w:tblW type="pct" w:w="2345"` |
| 封面表格列宽 | 2cm / 3cm (40/60) | pct 2335/2665 (46.7/53.3) | 用 XML `w:tcW type="pct"` |
| 表格后空段（L169-179） | `line_spacing=1.5` | `line_spacing=1.5` | **不改**（Codex 验证与参考文档一致） |
| 申办方段（L182-186） | 无段间距 | `space_before=7.8pt, space_after=7.8pt` | 添加 `paragraph_format.space_before/after = Pt(7.8)` |
| DMU 段（L190-194） | 无段间距 | `space_before=7.8pt, space_after=7.8pt` | 同上 |
| DMU 后空段（L195） | 无 line_spacing | `line_spacing=2.0` | 保存变量，设置 `paragraph_format.line_spacing = 2.0` |
| 分页段（L198） | 忽略返回值 | `line_spacing=2.0` | 捕获返回值，设置 `paragraph_format.line_spacing = 2.0` |

**表格宽度实现细节**（XML pct 单位）：

```python
# w:tblW — 表格总宽 46.9% 页面宽度
tblW = OxmlElement('w:tblW')
tblW.set(qn('w:type'), 'pct')
tblW.set(qn('w:w'), '2345')

# w:tcW — 列宽（pct 单位，5000 = 100%）
# 第一列：2335/5000 = 46.7%
# 第二列：2665/5000 = 53.3%
```

**注释同步**：更新 `_apply_cover_page_table_style()` 的 docstring，移除"左对齐、表格宽度5cm"旧描述。

---

## 文件变更矩阵

| 文件 | 变更类型 | 关键修改点 |
|------|----------|-----------|
| `frontend/src/styles/main.css` | 修改 | 追加 `.word-page` 暗色模式覆盖（~15 行 CSS） |
| `frontend/src/components/ProjectInfoTab.vue` | 修改 | 移动 1 行 `<el-form-item>`（模板重排） |
| `backend/src/services/export_service.py` | 修改 | `_add_cover_page()` 段间距 + `_apply_cover_page_table_style()` 表格宽度 |

**共 3 个文件，全部为修改，无新增/删除。**

---

## 依赖关系

```
R1（暗色预览）── 独立
R2（字段位置）── 独立
R3（封面格式）── 独立
三者无交叉依赖，可并行执行。
```

---

## 超出范围

- `.fill-line` 暗色适配（HC-3 红线禁止修改）
- `v-html` 渲染逻辑变更
- 后端 API / 数据库 schema 变更
- 其他页面（非封面页）的 Word 导出格式调整
