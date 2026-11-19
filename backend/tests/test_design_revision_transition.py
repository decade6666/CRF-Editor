"""F1: additive pre/post transition metadata on exactly three invalidation-only writers.

边界（prd F1-R1/R2、design §2.1–§2.2）：只有字典创建、单位创建、整表复制三个路由新增
`X-CRF-Design-Before-Revision` 响应元数据；十九个核心写入注册表不变；不新增管理端
If-Match 门；鉴权/资源解析先于体校验（403/404 优先于 422 的明确误差）；任何失败
（鉴权、体校验、业务、存储、提交）不泄露任何标签。R6：成功/失败/安全矩阵按三条路由
参数化覆盖，物理 BEGIN IMMEDIATE 先于鉴权 SELECT 在三条路由上一一证明；失败矩阵按
真实故障边界分层——字典/单位创建的外来/缺失作用域携带真正无效的请求体（作用域先于
体校验），整表复制无请求体 schema（仅作用域先行）；INSERT 触发器证明存储故障回滚，
serialize_response 注入证明提交前的输出校验失败，Session before_commit 注入证明提交
失败回滚；两类迟到失败同样不发布任何标签。
"""

from sqlalchemy import event
from sqlalchemy.orm import Session

from src.models.project import Project
from src.models.user import User

from test_design_revision import HEADER, design_context, load_state, write_headers

import pytest

pytestmark = pytest.mark.integration
BEFORE_HEADER = "X-CRF-Design-Before-Revision"

TRANSITION_CASES = [
    ("/projects/{project_id}/codelists", {"name": "快速字典", "options": [{"code": "1", "decode": "是"}]}),
    ("/projects/{project_id}/units", {"symbol": "kg"}),
    ("/forms/{form_id}/copy", {}),
]

# 生命周期失败矩阵（R6）：同一无效输入在三条路由上的可适用项。copy 无请求体校验。
OWNER_INVALID_CASES = [
    ("/projects/{project_id}/codelists", {"name": "x", "order_index": 0}),
    ("/projects/{project_id}/units", {}),
]

# 存储故障注入点：三条路由各自的第一个 INSERT 目标。
STORAGE_FAILURE_CASES = [
    ("/projects/{project_id}/codelists", {"name": "失败字典"}, "codelist", "fail_codelist_insert"),
    ("/projects/{project_id}/units", {"symbol": "kg"}, "unit", "fail_unit_insert"),
    ("/forms/{form_id}/copy", {}, "form", "fail_form_insert"),
]


@pytest.mark.parametrize("path,payload", TRANSITION_CASES)
def test_should_publish_before_and_after_tags_on_each_transition_route(design_context, path, payload):
    client, _, context = design_context
    before = load_state(client, context).headers[HEADER]
    response = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    assert response.status_code == 201, response.text
    # 既有成功体保持不变：仍是 201 业务响应（CodeListResponse/UnitResponse/FormResponse）。
    if "codelists" in path:
        assert response.json()["name"] == "快速字典"
    if "units" in path:
        assert response.json()["symbol"] == "kg"
    if "copy" in path:
        assert response.json()["id"] != context["form_id"]
    # F1 元数据：before=提交前真实标签，after=提交后标签；两者一体只在成功后发布。
    assert response.headers[BEFORE_HEADER] == before, response.headers
    assert response.headers[HEADER] == load_state(client, context).headers[HEADER]
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("path,payload", TRANSITION_CASES)
def test_should_begin_physical_write_transaction_before_user_select_on_each_creation_route(
    design_context, path, payload
):
    client, engine, context = design_context
    statements = []

    def record(conn, cursor, statement, parameters, execution_context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        response = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert response.status_code == 201, response.text
    assert statements[0] == "BEGIN IMMEDIATE"
    assert next(index for index, sql in enumerate(statements) if "FROM user" in sql) > 0


def test_should_extend_only_invalidation_metadata_and_keep_core_registry_unchanged():
    from src.design_dependencies import CORE_MUTATIONS, INVALIDATION_METADATA
    from test_design_revision_boundary import CORE_CASES

    assert CORE_MUTATIONS == {(method, path) for method, path, _ in CORE_CASES}
    assert len(CORE_MUTATIONS) == 19
    assert INVALIDATION_METADATA == {
        ("POST", "/forms/{form_id}/copy"),
        ("POST", "/projects/{project_id}/codelists"),
        ("POST", "/projects/{project_id}/units"),
    }


def test_before_tag_reflects_actual_pre_state_with_interleaved_external_write(design_context):
    client, engine, context = design_context
    stale = load_state(client, context).headers[HEADER]
    with engine.begin() as conn:
        conn.exec_driver_sql(f"UPDATE form SET design_notes='外部' WHERE id={context['form_id']}")
    external = load_state(client, context).headers[HEADER]
    assert external != stale
    response = client.post(
        f"/api/projects/{context['project_id']}/codelists", json={"name": "交错字典"}, headers=context["headers"]
    )
    assert response.status_code == 201, response.text
    # before 标签在锁内读取，反映事务启动时的真实前状态，而不是更早的过期读取。
    assert response.headers[BEFORE_HEADER] == external
    assert response.headers[HEADER] == load_state(client, context).headers[HEADER]
    # 持有更早标签的核心写入仍然拒绝（新增管理写入不带来任何 If-Match 豁免）。
    stale_write = client.put(
        f"/api/forms/{context['form_id']}", json={"name": "不得覆盖"}, headers=write_headers(context, stale)
    )
    assert stale_write.status_code == 409
    assert stale_write.json()["code"] == "STALE_STATE"


@pytest.mark.parametrize("path,payload", TRANSITION_CASES)
def test_should_reject_unauthenticated_and_revoked_auth_without_any_metadata(design_context, path, payload):
    client, engine, context = design_context
    url = "/api" + path.format(**context)
    # 未认证：无 Authorization 头 → 401，无任何设计标签。
    anonymous = client.post(url, json=payload)
    assert anonymous.status_code == 401, anonymous.text
    assert HEADER not in anonymous.headers
    assert BEFORE_HEADER not in anonymous.headers
    # 已认证但 JWT 的 auth_version 已被吊销（密码重置/管理吊销路径）→ 401，无任何设计标签。
    with engine.begin() as conn:
        conn.exec_driver_sql("UPDATE user SET auth_version=auth_version+1")
    revoked = client.post(url, json=payload, headers=context["headers"])
    assert revoked.status_code == 401, revoked.text
    assert HEADER not in revoked.headers
    assert BEFORE_HEADER not in revoked.headers


# R6：作用域先行证明使用真正无效的请求体（字典缺 name、单位缺 symbol——若体校验先于
# 作用域将得到 422 而不是 403/404）。整表复制没有请求体 schema，无对应体校验可比较，
# 其作用域先行单独证明（见 test_should_keep_copy_route_scope_errors_without_body_validation）。
INVALID_BODY_CASES = [
    ("/projects/{project_id}/codelists", {}),
    ("/projects/{project_id}/units", {}),
]


@pytest.mark.parametrize("path,payload", INVALID_BODY_CASES)
def test_should_report_inaccessible_or_missing_scope_before_invalid_body_validation(design_context, path, payload):
    client, engine, context = design_context
    # 先证明同一无效体在所有者作用域确实触发体校验 422（否则后面的 403/404 不构成先后证明）。
    owner_invalid = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    assert owner_invalid.status_code == 422, owner_invalid.text
    assert HEADER not in owner_invalid.headers
    assert BEFORE_HEADER not in owner_invalid.headers
    with Session(engine) as session:
        other = User(username="other-owner", auth_version=0)
        session.add(other)
        session.flush()
        foreign = Project(name="他人项目", version="1", owner_id=other.id)
        session.add(foreign)
        session.commit()
        foreign_project_id = foreign.id
    url = "/api" + path.format(**context)
    foreign_url = url.replace(f"/projects/{context['project_id']}/", f"/projects/{foreign_project_id}/")
    missing_url = url.replace(f"/projects/{context['project_id']}/", "/projects/999999/")
    malformed_url = url.replace(f"/projects/{context['project_id']}/", "/projects/not-an-int/")
    # 有鉴权的无权访问者携带无效体：项目归属先于体校验 → 403（§2.2 明确误差），不是 422。
    forbidden = client.post(foreign_url, json=payload, headers=context["headers"])
    assert forbidden.status_code == 403, forbidden.text
    assert HEADER not in forbidden.headers
    assert BEFORE_HEADER not in forbidden.headers
    # 项目不存在 → 404 先于 422。
    missing = client.post(missing_url, json=payload, headers=context["headers"])
    assert missing.status_code == 404, missing.text
    assert HEADER not in missing.headers
    assert BEFORE_HEADER not in missing.headers
    # 非整数作用域 id：沿用作用域 422 文案。
    malformed = client.post(malformed_url, json=payload, headers=context["headers"])
    assert malformed.status_code == 422
    assert malformed.json()["detail"] == "资源编号必须为整数"
    assert HEADER not in malformed.headers
    assert BEFORE_HEADER not in malformed.headers


def test_should_keep_copy_route_scope_errors_without_body_validation(design_context):
    """整表复制没有请求体 schema（任何体都不做校验）：作用域错误单独证明——
    外来 form_id → 403、缺失 → 404、非整数 → 422，全部不发布任何设计标签。"""
    client, engine, context = design_context
    with Session(engine) as session:
        other = User(username="copy-other-owner", auth_version=0)
        session.add(other)
        session.flush()
        foreign = Project(name="复制他人项目", version="1", owner_id=other.id)
        session.add(foreign)
        session.flush()
        from src.models.form import Form

        foreign_form = Form(project_id=foreign.id, name="他人表单", order_index=1)
        session.add(foreign_form)
        session.commit()
        foreign_form_id = foreign_form.id
    forbidden = client.post(f"/api/forms/{foreign_form_id}/copy", json={}, headers=context["headers"])
    assert forbidden.status_code == 403, forbidden.text
    assert HEADER not in forbidden.headers
    assert BEFORE_HEADER not in forbidden.headers
    missing = client.post("/api/forms/999999/copy", json={}, headers=context["headers"])
    assert missing.status_code == 404, missing.text
    assert HEADER not in missing.headers
    assert BEFORE_HEADER not in missing.headers
    malformed = client.post("/api/forms/not-an-int/copy", json={}, headers=context["headers"])
    assert malformed.status_code == 422
    assert malformed.json()["detail"] == "资源编号必须为整数"
    assert HEADER not in malformed.headers
    assert BEFORE_HEADER not in malformed.headers


@pytest.mark.parametrize("path,payload", OWNER_INVALID_CASES)
def test_should_keep_owner_visible_validation_unchanged_and_publish_no_failure_metadata(design_context, path, payload):
    client, _, context = design_context
    response = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    assert response.status_code == 422, response.text
    assert HEADER not in response.headers
    assert BEFORE_HEADER not in response.headers


@pytest.mark.parametrize("path,payload,table,trigger", STORAGE_FAILURE_CASES)
def test_should_publish_no_metadata_when_storage_failure_rolls_back(design_context, path, payload, table, trigger):
    client, engine, context = design_context
    before = load_state(client, context).headers[HEADER]
    with engine.begin() as conn:
        conn.exec_driver_sql(
            f"CREATE TRIGGER {trigger} BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'injected fault'); END"
        )
    response = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    assert response.status_code >= 400
    assert HEADER not in response.headers
    assert BEFORE_HEADER not in response.headers
    assert load_state(client, context).headers[HEADER] == before


@pytest.mark.parametrize("path,payload", TRANSITION_CASES)
def test_should_roll_back_and_publish_no_metadata_when_output_validation_fails(
    design_context, path, payload, monkeypatch
):
    """R6：响应序列化（响应模型校验）是提交前的最后失败边界，与 INSERT 存储故障不同：
    业务写入已执行但尚未提交，失败后依赖栈回滚，整个事务不留任何业务行，两个设计标签
    都不发布。注入仅对本请求生效（monkeypatch 自动还原）。"""
    client, _, context = design_context
    import fastapi.routing
    from fastapi.exceptions import ResponseValidationError

    original_serialize = fastapi.routing.serialize_response
    injection = {"active": False}

    async def failing_serialize_response(**kwargs):
        if injection["active"]:
            raise ResponseValidationError(
                errors=[{"loc": ("response",), "msg": "注入的输出校验失败", "type": "value_error"}],
                body=kwargs.get("response_content"),
            )
        return await original_serialize(**kwargs)

    monkeypatch.setattr(fastapi.routing, "serialize_response", failing_serialize_response)
    before = load_state(client, context).headers[HEADER]
    forms_before = load_state(client, context).json()
    injection["active"] = True
    try:
        response = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    finally:
        injection["active"] = False
    assert response.status_code >= 400, response.text
    assert HEADER not in response.headers
    assert BEFORE_HEADER not in response.headers
    # 回滚证明：修订不变、业务行不落库。
    assert load_state(client, context).headers[HEADER] == before
    if "codelists" in path:
        codelists = client.get(f"/api/projects/{context['project_id']}/codelists", headers=context["headers"])
        assert codelists.status_code == 200, codelists.text
        assert all(item["name"] != "快速字典" for item in codelists.json())
    if "units" in path:
        units = client.get(f"/api/projects/{context['project_id']}/units", headers=context["headers"])
        assert units.status_code == 200, units.text
        assert all(item["symbol"] != "kg" for item in units.json())
    if "copy" in path:
        forms_after = load_state(client, context).json()
        assert len(forms_after) == len(forms_before)


@pytest.mark.parametrize("path,payload", TRANSITION_CASES)
def test_should_roll_back_and_publish_no_metadata_when_commit_fails(design_context, path, payload):
    """R6：依赖栈收尾提交是最后一个外部故障边界（Session before_commit 注入）：
    提交失败 → 整个请求事务回滚，业务行不落库，两个设计标签都不发布。监听器在 finally
    移除，且仅对注入窗口内的提交生效。"""
    client, engine, context = design_context
    from sqlalchemy.orm import Session as OrmSession

    injection = {"active": False}

    def fail_commit(session):
        if injection["active"]:
            raise RuntimeError("注入的提交失败")

    event.listen(OrmSession, "before_commit", fail_commit)
    try:
        before = load_state(client, context).headers[HEADER]
        forms_before = load_state(client, context).json()
        injection["active"] = True
        response = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    finally:
        injection["active"] = False
        event.remove(OrmSession, "before_commit", fail_commit)
    assert response.status_code >= 400, response.text
    assert HEADER not in response.headers
    assert BEFORE_HEADER not in response.headers
    assert load_state(client, context).headers[HEADER] == before
    if "codelists" in path:
        codelists = client.get(f"/api/projects/{context['project_id']}/codelists", headers=context["headers"])
        assert codelists.status_code == 200, codelists.text
        assert all(item["name"] != "快速字典" for item in codelists.json())
    if "units" in path:
        units = client.get(f"/api/projects/{context['project_id']}/units", headers=context["headers"])
        assert units.status_code == 200, units.text
        assert all(item["symbol"] != "kg" for item in units.json())
    if "copy" in path:
        forms_after = load_state(client, context).json()
        assert len(forms_after) == len(forms_before)


@pytest.mark.parametrize("path,payload", TRANSITION_CASES)
def test_should_keep_recycled_project_creation_owner_scoped_with_metadata(design_context, path, payload):
    """非门控创建路由保持既有语义：回收站项目内所有者创建仍成功（仅所有者可见），并携带标签。"""
    client, engine, context = design_context
    before = load_state(client, context).headers[HEADER]
    with engine.begin() as conn:
        conn.exec_driver_sql(f"UPDATE project SET deleted_at=datetime('now') WHERE id={context['project_id']}")
    response = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    assert response.status_code == 201, response.text
    assert response.headers[BEFORE_HEADER] == before
    assert response.headers["Cache-Control"] == "no-store"


def test_should_keep_unrelated_management_writer_without_design_metadata(design_context):
    client, _, context = design_context
    response = client.post(
        f"/api/projects/{context['project_id']}/visits",
        json={"name": "独立访视", "sequence": 1},
        headers=context["headers"],
    )
    assert response.status_code == 201, response.text
    assert HEADER not in response.headers
    assert BEFORE_HEADER not in response.headers
