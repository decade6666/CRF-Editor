"""Agent 创作契约测试：OID/类型/日期/数字规则与前端契约源对齐。

直接解析前端源文件（oidValidation.js / dateFormatOptions.js /
FieldsTab.vue / fieldTypeAvailability.js），不复制第二份清单。
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from agent_access_helpers import agent_tool, issue_credential, seed_full_project, reset_agent_limiter
from src.schemas.agent_tools import (
    CHOICE_FIELD_TYPES,
    DATE_FORMAT_FIELD_TYPES,
    REGULAR_FIELD_TYPES,
)

pytestmark = pytest.mark.integration

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND = REPO_ROOT / "frontend" / "src"


def _read(rel: str) -> str:
    return (FRONTEND / rel).read_text(encoding="utf-8")


def test_regular_field_types_match_fields_tab():
    """后端 REGULAR_FIELD_TYPES 与 FieldsTab.vue 字段类型清单逐项对齐。"""
    source = _read("components/FieldsTab.vue")
    match = re.search(r"const fieldTypes = \[(.*?)\]", source, re.S)
    assert match, "FieldsTab.vue 缺少 fieldTypes 声明"
    frontend_types = re.findall(r"'([^']+)'", match.group(1))
    assert tuple(frontend_types) == REGULAR_FIELD_TYPES


def test_date_formats_match_canonical_options():
    """新写日期格式校验源与 dateFormatOptions.js（唯一事实来源）一致。"""
    from src.database import _DATE_FORMAT_CANONICALS

    source = _read("composables/dateFormatOptions.js")
    body = re.search(r"export const DATE_FORMAT_OPTIONS = \{(.*?)\n\}", source, re.S)
    assert body
    options = {}
    for key, list_body in re.findall(r"['\"]?(日期时间|日期|时间)['\"]?\s*:\s*\[(.*?)\]", body.group(1), re.S):
        options[key] = re.findall(r"['\"]([^'\"]+)['\"]", list_body)
    for field_type in DATE_FORMAT_FIELD_TYPES:
        lowered = {opt.lower(): opt for opt in options[field_type]}
        for opt in options[field_type]:
            assert _DATE_FORMAT_CANONICALS[field_type][opt.lower()] == opt


def test_choice_types_match_frontend_availability():
    source = _read("composables/fieldTypeAvailability.js")
    match = re.search(r"MULTISELECT_FIELD_TYPES = Object\.freeze\(\[(.*?)\]\)", source, re.S)
    assert match, "fieldTypeAvailability.js 缺少 MULTISELECT_FIELD_TYPES"
    frontend_multiselect = tuple(re.findall(r"'([^']+)'", match.group(1)))
    from src.services.field_type_policy import MULTISELECT_FIELD_TYPES

    assert set(frontend_multiselect) == set(MULTISELECT_FIELD_TYPES)
    for choice_type in CHOICE_FIELD_TYPES:
        assert choice_type in _read("components/FieldsTab.vue")


def test_saimeisi_oid_cap_matches_frontend_constant():
    """服务端赛美斯字段 OID 上限 = 前端 FIELD_OID_MAX_LENGTH。"""
    source = _read("composables/oidValidation.js")
    match = re.search(r"export const FIELD_OID_MAX_LENGTH = (\d+)", source)
    assert match
    frontend_cap = int(match.group(1))
    from src.services.agent_edit_service import _SAIMEISI_FIELD_OID_MAX_LENGTH

    assert _SAIMEISI_FIELD_OID_MAX_LENGTH == frontend_cap


def test_integer_decimal_ranges_match_frontend():
    """integer 1..20 / decimal 0..15 与 FieldsTab 输入范围一致。"""
    source = _read("components/FieldsTab.vue")
    int_match = re.search(r'integer_digits[^>]*:min="(\d+)"[^>]*:max="(\d+)"', source)
    assert int_match, "FieldsTab.vue 缺少 integer_digits 范围"
    assert sorted(int_match.groups()) == ["1", "20"]
    dec_match = re.search(r'decimal_digits[^>]*:min="(\d+)"[^>]*:max="(\d+)"', source)
    assert dec_match, "FieldsTab.vue 缺少 decimal_digits 范围"
    assert sorted(dec_match.groups()) == ["0", "15"]


def test_new_definition_digit_validation(client: TestClient, engine):
    """非法数字位数被 agent 工具拒绝（服务端策略，不依赖前端）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    fp = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]

    resp = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {
                "new_definition": {
                    "variable_name": "NUM_FIELD",
                    "label": "数值字段",
                    "field_type": "数值",
                    "integer_digits": 25,  # 超出 1..20
                }
            },
            "instance": {},
            "position": None,
            "expected_project_fingerprint": fp,
            "request_id": "digits-bad",
        },
    )
    assert resp.status_code == 422


def test_checkbox_codelist_free_contract():
    """复选类型契约：字典必空（模型 validates + agent 服务端策略）。"""
    source = _read("composables/useCRFRenderer.js")
    assert "复选" in source
    # 后端模型：@validates("field_type") 切复选清 codelist
    model = (REPO_ROOT / "backend" / "src" / "models" / "field_definition.py").read_text(encoding="utf-8")
    assert 'field_type == "复选"' in model and "self.codelist_id = None" in model


def test_legacy_oid_casing_preserved_on_untouched_binding(client: TestClient, engine):
    """绑定既有小写 OID 定义不改写其身份。"""
    from src.models.field_definition import FieldDefinition
    from src.models.form_field import FormField

    ctx = seed_full_project(client, engine, "alice")
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        legacy = FieldDefinition(
            project_id=ctx["project_id"],
            variable_name="legacy_lower",
            label="历史字段",
            field_type="文本",
            order_index=5,
        )
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id

    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    fp = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]
    resp = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {"definition_id": legacy_id},
            "instance": {},
            "position": None,
            "expected_project_fingerprint": fp,
            "request_id": "bind-legacy",
        },
    )
    assert resp.status_code == 200, resp.text
    with Session(engine) as session:
        assert session.get(FieldDefinition, legacy_id).variable_name == "legacy_lower"


def test_default_date_formats_match_frontend_contract():
    """后端类型默认日期格式（agent 新写/类型切换缺省值）与
    dateFormatOptions.js::DEFAULT_DATE_FORMATS（唯一事实来源）逐项一致。"""
    from src.schemas.agent_tools import DATE_FORMAT_FIELD_TYPES
    from src.services.field_profile_service import DEFAULT_DATE_FORMATS_BY_TYPE

    source = _read("composables/dateFormatOptions.js")
    body = re.search(r"export const DEFAULT_DATE_FORMATS = \{(.*?)\n\}", source, re.S)
    assert body, "dateFormatOptions.js 缺少 DEFAULT_DATE_FORMATS 声明"
    frontend = dict(re.findall(r"['\"]?(日期时间|日期|时间)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", body.group(1)))
    assert set(frontend) == set(DEFAULT_DATE_FORMATS_BY_TYPE), "默认日期格式键集不一致"
    for field_type in DATE_FORMAT_FIELD_TYPES:
        assert DEFAULT_DATE_FORMATS_BY_TYPE[field_type] == frontend[field_type], (
            f"{field_type} 默认格式漂移: backend={DEFAULT_DATE_FORMATS_BY_TYPE[field_type]!r} "
            f"frontend={frontend[field_type]!r}"
        )
