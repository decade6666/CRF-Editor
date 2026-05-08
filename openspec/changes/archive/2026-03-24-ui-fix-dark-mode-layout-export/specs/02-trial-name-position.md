# Spec 02 — 试验名称字段位置

## 目标

将"试验名称"字段从"项目信息"区移动到"封面页信息"区的第一行。

---

## 前提条件

- `ProjectInfoTab.vue` 使用 `reactive(form)` + `watch` 双向绑定
- `trial_name` 字段在 `watch` 初始化、`form` 对象和 `save()` PUT payload 中完整存在
- 此变更仅涉及 DOM 顺序，不影响数据链路

---

## 变更规格

### 2.1 修改 `frontend/src/components/ProjectInfoTab.vue`

**模板区**：将 L57 的 `<el-form-item label="试验名称">` 从当前位置移至 L58 `<el-divider>封面页信息</el-divider>` 之后、L59 `<el-form-item label="CRF版本">` 之前。

**变更前**（L54-61）：
```html
<el-divider content-position="left">项目信息</el-divider>
<el-form-item label="项目名称">...</el-form-item>
<el-form-item label="版本号">...</el-form-item>
<el-form-item label="试验名称">...</el-form-item>      <!-- L57 -->
<el-divider content-position="left">封面页信息</el-divider>  <!-- L58 -->
<el-form-item label="CRF版本">...</el-form-item>
```

**变更后**：
```html
<el-divider content-position="left">项目信息</el-divider>
<el-form-item label="项目名称">...</el-form-item>
<el-form-item label="版本号">...</el-form-item>
<el-divider content-position="left">封面页信息</el-divider>
<el-form-item label="试验名称">...</el-form-item>      <!-- 移至此处 -->
<el-form-item label="CRF版本">...</el-form-item>
```

**不改动**：
- `<script setup>` 中的任何代码
- `form` reactive 对象的字段定义
- `watch(() => props.project)` 的映射逻辑
- `save()` 函数和 PUT payload

---

## 约束

| ID | 类型 | 约束 |
|----|------|------|
| HC-4 | Hard | 纯前端改动，不涉及 API 变更 |
| HC-5 | Hard | 改动范围限于 `ProjectInfoTab.vue` |

---

## PBT 属性

| 属性 | 不变量 | 伪造策略 |
|------|--------|---------|
| 数据绑定不变性 | 移动前后 `form.trial_name` 的 v-model 绑定行为一致 | 输入随机字符串 → save → 验证 PUT payload 包含 `trial_name` |
| 空值安全 | `trial_name` 为空时，分组显示无异常空白 | 清空字段 → 检查 DOM 无多余间距 |
| 幂等保存 | 连续两次 save 返回相同结果 | save → save → 比较两次响应 |

---

## 验证条件

| ID | 条件 |
|----|------|
| SC-2.1 | "试验名称"出现在"封面页信息"分隔线下方第一行 |
| SC-2.2 | "项目信息"分隔线下仅有"项目名称"和"版本号" |
| SC-2.3 | 修改试验名称后保存，HTTP 200，数据正确持久化 |

---

## 风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 无实质性风险 | — | 纯 DOM 重排，数据链路不变 |
