"""Schema 公共校验工具（req2：OID 字符集）。

OID 契约：只允许字母、数字、`.`、`_`、`-`（正则 `^[A-Za-z0-9._-]+$`）。
- `required_oid_validator`：必填 OID（如字段定义 `variable_name`），去空白后非空且合规。
- `optional_oid_validator`：可选 OID（表单 / 码表 `code` 等），空 / 空白归一为 None，有值才校验字符集。
- `optional_free_code_validator`：自由编码（码表选项 `code`，与标签一致不限制字符内容），空 / 空白归一为 None，仅去空白、不做字符集校验。

仅在写入边界（Create/Update schema）拦截；不做存量迁移。前后端共用同一字符集。
"""

from __future__ import annotations

import re

from pydantic import field_validator

OID_PATTERN = r"^[A-Za-z0-9._-]+$"
_OID_RE = re.compile(OID_PATTERN)
OID_ERROR = "OID 只允许由字母、数字、“-”、“_”和“.”组成"


def _normalize_optional_text(value: object) -> str | None:
    """可选文本字段共用的 before 规范化：None / 空 / 空白 -> None，否则 str() 去空白。"""
    if value is None:
        return None
    text = str(value).strip()
    if text == "":
        return None
    return text


def _check_charset(value: str) -> str:
    if not _OID_RE.fullmatch(value):
        raise ValueError(OID_ERROR)
    return value


def normalize_optional_oid(value: object) -> str | None:
    """空 / 空白 -> None；有值则去空白并校验字符集。"""
    text = _normalize_optional_text(value)
    if text is None:
        return None
    return _check_charset(text)


def normalize_optional_free_code(value: object) -> str | None:
    """自由编码：空 / 空白 -> None；有值仅去空白，不限制字符内容。"""
    return _normalize_optional_text(value)


def normalize_required_oid(value: object) -> str:
    """必填 OID：去空白后不得为空，且须符合字符集。"""
    if value is None:
        raise ValueError(OID_ERROR)
    text = str(value).strip()
    if text == "":
        raise ValueError(OID_ERROR)
    return _check_charset(text)


def optional_oid_validator(*fields: str):
    """构造一个可复用的可选 OID `field_validator`（mode=before）。"""

    @field_validator(*fields, mode="before")
    @classmethod
    def _validate(cls, value: object) -> str | None:
        return normalize_optional_oid(value)

    return _validate


def optional_free_code_validator(*fields: str):
    """构造一个可复用的自由编码 `field_validator`（mode=before，仅 strip + 空→None）。"""

    @field_validator(*fields, mode="before")
    @classmethod
    def _validate(cls, value: object) -> str | None:
        return normalize_optional_free_code(value)

    return _validate


def required_oid_validator(*fields: str):
    """构造一个可复用的必填 OID `field_validator`（mode=before）。"""

    @field_validator(*fields, mode="before")
    @classmethod
    def _validate(cls, value: object) -> str:
        return normalize_required_oid(value)

    return _validate
