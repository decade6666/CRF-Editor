"""R9 原子批量恢复端点测试矩阵（POST /api/forms/{form_id}/fields/restore-batch）。

覆盖：常规/标签兜底/log 行恢复、请求序返回、缺失定义 404、非标签快照不兜底、
跨用户/跨项目定义 403、重复绑定/陈旧快照/OID 冲突 409、批量 1..500 与形状 422、
后段违规零写入（原子性）、不提供遗留块数豁免、遗留标记原样保留。
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models.codelist import CodeList
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.user import User

RESTORE_URL = "/api/forms/{form_id}/fields/restore-batch"
LIMIT_MESSAGE = "单个表单最多允许一个横向表格，本次操作会新增横向表格，已取消操作"


def _definition_payload(variable_name, label, field_type="文本"):
    return {"variable_name": variable_name, "label": label, "field_type": field_type}


def _item(form_field_payload, definition_payload="__keep__"):
    """definition_payload=__keep__ 表示省略 field_definition 键；None 表示显式 null。"""
    item = {"form_field": form_field_payload}
    if definition_payload != "__keep__":
        item["field_definition"] = definition_payload
    return item


@pytest.fixture
def restore_context(client: TestClient, engine):
    """alice 的项目/表单 + 文本定义 A/B 与标签定义；bob 的独立项目/表单/定义。"""
    alice_token = login_as(client, "alice")
    bob_token = login_as(client, "bob")
    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        bob = session.scalar(select(User).where(User.username == "bob"))

        project = Project(name="恢复项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.flush()
        form = Form(project_id=project.id, name="恢复表单", code="RESTORE", order_index=1)
        session.add(form)
        session.flush()
        fd_a = FieldDefinition(
            project_id=project.id, variable_name="DEF_A", label="字段A", field_type="文本", order_index=1
        )
        fd_b = FieldDefinition(
            project_id=project.id, variable_name="DEF_B", label="字段B", field_type="文本", order_index=2
        )
        fd_c = FieldDefinition(
            project_id=project.id, variable_name="DEF_C", label="字段C", field_type="文本", order_index=3
        )
        label_fd = FieldDefinition(
            project_id=project.id, variable_name="LABEL_1", label="节段一", field_type="标签", order_index=4
        )
        session.add_all([fd_a, fd_b, fd_c, label_fd])
        session.flush()

        bob_project = Project(name="Bob项目", version="1.0", owner_id=bob.id, order_index=2)
        session.add(bob_project)
        session.flush()
        bob_form = Form(project_id=bob_project.id, name="Bob表单", code="B_FORM", order_index=1)
        session.add(bob_form)
        session.flush()
        bob_fd = FieldDefinition(
            project_id=bob_project.id, variable_name="BOB_DEF", label="Bob字段", field_type="文本", order_index=1
        )
        session.add(bob_fd)
        session.flush()
        session.commit()
        context = {
            "project_id": project.id,
            "form_id": form.id,
            "definition_a": fd_a.id,
            "definition_b": fd_b.id,
            "definition_c": fd_c.id,
            "label_definition": label_fd.id,
            "bob_project_id": bob_project.id,
            "bob_form_id": bob_form.id,
            "bob_definition": bob_fd.id,
        }
    context["alice_token"] = alice_token
    context["bob_token"] = bob_token
    return context


def _restore(client, form_id, token, items):
    return client.post(RESTORE_URL.format(form_id=form_id), json={"items": items}, headers=auth_headers(token))


def _read_fields(engine, form_id):
    with Session(engine) as session:
        rows = session.scalars(
            select(FormField).where(FormField.form_id == form_id).order_by(FormField.order_index, FormField.id)
        ).all()
        return [
            (row.order_index, row.inline_mark, row.is_log_row, row.field_definition_id, row.label_override)
            for row in rows
        ]


def _read_definitions(engine, project_id):
    with Session(engine) as session:
        rows = session.scalars(
            select(FieldDefinition)
            .where(FieldDefinition.project_id == project_id)
            .order_by(FieldDefinition.order_index, FieldDefinition.id)
        ).all()
        return [(row.id, row.variable_name, row.field_type) for row in rows]


def _find_definition_id(engine, project_id, variable_name):
    with Session(engine) as session:
        return session.scalar(
            select(FieldDefinition.id).where(
                FieldDefinition.project_id == project_id, FieldDefinition.variable_name == variable_name
            )
        )


# ── 成功路径 ────────────────────────────────────────────────────────────


def test_restore_single_regular_field_returns_created_instance(restore_context, client, engine):
    resp = _restore(
        client,
        restore_context["form_id"],
        restore_context["alice_token"],
        [_item({"field_definition_id": restore_context["definition_a"], "order_index": 1, "inline_mark": 1})],
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert isinstance(body, list) and len(body) == 1
    assert body[0]["field_definition"]["variable_name"] == "DEF_A"
    assert body[0]["inline_mark"] == 1
    assert _read_fields(engine, restore_context["form_id"])[0][0] == 1


def test_restore_mixed_regular_label_log_returns_request_order(restore_context, client, engine):
    """常规 + 标签兜底 + log 行一次恢复；响应保持请求序，落库顺序按快照位置（AC6）。"""
    form_id = restore_context["form_id"]
    token = restore_context["alice_token"]
    missing_label_id = restore_context["label_definition"] + 10000

    items = [
        _item({"field_definition_id": restore_context["definition_b"], "order_index": 2}),
        _item(
            {
                "field_definition_id": missing_label_id,
                "order_index": 1,
                "label_override": "恢复的标签",
                "label_bold": 0,
            },
            _definition_payload("LABEL_R1", "节段一", "标签"),
        ),
        _item({"field_definition_id": None, "is_log_row": 1, "order_index": 3, "label_override": "以下为log行"}),
    ]
    resp = _restore(client, form_id, token, items)

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert [entry["order_index"] for entry in body] == [2, 1, 3], "响应必须按请求序返回"
    assert body[1]["field_definition"]["variable_name"] == "LABEL_R1"
    assert body[1]["field_definition"]["label"] == "节段一"
    assert body[2]["is_log_row"] == 1 and body[2]["field_definition_id"] is None
    # 落库：order 1 = 标签实例，order 2 = DEF_B，order 3 = log 行
    rows = _read_fields(engine, form_id)
    assert [row[0] for row in rows] == [1, 2, 3]
    assert rows[0][3] == _find_definition_id(engine, restore_context["project_id"], "LABEL_R1")
    assert rows[0][4] == "恢复的标签"
    assert rows[1][3] == restore_context["definition_b"]
    assert rows[2][2] == 1


def test_restore_preserves_legacy_markers_and_attributes(restore_context, client, engine):
    """遗留标记（如 2）与展示属性原样恢复，不做静默归一（design §4 执行 3）。"""
    resp = _restore(
        client,
        restore_context["form_id"],
        restore_context["alice_token"],
        [
            _item(
                {
                    "field_definition_id": restore_context["definition_a"],
                    "order_index": 1,
                    "inline_mark": 2,
                    "bg_color": "FFEEDD",
                    "label_bold": 0,
                }
            )
        ],
    )
    assert resp.status_code == 201, resp.text
    rows = _read_fields(engine, restore_context["form_id"])
    assert rows[0][1] == 2


def test_restore_uses_current_form_baseline_not_snapshot_count(restore_context, client, engine):
    """不提供「快照原布局」豁免：恢复在当前表单上造出第二个块 → 400。"""
    form_id, token = restore_context["form_id"], restore_context["alice_token"]
    # 当前表单已有 1 块
    resp = _restore(
        client,
        form_id,
        token,
        [_item({"field_definition_id": restore_context["definition_a"], "order_index": 1, "inline_mark": 1})],
    )
    assert resp.status_code == 201, resp.text

    # 即使快照在原布局里相邻，也只按当前表单基线判定：普通分隔后恢复横向 → 400
    resp = _restore(
        client,
        form_id,
        token,
        [
            _item({"field_definition_id": restore_context["definition_b"], "order_index": 2, "inline_mark": 0}),
            _item({"field_definition_id": restore_context["definition_c"], "order_index": 3, "inline_mark": 1}),
        ],
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == LIMIT_MESSAGE
    assert len(_read_fields(engine, form_id)) == 1


# ── 原子性：后段违规零写入 ───────────────────────────────────────────────


def test_restore_rejected_later_item_persists_nothing(restore_context, client, engine):
    """后段横向条目违规：先执行的标签定义重建/实例/位移全部不落库（AC6/R9）。"""
    form_id, token = restore_context["form_id"], restore_context["alice_token"]
    # 预置 1 块：DEF_A inline
    assert (
        _restore(
            client,
            form_id,
            token,
            [_item({"field_definition_id": restore_context["definition_a"], "order_index": 1, "inline_mark": 1})],
        ).status_code
        == 201
    )
    definitions_before = _read_definitions(engine, restore_context["project_id"])
    fields_before = _read_fields(engine, form_id)
    missing_label_id = restore_context["label_definition"] + 20000

    items = [
        _item(
            {"field_definition_id": missing_label_id, "order_index": 2},
            _definition_payload("LABEL_RESTORED", "恢复标签", "标签"),
        ),
        _item({"field_definition_id": restore_context["definition_b"], "order_index": 3, "inline_mark": 1}),
    ]
    resp = _restore(client, form_id, token, items)

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == LIMIT_MESSAGE
    assert _read_fields(engine, form_id) == fields_before
    assert _read_definitions(engine, restore_context["project_id"]) == definitions_before
    assert _find_definition_id(engine, restore_context["project_id"], "LABEL_RESTORED") is None


# ── 校验与安全边界 ──────────────────────────────────────────────────────


def test_restore_missing_regular_definition_without_snapshot_404(restore_context, client, engine):
    form_id, token = restore_context["form_id"], restore_context["alice_token"]
    resp = _restore(
        client,
        form_id,
        token,
        [_item({"field_definition_id": restore_context["definition_a"] + 50000, "order_index": 1})],
    )
    assert resp.status_code == 404, resp.text
    assert _read_fields(engine, form_id) == []


def test_restore_missing_definition_nonlabel_snapshot_not_used(restore_context, client, engine):
    """标签兜底仅限标签快照：缺失的常规定义携带文本快照仍 404，不创建共享定义。"""
    form_id, token = restore_context["form_id"], restore_context["alice_token"]
    resp = _restore(
        client,
        form_id,
        token,
        [
            _item(
                {"field_definition_id": restore_context["definition_a"] + 50000, "order_index": 1},
                _definition_payload("NOT_A_LABEL", "普通字段", "文本"),
            )
        ],
    )
    assert resp.status_code == 404, resp.text
    assert _find_definition_id(engine, restore_context["project_id"], "NOT_A_LABEL") is None
    assert _read_fields(engine, form_id) == []


def test_restore_snapshot_without_definition_id_rejected(restore_context, client):
    resp = _restore(
        client,
        restore_context["form_id"],
        restore_context["alice_token"],
        [_item({"field_definition_id": None, "order_index": 1}, _definition_payload("LABEL_X", "标签X", "标签"))],
    )
    assert resp.status_code == 422, resp.text


def test_restore_foreign_definition_rejected(restore_context, client, engine):
    """跨项目/跨用户定义均 403，零写入。"""
    form_id, alice_token = restore_context["form_id"], restore_context["alice_token"]
    # alice 自己的另一个项目里的定义 → 403
    with Session(engine) as session:
        other_project = Project(
            name="Alice第二项目",
            version="1.0",
            owner_id=session.scalar(select(User).where(User.username == "alice")).id,
            order_index=3,
        )
        session.add(other_project)
        session.flush()
        foreign_fd = FieldDefinition(
            project_id=other_project.id, variable_name="ALIEN_DEF", label="外来字段", field_type="文本", order_index=1
        )
        session.add(foreign_fd)
        session.flush()
        foreign_fd_id = foreign_fd.id
        session.commit()

    resp = _restore(client, form_id, alice_token, [_item({"field_definition_id": foreign_fd_id, "order_index": 1})])
    assert resp.status_code == 403, resp.text

    # bob 的定义 → 403
    resp = _restore(
        client,
        form_id,
        alice_token,
        [_item({"field_definition_id": restore_context["bob_definition"], "order_index": 1})],
    )
    assert resp.status_code == 403, resp.text
    assert _read_fields(engine, form_id) == []


def test_restore_cross_user_form_rejected(restore_context, client):
    """bob 不能向 alice 的表单恢复任何内容。"""
    resp = _restore(
        client,
        restore_context["form_id"],
        restore_context["bob_token"],
        [_item({"field_definition_id": restore_context["bob_definition"], "order_index": 1})],
    )
    assert resp.status_code in (403, 404), resp.text
    resp = _restore(
        client,
        restore_context["bob_form_id"],
        restore_context["alice_token"],
        [_item({"field_definition_id": restore_context["definition_a"], "order_index": 1})],
    )
    assert resp.status_code in (403, 404), resp.text


def test_restore_duplicate_binding_conflict_409(restore_context, client, engine):
    """定义已在表单中：409（与直接创建的重复语义一致）。"""
    form_id, token = restore_context["form_id"], restore_context["alice_token"]
    assert (
        _restore(
            client,
            form_id,
            token,
            [_item({"field_definition_id": restore_context["definition_a"], "order_index": 1})],
        ).status_code
        == 201
    )
    resp = _restore(
        client,
        form_id,
        token,
        [_item({"field_definition_id": restore_context["definition_a"], "order_index": 2})],
    )
    assert resp.status_code == 409, resp.text
    assert len(_read_fields(engine, form_id)) == 1


def test_restore_stale_snapshot_conflict_409(restore_context, client, engine):
    """陈旧快照：ID 与 OID 指向不同定义 → 409，目标定义不被改写、实例不落库。"""
    form_id, token = restore_context["form_id"], restore_context["alice_token"]
    resp = _restore(
        client,
        form_id,
        token,
        [
            _item(
                {"field_definition_id": restore_context["definition_b"], "order_index": 1},
                _definition_payload("DEF_A", "字段A"),
            )
        ],
    )
    assert resp.status_code == 409, resp.text
    definitions = dict((row[1], row[2]) for row in _read_definitions(engine, restore_context["project_id"]))
    assert definitions["DEF_B"] == "文本"
    assert _read_fields(engine, form_id) == []


def test_restore_snapshot_oid_conflict_409(restore_context, client, engine):
    """缺失定义的标签快照与项目内现有 OID 冲突：409，不覆盖现有定义。"""
    form_id, token = restore_context["form_id"], restore_context["alice_token"]
    missing_label_id = restore_context["label_definition"] + 30000
    resp = _restore(
        client,
        form_id,
        token,
        [
            _item(
                {"field_definition_id": missing_label_id, "order_index": 1},
                _definition_payload("DEF_B", "与现有OID冲突", "标签"),
            )
        ],
    )
    assert resp.status_code == 409, resp.text
    definitions = dict((row[1], row[2]) for row in _read_definitions(engine, restore_context["project_id"]))
    assert definitions["DEF_B"] == "文本"
    assert _read_fields(engine, form_id) == []


def test_restore_should_reject_regular_row_without_definition(restore_context, client, engine):
    response = _restore(
        client,
        restore_context["form_id"],
        restore_context["alice_token"],
        [_item({"field_definition_id": None, "is_log_row": 0})],
    )

    assert response.status_code == 422
    assert _read_fields(engine, restore_context["form_id"]) == []


@pytest.mark.parametrize("link_key", ["codelist_id", "unit_id"])
@pytest.mark.parametrize("foreign_owner", [False, True], ids=["other-own-project", "other-user-project"])
def test_restore_should_reject_foreign_label_links_without_partial_writes(
    restore_context, client, engine, link_key, foreign_owner
):
    with Session(engine) as session:
        if foreign_owner:
            project_id = restore_context["bob_project_id"]
        else:
            owner_id = session.get(Project, restore_context["project_id"]).owner_id
            project = Project(name="另一个恢复项目", version="1.0", owner_id=owner_id)
            session.add(project)
            session.flush()
            project_id = project.id
        link = (
            CodeList(project_id=project_id, name="外来字典")
            if link_key == "codelist_id"
            else Unit(project_id=project_id, symbol="kg")
        )
        session.add(link)
        session.flush()
        link_id = link.id
        session.commit()
    fields_before = _read_fields(engine, restore_context["form_id"])
    definitions_before = _read_definitions(engine, restore_context["project_id"])
    snapshot = {**_definition_payload("LABEL_FOREIGN_LINK", "不可恢复", "标签"), link_key: link_id}

    response = _restore(
        client,
        restore_context["form_id"],
        restore_context["alice_token"],
        [
            _item({"field_definition_id": restore_context["definition_a"]}),
            _item({"field_definition_id": 999999}, snapshot),
        ],
    )

    assert response.status_code == 403, response.text
    assert _read_fields(engine, restore_context["form_id"]) == fields_before
    assert _read_definitions(engine, restore_context["project_id"]) == definitions_before


def test_restore_should_not_use_label_snapshot_to_bypass_foreign_definition(restore_context, client, engine):
    response = _restore(
        client,
        restore_context["form_id"],
        restore_context["alice_token"],
        [
            _item(
                {"field_definition_id": restore_context["bob_definition"]},
                _definition_payload("FALLBACK", "标签", "标签"),
            ),
        ],
    )

    assert response.status_code == 403, response.text
    assert _read_fields(engine, restore_context["form_id"]) == []
    assert _find_definition_id(engine, restore_context["project_id"], "FALLBACK") is None


def test_restore_should_reject_duplicate_definition_ids_in_one_batch(restore_context, client, engine):
    item = _item({"field_definition_id": restore_context["definition_a"]})
    response = _restore(client, restore_context["form_id"], restore_context["alice_token"], [item, item])

    assert response.status_code == 409
    assert _read_fields(engine, restore_context["form_id"]) == []


def test_restore_should_append_when_order_is_omitted(restore_context, client, engine):
    form_id, token = restore_context["form_id"], restore_context["alice_token"]
    assert (
        _restore(
            client, form_id, token, [_item({"field_definition_id": restore_context["definition_a"], "order_index": 1})]
        ).status_code
        == 201
    )
    response = _restore(client, form_id, token, [_item({"field_definition_id": restore_context["definition_b"]})])

    assert response.status_code == 201
    assert response.json()[0]["order_index"] == 2
    assert [row[3] for row in _read_fields(engine, form_id)] == [
        restore_context["definition_a"],
        restore_context["definition_b"],
    ]


def test_restore_should_reuse_existing_imported_label_without_creating_definition(restore_context, client, engine):
    with Session(engine) as session:
        definition = session.get(FieldDefinition, restore_context["label_definition"])
        definition.variable_name = "IMPORTED?LABEL"
        session.commit()
    before = _read_definitions(engine, restore_context["project_id"])

    response = _restore(
        client,
        restore_context["form_id"],
        restore_context["alice_token"],
        [
            _item({"field_definition_id": restore_context["label_definition"], "order_index": 1}),
        ],
    )

    assert response.status_code == 201, response.text
    assert response.json()[0]["field_definition"]["variable_name"] == "IMPORTED?LABEL"
    assert _read_definitions(engine, restore_context["project_id"]) == before


def test_restore_requires_authentication(restore_context, client):
    resp = client.post(
        RESTORE_URL.format(form_id=restore_context["form_id"]),
        json={"items": [_item({"field_definition_id": restore_context["definition_a"], "order_index": 1})]},
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.parametrize(
    "items",
    [
        [],
        [_item({"field_definition_id": None}) for _ in range(501)],
        [{"form_field": {"field_definition_id": None}, "unexpected_sibling": True}],
        [{"definition": {}}],
        [_item({"field_definition_id": "not-an-int"})],
    ],
    ids=["empty", "oversized", "unknown-sibling-key", "missing-form-field", "malformed-definition-id"],
)
def test_restore_bounds_and_shape_422(restore_context, client, items):
    resp = _restore(client, restore_context["form_id"], restore_context["alice_token"], items)
    assert resp.status_code == 422, resp.text
