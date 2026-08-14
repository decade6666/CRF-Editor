# 全屏设计器两栏重构与字段原子 profile — 技术设计

## 架构边界

- 后端新增薄路由 + 共享 service/schema；所有写操作在单个 `get_session` 事务内完成，任一步失败整体回滚。
- 前端把所有「多次请求才算原子」的保存链收敛为单次 profile 调用；结构类端点（log 创建/删除、复制、排序、批量）保持既有单请求原子语义不变。
- `FormDesignerTab.vue` 仍是单文件超大组件：新增逻辑优先沉淀到 composables（`fieldDefinitionAutocomplete.js`、`formDesignerPropertyEditor.js` 补 profile 快照/命令纯函数），组件内只做接线。

## 数据流与契约

### FieldProfileCommand（后端核心 schema，两个路由共用）

```text
definition_operation:
  none                          # 不写共享定义（快编 / 纯实例更新 / inline）
  update_shared {               # 更新指定共享定义（设计器路径禁止改其 OID）
    target_definition_id: int
    definition: {...完整快照}
  }
  create_or_restore {           # 新建，或历史重做时复用
    preferred_definition_id?: int
    definition: {...完整快照，variable_name 必填}
  }
binding:
  keep                          # 保持现有绑定
  existing { target_field_definition_id: int }   # 换绑同项目定义
  operation_result              # 绑定本次新建/恢复的定义
instance:
  upsert { required?, label_override?, help_text?, default_value?, inline_mark?,
           bg_color?, text_color?, label_bold?, label_font_size? }  # exclude_unset 部分更新
  delete                        # 仅撤销「新增字段」历史
cleanup_definition_id?: int     # 仅限 PUT 开始时该实例绑定的定义
```

响应 envelope：

```text
{ form_field: FormFieldResponse | null,      # delete 时为 null
  final_definition_id: int | null,
  definition_created: bool,
  definition_restored: bool,
  cleanup: { deleted: bool, retained_in_use: bool } | null }
```

### 校验链（顺序固定）

1. `verify_form_owner` / `verify_form_field_owner`（404/403）。
2. binding-profile 拒绝 `is_log_row=1`（400）。
3. `binding=existing`：目标定义同项目、被当前表单其他实例引用 → 409「该字段已在表单中」。
4. `update_shared`：目标定义存在且属本项目；提交 OID ≠ 目标现有 OID → 422（设计器 OID 变更必须走 fork）。
5. `create_or_restore`：OID 字符集（`optional_oid_validator` 语义，required）；项目内同 OID 冲突时：`preferred_definition_id` 命中且 OID 一致 → 复用；否则 409「该OID已在字段库中存在」。
6. 多选策略（`_reject_disallowed_multiselect`）、codelist/unit 跨项目、复选清 codelist、数字位数 CheckConstraint、HexColor/LabelBold/LabelFontSize。
7. 归一（按最终字段类型）：`default_value` / `inline_mark` 镜像前端规则。
8. 单个事务 flush；异常 → 路由统一 400/403/404/409/422 中文 detail。

### 跨栈归一契约（新增）

共享用例表（`backend/tests/fixtures/field_normalization_cases.json` 或同构纯数据文件）：

| field_type | inline_mark | 规则 |
| --- | --- | --- |
| 复选 | 任意 | 清空默认值 |
| 文本/数值 | 0 | 仅保留首行 |
| 文本/数值 | 1 | 保留多行 |
| 日期/日期时间/时间/单选/多选/… | 0 | 清空默认值 |
| 标签/日志行 | 任意 | 禁止 inline（can_toggle_inline=false） |

前端 `useCRFRenderer.js` 的 `isDefaultValueSupported` / `normalizeDefaultValue` 与后端 `field_normalization.py` 逐例锁定；用例变化需同时更新两侧测试。

### 历史命令映射（前端）

| 用户动作 | 历史记录 | undo（单次调用） | redo（单次调用） |
| --- | --- | --- | --- |
| 共享属性保存 | update_shared before/after | 反方向 update_shared | 正向 update_shared |
| 候选换绑 + 共享更新 | existing + update_shared | 反向 update_shared + existing 回原 | 正向 |
| OID 分叉 | create_or_restore 新 id | existing 回原 + cleanup 分叉 id | create_or_restore + preferred_definition_id |
| 新增草稿（新定义） | create_or_restore + upsert | instance delete + cleanup | create_or_restore + upsert（preferred 复用） |
| 快编/inline | 不记历史（现状） | — | — |

回放失败保持栈；redo 冲突（OID 被占且 preferred 不命中）→ 明确报错不重建。

### usePaneSplit 扩展

`usePaneSplit(storageKey, defaultRatio, { min, max, axis = 'vertical' })`：`axis='horizontal'` 用 `clientX / container.width`。现有调用零变化；新增 `crf:designer:main-split`（0.38）与 `crf:designer:left-split`（0.5，纵向）。

### 两栏 DOM 结构（全屏 designer-shell）

```text
designer-shell
├─ designer-main-split (横向)
│  ├─ designer-left-column (纵向 usePaneSplit)
│  │  ├─ designer-fields-card（字段列表 + 工具栏）
│  │  └─ designer-editor-card（属性：固定标题 / 滚动表单 / 固定动作栏）
│  └─ designer-preview-card（预览原样保留）
└─ 删除：fd-library / fd-panel-resizer / fieldSearch / workspace-split / 460px propWidth / 备注卡
```

窄屏（约 ≤1100px 可用宽）：`designer-shell` 改纵向布局，隐藏横向拖拽条。

## 兼容与迁移

- 删除旧写路由与旧前端三连发在同一 PR；后端测试断言从旧路由等价迁移到新端点，不降覆盖率。
- `useApi._autoInvalidate` 前缀契约：新端点位于 `/api/form-fields/...` 与 `/api/forms/...` 下，自动失效逻辑不变；设计器显式 `invalidateCache('/api/forms/{id}/fields')` + `refreshKey++` 保留。
- 备注 500ms 防抖与 pending 队列删除；`designNotesSummary.js` 继续服务外层摘要。

## 回滚

- 回滚单位 = 整条 PR revert；不做半兼容层。
- `frontend/dist` 本地构建仅用于实机验证，不提交；验证前必须重建，防「旧包假象」。
