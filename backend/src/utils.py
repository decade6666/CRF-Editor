"""公共工具函数"""

from __future__ import annotations

from datetime import datetime
import random
import string
from pathlib import Path


def generate_code(prefix: str) -> str:
    """生成默认唯一标识 code: PREFIX_YYYYMMDDHHmmss_XXXXXX

    随机后缀使用 6 位大写字母+数字组合（36^6 ≈ 21 亿种），
    大幅降低同秒批量生成时的碰撞概率。
    """
    now = datetime.now()
    ts = now.strftime("%Y%m%d%H%M%S")
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"{prefix}_{ts}_{rand}"


def is_safe_path(path: str, allowed_dirs: list[str] = None) -> tuple[bool, str]:
    """
    校验路径是否安全。

    未提供白名单时，保留基础路径穿越拦截；
    提供白名单时，校验解析后路径是否位于允许目录内。

    Args:
        path: 待校验路径
        allowed_dirs: 允许的目录列表（绝对路径或可解析路径）

    Returns:
        (is_safe, error_message)
    """
    if not path:
        return False, "路径不能为空"

    try:
        raw_path = Path(path)
        if not allowed_dirs and ".." in raw_path.parts:
            return False, "路径不能包含 .."

        real_path = Path(path).resolve()
        if allowed_dirs:
            import os

            for allowed_dir in allowed_dirs:
                allowed_real = Path(allowed_dir).resolve()
                try:
                    # 使用 commonpath 确保 real_path 确实在 allowed_real 下
                    if os.path.commonpath([str(real_path), str(allowed_real)]) == str(allowed_real):
                        return True, ""
                except (ValueError, OSError):
                    continue
            return False, f"路径必须在允许的目录内: {', '.join(str(item) for item in allowed_dirs)}"

        return True, ""
    except Exception as e:
        return False, f"路径解析失败: {str(e)}"


def is_safe_file_upload(
    filename: str,
    content: bytes,
    allowed_mime_types: list[str],
    max_size_mb: int = 5,
) -> tuple[bool, str, str]:
    """
    校验上传文件是否安全，并返回检测得到的保存扩展名。

    Args:
        filename: 原始文件名
        content: 完整文件内容
        allowed_mime_types: 允许的MIME类型列表
        max_size_mb: 最大文件大小(MB)

    Returns:
        (is_safe, error_message, detected_extension)
    """
    if not filename:
        return False, "文件名不能为空", ""

    size_mb = len(content) / (1024 * 1024)
    if size_mb > max_size_mb:
        return False, f"文件过大({size_mb:.2f}MB),最大允许{max_size_mb}MB", ""

    text_prefix = content[:512].lstrip(b"\xef\xbb\xbf\r\n\t ")
    lowered_prefix = text_prefix.lower()
    if lowered_prefix.startswith(b"<svg") or lowered_prefix.startswith(b"<?xml"):
        return False, "不允许 SVG/XML 图片", ""

    detected_mime = ""
    detected_ext = ""
    if content.startswith(b"\xff\xd8\xff"):
        detected_mime = "image/jpeg"
        detected_ext = "jpg"
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):
        detected_mime = "image/png"
        detected_ext = "png"
    elif content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):
        detected_mime = "image/gif"
        detected_ext = "gif"
    elif content.startswith(b"BM"):
        detected_mime = "image/bmp"
        detected_ext = "bmp"
    elif content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP":
        detected_mime = "image/webp"
        detected_ext = "webp"

    if not detected_mime:
        return False, "无法识别文件类型（魔数检测失败）", ""

    if detected_mime not in allowed_mime_types:
        return False, f"不允许的文件类型: {detected_mime}", ""

    return True, "", detected_ext
