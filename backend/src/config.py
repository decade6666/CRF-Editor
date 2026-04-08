"""配置加载模块"""
import logging
import os
import tempfile
import threading
from pathlib import Path
from functools import lru_cache

import yaml
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

# 配置文件迁移至项目根目录，统一配置入口
CONFIG_FILE = Path(__file__).resolve().parents[2] / "config.yaml"
# update_config 的读-改-写锁，防止并发请求导致配置互相覆盖
_config_lock = threading.Lock()
# 所有相对路径均以 config.yaml 所在目录（项目根目录）为基准解析
_CONFIG_DIR = CONFIG_FILE.resolve().parent
_CONFIG_PATH_LOGGED = False


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


class DatabaseConfig(BaseModel):
    path: str = "./crf_editor.db"


class StorageConfig(BaseModel):
    upload_path: str = "./uploads"


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8888


class TemplateConfig(BaseModel):
    template_path: str = ""


class AIConfig(BaseModel):
    enabled: bool = False
    api_url: str = ""
    api_key: str = ""
    model: str = ""
    timeout: int = 30
    api_format: str = ""  # openai / anthropic，测试连接时自动探测


class AuthConfig(BaseModel):
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30


class AdminConfig(BaseModel):
    username: str = "admin"


class AppConfig(BaseModel):
    database: DatabaseConfig = DatabaseConfig()
    storage: StorageConfig = StorageConfig()
    server: ServerConfig = ServerConfig()
    template: TemplateConfig = TemplateConfig()
    ai: AIConfig = AIConfig()
    auth: AuthConfig = AuthConfig()
    admin: AdminConfig = AdminConfig()

    @property
    def db_path(self) -> str:
        """数据库路径，相对路径基于 config.yaml 所在目录（backend/src/）解析"""
        return _resolve_path(self.database.path, _CONFIG_DIR)

    @property
    def upload_path(self) -> str:
        """上传目录，相对路径基于 config.yaml 所在目录（backend/src/）解析"""
        return _resolve_path(self.storage.upload_path, _CONFIG_DIR)

    @property
    def template_path(self) -> str:
        return self.template.template_path

    @property
    def ai_config(self) -> "AIConfig":
        return self.ai


def load_config(path: Path | None = None) -> AppConfig:
    """从指定路径（默认 CONFIG_FILE）加载配置，返回 AppConfig 实例。

    不走缓存，每次调用都重新读取磁盘。
    YAML 解析失败时抛出 ValueError，由调用方决定如何处理。
    """
    config_file = path or CONFIG_FILE
    if config_file.exists():
        try:
            with open(config_file, encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except yaml.YAMLError as exc:
            raise ValueError(f"配置文件格式错误（{config_file}）: {exc}") from exc
        try:
            return AppConfig(**data)
        except ValidationError as exc:
            raise ValueError(f"配置文件内容不符合预期格式（{config_file}）: {exc}") from exc
    return AppConfig()


def save_config(config: AppConfig, path: Path | None = None) -> None:
    """将 AppConfig 序列化后写入 YAML 文件。

    警告：yaml.safe_dump 不保留原文件注释。
    写入后自动清除 get_config 缓存，确保下次读取拿到最新值。
    """
    config_file = path or CONFIG_FILE
    data = config.model_dump()
    with open(config_file, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
    get_config.cache_clear()


def update_config(updates: dict, path: Path | None = None) -> AppConfig:
    """线程安全地更新配置文件中的指定字段，返回更新后的 AppConfig。

    采用「加锁 + 读-改-写 + 原子替换」策略：
    1. 加 _config_lock，防止并发请求互相覆盖（HIGH-1 fix）
    2. 读取原始 YAML（保留 Pydantic 模型之外的非标准字段，如 app.title）
    3. 深合并 updates（不修改其他字段）
    4. 写入同目录临时文件，成功后 os.replace 原子替换（MEDIUM-4 fix）
    5. 清除 get_config 缓存

    写入失败时抛出异常，原配置文件保持完整不受损坏。
    警告：yaml.safe_dump 会丢失原文件中的注释。
    """
    config_file = path or CONFIG_FILE
    with _config_lock:
        raw: dict = {}
        if config_file.exists():
            try:
                with open(config_file, encoding="utf-8") as f:
                    raw = yaml.safe_load(f) or {}
            except yaml.YAMLError as exc:
                raise ValueError(f"配置文件格式错误（{config_file}）: {exc}") from exc
        merged = _deep_merge(raw, updates)
        content = yaml.safe_dump(merged, allow_unicode=True, sort_keys=False)
        # 写到同目录临时文件，再 os.replace 原子替换，避免写到一半崩溃导致配置损坏
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=config_file.parent, suffix=".tmp", prefix=".config_"
        )
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                f.write(content)
            os.replace(tmp_path, config_file)
        except Exception:
            # 写入失败时清理临时文件，原配置文件不受影响
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        get_config.cache_clear()
    return get_config()


@lru_cache(maxsize=1)
def get_config() -> AppConfig:
    """加载并缓存配置（单例模式）。调用 update_config() 后缓存自动失效。"""
    global _CONFIG_PATH_LOGGED
    if not _CONFIG_PATH_LOGGED:
        logger.info("配置文件路径: %s", CONFIG_FILE)
        _CONFIG_PATH_LOGGED = True
    return load_config()
