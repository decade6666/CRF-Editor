"""Schema 公共校验工具（req2：OID 字符集）。

OID 契约：只允许字母、数字、`.`、`_`、`-`（正则 `^[A-Za-z0-9._-]+$`）。
- `required_oid_validator`：必填 OID（如字段定义 `variable_name`），去空白后非空且合规。
- `optional_oid_validator`：可选 OID（表单 / 码表 `code` 等），空 / 空白归一为 None，有值才校验字符集。
- `optional_free_code_validator`：自由编码（码表选项 `code`，与标签一致不限制字符内容），空 / 空白归一为 None，仅去空白、不做字符集校验。

仅在写入边界（Create/Update schema）拦截；不做存量迁移。前后端共用同一字符集。

大写 OID 录入（10-27-uppercase-oids）：`upper_ascii_oid` / `normalize_changed_oid`
只在作者写入分支做 ASCII 大写归一（普通路由新建 / 真正改值的更新、字段定义复制、
field-profile 新建定义）；本模块既有 validator 只校验字符集、保留原大小写
（快照 / 恢复 / 导入共用，不得全局大写化）。
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


_UPPER_ASCII_RE = re.compile(r"[a-z]")


def upper_ascii_oid(value: object) -> str | None:
    """新写 / 人工改写 OID 的 ASCII 大写归一：仅转换 a-z 为 A-Z。

    不动空白、数字、标点与非 ASCII（如 ``ß`` 不得经 Unicode 大写膨胀为 ``SS``）；
    字符集校验仍归既有 schema validator。仅限写入边界的作者分支调用，
    存量行 / 快照 / 导入 / 恢复路径不得使用。
    """
    if value is None:
        return None
    return _UPPER_ASCII_RE.sub(lambda match: match.group(0).upper(), str(value))


def normalize_changed_oid(new_value: object, current_value: str | None) -> str | None:
    """更新分支的 OID 归一：显式 None 保持 None（清空语义）；与现有值完全一致的
    exact echo 原样保留（含历史小写，不得隐藏改名）；其余真正改写的非 None 值
    先做 ASCII 大写归一（见 `upper_ascii_oid`）。
    「OID 未提交」的省略场景由调用方在构造 payload 时按键缺失跳过，不进入本函数。"""
    if new_value is None:
        return None
    if current_value is not None and str(new_value) == current_value:
        return current_value
    return upper_ascii_oid(new_value)


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
