"""Agent 读工具测试：有界投影、字面检索、引用影响与日志行语义。"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from agent_access_helpers import (
    agent_manifest,
    agent_tool,
    issue_credential,
    reset_agent_limiter,
    seed_full_project,
    seed_owner_and_project,
)
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.unit import Unit

pytestmark = pytest.mark.integration


def _rw_credential(client, ctx):
    return issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]


def _fingerprint(client, raw, ctx):
    resp = agent_tool(client, raw, "crf_list_projects", {})
    assert resp.status_code == 200, resp.text
    return resp.json()["project_fingerprint"]


def test_list_projects_returns_single_granted(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(client, raw, "crf_list_projects", {})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]["projects"]) == 1
    assert body["data"]["projects"][0]["id"] == ctx["project_id"]
    assert body["project_fingerprint"] and len(body["project_fingerprint"]) == 64


def test_outline_includes_forms_visits_and_rules(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(client, raw, "crf_get_project_outline", {"project_id": ctx["project_id"]})
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert [f["id"] for f in data["forms"]] == [ctx["form_id"]]
    assert "editing_rules" in data
    rules = data["editing_rules"]
    assert rules["saimeisi_field_oid_max_length"] == 8
    assert rules["integer_digits_range"] == [1, 20]
    assert "文本" in rules["regular_field_types"] and "标签" not in rules["regular_field_types"]


def test_form_detail_resolves_effective_attributes(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    # 实例覆盖标签
    with Session(engine) as session:
        ff = session.get(FormField, ctx["form_field_id"])
        ff.label_override = "覆盖标签"
        session.commit()

    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(client, raw, "crf_get_form_detail", {"project_id": ctx["project_id"], "form_id": ctx["form_id"]})
    assert resp.status_code == 200, resp.text
    rows = resp.json()["data"]["rows"]
    assert len(rows) == 1
    row = rows[0]
    assert row["label"] == "覆盖标签"  # 实例覆盖优先
    assert row["definition"]["variable_name"] == "BASE_DEF"
    assert row["required"] is False
    assert row["is_log_row"] is False


def test_form_detail_includes_log_rows_in_order(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    with Session(engine) as session:
        log_row = FormField(form_id=ctx["form_id"], is_log_row=1, order_index=0)
        session.add(log_row)
        session.commit()
        log_id = log_row.id

    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(client, raw, "crf_get_form_detail", {"project_id": ctx["project_id"], "form_id": ctx["form_id"]})
    rows = resp.json()["data"]["rows"]
    assert [r["id"] for r in rows] == [log_id, ctx["form_field_id"]]
    assert rows[0]["is_log_row"] is True and rows[0]["definition"] is None


def test_form_detail_foreign_form_404(client: TestClient, engine):
    ctx_a = seed_full_project(client, engine, "alice")
    ctx_b = seed_full_project(client, engine, "bob", "B项目")
    raw = issue_credential(client, ctx_a["token"], ctx_a["project_id"])["token"]
    resp = agent_tool(
        client, raw, "crf_get_form_detail", {"project_id": ctx_a["project_id"], "form_id": ctx_b["form_id"]}
    )
    assert resp.status_code == 404


def test_search_exact_oid_first_then_substring(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    with Session(engine) as session:
        for name, label in (("AE_TERM", "不良事件名称"), ("HIS_AE_TERM", "病史不良事件"), ("VISIT_DT", "访视日期")):
            session.add(
                FieldDefinition(
                    project_id=ctx["project_id"], variable_name=name, label=label, field_type="文本", order_index=2
                )
            )
        session.commit()

    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(
        client, raw, "crf_search_field_definitions", {"project_id": ctx["project_id"], "query": "AE_TERM"}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    variables = [c["variable_name"] for c in data["candidates"]]
    assert variables[0] == "AE_TERM"  # 精确 OID 优先
    assert "HIS_AE_TERM" in variables
    assert data["total"] == 2

    # 标签子串检索
    resp = agent_tool(client, raw, "crf_search_field_definitions", {"project_id": ctx["project_id"], "query": "访视"})
    labels = [c["label"] for c in resp.json()["data"]["candidates"]]
    assert "访视日期" in labels


def test_search_excludes_structural_definitions(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    with Session(engine) as session:
        session.add(
            FieldDefinition(
                project_id=ctx["project_id"],
                variable_name="FIELD_LABEL_X",
                label="分组标签",
                field_type="标签",
                order_index=2,
            )
        )
        session.commit()

    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(
        client, raw, "crf_search_field_definitions", {"project_id": ctx["project_id"], "query": "FIELD_LABEL_X"}
    )
    assert resp.json()["data"]["total"] == 0


def test_search_pagination(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(
        client,
        raw,
        "crf_search_field_definitions",
        {"project_id": ctx["project_id"], "query": "DEF", "limit": 1, "offset": 0},
    )
    data = resp.json()["data"]
    assert len(data["candidates"]) == 1
    assert data["has_more"] is False
    assert data["total"] == 1


def test_reference_impact_definition_with_unplaced(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    with Session(engine) as session:
        # 未放置定义
        session.add(
            FieldDefinition(
                project_id=ctx["project_id"],
                variable_name="UNPLACED_DEF",
                label="未放置",
                field_type="数值",
                order_index=2,
            )
        )
        session.commit()
        unplaced_id = session.scalar(select(FieldDefinition.id).where(FieldDefinition.variable_name == "UNPLACED_DEF"))

    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    # 已放置定义：placed_forms 有表单
    resp = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "definition", "resource_id": ctx["field_definition_id"]},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["resource"]["variable_name"] == "BASE_DEF"
    assert any(item["form_id"] == ctx["form_id"] for item in data["placed_forms"])
    assert data["unplaced_definitions"] == []

    # 未放置定义：无已放置影响（unplaced 概念对 definition 本身不适用，
    # 该资源就是定义自身；语义为空影响集，允许空提案）
    resp = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "definition", "resource_id": unplaced_id},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["placed_forms"] == []


def test_reference_impact_codelist_and_unit(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    with Session(engine) as session:
        cl = CodeList(project_id=ctx["project_id"], name="是/否", code="YN", order_index=1)
        session.add(cl)
        session.flush()
        session.add(CodeListOption(codelist_id=cl.id, code="1", decode="是", order_index=1))
        session.add(CodeListOption(codelist_id=cl.id, code="0", decode="否", order_index=2))
        unit = Unit(project_id=ctx["project_id"], symbol="kg", code="KG", order_index=1)
        session.add(unit)
        session.flush()
        # 放置的选择字段引用字典
        choice_fd = FieldDefinition(
            project_id=ctx["project_id"],
            variable_name="YN_FIELD",
            label="是否",
            field_type="单选",
            codelist_id=cl.id,
            order_index=2,
        )
        session.add(choice_fd)
        session.flush()
        session.add(FormField(form_id=ctx["form_id"], field_definition_id=choice_fd.id, order_index=2))
        # 未放置单位引用
        unplaced_unit_user = FieldDefinition(
            project_id=ctx["project_id"],
            variable_name="WT_FIELD",
            label="体重",
            field_type="数值",
            unit_id=unit.id,
            order_index=3,
        )
        session.add(unplaced_unit_user)
        session.commit()
        cl_id, unit_id = cl.id, unit.id

    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "codelist", "resource_id": cl_id},
    )
    data = resp.json()["data"]
    assert data["resource"]["name"] == "是/否"

    resp = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "unit", "resource_id": unit_id},
    )
    data = resp.json()["data"]
    assert [d["variable_name"] for d in data["unplaced_definitions"]] == ["WT_FIELD"]


def test_reference_impact_form_visit_usage(client: TestClient, engine):
    from src.models.visit import Visit
    from src.models.visit_form import VisitForm

    ctx = seed_full_project(client, engine, "alice")
    with Session(engine) as session:
        visit = Visit(project_id=ctx["project_id"], name="筛选访视", sequence=1)
        session.add(visit)
        session.flush()
        session.add(VisitForm(visit_id=visit.id, form_id=ctx["form_id"], sequence=1))
        session.commit()

    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "form", "resource_id": ctx["form_id"]},
    )
    data = resp.json()["data"]
    assert data["placed_forms"][0]["visit_names"] == ["筛选访视"]


def test_reference_impact_rejects_unsupported_type(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "project", "resource_id": 1},
    )
    assert resp.status_code == 422


# ── 指纹与项目内解析的直测（404/413/422 守卫分支） ──────────────────────────


def _foreign_project_with_links(client: TestClient, engine: Engine, name: str) -> dict:
    """第二个属主项目 + 字典 + 单位 + 表单（供跨项目 404/422 守卫使用）。"""
    from src.models.visit import Visit

    ctx2 = seed_owner_and_project(client, engine, name)
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx2["project_id"], name="外部字典", code="C_EXT")
        session.add(codelist)
        session.flush()
        unit = Unit(project_id=ctx2["project_id"], symbol="mg", code="U_EXT")
        session.add(unit)
        session.flush()
        form = Form(project_id=ctx2["project_id"], name="外部表单", code="F_EXT", order_index=1)
        session.add(form)
        session.flush()
        visit = Visit(project_id=ctx2["project_id"], name="外部访视", sequence=1)
        session.add(visit)
        session.commit()
        ctx2.update({"codelist_id": codelist.id, "unit_id": unit.id, "form_id": form.id})
    return ctx2


def test_canon_normalizes_none_scalars_and_datetimes():
    from datetime import date, datetime

    from src.services.agent_state_service import _canon

    assert _canon(None) is None
    assert _canon("文本") == "文本"
    assert _canon(3) == 3
    assert _canon(1.5) == 1.5
    assert _canon(True) is True
    assert _canon(datetime(2026, 11, 5, 8, 30)) == "2026-11-05 08:30:00"
    assert _canon(date(2026, 11, 5)) == "2026-11-05"


def test_fingerprint_missing_project_is_404(client: TestClient, engine: Engine):
    from fastapi import HTTPException

    from src.services.agent_state_service import compute_project_fingerprint

    seed_full_project(client, engine, "alice")
    with pytest.raises(HTTPException) as exc:
        with Session(engine) as session:
            compute_project_fingerprint(session, 999999)
    assert exc.value.status_code == 404


def test_fingerprint_row_cap_returns_413(client: TestClient, engine: Engine, monkeypatch):
    from fastapi import HTTPException

    from src.services import agent_state_service

    ctx = seed_full_project(client, engine, "alice")
    monkeypatch.setattr(agent_state_service, "MAX_FINGERPRINT_ROWS", 0)
    with pytest.raises(HTTPException) as exc:
        with Session(engine) as session:
            agent_state_service.compute_project_fingerprint(session, ctx["project_id"])
    assert exc.value.status_code == 413


def test_resolve_helpers_reject_missing_and_foreign_resources(client: TestClient, engine: Engine):
    from fastapi import HTTPException

    from src.services.agent_state_service import (
        resolve_project_codelist,
        resolve_project_definition,
        resolve_project_form,
        resolve_project_form_field,
        resolve_project_unit,
    )

    ctx = seed_full_project(client, engine, "alice")
    foreign = _foreign_project_with_links(client, engine, "bob")

    with Session(engine) as session:
        # 外部项目中的真实字段定义（definition 守卫用其 id，而非借用外部表单 id）
        foreign_fd = FieldDefinition(
            project_id=foreign["project_id"],
            variable_name="F_DEF_X",
            label="外部定义",
            field_type="文本",
            order_index=1,
        )
        session.add(foreign_fd)
        session.commit()
        foreign_fd_id = foreign_fd.id

    with Session(engine) as session:
        with pytest.raises(HTTPException) as exc:
            resolve_project_form(session, ctx["project_id"], 999999)
        assert exc.value.status_code == 404
        with pytest.raises(HTTPException) as exc:
            resolve_project_form(session, ctx["project_id"], foreign["form_id"])
        assert exc.value.status_code == 404
        with pytest.raises(HTTPException) as exc:
            resolve_project_form_field(session, ctx["project_id"], 999999)
        assert exc.value.status_code == 404
        with pytest.raises(HTTPException) as exc:
            resolve_project_definition(session, ctx["project_id"], foreign_fd_id)
        assert exc.value.status_code == 404
        with pytest.raises(HTTPException) as exc:
            resolve_project_codelist(session, ctx["project_id"], foreign["codelist_id"])
        assert exc.value.status_code == 404
        with pytest.raises(HTTPException) as exc:
            resolve_project_unit(session, ctx["project_id"], foreign["unit_id"])
        assert exc.value.status_code == 404
        # 项目内资源正常解析
        assert resolve_project_form(session, ctx["project_id"], ctx["form_id"]).id == ctx["form_id"]


def test_resolve_form_field_rejects_foreign_host_form(client: TestClient, engine: Engine):
    """实例宿主表单属于其他项目 → 404（不泄露外部细节）。"""
    from fastapi import HTTPException

    from src.models.field_definition import FieldDefinition as FD
    from src.models.form_field import FormField as FF
    from src.services.agent_state_service import resolve_project_form_field

    ctx = seed_full_project(client, engine, "alice")
    foreign = _foreign_project_with_links(client, engine, "bob")
    with Session(engine) as session:
        fd = FD(
            project_id=foreign["project_id"],
            variable_name="EXT_DEF",
            label="外部字段",
            field_type="文本",
            order_index=1,
        )
        session.add(fd)
        session.flush()
        ff = FF(form_id=foreign["form_id"], field_definition_id=fd.id, order_index=1)
        session.add(ff)
        session.commit()
        foreign_ff_id = ff.id

    with pytest.raises(HTTPException) as exc:
        with Session(engine) as session:
            resolve_project_form_field(session, ctx["project_id"], foreign_ff_id)
    assert exc.value.status_code == 404


def test_ensure_no_foreign_links_rejects_foreign_codelist_and_unit(client: TestClient, engine: Engine):
    from fastapi import HTTPException

    from src.services.agent_state_service import ensure_no_foreign_links

    ctx = seed_full_project(client, engine, "alice")
    foreign = _foreign_project_with_links(client, engine, "bob")
    with Session(engine) as session:
        definition = session.get(FieldDefinition, ctx["field_definition_id"])
        definition.codelist_id = foreign["codelist_id"]
        session.commit()

    with pytest.raises(HTTPException) as exc:
        with Session(engine) as session:
            ensure_no_foreign_links(
                session, ctx["project_id"], session.get(FieldDefinition, ctx["field_definition_id"])
            )
    assert exc.value.status_code == 422

    with Session(engine) as session:
        definition = session.get(FieldDefinition, ctx["field_definition_id"])
        definition.codelist_id = None
        definition.unit_id = foreign["unit_id"]
        session.commit()

    with pytest.raises(HTTPException) as exc:
        with Session(engine) as session:
            ensure_no_foreign_links(
                session, ctx["project_id"], session.get(FieldDefinition, ctx["field_definition_id"])
            )
    assert exc.value.status_code == 422


# ── 修复轮回归（跨项目 fail closed / 指纹完整性 / 输出 schema / 真实引用标识） ──


def test_form_read_rejects_hidden_foreign_definition(client: TestClient, engine):
    """own 实例指向外部定义 → 422 通用拒绝（不序列化外部定义元数据）。"""
    from src.models.form_field import FormField as FF

    ctx = seed_full_project(client, engine, "alice")
    foreign = seed_full_project(client, engine, "review_foreign_owner")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    with Session(engine) as session:
        session.get(FF, ctx["form_field_id"]).field_definition_id = foreign["field_definition_id"]
        session.commit()

    response = agent_tool(
        client, raw, "crf_get_form_detail", {"project_id": ctx["project_id"], "form_id": ctx["form_id"]}
    )
    assert response.status_code == 422
    assert "跨项目" in response.json()["detail"]
    assert str(foreign["field_definition_id"]) not in response.text


def test_form_detail_rejects_foreign_codelist_link(client: TestClient, engine):
    """own 定义链接外部字典 → 表单详情 422（链接数据 fail closed，不泄露外部字典）。"""
    from src.services.agent_state_service import FOREIGN_LINK_MSG

    ctx = seed_full_project(client, engine, "alice")
    foreign = _foreign_project_with_links(client, engine, "read_cl_foreign_owner")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read")["token"]
    with Session(engine) as session:
        session.get(FieldDefinition, ctx["field_definition_id"]).codelist_id = foreign["codelist_id"]
        session.commit()

    response = agent_tool(
        client, raw, "crf_get_form_detail", {"project_id": ctx["project_id"], "form_id": ctx["form_id"]}
    )
    assert response.status_code == 422
    assert response.json()["detail"] == FOREIGN_LINK_MSG
    assert "外部字典" not in response.text
    assert "C_EXT" not in response.text


def test_form_detail_rejects_foreign_unit_link(client: TestClient, engine):
    """own 定义链接外部单位 → 表单详情 422（fail closed，不泄露外部单位）。"""
    from src.services.agent_state_service import FOREIGN_LINK_MSG

    ctx = seed_full_project(client, engine, "alice")
    foreign = _foreign_project_with_links(client, engine, "read_unit_foreign_owner")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read")["token"]
    with Session(engine) as session:
        session.get(FieldDefinition, ctx["field_definition_id"]).unit_id = foreign["unit_id"]
        session.commit()

    response = agent_tool(
        client, raw, "crf_get_form_detail", {"project_id": ctx["project_id"], "form_id": ctx["form_id"]}
    )
    assert response.status_code == 422
    assert response.json()["detail"] == FOREIGN_LINK_MSG
    assert "U_EXT" not in response.text


def test_codelist_impact_rejects_hidden_foreign_reference(client: TestClient, engine):
    """own 字典被外部定义引用 → 422（不泄露外部表单/定义名称）。"""
    ctx = seed_full_project(client, engine, "alice")
    foreign = seed_full_project(client, engine, "review_foreign_owner")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="Own dictionary", code="REVIEW_CL")
        session.add(codelist)
        session.flush()
        codelist_id = codelist.id
        session.get(FieldDefinition, foreign["field_definition_id"]).codelist_id = codelist_id
        session.commit()

    response = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "codelist", "resource_id": codelist_id},
    )
    assert response.status_code == 422
    assert "review_foreign_owner" not in response.text


def test_fingerprint_observes_option_order_changes(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="Ordered choices", code="REVIEW_ORDER")
        session.add(codelist)
        session.flush()
        option = CodeListOption(codelist_id=codelist.id, code="review-code", decode="Review option", order_index=1)
        session.add(option)
        session.flush()
        option_id = option.id
        session.commit()

    before = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]
    with Session(engine) as session:
        session.get(CodeListOption, option_id).order_index = 2
        session.commit()
    after = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]
    assert after != before


def test_fingerprint_caps_options_too(client: TestClient, engine, monkeypatch):
    from src.services import agent_state_service

    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="Bounded choices", code="REVIEW_CAP")
        session.add(codelist)
        session.flush()
        for index in range(3):
            session.add(CodeListOption(codelist_id=codelist.id, code=str(index), decode=f"Choice {index}"))
        session.commit()
    monkeypatch.setattr(agent_state_service, "MAX_FINGERPRINT_ROWS", 2)
    response = agent_tool(client, raw, "crf_list_projects", {})
    assert response.status_code == 413
    assert response.json()["code"] == "LIMIT_EXCEEDED"


@pytest.mark.parametrize(
    "attribute,value",
    [
        ("crf_version_date", date(2026, 11, 5)),
        ("screening_number_format", "ROUND2-FORMAT"),
        ("data_management_unit", "数据管理部门"),
        ("company_logo_path", "round2-logo.png"),
        ("order_index", 3),
    ],
)
def test_fingerprint_observes_project_design_metadata(client: TestClient, engine, attribute, value):
    """项目行全部持久化设计列（含日期类型）进入指纹；变更即失效。"""
    from src.models.project import Project

    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    before = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]
    with Session(engine) as session:
        setattr(session.get(Project, ctx["project_id"]), attribute, value)
        session.commit()
    after = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]
    assert after != before


def test_fingerprint_project_metadata_date_null_round_trip_is_stable(client: TestClient, engine):
    """日期列 null → 值 → null 往返指纹确定性（无 TypeError、可复现）。"""
    from datetime import date as date_type

    from src.models.project import Project

    ctx = seed_full_project(client, engine, "helen")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    base = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]
    with Session(engine) as session:
        session.get(Project, ctx["project_id"]).crf_version_date = date_type(2026, 11, 5)
        session.commit()
    dated = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]
    with Session(engine) as session:
        session.get(Project, ctx["project_id"]).crf_version_date = None
        session.commit()
    cleared = agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]
    assert dated != base
    assert cleared == base
    with Session(engine) as session:
        session.get(Project, ctx["project_id"]).crf_version_date = date_type(2026, 11, 5)
        session.commit()
    assert agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"] == dated


def test_manifest_publishes_typed_output_schemas(client, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    manifest = agent_manifest(client, raw).json()
    assert len(manifest["tools"]) == 10
    assert all("outputSchema" in tool for tool in manifest["tools"])


def test_codelist_reference_impact_contains_real_instance_and_form_ids(client, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="Placed choices", code="PLACED")
        session.add(codelist)
        session.flush()
        codelist_id = codelist.id
        session.get(FieldDefinition, ctx["field_definition_id"]).codelist_id = codelist_id
        session.commit()

    response = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "codelist", "resource_id": codelist_id},
    )
    assert response.status_code == 200
    impact = response.json()["data"]["placed_forms"][0]
    assert impact.get("form_id") == ctx["form_id"]
    assert impact.get("instance_ids") == [ctx["form_field_id"]]


def test_search_returns_real_placed_form_ids(client, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    response = agent_tool(
        client, raw, "crf_search_field_definitions", {"project_id": ctx["project_id"], "query": "BASE_DEF"}
    )
    assert response.status_code == 200
    candidate = response.json()["data"]["candidates"][0]
    assert candidate["placed_form_ids"] == [ctx["form_id"]]


def test_form_detail_returns_complete_definition_and_override_distinction(client, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    with Session(engine) as session:
        row = session.get(FormField, ctx["form_field_id"])
        row.label_override = "本地覆盖标签"
        session.commit()

    response = agent_tool(
        client, raw, "crf_get_form_detail", {"project_id": ctx["project_id"], "form_id": ctx["form_id"]}
    )
    assert response.status_code == 200
    row_data = response.json()["data"]["rows"][0]
    assert row_data["label_override"] == "本地覆盖标签"
    assert row_data["label"] == "本地覆盖标签"
    definition = row_data["definition"]
    for key in (
        "checkbox_label",
        "integer_digits",
        "decimal_digits",
        "date_format",
        "codelist_id",
        "unit_id",
        "options",
    ):
        assert key in definition


# ── 修复轮回归（访视↔表单链接双向 fail closed） ──


def test_form_impact_rejects_foreign_visit_link(client, engine):
    """外部访视链接授权表单 → crf_get_reference_impact(form) 422（不泄露外部访视名）。"""
    from src.models.visit import Visit
    from src.models.visit_form import VisitForm

    ctx = seed_full_project(client, engine, "alice")
    foreign = seed_full_project(client, engine, "foreign_visit_owner")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    with Session(engine) as session:
        visit = Visit(project_id=foreign["project_id"], name="Foreign-only visit", code="FOREIGN_VISIT", sequence=1)
        session.add(visit)
        session.flush()
        session.add(VisitForm(visit_id=visit.id, form_id=ctx["form_id"], sequence=1))
        session.commit()

    response = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "form", "resource_id": ctx["form_id"]},
    )
    assert response.status_code == 422
    assert "Foreign-only visit" not in response.text


def test_outline_rejects_foreign_visit_links_in_both_directions(client, engine):
    """outline：授权访视链接外部表单 / 外部访视链接授权表单 → 双向 422 且不泄露外部名称。"""
    from src.models.visit import Visit
    from src.models.visit_form import VisitForm

    # 方向一：授权访视 → 外部表单
    ctx = seed_full_project(client, engine, "alice")
    foreign = seed_full_project(client, engine, "outline_foreign_owner")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    with Session(engine) as session:
        visit = Visit(project_id=ctx["project_id"], name="Own outline visit", code="OWN_VISIT", sequence=1)
        session.add(visit)
        session.flush()
        session.add(VisitForm(visit_id=visit.id, form_id=foreign["form_id"], sequence=1))
        session.commit()
    response = agent_tool(client, raw, "crf_get_project_outline", {"project_id": ctx["project_id"]})
    assert response.status_code == 422
    assert "跨项目" in response.json()["detail"]

    # 方向二：外部访视 → 授权表单
    ctx2 = seed_full_project(client, engine, "carol")
    foreign2 = seed_full_project(client, engine, "outline_foreign_owner2")
    raw2 = issue_credential(client, ctx2["token"], ctx2["project_id"])["token"]
    with Session(engine) as session:
        visit2 = Visit(
            project_id=foreign2["project_id"], name="Foreign outline visit", code="F_OUTLINE_VISIT", sequence=1
        )
        session.add(visit2)
        session.flush()
        session.add(VisitForm(visit_id=visit2.id, form_id=ctx2["form_id"], sequence=1))
        session.commit()
    response2 = agent_tool(client, raw2, "crf_get_project_outline", {"project_id": ctx2["project_id"]})
    assert response2.status_code == 422
    assert "Foreign outline visit" not in response2.text


def test_definition_impact_rejects_foreign_visit_link(client, engine):
    """own 定义被授权表单放置且该表单被外部访视链接 → 422（不泄露外部访视名）。"""
    from src.models.visit import Visit
    from src.models.visit_form import VisitForm

    ctx = seed_full_project(client, engine, "alice")
    foreign = seed_full_project(client, engine, "definition_visit_owner")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]
    with Session(engine) as session:
        visit = Visit(project_id=foreign["project_id"], name="Definition foreign visit", code="DEF_F_VISIT", sequence=1)
        session.add(visit)
        session.flush()
        session.add(VisitForm(visit_id=visit.id, form_id=ctx["form_id"], sequence=1))
        session.commit()

    response = agent_tool(
        client,
        raw,
        "crf_get_reference_impact",
        {"project_id": ctx["project_id"], "resource_type": "definition", "resource_id": ctx["field_definition_id"]},
    )
    assert response.status_code == 422
    assert "Definition foreign visit" not in response.text


def test_foreign_dictionary_cannot_break_granted_outline(client, engine):
    """IR2：其他属主（活动/回收站）501 选项字典不得影响授权项目摘要；
    选项计数只统计授权项目内字典，不耦合全局上限、不泄露外部字典。"""
    from datetime import datetime

    from src.models.project import Project

    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    with Session(engine) as session:
        granted = CodeList(project_id=ctx["project_id"], name="授权字典", code="CL_GRANTED", order_index=1)
        session.add(granted)
        session.flush()
        session.add_all(
            [
                CodeListOption(codelist_id=granted.id, code=f"G{i}", decode=f"授权选项 {i}", order_index=i + 1)
                for i in range(3)
            ]
        )
        session.commit()
        granted_id = granted.id

    payload = {"project_id": ctx["project_id"]}
    assert agent_tool(client, raw, "crf_get_project_outline", payload).status_code == 200

    other = seed_owner_and_project(client, engine, "outline_other_owner")
    with Session(engine) as session:
        foreign = CodeList(project_id=other["project_id"], name="外部 501 字典", code="CL_FOREIGN", order_index=1)
        session.add(foreign)
        session.flush()
        session.add_all(
            [
                CodeListOption(codelist_id=foreign.id, code=str(i), decode=f"外部选项 {i}", order_index=i + 1)
                for i in range(501)
            ]
        )
        session.commit()
        foreign_id = foreign.id

    # 活动 + 回收站两种状态都必须不影响授权摘要
    for recycled in (False, True):
        with Session(engine) as session:
            project = session.get(Project, other["project_id"])
            project.deleted_at = datetime.now() if recycled else None
            session.commit()

        resp = agent_tool(client, raw, "crf_get_project_outline", payload)
        assert resp.status_code == 200, f"recycled={recycled}: 外部字典导致 HTTP {resp.status_code}"
        data = resp.json()["data"]
        codelist_ids = [c["id"] for c in data["codelists"]]
        assert foreign_id not in codelist_ids
        counts = {c["id"]: c["option_count"] for c in data["codelists"]}
        assert counts[granted_id] == 3
