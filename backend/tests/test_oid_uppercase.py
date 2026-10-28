"""新写/人工改写 OID 的 ASCII 大写归一（任务 10-27-uppercase-oids）。

契约边界（design.md）：
- 仅「新写 / 人工改写」分支归一：普通 create、真正改值的 update（PUT/PATCH）、
  字段 profile 无 preferred 的新建定义、字段定义复制端点；
- 省略 OID / 与现有值完全一致（exact echo）的更新不得改写存量行（含历史小写）；
- 字段 profile 的 update_shared / 纯绑定 / 带 preferred 的历史恢复保持快照原值；
- 码表选项 code、名称、标签、单位符号为自由文本，不做大小写转换；
- 仅转换 ASCII a-z，非 ASCII 不得经 Unicode 大写膨胀为合法 ASCII。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as

from src.schemas._common import normalize_changed_oid, upper_ascii_oid


# --------- 纯 helper ---------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("ae_01.a-b", "AE_01.A-B"),
        ("Ae01", "AE01"),
        ("AE_01.A-B", "AE_01.A-B"),  # 幂等
        ("1.2-3_4", "1.2-3_4"),  # 数字与标点不动
        (" a b ", " A B "),  # 空白保留（trim 仍归写入校验链）
        ("ß", "ß"),  # 非 ASCII 不得膨胀为 SS
        ("中文AE", "中文AE"),
        ("", ""),
    ],
)
def test_upper_ascii_oid_only_converts_ascii_letters(raw: str, expected: str) -> None:
    assert upper_ascii_oid(raw) == expected


def test_upper_ascii_oid_none_stays_none() -> None:
    assert upper_ascii_oid(None) is None


@pytest.mark.parametrize(
    "new,current,expected",
    [
        (None, "OLD", None),  # 显式 None → 保持清空语义（「未提交省略」由调用方按键缺失跳过）
        ("OLD", "OLD", "OLD"),  # exact echo（大写）→ 原样
        ("old", "old", "old"),  # exact echo（历史小写）→ 原样，不得隐藏改名
        ("old", "OLD", "OLD"),  # 真正改写 → 归一
        ("new_oid", "OLD", "NEW_OID"),
    ],
)
def test_normalize_changed_oid_preserves_identity_and_normalizes_changed(new, current, expected) -> None:
    assert normalize_changed_oid(new, current) == expected


def test_normalize_changed_oid_none_current_normalizes_new_value() -> None:
    assert normalize_changed_oid("abc", None) == "ABC"


# --------- 路由集成 ---------

FIELD = "/api/projects/{pid}/field-definitions"


@pytest.fixture
def auth_token(client: TestClient) -> str:
    return login_as(client, "alice")


@pytest.fixture
def project_id(client: TestClient, auth_token: str) -> int:
    resp = client.post(
        "/api/projects",
        json={"name": "大写OID项目", "version": "1.0"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_field(client, token, project_id, variable_name):
    return client.post(
        FIELD.format(pid=project_id),
        json={"variable_name": variable_name, "label": "字段", "field_type": "文本"},
        headers=auth_headers(token),
    )


def _seed_legacy_lower_field(engine, project_id: int, variable_name: str = "oldfld") -> int:
    """绕过写入边界，直接构造历史小写行（模拟存量数据）。"""

    from src.models.field_definition import FieldDefinition

    with Session(engine) as session:
        fd = FieldDefinition(
            project_id=project_id,
            variable_name=variable_name,
            label="历史字段",
            field_type="文本",
            order_index=99,
        )
        session.add(fd)
        session.commit()
        return fd.id


# ---- 字段定义 ----


def test_field_create_normalizes_lowercase_oid(client, project_id, auth_token) -> None:
    resp = _create_field(client, auth_token, project_id, "ae_01.a-b")
    assert resp.status_code == 201, resp.text
    assert resp.json()["variable_name"] == "AE_01.A-B"


def test_field_update_changed_oid_is_normalized(client, project_id, auth_token) -> None:
    fd_id = _create_field(client, auth_token, project_id, "AE01").json()["id"]
    resp = client.put(
        f"{FIELD.format(pid=project_id)}/{fd_id}",
        json={"variable_name": "ae02"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["variable_name"] == "AE02"


def test_field_update_exact_echo_keeps_legacy_lowercase(client, project_id, auth_token, engine) -> None:
    fd_id = _seed_legacy_lower_field(engine, project_id, "oldfld")
    resp = client.put(
        f"{FIELD.format(pid=project_id)}/{fd_id}",
        json={"variable_name": "oldfld", "label": "改名不改OID"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["variable_name"] == "oldfld"


def test_field_update_omitted_oid_keeps_legacy_lowercase(client, project_id, auth_token, engine) -> None:
    fd_id = _seed_legacy_lower_field(engine, project_id, "oldfld")
    resp = client.put(
        f"{FIELD.format(pid=project_id)}/{fd_id}",
        json={"label": "只改标签"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["variable_name"] == "oldfld"


def test_field_update_non_ascii_code_is_not_expanded(client, project_id, auth_token, engine) -> None:
    """非 ASCII 不得经大写转换变成合法 ASCII；字符集校验保持拒绝语义。"""

    fd_id = _seed_legacy_lower_field(engine, project_id, "oldfld")
    resp = client.put(
        f"{FIELD.format(pid=project_id)}/{fd_id}",
        json={"variable_name": "ß"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 422, resp.text


# ---- 表单（PUT 与 PATCH 共用 _apply_form_update）----


def _create_form(client, token, project_id, code=None):
    payload = {"name": "表单"}
    if code is not None:
        payload["code"] = code
    return client.post(f"/api/projects/{project_id}/forms", json=payload, headers=auth_headers(token))


def test_form_create_normalizes_lowercase_code(client, project_id, auth_token) -> None:
    resp = _create_form(client, auth_token, project_id, "f_01")
    assert resp.status_code == 201, resp.text
    assert resp.json()["code"] == "F_01"


@pytest.mark.parametrize("method", ["put", "patch"])
def test_form_update_changed_code_is_normalized(client, project_id, auth_token, method) -> None:
    form_id = _create_form(client, auth_token, project_id, "FORMA").json()["id"]
    resp = getattr(client, method)(f"/api/forms/{form_id}", json={"code": "form_b"}, headers=auth_headers(auth_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["code"] == "FORM_B"


@pytest.mark.parametrize("method", ["put", "patch"])
def test_form_update_exact_echo_keeps_legacy_lowercase(client, project_id, auth_token, engine, method) -> None:
    from src.models.form import Form

    with Session(engine) as session:
        form = Form(project_id=project_id, name="历史表单", code="oldfrm", order_index=1)
        session.add(form)
        session.commit()
        form_id = form.id

    resp = getattr(client, method)(
        f"/api/forms/{form_id}", json={"code": "oldfrm", "name": "改名"}, headers=auth_headers(auth_token)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["code"] == "oldfrm"


def test_form_update_omitted_code_keeps_legacy_lowercase(client, project_id, auth_token, engine) -> None:
    from src.models.form import Form

    with Session(engine) as session:
        form = Form(project_id=project_id, name="历史表单", code="oldfrm", order_index=1)
        session.add(form)
        session.commit()
        form_id = form.id

    resp = client.put(f"/api/forms/{form_id}", json={"name": "只改名称"}, headers=auth_headers(auth_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["code"] == "oldfrm"


# ---- 码表（选项 code 保持自由文本）----


def test_codelist_create_normalizes_code_but_keeps_option_codes(client, project_id, auth_token) -> None:
    resp = client.post(
        f"/api/projects/{project_id}/codelists",
        json={
            "name": "性别",
            "code": "cl_sex",
            "options": [
                {"code": "opt_a", "decode": "男"},
                {"code": "Opt-B", "decode": "女"},
            ],
        },
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["code"] == "CL_SEX"
    assert [opt["code"] for opt in body["options"]] == ["opt_a", "Opt-B"]


def test_codelist_update_changed_code_is_normalized_and_echo_preserved(client, project_id, auth_token, engine) -> None:
    from src.models.codelist import CodeList

    with Session(engine) as session:
        cl = CodeList(project_id=project_id, name="历史码表", code="oldcl", order_index=1)
        session.add(cl)
        session.commit()
        cl_id = cl.id

    # 任何改名之前：exact echo 历史小写 + 只改名称 → OID 原样保留
    legacy_echo = client.put(
        f"/api/projects/{project_id}/codelists/{cl_id}",
        json={"code": "oldcl", "name": "改名不改OID"},
        headers=auth_headers(auth_token),
    )
    assert legacy_echo.status_code == 200, legacy_echo.text
    assert legacy_echo.json()["code"] == "oldcl"

    update = client.put(
        f"/api/projects/{project_id}/codelists/{cl_id}",
        json={"code": "new_cl"},
        headers=auth_headers(auth_token),
    )
    assert update.status_code == 200, update.text
    assert update.json()["code"] == "NEW_CL"

    echo = client.put(
        f"/api/projects/{project_id}/codelists/{cl_id}",
        json={"code": "NEW_CL", "name": "再改名"},
        headers=auth_headers(auth_token),
    )
    assert echo.status_code == 200, echo.text
    assert echo.json()["code"] == "NEW_CL"


# ---- 单位 / 访视（无字符集校验，仅加大小写）----


def test_unit_create_and_update_normalize_lowercase_code(client, project_id, auth_token) -> None:
    created = client.post(
        f"/api/projects/{project_id}/units",
        json={"symbol": "kg", "code": "u_wt"},
        headers=auth_headers(auth_token),
    )
    assert created.status_code == 201, created.text
    assert created.json()["code"] == "U_WT"

    updated = client.put(
        f"/api/units/{created.json()['id']}",
        json={"code": "u_ht"},
        headers=auth_headers(auth_token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["code"] == "U_HT"


def test_unit_non_ascii_code_is_not_transformed(client, project_id, auth_token) -> None:
    """单位 code 无字符集校验：非 ASCII 原样保留，不得新增无关字符限制。"""

    created = client.post(
        f"/api/projects/{project_id}/units",
        json={"symbol": "毫米", "code": "毫米"},
        headers=auth_headers(auth_token),
    )
    assert created.status_code == 201, created.text
    assert created.json()["code"] == "毫米"


def test_unit_update_exact_echo_keeps_legacy_lowercase(client, project_id, auth_token, engine) -> None:
    from src.models.unit import Unit

    with Session(engine) as session:
        unit = Unit(project_id=project_id, symbol="mg", code="oldu", order_index=1)
        session.add(unit)
        session.commit()
        unit_id = unit.id

    resp = client.put(f"/api/units/{unit_id}", json={"code": "oldu", "symbol": "g"}, headers=auth_headers(auth_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["code"] == "oldu"


def test_visit_create_and_update_normalize_lowercase_code(client, project_id, auth_token) -> None:
    created = client.post(
        f"/api/projects/{project_id}/visits",
        json={"name": "筛选期", "code": "v_scr"},
        headers=auth_headers(auth_token),
    )
    assert created.status_code == 201, created.text
    assert created.json()["code"] == "V_SCR"

    updated = client.put(
        f"/api/projects/{project_id}/visits/{created.json()['id']}",
        json={"code": "v_eot"},
        headers=auth_headers(auth_token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["code"] == "V_EOT"


def test_visit_update_exact_echo_keeps_legacy_lowercase(client, project_id, auth_token, engine) -> None:
    from src.models.visit import Visit

    with Session(engine) as session:
        visit = Visit(project_id=project_id, name="历史访视", code="oldv", sequence=1)
        session.add(visit)
        session.commit()
        visit_id = visit.id

    resp = client.put(
        f"/api/projects/{project_id}/visits/{visit_id}",
        json={"code": "oldv", "name": "改名"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["code"] == "oldv"


# ---- 字段 profile（新建归一 / 恢复保快照 / 冲突不静默换绑）----

PROFILE = "/api/forms/{fid}/field-profile"


@pytest.fixture
def profile_context(client, project_id, auth_token, engine):
    from src.models.form import Form

    with Session(engine) as session:
        form = Form(project_id=project_id, name="Profile表单", code="F_PROF", order_index=1)
        session.add(form)
        session.commit()
        form_id = form.id
    return {"form_id": form_id}


def _new_definition_command(variable_name: str, preferred=None) -> dict:
    payload = {
        "definition_operation": {
            "operation": "create_or_restore",
            "create_or_restore": {
                "definition": {
                    "variable_name": variable_name,
                    "label": "新字段",
                    "field_type": "文本",
                }
            },
        },
        "binding": {"mode": "operation_result"},
        "instance": {"mode": "upsert", "upsert": {"required": 0}},
    }
    if preferred is not None:
        payload["definition_operation"]["create_or_restore"]["preferred_definition_id"] = preferred
    return payload


def test_profile_create_without_preferred_normalizes_lowercase_oid(
    client, project_id, auth_token, profile_context
) -> None:
    resp = client.post(
        PROFILE.format(fid=profile_context["form_id"]),
        json=_new_definition_command("new_fld"),
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["definition_created"] is True
    listing = client.get(FIELD.format(pid=project_id), headers=auth_headers(auth_token)).json()
    assert any(fd["variable_name"] == "NEW_FLD" for fd in listing)


def test_profile_create_normalized_collision_conflicts_without_silent_bind(
    client, project_id, auth_token, profile_context
) -> None:
    _create_field(client, auth_token, project_id, "AE01")
    resp = client.post(
        PROFILE.format(fid=profile_context["form_id"]),
        json=_new_definition_command("ae01"),
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 409, resp.text


def test_profile_update_shared_echo_keeps_legacy_lowercase(
    client, project_id, auth_token, engine, profile_context
) -> None:
    fd_id = _seed_legacy_lower_field(engine, project_id, "oldfld")
    from src.models.form_field import FormField

    with Session(engine) as session:
        ff = FormField(form_id=profile_context["form_id"], field_definition_id=fd_id, order_index=1)
        session.add(ff)
        session.commit()
        ff_id = ff.id

    resp = client.put(
        f"/api/form-fields/{ff_id}/binding-profile",
        json={
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": fd_id,
                    "definition": {
                        "variable_name": "oldfld",
                        "label": "共享改名",
                        "field_type": "文本",
                    },
                },
            },
            "instance": {"mode": "upsert", "upsert": {}},
        },
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200, resp.text
    listing = client.get(FIELD.format(pid=project_id), headers=auth_headers(auth_token)).json()
    assert any(fd["id"] == fd_id and fd["variable_name"] == "oldfld" for fd in listing)


def test_profile_restore_with_preferred_keeps_snapshot_oid(
    client, project_id, auth_token, engine, profile_context
) -> None:
    fd_id = _seed_legacy_lower_field(engine, project_id, "oldfld")
    resp = client.post(
        PROFILE.format(fid=profile_context["form_id"]),
        json=_new_definition_command("oldfld", preferred=fd_id),
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["definition_restored"] is True
    listing = client.get(FIELD.format(pid=project_id), headers=auth_headers(auth_token)).json()
    assert any(fd["id"] == fd_id and fd["variable_name"] == "oldfld" for fd in listing)


# ---- 字段定义复制端点：大写 _COPY 梯子 ----


def test_field_copy_mints_uppercase_copy_ladder(client, project_id, auth_token, engine) -> None:
    fd_id = _seed_legacy_lower_field(engine, project_id, "age01")
    first = client.post(f"/api/field-definitions/{fd_id}/copy", headers=auth_headers(auth_token))
    assert first.status_code == 201, first.text
    assert first.json()["variable_name"] == "AGE01_COPY"
    assert first.json()["label"] == "历史字段"  # 人类可读名称不变

    second = client.post(f"/api/field-definitions/{fd_id}/copy", headers=auth_headers(auth_token))
    assert second.status_code == 201, second.text
    assert second.json()["variable_name"] == "AGE01_COPY1"


def test_field_copy_ladder_skips_taken_exact_names(client, project_id, auth_token, engine) -> None:
    """梯子按精确值查重：基名被占用时顺延数字后缀，且不改写既有行。"""

    fd_id = _seed_legacy_lower_field(engine, project_id, "age01")
    _seed_legacy_lower_field(engine, project_id, "AGE01_COPY")
    copy_resp = client.post(f"/api/field-definitions/{fd_id}/copy", headers=auth_headers(auth_token))
    assert copy_resp.status_code == 201, copy_resp.text
    assert copy_resp.json()["variable_name"] == "AGE01_COPY1"


def test_field_copy_of_uppercase_source_ladder(client, project_id, auth_token) -> None:
    fd_id = _create_field(client, auth_token, project_id, "AGE").json()["id"]
    first = client.post(f"/api/field-definitions/{fd_id}/copy", headers=auth_headers(auth_token))
    assert first.status_code == 201, first.text
    assert first.json()["variable_name"] == "AGE_COPY"
