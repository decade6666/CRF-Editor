"""共用 Logo 存储服务：位图矩阵、有界读取、路径防护、补偿式文件操作。"""
import io

import pytest
from types import SimpleNamespace

from src.services import logo_storage_service as svc

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
GIF = b"GIF89a" + b"\x00" * 32
BMP = b"BM" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 32
SVG = b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"
XML_PNG_EXT = b"<?xml version='1.0'?><svg></svg>"


@pytest.fixture
def upload_dir(tmp_path):
    return tmp_path


@pytest.fixture(autouse=True)
def _patch_config(upload_dir, monkeypatch):
    monkeypatch.setattr(
        svc, "get_config", lambda: SimpleNamespace(upload_path=str(upload_dir))
    )


def _upload_file(content: bytes):
    return SimpleNamespace(file=io.BytesIO(content))


# ---- validate_bitmap 位图矩阵 ----

@pytest.mark.parametrize(
    "name,content,expected_ext",
    [
        ("a.png", PNG, "png"),
        ("a.jpg", JPG, "jpg"),
        ("a.jpeg", JPG, "jpg"),
        ("a.gif", GIF, "gif"),
        ("a.bmp", BMP, "bmp"),
        ("a.webp", WEBP, "webp"),
    ],
)
def test_validate_bitmap_accepts_safe_bitmaps(name, content, expected_ext):
    assert svc.validate_bitmap(name, content) == expected_ext


def test_validate_bitmap_rejects_svg_even_with_png_extension():
    with pytest.raises(ValueError, match="SVG/XML"):
        svc.validate_bitmap("logo.png", SVG)


def test_validate_bitmap_rejects_xml_payload_with_png_extension():
    with pytest.raises(ValueError, match="SVG/XML"):
        svc.validate_bitmap("logo.png", XML_PNG_EXT)


def test_validate_bitmap_rejects_unknown_magic():
    with pytest.raises(ValueError, match="魔数"):
        svc.validate_bitmap("logo.txt", b"plain text content")


def test_validate_bitmap_rejects_oversize():
    oversized = PNG + b"\x00" * (5 * 1024 * 1024 + 10)
    with pytest.raises(ValueError, match="过大"):
        svc.validate_bitmap("logo.png", oversized)


# ---- read_bounded_upload ----

def test_read_bounded_upload_accepts_within_limit():
    content = svc.read_bounded_upload(_upload_file(PNG))
    assert content == PNG


def test_read_bounded_upload_rejects_over_limit():
    big = PNG + b"\x00" * (5 * 1024 * 1024 + 5)
    with pytest.raises(ValueError, match="过大"):
        svc.read_bounded_upload(_upload_file(big))


# ---- safe_resolve 路径防护 ----

def test_safe_resolve_accepts_plain_relative_name():
    assert svc.safe_resolve("logos", "abc.png") == svc.namespace_dir("logos") / "abc.png"


@pytest.mark.parametrize(
    "bad",
    ["/etc/passwd", "../escape.png", "a/../b.png", "dir/nested.png", "a\\b.png"],
)
def test_safe_resolve_rejects_unsafe_paths(bad):
    with pytest.raises(ValueError, match="非法路径"):
        svc.safe_resolve("logos", bad)


# ---- prepare_new_file / delete_file / read_safe ----

def test_prepare_new_file_writes_unique_uuid_file(upload_dir):
    rel = svc.prepare_new_file("logos", PNG, "png")
    assert rel.endswith(".png")
    path = svc.safe_resolve("logos", rel)
    assert path.exists()
    assert path.read_bytes() == PNG


def test_prepare_new_file_namespaces_are_isolated(upload_dir):
    svc.prepare_new_file("logos", PNG, "png")
    svc.prepare_new_file("organization-logos", JPG, "jpg")
    assert (upload_dir / "logos").exists()
    assert (upload_dir / "organization-logos").exists()


def test_delete_file_removes_and_reports_missing(upload_dir):
    rel = svc.prepare_new_file("logos", PNG, "png")
    assert svc.delete_file("logos", rel) is True
    assert svc.delete_file("logos", rel) is False


def test_read_safe_revalidates_magic_of_historical_file(upload_dir):
    svc.namespace_dir("logos").mkdir(parents=True, exist_ok=True)
    (upload_dir / "logos" / "legacy.png").write_bytes(XML_PNG_EXT)
    with pytest.raises(ValueError, match="SVG/XML"):
        svc.read_safe("logos", "legacy.png")


def test_read_safe_missing_file_raises(upload_dir):
    with pytest.raises(FileNotFoundError):
        svc.read_safe("logos", "missing.png")


def test_copy_file_for_project_creates_new_uuid_copy(upload_dir):
    source_rel = svc.prepare_new_file("organization-logos", PNG, "png")
    dest_rel = svc.copy_file_for_project("organization-logos", source_rel)
    assert dest_rel != source_rel
    assert dest_rel.endswith(".png")
    assert svc.safe_resolve("logos", dest_rel).read_bytes() == PNG
