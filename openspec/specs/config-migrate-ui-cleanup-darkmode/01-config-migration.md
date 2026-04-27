# Spec 01 — Config 迁移

## 目标

将 `backend/src/config.yaml` 迁移至项目根目录，使配置入口统一、路径直观。

---

## 前提条件

- `backend/src/config.py` 存在，`CONFIG_FILE` 当前指向 `backend/src/config.yaml`
- `backend/src/config.yaml` 内容完整（含 `app.title`、`database`、`storage`、`server`、`template`、`ai` 六个顶级 key）
- `backend/config.yaml` 存在但无任何代码引用，可安全删除
- `backend/crf.spec` 第 57 行已有 `('config.yaml', '.')` —— 从 `backend/` 目录收集根目录 `config.yaml`，迁移后路径吻合，**无需修改**

---

## 变更规格

### 1.1 修改 `backend/src/config.py`

**L15 — CONFIG_FILE 路径**

```python
# Before
CONFIG_FILE = Path(__file__).resolve().parent / "config.yaml"

# After
CONFIG_FILE = Path(__file__).resolve().parents[2] / "config.yaml"
```

- `parents[0]` = `backend/src/`
- `parents[1]` = `backend/`
- `parents[2]` = `<project_root>/`

**L43 — DatabaseConfig 默认值**

```python
# Before
path: str = "../../crf_editor.db"

# After
path: str = "./crf_editor.db"
```

**L47 — StorageConfig 默认值**

```python
# Before
upload_path: str = "../../uploads"

# After
upload_path: str = "./uploads"
```

注：`_CONFIG_DIR` 已自动引用 `CONFIG_FILE.resolve().parent`，无需单独修改。

---

### 1.2 新建 `<project_root>/config.yaml`

从 `backend/src/config.yaml` 原样复制，修正两处相对路径：

```yaml
app:
  title: CRF编辑器
database:
  path: ./crf_editor.db        # 原 ../../crf_editor.db
storage:
  upload_path: ./uploads        # 原 ../../uploads
server:
  host: 0.0.0.0
  port: 8000
template:
  template_path: ""             # 保留用户已设定的路径（执行时从实际文件读取）
ai:
  enabled: false
  api_url: ""
  api_key: ""
  model: ""
  api_format: ""
  timeout: 30
```

**迁移规则**：
- 使用 Python `yaml.safe_load` 读取原文件原始 dict
- 仅修改 `database.path` 和 `storage.upload_path` 的值
- 使用 `yaml.safe_dump` 写出（注意：注释会丢失，属已知限制）
- **不得** 通过 `AppConfig` 序列化，防止丢失 `app.title` 等非模型字段

---

### 1.3 删除旧配置文件

- 删除 `backend/src/config.yaml`
- 删除 `backend/config.yaml`

---

## 验证条件（Success Criteria）

| ID | 条件 |
|----|------|
| SC-1.1 | `<project_root>/config.yaml` 存在，且 `database.path` = `./crf_editor.db` |
| SC-1.2 | `backend/src/config.py` 第 15 行使用 `parents[2]` |
| SC-1.3 | `backend/src/config.py` 第 43/47 行默认值为 `./` 前缀 |
| SC-1.4 | 应用启动后日志打印路径包含项目根目录（非 `backend/src/`） |
| SC-1.5 | 数据库文件和上传目录路径基于项目根正确解析 |
| SC-1.6 | `backend/src/config.yaml` 和 `backend/config.yaml` 均已不存在 |

---

## 风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| app.title 等非模型字段丢失 | 高 | 使用原始 YAML dict 操作，禁止 AppConfig 序列化 |
| PyInstaller 打包路径失效 | 中 | `crf.spec` 已有正确条目，无需修改 |
| 数据库/上传路径解析错误 | 高 | SC-1.5 显式验证路径解析结果 |
| 并发写入配置 | 低 | `_config_lock` + 原子替换已有保护 |
