# 统一配置管理 — 实施计划

## 需求摘要

将所有配置文件路径管理集中到 `backend/src/config.py` + `backend/src/config.yaml`，提供完整的 load/save/update API，消除 `settings.py` 中散落的 YAML 读写逻辑。

**验收标准：**
- `config.py` 对外暴露 `load_config()` / `save_config()` / `update_config()` 三个函数
- `settings.py` 中不再直接出现 `yaml` 操作，改用 `update_config()`
- `config.yaml` 包含完整中文注释，每个字段均有说明
- 所有路径（db、uploads、templates）相对于 `config.yaml` 所在目录解析（即 `backend/src/`）
- 现有 6 个消费方（main.py、database.py、routers/*）无需改动

---

## 影响文件（3 个）

| 文件 | 改动类型 | 描述 |
|------|----------|------|
| `backend/src/config.py` | 重构 | 新增 path helper、load/save/update 函数，调整路径基准目录 |
| `backend/src/routers/settings.py` | 简化 | 用 `update_config()` 替换手动 YAML 读写块 |
| `backend/src/config.yaml` | 更新 | 加中文注释，调整路径值以匹配新基准目录 |

**无需改动（向后兼容）：**
`main.py`、`database.py`、`routers/projects.py`、`routers/export.py`、`routers/import_docx.py`、`routers/import_template.py`

---

## Phase 1：重构 `backend/src/config.py`

### 1.1 关键变量变更

```python
# 旧：基准目录为项目根（CRF-Editor/）
_PROJECT_ROOT = CONFIG_FILE.resolve().parent.parent.parent

# 新：基准目录为 config.yaml 所在目录（backend/src/）
_CONFIG_DIR = CONFIG_FILE.resolve().parent
```

### 1.2 新增辅助函数

```python
def _resolve_path(raw: str, base_dir: Path) -> str:
    """将相对路径基于 base_dir 解析为绝对路径字符串，绝对路径原样返回。"""
    p = Path(raw)
    if not p.is_absolute():
        p = base_dir / p
    return str(p.resolve())

def _deep_merge(base: dict, override: dict) -> dict:
    """递归合并两个字典，override 中的值覆盖 base，返回新字典（不修改原始对象）。"""
    result = dict(base)
    for key, val in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        else:
            result[key] = val
    return result
```

### 1.3 新增公共 API

```python
def load_config(path: Path | None = None) -> AppConfig:
    """从指定路径（默认 CONFIG_FILE）加载配置，返回 AppConfig 实例。
    注意：此函数不走缓存，每次调用都重新读取磁盘。
    """
    config_file = path or CONFIG_FILE
    if config_file.exists():
        with open(config_file, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return AppConfig(**data)
    return AppConfig()

def save_config(config: AppConfig, path: Path | None = None) -> None:
    """将 AppConfig 序列化后写入 YAML 文件。
    警告：会丢失原文件中的注释（yaml.safe_dump 不保留注释）。
    """
    config_file = path or CONFIG_FILE
    data = config.model_dump()
    with open(config_file, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)

def update_config(updates: dict, path: Path | None = None) -> AppConfig:
    """原子性地更新配置文件中的指定字段，返回更新后的 AppConfig。

    采用"读-改-写"策略：
    1. 读取原始 YAML（保留 Pydantic 模型之外的非标准字段，如 app.title）
    2. 深合并 updates（不修改其他字段）
    3. 写回文件并清除 get_config 缓存

    警告：yaml.safe_dump 会丢失原文件中的注释。
    """
    config_file = path or CONFIG_FILE
    # 1. 读取原始 YAML
    raw: dict = {}
    if config_file.exists():
        with open(config_file, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
    # 2. 深合并
    merged = _deep_merge(raw, updates)
    # 3. 写回
    with open(config_file, "w", encoding="utf-8") as f:
        yaml.safe_dump(merged, f, allow_unicode=True, sort_keys=False)
    # 4. 清除缓存，确保下次 get_config() 返回最新值
    get_config.cache_clear()
    return get_config()
```

### 1.4 重构 `get_config()`

```python
@lru_cache(maxsize=1)
def get_config() -> AppConfig:
    """加载并缓存配置（单例模式）。调用 update_config() 后缓存自动失效。"""
    global _CONFIG_PATH_LOGGED
    if not _CONFIG_PATH_LOGGED:
        logger.info("配置文件路径: %s", CONFIG_FILE)
        _CONFIG_PATH_LOGGED = True
    return load_config()
```

### 1.5 `AppConfig` 属性方法更新

`db_path` 和 `upload_path` 属性中将 `_PROJECT_ROOT` 替换为 `_CONFIG_DIR`：

```python
@property
def db_path(self) -> str:
    """数据库路径，相对路径基于 config.yaml 所在目录（backend/src/）解析"""
    return _resolve_path(self.database.path, _CONFIG_DIR)

@property
def upload_path(self) -> str:
    """上传目录，相对路径基于 config.yaml 所在目录（backend/src/）解析"""
    return _resolve_path(self.storage.upload_path, _CONFIG_DIR)
```

---

## Phase 2：简化 `backend/src/routers/settings.py`

### 改动范围

**删除**以下 import：
```python
import yaml
from src.config import get_config, CONFIG_FILE  # 移除 CONFIG_FILE
```

**新增**：
```python
from src.config import get_config, update_config
```

**替换**手动 YAML 读写块（约 17 行）为：

```python
cfg = update_config({
    "template": {"template_path": payload.template_path},
    "ai": {
        "enabled": payload.ai_enabled,
        "api_url": payload.ai_api_url,
        "api_key": payload.ai_api_key,
        "model": payload.ai_model,
        "api_format": payload.ai_api_format,
    },
})
```

---

## Phase 3：更新 `backend/src/config.yaml`

### 3.1 路径值变更（基准目录从项目根 → `backend/src/`）

| 字段 | 旧值 | 新值 |
|------|------|------|
| `database.path` | `../crf_editor.db` | `../../crf_editor.db` |
| `storage.upload_path` | `uploads` | `../../uploads` |
| `template.template_path` | `templates` | `../../templates` |

> **计算依据**：`backend/src/` → `backend/` 需要 `../`，再往上到项目根需要 `../../`。
> 所以 `crf_editor.db` 在项目根，路径为 `../../crf_editor.db`；
> `uploads` 在项目根，路径为 `../../uploads`。

### 3.2 目标文件格式（含完整中文注释）

```yaml
# ============================================================
# CRF 编辑器配置文件
# 所有相对路径均基于本文件（config.yaml）所在目录解析
# 即：backend/src/ 目录
# 注意：通过 API 保存配置时，注释会丢失（YAML 库限制）
# ============================================================

# 应用基本信息
app:
  title: CRF编辑器                  # 应用显示名称

# 数据库配置
database:
  path: ../../crf_editor.db         # 数据库文件路径（相对于 backend/src/）

# 存储配置
storage:
  upload_path: ../../uploads        # 上传文件存储目录

# 服务器配置
server:
  host: 0.0.0.0                     # 监听地址（0.0.0.0 表示所有网卡）
  port: 8000                        # 监听端口

# Word 模板配置
template:
  template_path: ../../templates    # Word 模板文件目录

# AI 辅助功能配置
ai:
  enabled: false                    # 是否启用 AI 功能
  api_url: https://api.example.com/v1  # API 地址（支持 OpenAI 兼容格式）
  api_key: sk-xxx                   # API 密钥（请勿提交到版本控制）
  model: deepseek-chat              # 使用的模型名称
  api_format: openai                # API 格式：openai / anthropic
  timeout: 30                       # 请求超时（秒）
```

---

## 已知限制

1. **注释丢失**：`yaml.safe_dump` 不保留原文件注释。调用 `update_config()` 或 `save_config()` 后，注释将丢失。这是 PyYAML 的已知限制，接受此行为。
2. **`app.title` 非标准字段**：`app.title` 不在 `AppConfig` Pydantic 模型中，通过 `update_config` 的"读-改-写"策略可以保留此字段。`save_config` 会丢失它（使用 `model_dump()`），使用时需注意。
3. **并发安全**：当前为单进程单线程模型，无需额外加锁。若未来改为多进程，`update_config` 需要加文件锁。

---

## 安全提醒

⚠️ 当前 `config.yaml` 中存在硬编码 API Key：`sk-b47cf5c41a1e41f1d7804d4fa3a901f8`。
实施计划中已将其替换为占位符 `sk-xxx`，**请在实施后立即轮换该密钥**。

---

## 实施顺序

1. Phase 1：`config.py`（核心变更，其他两个文件依赖于此）
2. Phase 3：`config.yaml`（同步路径值，与 Phase 1 联动）
3. Phase 2：`settings.py`（依赖 `update_config` 可用）

---

_计划生成时间：2026-03-15_
