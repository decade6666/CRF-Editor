"""Logo 文件存储服务（项目与机构预设共用）。

DB 是唯一事实源；文件操作全部补偿式，顺序固定：
准备新文件（事务外）→ DB 事务 → commit → 删除旧文件（失败仅 warning）。
绝不出现 DB 指向不存在文件。
"""
import logging
import uuid
from pathlib import Path

from src.config import get_config
from src.utils import is_safe_file_upload

logger = logging.getLogger("src.logo_storage")

LOGO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp"]
LOGO_BLOCKED_EXTENSIONS = {".svg", ".xml"}
MAX_LOGO_MB = 5
MAX_LOGO_BYTES = MAX_LOGO_MB * 1024 * 1024

# 命名空间目录：项目 Logo 与机构预设 Logo 物理隔离
PROJECT_NAMESPACE = "logos"
ORGANIZATION_NAMESPACE = "organization-logos"


def namespace_dir(namespace: str) -> Path:
    return Path(get_config().upload_path) / namespace


def safe_resolve(namespace: str, rel_name: str) -> Path:
    """安全解析相对文件名：拒绝绝对路径 / 目录穿越 / 嵌套路径 / 反斜杠。"""
    raw = Path(rel_name)
    if (
        raw.is_absolute()
        or raw.name != rel_name
        or ".." in raw.parts
        or "\\" in rel_name
    ):
        raise ValueError("Logo 文件不安全: 非法路径")
    return namespace_dir(namespace) / rel_name


def validate_bitmap(filename: str, content: bytes) -> str:
    """校验位图并返回保存扩展名；不合法抛出中文 ValueError。"""
    is_valid, error_msg, detected_ext = is_safe_file_upload(
        filename=filename,
        content=content,
        allowed_mime_types=LOGO_ALLOWED_TYPES,
        max_size_mb=MAX_LOGO_MB,
    )
    if not is_valid:
        raise ValueError(f"文件不安全: {error_msg}")
    return detected_ext


def read_bounded_upload(file) -> bytes:
    """有界读取上传内容（5MB + 1 字节截断检测）。"""
    content = file.file.read(MAX_LOGO_BYTES + 1)
    if len(content) > MAX_LOGO_BYTES:
        raise ValueError(f"文件过大，最大允许 {MAX_LOGO_MB}MB")
    return content


def prepare_new_file(namespace: str, content: bytes, ext: str) -> str:
    """事务外准备唯一新文件，返回相对文件名。"""
    upload_dir = namespace_dir(namespace)
    upload_dir.mkdir(parents=True, exist_ok=True)
    rel_name = f"{uuid.uuid4().hex}.{ext}"
    (upload_dir / rel_name).write_bytes(content)
    return rel_name


def copy_file_for_project(namespace: str, source_rel: str) -> str:
    """快照复制（如预设 Logo → 项目目录），返回新相对文件名。"""
    source = safe_resolve(namespace, source_rel)
    content = source.read_bytes()
    upload_dir = namespace_dir(PROJECT_NAMESPACE)
    upload_dir.mkdir(parents=True, exist_ok=True)
    rel_name = f"{uuid.uuid4().hex}.{source.suffix.lstrip('.') or 'png'}"
    (upload_dir / rel_name).write_bytes(content)
    return rel_name


def delete_file(namespace: str, rel_name: str) -> bool:
    """删除文件；文件不存在返回 False，失败仅 warning 不抛错。"""
    try:
        path = safe_resolve(namespace, rel_name)
        if not path.exists():
            return False
        path.unlink()
        return not path.exists()
    except Exception as exc:  # noqa: BLE001 - 清理失败必须可观察但不阻断
        logger.warning("删除 Logo 文件失败 (namespace=%s, file=%s): %s", namespace, rel_name, exc)
        return False


def read_safe(namespace: str, rel_name: str) -> bytes:
    """读取并复核历史文件：路径安全 + 扩展名 + 魔数。"""
    path = safe_resolve(namespace, rel_name)
    if path.suffix.lower() in LOGO_BLOCKED_EXTENSIONS:
        raise ValueError("Logo 文件不安全: 不允许 SVG/XML 图片，请重新上传位图")
    content = path.read_bytes()
    validate_bitmap(path.name, content)
    return content
