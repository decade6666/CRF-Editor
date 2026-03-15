"""公共工具函数"""
from datetime import datetime
import ipaddress
import random
from pathlib import Path
from urllib.parse import urlparse


def generate_code(prefix: str) -> str:
    """生成默认唯一标识 code: PREFIX_YYYYMMDDHHmmss_XXX"""
    now = datetime.now()
    ts = now.strftime("%Y%m%d%H%M%S")
    rand = f"{random.randint(0, 999):03d}"
    return f"{prefix}_{ts}_{rand}"


def is_safe_url(url: str) -> tuple[bool, str]:
    """
    校验 URL 是否安全（防止 SSRF）

    Returns:
        (is_safe, error_message)
    """
    if not url:
        return False, "URL 不能为空"

    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False, "仅支持 http/https 协议"

        hostname = parsed.hostname
        if not hostname:
            return False, "无效的 URL 格式"

        # 阻止私网地址
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return False, "不允许访问私网地址"
        except ValueError:
            # 域名，检查常见的内网域名
            if hostname in ("localhost", "metadata.google.internal"):
                return False, "不允许访问本地或元数据地址"
            if hostname.endswith((".local", ".internal")):
                return False, "不允许访问内网域名"

        return True, ""
    except Exception as e:
        return False, f"URL 解析失败: {str(e)}"


def is_safe_path(path: str, allowed_dirs: list[str] = None) -> tuple[bool, str]:
    """
    校验路径是否安全（防止路径穿越）

    Args:
        path: 待校验路径
        allowed_dirs: 允许的目录列表（绝对路径）

    Returns:
        (is_safe, error_message)
    """
    if not path:
        return False, "路径不能为空"

    try:
        real_path = Path(path).resolve()

        # 检查路径穿越
        if ".." in Path(path).parts:
            return False, "路径不能包含 .."

        # 如果指定了白名单，检查是否在允许的目录内
        if allowed_dirs:
            for allowed_dir in allowed_dirs:
                allowed_real = Path(allowed_dir).resolve()
                try:
                    real_path.relative_to(allowed_real)
                    return True, ""
                except ValueError:
                    continue
            return False, f"路径必须在允许的目录内: {', '.join(allowed_dirs)}"

        return True, ""
    except Exception as e:
        return False, f"路径解析失败: {str(e)}"


def mask_secret(secret: str, show_last: int = 4) -> str:
    """
    脱敏处理密钥

    Args:
        secret: 原始密钥
        show_last: 显示最后几位

    Returns:
        脱敏后的字符串
    """
    if not secret:
        return ""
    if len(secret) <= show_last:
        return "*" * len(secret)
    return "*" * (len(secret) - show_last) + secret[-show_last:]


def is_safe_file_upload(
    filename: str,
    content: bytes,
    allowed_mime_types: list[str],
    max_size_mb: int = 5,
) -> tuple[bool, str]:
    """
    校验上传文件是否安全

    Args:
        filename: 原始文件名
        content: 文件内容（前8KB足够检测魔数）
        allowed_mime_types: 允许的MIME类型列表
        max_size_mb: 最大文件大小(MB)

    Returns:
        (is_safe, error_message)
    """
    if not filename:
        return False, "文件名不能为空"

    # 检查文件扩展名
    _, ext = filename.lower().rsplit(".", 1) if "." in filename else ("", "")
    if ext not in ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]:
        return False, f"不支持的文件扩展名: .{ext}"

    # 检查文件大小
    size_mb = len(content) / (1024 * 1024)
    if size_mb > max_size_mb:
        return False, f"文件过大({size_mb:.2f}MB),最大允许{max_size_mb}MB"

    # 魔数检测（前8字节）
    magic_signatures = {
        b"\xff\xd8\xff": ["image/jpeg"],  # JPEG
        b"\x89PNG\r\n\x1a\n": ["image/png"],  # PNG
        b"GIF87a": ["image/gif"],  # GIF87a
        b"GIF89a": ["image/gif"],  # GIF89a
        b"BM": ["image/bmp"],  # BMP
        b"RIFF": ["image/webp"],  # WebP (需进一步检查)
        b"<svg": ["image/svg+xml"],  # SVG
        b"<?xml": ["image/svg+xml"],  # SVG with XML declaration
    }

    detected_mime = None
    for magic, mime_list in magic_signatures.items():
        if content.startswith(magic):
            detected_mime = mime_list[0]
            # WebP需额外验证WEBP标识
            if magic == b"RIFF" and len(content) >= 12:
                if content[8:12] != b"WEBP":
                    continue
            break

    if not detected_mime:
        return False, "无法识别文件类型（魔数检测失败）"

    # 检查MIME类型是否在白名单内
    if detected_mime not in allowed_mime_types:
        return False, f"不允许的文件类型: {detected_mime}"

    return True, ""
