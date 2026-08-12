# 技术设计：回收站定时清理与用户管理页重构

> PRD 见 `prd.md`。本文聚焦边界、数据流、契约、取舍与兼容性。

## 1. 模块边界与文件清单

| 层 | 新增/修改 | 职责 |
|---|---|---|
| 配置 | `backend/src/config.py`（改） | `RecycleBinConfig` 等 Pydantic 模型 + 校验 |
| 纯逻辑（可注入 now 单测） | `backend/src/services/recycle_bin_cleanup_service.py`（新） | 规则解析、计划生成、执行 |
| 共用删除 | `backend/src/services/project_purge_service.py`（新） | `purge_project`（ORM delete + logo unlink） |
| 体积估算 | `backend/src/services/project_size_service.py`（新） | 按表分组聚合统计 |
| 后台任务 | `backend/src/background_jobs.py`（新） | asyncio 循环 + 启停 + env 开关 |
| 路由 | `backend/src/routers/admin.py`（改） | 策略 GET/PUT/preview + 回收站列表加 size |
| 入口 | `backend/main.py`（改） | lifespan 接线 |
| 测试隔离 | `backend/tests/conftest.py`（改） | env 开关 + 两条 get_config patch |
| 前端组合式 | `frontend/src/composables/byteSize.js`（新） | `formatBytes` |
| 前端组件 | `frontend/src/components/AdminView.vue`（改） | R2/R3/清理策略 UI/回收站大小列 |
| 前端样式 | `frontend/src/App.vue`（改，scoped） | R4 `.admin-shell` 半宽居中 |

`backend/app_launcher.py` 不改。

## 2. 配置模型

```python
DAYS_PER_MONTH = 30
DAYS_PER_YEAR  = 365

class RecycleBinAgeUnit(str, Enum):  DAY="day"; MONTH="month"; YEAR="year"
class RecycleBinSizeUnit(str, Enum): MB="MB"; GB="GB"

class RecycleBinAgeRule(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    enabled: bool = False
    value: int = 30            # field_validator: >=1
    unit: RecycleBinAgeUnit = Field(default=DAY, validate_default=True)

class RecycleBinSizeRule(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    enabled: bool = False
    value: int = 500           # >=1
    unit: RecycleBinSizeUnit = Field(default=MB, validate_default=True)

class RecycleBinConfig(BaseModel):
    interval_minutes: int = 60     # 1..1440
    min_retain_hours: int = 24      # >=0，0 关闭
    age:  RecycleBinAgeRule = RecycleBinAgeRule()
    size: RecycleBinSizeRule = RecycleBinSizeRule()

AppConfig.recycle_bin: RecycleBinConfig = RecycleBinConfig()
```

- 枚举规范值用英文（与 `docx_screenshot.backend` 一致，`config.yaml` 可手改，`yaml.safe_dump` 干净）。
- 不加 `_ENV_OVERRIDE_MAP` 条目（理由见下）。

## 3. 数据流

### 3.1 清理执行流
```
后台循环（asyncio, _recycle_bin_cleanup_loop）
  → asyncio.to_thread(_run_cleanup_once_sync)        # 阻塞 SQLite I/O 挪出事件循环
      → with Session(get_engine()) as session:        # 自建会话，不复用 get_session 依赖
            run_recycle_bin_cleanup(session, policy=get_config().recycle_bin)
              → build_cleanup_plan(session, policy, now=datetime.now())   # naive 本地
              → 逐项目 purge_project + commit + INFO 日志
  → await asyncio.sleep(interval*60)                  # 每轮重读配置
```

### 3.2 策略配置流
```
前端 清理策略弹窗
  → GET  /api/admin/recycle-bin/cleanup-policy         # 读策略 + 统计
  → POST /api/admin/recycle-bin/cleanup/preview        # 试运行（只读）
  → （启用切换时二次确认）
  → PUT  /api/admin/recycle-bin/cleanup-policy
        admin.py → update_config({"recycle_bin": payload.model_dump(mode="json")})
        → 线程锁 + 读改写 + os.replace + get_config.cache_clear
  → 下一轮循环自动读到新策略
```

### 3.3 回收站列表流
```
前端 openRecycleBin → GET /api/admin/projects/recycle-bin
  admin.py list_recycle_bin
    → estimate_recycled_project_sizes(session)   # 9 条分组聚合
    → 填充 estimated_size_bytes 到每个 RecycleBinProjectResponse
```

## 4. 关键契约

### 4.1 `deleted_at` 时间语义（关键）
生产写 `deleted_at` 用 `datetime.now()`（naive 本地），SQLAlchemy SQLite `DateTime` 丢弃 tzinfo。
**年龄 cutoff 必须用 naive 本地**：`now - timedelta(days=value*factor)`，`now=datetime.now()`。
用 `datetime.now(timezone.utc)` 会整体偏移时区差，删错集合。需写进 `.trellis/spec/backend/database-guidelines.md`。

### 4.2 后台任务会话
`backend/src/database.py` 无 `SessionLocal`，只有 `get_session()`/`get_read_session()`（请求作用域）。
后台任务**必须自建** `Session(get_engine())`，禁用 `get_session` 依赖。
`get_engine()` 已带 `check_same_thread=False` + `busy_timeout=5000`，`asyncio.to_thread` 工作线程取连接安全。

### 4.3 体积估算契约
- 按需计算，不物化列。
- 每张子表一条按 `project_id` 分组的聚合查询，共 9 条，**查询条数与项目数无关**（`O(表数)`）。
- 字节长度用 `length(CAST(coalesce(col,'') AS BLOB))`（SQLite 3.37.2 无 `octet_length`）。
- 每行固定开销 `ROW_OVERHEAD_BYTES = 64`（rowid+整型列+索引摊销），是唯一调参旋钮。
- Logo：SQL 之后按 `company_logo_path` 做 `stat()`，`try/except OSError: 0`。
- 字段名 `estimated_size_bytes`，UI 列头「大小（估算）」。
- 这是**估算值**，忽略 B-tree 页空隙/索引键/freelist/WAL，通常低报 1.5-3 倍。UI/文档标注。

### 4.4 跨栈单位契约（写入 cross-stack-contracts.md §11）
- 年龄单位规范值 `day/month/year`，容量单位 `MB/GB`，跨 `config.py` 与前端 `el-select` 一致。
- 中文 label 只在前端；`config.yaml` 存英文。
- `30/365` 常量两侧同源。

### 4.5 硬删除复用
`hard_delete_project` 路由（admin.py:168-189）现有「ORM delete + logo unlink」逻辑抽到 `project_purge_service.purge_project`，路由保留 404/400 判断。清理路径与路由共用同一实现。
新行为：logo `unlink` 包 `try/except OSError` 记 warning（原路由在文件锁时会 500，后台循环不应因单文件失败崩轮）。

### 4.6 批量函数体保持原样
`executeBatchMove/Copy/Delete` 三个函数体（同接口、同 `confirmFinalProjectDelete` 门禁、同提示）保持不变，仅把 `resetBatchActionState()` 换成 `resetProjectListState()`。这样 `projectDeleteConfirmation.test.js` 无需改动即可继续通过。

### 4.7 admin-shell 半宽居中
`.admin-shell` 是 `#app{display:flex;flex-direction:column}` 的 flex 项。
列方向下 `width` 是交叉轴尺寸，显式给宽覆盖默认 stretch，`margin-inline:auto` 吸收剩余空间。
固定列合计从 `70+120+100+540=830px` 降到 `70+100+300=470px`，故 50% 宽不会出横向滚动条。
**禁止**在 `.admin-shell` 下加任何 `td`/`.cell` 规则，`tableHeaderStyle.test.js` 不受影响。

## 5. 体积估算查询 shape（每表一条分组聚合）

```python
# 例：form 表
select(Form.project_id,
       func.count(),
       func.sum(64 + length(cast(coalesce(Form.name,'') AS BLOB))
                  + length(cast(coalesce(Form.code,'') AS BLOB)) + ...))
.groupby(Form.project_id)
```

子表通过 `Visit`/`Form`/`CodeList` join 回 `project_id`。`visit_form` 无文本列只计行开销。
各表文本列清单见 implement.md Step 4。

## 6. 清理决策语义（build_cleanup_plan）

1. 取所有 `deleted_at IS NOT NULL`，按 `deleted_at ASC, id ASC` 排序。
2. **年龄规则先算** → `age_ids`（`deleted_at < cutoff`）。
3. **容量规则在剩余集合上算**（否则重复计入即将消失的项目而超删）：
   - 跳过受 `min_retain_hours` 保护的项目（`deleted_at > now - min_retain_hours`）。
   - 从最早开始逐个加入 `size_ids`，直到剩余总量 ≤ 阈值。
   - 若受保留下限无法降到阈值以下，停在那里并 log INFO（不静默截断）。
4. 两条规则结果并集（`age_ids + size_ids`）。

`run_recycle_bin_cleanup`：
- 每项目一个事务（`purge_project` + `commit`），短锁窗口。
- 删前重查 `deleted_at is not None`（关掉计划后恢复的竞态）。
- 单项目失败 → rollback + `logger.exception` + 继续下一个。

## 7. 接口设计

### 策略接口（admin.py）
```
GET  /api/admin/recycle-bin/cleanup-policy    -> CleanupPolicyResponse
PUT  /api/admin/recycle-bin/cleanup-policy    -> CleanupPolicyResponse
POST /api/admin/recycle-bin/cleanup/preview   -> List[CleanupPreviewItem]
```
响应/请求模型（admin.py 内定义）：
```python
class CleanupRuleAge(BaseModel):    enabled: bool; value: int=Field(ge=1); unit: Literal["day","month","year"]
class CleanupRuleSize(BaseModel):   enabled: bool; value: int=Field(ge=1); unit: Literal["MB","GB"]
class CleanupPolicyUpdateRequest(BaseModel):
    interval_minutes: int = Field(ge=1, le=1440)
    min_retain_hours: int = Field(ge=0)
    age: CleanupRuleAge
    size: CleanupRuleSize
class CleanupPolicyResponse(CleanupPolicyUpdateRequest):
    total_estimated_size_bytes: int
    recycled_project_count: int
class CleanupPreviewItem(BaseModel):
    id: int; name: str; owner_username: Optional[str]
    deleted_at: datetime; estimated_size_bytes: int
    matched_rules: List[str]   # ["age"] / ["size"] / ["age","size"]
```

PUT 走 `update_config({"recycle_bin": payload.model_dump(mode="json")})`（线程锁+原子写+缓存清除已有）。
preview 调 `build_cleanup_plan` 不执行删除。

### 回收站列表
`RecycleBinProjectResponse` 加 `estimated_size_bytes: int = 0`，`list_recycle_bin` 调一次 `estimate_recycled_project_sizes`。

### 路由专用接口 vs 扩展 `/api/settings`（已选前者，理由）
- `PUT /settings` 整体替换，`template_path` 必填空值 400，没配模板库的管理员无法保存策略。
- 设置弹窗在 `App.vue`、回收站在 `AdminView.vue`，共用会迫使 AdminView 回传 `ai_api_key` 脱敏占位符逻辑，一处写错静默清空 AI 密钥。
- GET 需带实时统计，放 `/settings` 语义不清。
- 测试需断言「PUT 策略不污染 ai/template」——这是方案差异的关键回归点。

## 8. 配置 env 覆盖取舍

**不加 `_ENV_OVERRIDE_MAP` 条目**（与所有其他配置段不同）。
理由：策略由 UI 运行时可改并回写 `config.yaml`，env 覆盖会让 UI 显示与实际行为不一致（UI 改了但 env 仍占优）。
替代：后台循环每轮重读 `get_config()`，策略改动在下一轮自动生效。
取舍：改动生效有 ≤ interval 延迟，可接受。
**唯一例外**：`CRF_DISABLE_BACKGROUND_JOBS` 控制**循环本身启停**（非策略内容），用于测试隔离，不算违反。

## 9. 桌面打包 / 多实例

- `app_launcher.py` 不改：uvicorn 守护线程自建事件循环，lifespan 正常执行。
- 托盘退出走 `os._exit(0)` 跳过 shutdown，但「一项目一事务」保证进程被杀最多留孤儿 logo（commit 在 unlink 之前），无半删数据图。
- 多实例：N 实例跑 N 循环，行为仍正确（删前重查 + 单项目事务使重复工作 no-op）但浪费，与现有限流器同属单节点限制，文档说明。

## 10. 兼容性

- 配置：有默认值，旧 `config.yaml` 不含 `recycle_bin` 段也能加载（Pydantic 默认填充）。
- 数据库：无 schema 改动，无迁移。
- 路由：新接口不与既有冲突；`hard_delete_project` 重构行为保持（仅文件锁改为 warning）。
- 前端：`AdminView.vue` 测试断言需同步改（见 implement.md Step 13）。
- conftest：env 开关必须**先于** `from main import app`；新 service 模块各自加 `get_config` patch。

## 11. 取舍与风险

1. **估算低报**：1.5-3 倍，阈值触发比直觉晚。UI/文档标注 + `ROW_OVERHEAD_BYTES` 调节。
2. **WAL 单写者**：清理持锁期间并发写最多等 5s 后 `SQLITE_BUSY`。一项目一事务缩短锁窗口。超大项目仍超时则后续改分块删子表。
3. **不可逆删除**：默认关闭 + `value>=1` 双层校验 + 最短保留时间 + 预览试运行 + 启用二次确认 + INFO 日志 + 删前重查，六道防线。
4. **测试误伤真实库**：`CRF_DISABLE_BACKGROUND_JOBS` 与循环同提交加入 conftest，位置在 `from main import app` 之前。
5. **策略改动延迟生效**：≤ interval，可接受。

## 12. 不做

- 不改 `/api/settings`、不引入调度依赖、不物化体积列、不做多实例去重、不改桌面打包。