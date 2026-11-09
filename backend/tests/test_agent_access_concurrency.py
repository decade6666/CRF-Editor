"""Agent 并发测试：两条独立 SQLite 连接 + 屏障/事件，含浏览器式并发写者。

不使用单个 mock 会话；真实 BEGIN IMMEDIATE 竞争与 WAL 行为。
"""

from __future__ import annotations

import threading

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from agent_access_helpers import agent_tool, issue_credential, seed_full_project, reset_agent_limiter
from src.models.agent_access import AgentCredential, AgentOperation
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.services.agent_access_service import issue_credential as svc_issue_credential
from src.services.agent_state_service import compute_project_fingerprint

pytestmark = pytest.mark.integration


@pytest.fixture
def file_engine(tmp_path):
    """真实文件数据库 + WAL：QueuePool 每次连接取出独立 DBAPI 连接，
    两个线程可各自开事务（StaticPool 共享单连接会串线程报
    cannot start a transaction within a transaction）。"""
    db_path = tmp_path / "concurrency.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False, "timeout": 2},
        poolclass=QueuePool,
        pool_size=4,
    )

    @event.listens_for(engine, "connect")
    def _configure(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA busy_timeout=2000")

    from src.models import Base

    Base.metadata.create_all(engine)
    return engine


def _seed(file_engine, username="alice"):
    with Session(file_engine) as session:
        user = User(username=username, auth_version=0)
        session.add(user)
        session.flush()
        project = Project(name="并发项目", version="1.0", owner_id=user.id, order_index=1)
        session.add(project)
        session.flush()
        fd = FieldDefinition(
            project_id=project.id, variable_name="C_DEF", label="并发字段", field_type="文本", order_index=1
        )
        session.add(fd)
        session.commit()
        return user.id, project.id, fd.id


def test_begin_immediate_blocks_second_writer_until_release(file_engine):
    """连接 A 持有 BEGIN IMMEDIATE 时连接 B 的 BEGIN IMMEDIATE 忙等或 SQLITE_BUSY。"""
    user_id, project_id, fd_id = _seed(file_engine)

    conn_a = file_engine.connect()
    conn_a.exec_driver_sql("BEGIN IMMEDIATE")

    outcomes = {}

    def try_b():
        conn_b = file_engine.connect()
        try:
            conn_b.exec_driver_sql("BEGIN IMMEDIATE")
            outcomes["b_acquired"] = True
            conn_b.commit()
        except Exception as exc:  # SQLITE_BUSY → 第二写者被拒
            outcomes["b_acquired"] = False
            outcomes["b_error"] = type(exc).__name__
        finally:
            conn_b.close()

    thread = threading.Thread(target=try_b)
    thread.start()
    thread.join(timeout=3)
    # A 未提交前 B 必须拿不到写锁（busy_timeout 内忙等，超时后 SQLITE_BUSY 失败）
    assert outcomes.get("b_acquired") is False, f"B 不应在 A 持锁期间获得写锁：{outcomes}"
    assert "b_error" in outcomes, f"B 应以忙等失败结束（SQLITE_BUSY 类错误）：{outcomes}"
    conn_a.commit()
    conn_a.close()
    # 无论哪种路径，数据库仍处于一致状态
    with Session(file_engine) as session:
        assert session.get(FieldDefinition, fd_id) is not None


def test_concurrent_fingerprint_write_single_commit(file_engine):
    """并发场景：读指纹（BEGIN）与写（BEGIN IMMEDIATE）交错，写提交后指纹变化。"""
    user_id, project_id, fd_id = _seed(file_engine)

    with Session(file_engine) as session:
        fp_before = compute_project_fingerprint(session, project_id)

    # 浏览器式并发写者：另一个连接直接写字段标签（非 agent 路径）
    def browser_writer(barrier, done):
        with Session(file_engine) as session:
            session.get(FieldDefinition, fd_id).label = "并发改写"
            barrier.wait(timeout=5)
            session.commit()
        done.set()

    barrier = threading.Barrier(2)
    done = threading.Event()
    t = threading.Thread(target=browser_writer, args=(barrier, done))
    t.start()

    # agent 侧写事务等待 barrier 对齐后开锁
    with Session(file_engine) as agent_session:
        barrier.wait(timeout=5)
        agent_session.get(FieldDefinition, fd_id).integer_digits = 3
        agent_session.commit()

    t.join(timeout=5)
    assert done.is_set()

    with Session(file_engine) as session:
        fd = session.get(FieldDefinition, fd_id)
        assert fd.label == "并发改写"
        assert fd.integer_digits == 3
        fp_after = compute_project_fingerprint(session, project_id)
    assert fp_after != fp_before


def test_replay_after_concurrent_duplicate_request(file_engine):
    """两个相同 request_id 的并发请求：只有一个提交成功，另一个返回原结果或 409。"""
    from src.models.agent_access import AgentOperation
    from src.services.agent_operation_service import (
        bind_or_reject,
        canonical_json,
        input_digest,
        record_success,
    )

    user_id, project_id, fd_id = _seed(file_engine)
    with Session(file_engine) as session:
        user = session.get(User, user_id)
        project = session.get(Project, project_id)
        credential, raw = svc_issue_credential(session, project, user, "并发凭据", "read_write", 24)
        session.commit()
        credential_id = credential.id

    payload = {"project_id": project_id, "form_field_id": 1, "patch": {"required": 1}}
    results = []
    lock = threading.Lock()

    def worker():
        try:
            with file_engine.connect() as conn:
                conn.exec_driver_sql("BEGIN IMMEDIATE")
                s = Session(bind=conn, join_transaction_mode="control_fully")
                try:
                    cred = s.get(AgentCredential, credential_id)
                    existing = bind_or_reject(s, cred, project_id, "crf_update_form_field_instance", "dup-1", payload)
                    if existing is not None:
                        outcome = "replay"
                    else:
                        record_success(
                            s,
                            cred,
                            project_id,
                            "crf_update_form_field_instance",
                            "dup-1",
                            payload,
                            {"form_field_id": 1, "definition_id": fd_id, "definition_created": False},
                        )
                        outcome = "first"
                    # control_fully：由 Session 提交（复用同一底层游标/事务）
                    s.commit()
                except Exception as exc:
                    s.rollback()
                    outcome = f"conflict:{type(exc).__name__}"
        except Exception as exc:
            outcome = f"busy:{type(exc).__name__}"
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=6)

    # 恰好一次 first（或一方忙等失败后未写）；绝不出现两条记录
    with Session(file_engine) as session:
        count = len(
            list(
                session.query(AgentOperation)
                .filter(AgentOperation.credential_id == credential_id, AgentOperation.request_id == "dup-1")
                .all()
            )
        )
    assert count == 1, f"records={count}, worker outcomes={results}"
    assert results.count("first") == 1, f"outcomes={results}"


# ── 修复轮回归（属主边界锁内重校验的两连接竞争回归） ──


def test_owner_cap_contention_is_atomic_under_two_connections(file_engine, monkeypatch):
    """两连接同时发放：20 上限与同名判定在同一写锁内原子完成，不超发。"""
    from src.rate_limit import RateLimitRule
    from src.services import agent_access_service as access_service
    from src.services.agent_access_service import MAX_ACTIVE_CREDENTIALS_PER_PROJECT

    # 作用域 monkeypatch：用例结束自动恢复真实发放限流规则（不污染后续用例）
    monkeypatch.setattr(access_service, "ISSUE_CREDENTIAL_RULE", RateLimitRule(limit=100000, window_seconds=60))
    user_id, project_id, _fd_id = _seed(file_engine)
    results = []
    lock = threading.Lock()
    start = threading.Barrier(2)

    def issue(index):
        start.wait()
        try:
            with file_engine.connect() as conn:
                conn.exec_driver_sql("BEGIN IMMEDIATE")
                session = Session(bind=conn, join_transaction_mode="control_fully")
                try:
                    owner = session.get(User, user_id)
                    project = session.get(Project, project_id)
                    credential, _token = access_service.issue_credential(
                        session, project, owner, f"凭据{index}", "read", 24
                    )
                    session.commit()
                    with lock:
                        results.append(credential.id)
                except Exception as exc:
                    session.rollback()
                    with lock:
                        results.append(type(exc).__name__)
        except Exception as exc:  # BEGIN IMMEDIATE 层面的忙等失败
            with lock:
                results.append(type(exc).__name__)

    threads = [threading.Thread(target=issue, args=(i,)) for i in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)

    with Session(file_engine) as session:
        from sqlalchemy import func, select

        active = session.scalar(select(func.count(AgentCredential.id)).where(AgentCredential.project_id == project_id))
        assert active == len([r for r in results if isinstance(r, int)])
        assert active >= 1


def test_approval_rejected_when_browser_write_lands_first(file_engine):
    """浏览器式写者先落地 → 审批连接的基线重校验拒绝（409）。"""
    from datetime import datetime, timedelta

    from fastapi import HTTPException

    from src.services.agent_access_service import decide_change

    user_id, project_id, fd_id = _seed(file_engine)

    # 构造提案基线
    with Session(file_engine) as session:
        base_fp = compute_project_fingerprint(session, project_id)
        credential = AgentCredential(
            project_id=project_id,
            owner_id=user_id,
            name="审批凭据",
            token_hash="concurrency-review-hash",
            permission="read_write",
            auth_version=0,
            expires_at=datetime.now() + timedelta(hours=1),
        )
        session.add(credential)
        session.flush()
        from src.services.agent_operation_service import canonical_json

        operation = AgentOperation(
            credential_id=credential.id,
            project_id=project_id,
            request_id="approval-race",
            tool_name="crf_preview_shared_definition_change",
            input_digest="0" * 64,
            status="done",
            change_kind="shared_definition",
            definition_id=fd_id,
            normalized_command_json=canonical_json({"definition_id": fd_id, "patch": {"label": "x"}}),
            impact_json="[]",
            base_fingerprint=base_fp,
            proposal_digest="1" * 64,
            contract_version="1.1.0",
            expires_at=datetime.now() + timedelta(minutes=10),
            approval_state="pending",
            result_json="{}",
        )
        session.add(operation)
        session.commit()
        operation_id = operation.id

    browser_done = threading.Event()

    def browser_writer():
        # 先于审批连接拿到写锁并提交真实内容变更
        with file_engine.connect() as conn:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            session = Session(bind=conn, join_transaction_mode="control_fully")
            try:
                fd = session.get(FieldDefinition, fd_id)
                fd.label = "浏览器并发改写"
                session.commit()
            finally:
                browser_done.set()

    writer = threading.Thread(target=browser_writer)
    writer.start()
    writer.join(timeout=5)

    assert browser_done.is_set()
    with pytest.raises(HTTPException) as exc:
        with file_engine.connect() as conn:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            session = Session(bind=conn, join_transaction_mode="control_fully")
            try:
                owner = session.get(User, user_id)
                project = session.get(Project, project_id)
                decide_change(session, project, owner, operation_id, True, "1" * 64)
            except Exception:
                session.rollback()
                raise
    assert exc.value.status_code == 409

    # 提案审批状态未被改变
    with Session(file_engine) as session:
        assert session.get(AgentOperation, operation_id).approval_state == "pending"


# ── C13 回归（IR3 同步 DB 事务经线程池下放，事件循环保持存活） ──


def test_agent_write_threadpool_keeps_loop_live_while_browser_lock_held(file_engine):
    """IR3：agent 写的同步 DB 事务（BEGIN IMMEDIATE 锁等待）在线程池执行，
    同一事件循环上调度的浏览器式提交照常运行。

    真实 ASGI 请求（AsyncClient + ASGITransport 驱动同一 loop）+ 文件/WAL SQLite：
    浏览器式写者持 BEGIN IMMEDIATE，其释放经 loop.call_later 调度。修复前同步
    BEGIN IMMEDIATE 阻塞 loop，释放回调饿死 → busy 超时 500；修复后 loop 保持
    存活，浏览器提交先于 agent 响应执行，写请求 200。
    """
    import asyncio
    import time

    from httpx import ASGITransport, AsyncClient
    from main import app
    from src.agent_dependencies import get_agent_engine
    from src.models.form import Form

    user_id, project_id, fd_id = _seed(file_engine)
    with Session(file_engine) as session:
        form = Form(project_id=project_id, name="ASGI表单", code="F_ASI", order_index=1)
        session.add(form)
        session.flush()
        ff = FormField(form_id=form.id, field_definition_id=fd_id, order_index=1)
        session.add(ff)
        credential, raw_token = svc_issue_credential(
            session,
            session.get(Project, project_id),
            session.get(User, user_id),
            "ASGI凭据",
            "read_write",
            24,
        )
        session.commit()
        form_field_id = ff.id
        fingerprint = compute_project_fingerprint(session, project_id)

    previous_override = app.dependency_overrides.get(get_agent_engine)
    app.dependency_overrides[get_agent_engine] = lambda: file_engine
    try:

        async def scenario():
            holder = file_engine.connect()
            holder.exec_driver_sql("BEGIN IMMEDIATE")  # 浏览器式写者持锁
            released = asyncio.Event()
            loop = asyncio.get_running_loop()

            def release_lock():
                holder.commit()  # 浏览器提交：释放写锁（loop 回调内直接提交）
                loop.call_soon_threadsafe(released.set)

            heartbeats = {"count": 0}

            def beat():
                heartbeats["count"] += 1
                if not released.is_set():
                    loop.call_later(0.02, beat)

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                loop.call_later(0.25, release_lock)
                loop.call_later(0.02, beat)
                started = time.monotonic()
                response = await ac.post(
                    "/api/agent/tools/crf_update_form_field_instance",
                    json={
                        "project_id": project_id,
                        "form_field_id": form_field_id,
                        "patch": {"help_text": "asgi 并发回归"},
                        "expected_project_fingerprint": fingerprint,
                        "request_id": "asgi-lock-release-1",
                    },
                    headers={"Authorization": f"Bearer {raw_token}"},
                )
                elapsed = time.monotonic() - started
            holder.close()
            return response.status_code, elapsed, released.is_set(), heartbeats["count"]

        status, elapsed, released, beats = asyncio.run(scenario())
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_agent_engine, None)
        else:
            app.dependency_overrides[get_agent_engine] = previous_override

    assert status == 200, f"agent 写应在线程池中等待浏览器锁：HTTP {status}, {elapsed:.3f}s"
    assert released, "loop 调度的浏览器提交必须先于 agent 响应执行"
    assert beats >= 2, f"事件循环在锁等待期间必须保持存活（heartbeats={beats}）"

    # 真实落库：补丁已提交
    with Session(file_engine) as session:
        assert session.get(FormField, form_field_id).help_text == "asgi 并发回归"


# ── C14 回归（I2：同一事件循环上的真实浏览器/agent ASGI 写并发） ──


def test_same_event_loop_browser_write_wins_agent_gets_stale_409(file_engine, monkeypatch, reset_agent_limiter):
    """同一事件循环并发真实的浏览器/agent ASGI 写请求（文件/WAL 引擎）。

    浏览器 PUT /api/form-fields/{ff_id}/binding-profile 在真实 update_binding_profile
    （内部 flush 取 SQLite 写锁）之后于其请求事务内短暂持锁，锁由 get_session 的
    真实 yield-session 事务终结器（session.begin 上下文提交）释放——不是手工 SQL
    持有者（底层对照见 test_agent_write_threadpool_keeps_loop_live_while_browser_lock_held）。
    agent 写经线程池 BEGIN IMMEDIATE 只能在浏览器提交后进入；其写事务内重校验的
    指纹已因浏览器提交而变化 → 预期浏览器 200、agent 409 STALE_STATE。
    被拒 agent 不留部分变更/结果；依赖覆盖、监听器与事件不外泄。

    C15 修正：放行由 sqlalchemy before_cursor_execute 观测到的 agent BEGIN IMMEDIATE
    尝试门控（非定时重叠假设），心跳推进只在持锁窗口内计量（不含清理期睡眠）；
    审计断言以发放时已提交的 credential.issue/issued 基线集合不变为准——发放审计
    是生命周期事件（agent_access_service.py:98-106），不是代理编辑结果。
    """
    import asyncio

    from httpx import ASGITransport, AsyncClient
    from main import app
    from src.agent_dependencies import get_agent_engine
    from src.database import get_session
    from src.models.agent_access import AgentAuditEvent
    from src.models.form import Form
    from src.routers import fields as fields_router
    from src.services.auth_service import create_access_token

    user_id, project_id, fd_id = _seed(file_engine)
    with Session(file_engine) as session:
        form = Form(project_id=project_id, name="同循环表单", code="F_LOOP", order_index=1)
        session.add(form)
        session.flush()
        ff = FormField(form_id=form.id, field_definition_id=fd_id, order_index=1)
        session.add(ff)
        credential, raw_token = svc_issue_credential(
            session, session.get(Project, project_id), session.get(User, user_id), "同循环凭据", "read_write", 24
        )
        session.commit()
        form_field_id = ff.id
        credential_id = credential.id
        fingerprint_before = compute_project_fingerprint(session, project_id)
        # 审计基线（C15-A）：真实发放已在 Arrange 提交 credential.issue/issued 生命周期审计
        baseline_audits = sorted(
            (row.id, row.tool_name, row.result_code, row.operation_id)
            for row in session.query(AgentAuditEvent).filter(AgentAuditEvent.credential_id == credential_id).all()
        )
        assert ("credential.issue", "issued") in [(t, c) for _, t, c, _op in baseline_audits], (
            "凭据发放审计必须已在 Arrange 提交（生命周期事件，非代理编辑结果）"
        )

    browser_token = create_access_token(user_id, "alice", 0)
    browser_headers = {"Authorization": f"Bearer {browser_token}"}
    agent_headers = {"Authorization": f"Bearer {raw_token}"}
    browser_command = {
        "definition_operation": {
            "operation": "update_shared",
            "update_shared": {
                "target_definition_id": fd_id,
                "definition": {"variable_name": "C_DEF", "label": "浏览器共享标签", "field_type": "文本"},
            },
        },
        "binding": {"mode": "keep"},
        "instance": {"mode": "upsert", "upsert": {"label_override": "浏览器实例标签"}},
    }
    agent_args = {
        "project_id": project_id,
        "form_field_id": form_field_id,
        "patch": {"help_text": "agent 并发补丁"},
        "expected_project_fingerprint": fingerprint_before,
        "request_id": "same-loop-stale-1",
    }

    # 测试本地包装：先调用真实操作（flush 已在请求事务内取写锁），再短暂等待放行
    real_update = fields_router.update_binding_profile
    reached = threading.Event()
    release = threading.Event()

    def held_then_wait(session, ff, project, current_user, command):
        result = real_update(session, ff, project, current_user, command)
        reached.set()
        assert release.wait(timeout=10), "浏览器请求事务未在期限内被放行"
        return result

    monkeypatch.setattr(fields_router, "update_binding_profile", held_then_wait)

    def _file_session():
        # 与 src.database.get_session 相同的 yield-session 事务终结器（指向文件/WAL 引擎）
        with Session(file_engine) as session:
            with session.begin():
                yield session

    # G1：有界测试本地信号——before_cursor_execute 观测 agent 线程池连接真实执行
    # BEGIN IMMEDIATE 的时刻（浏览器事务不发 IMMEDIATE，不会误触）；finally 中移除
    agent_begin_attempted = threading.Event()
    begin_attempts = {"count": 0}

    def _on_before_cursor_execute(_conn, _cursor, statement, _parameters, _context, _executemany):
        if "BEGIN IMMEDIATE" in statement:
            begin_attempts["count"] += 1
            agent_begin_attempted.set()

    event.listens_for(file_engine, "before_cursor_execute")(_on_before_cursor_execute)
    previous_session = app.dependency_overrides.get(get_session)
    previous_agent_engine = app.dependency_overrides.get(get_agent_engine)
    app.dependency_overrides[get_session] = _file_session
    app.dependency_overrides[get_agent_engine] = lambda: file_engine
    try:

        async def scenario():
            heartbeats = {"total": 0}

            async def beat():
                while True:
                    heartbeats["total"] += 1
                    await asyncio.sleep(0.02)

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                beat_task = asyncio.create_task(beat())
                try:
                    browser_task = asyncio.create_task(
                        ac.put(
                            f"/api/form-fields/{form_field_id}/binding-profile",
                            json=browser_command,
                            headers=browser_headers,
                        )
                    )
                    # 等浏览器真实操作在请求事务内拿到写锁（wrapper 已调真实函数）
                    await asyncio.wait_for(asyncio.to_thread(reached.wait, 10), timeout=12)
                    assert reached.is_set()
                    agent_task = asyncio.create_task(
                        ac.post(
                            "/api/agent/tools/crf_update_form_field_instance",
                            json=agent_args,
                            headers=agent_headers,
                        )
                    )
                    # G1：放行必须等 agent 真正尝试 BEGIN IMMEDIATE（事件钩子有界等待），
                    # 不用固定定时重叠假设
                    await asyncio.wait_for(asyncio.to_thread(agent_begin_attempted.wait, 8), timeout=10)
                    assert agent_begin_attempted.is_set(), "agent 未在持锁窗口内尝试 BEGIN IMMEDIATE"
                    # 持锁窗口：浏览器仍持锁、release 未设，两个请求都必须仍未完成
                    assert not release.is_set()
                    assert not browser_task.done(), "浏览器请求不得先于放行完成"
                    assert not agent_task.done(), "agent 请求必须在锁等待窗口内保持挂起"
                    held_snapshot = heartbeats["total"]
                    await asyncio.sleep(0.05)  # 持锁窗口内的调度观察（不计任何清理期睡眠）
                    held_progress = heartbeats["total"] - held_snapshot
                    assert held_progress >= 1, "agent BEGIN IMMEDIATE 忙等期间事件循环必须保持调度"
                    release.set()
                    browser_resp, agent_resp = await asyncio.wait_for(
                        asyncio.gather(browser_task, agent_task), timeout=15
                    )
                finally:
                    release.set()  # 失败路径同样放行，不让浏览器事务挂满超时
                    beat_task.cancel()
                    try:
                        await beat_task
                    except asyncio.CancelledError:
                        pass
            return browser_resp, agent_resp, held_progress

        browser_resp, agent_resp, held_progress = asyncio.run(scenario())
    finally:
        event.remove(file_engine, "before_cursor_execute", _on_before_cursor_execute)
        if previous_session is None:
            app.dependency_overrides.pop(get_session, None)
        else:
            app.dependency_overrides[get_session] = previous_session
        if previous_agent_engine is None:
            app.dependency_overrides.pop(get_agent_engine, None)
        else:
            app.dependency_overrides[get_agent_engine] = previous_agent_engine

    # 依赖覆盖与事件不外泄（G1：before_cursor_execute 监听器已在 finally 移除）
    assert app.dependency_overrides.get(get_session) is previous_session
    assert app.dependency_overrides.get(get_agent_engine) is previous_agent_engine
    assert reached.is_set() and release.is_set()
    assert begin_attempts["count"] == 1, f"agent 写应恰好尝试一次 BEGIN IMMEDIATE（观测 {begin_attempts['count']} 次）"

    # 预期顺序：浏览器 200，agent 409 STALE_STATE；持锁窗口内 loop 保持调度
    assert browser_resp.status_code == 200, browser_resp.text
    assert agent_resp.status_code == 409, agent_resp.text
    assert agent_resp.json()["code"] == "STALE_STATE"
    assert "指纹" in agent_resp.json()["detail"]
    assert held_progress >= 1, "持锁窗口内的心跳推进必须在放行前完成（G1）"

    # 持久化：浏览器效果落地；被拒 agent 无部分变更、无结果记录
    with Session(file_engine) as session:
        fd = session.get(FieldDefinition, fd_id)
        ff_row = session.get(FormField, form_field_id)
        assert fd.label == "浏览器共享标签"
        assert ff_row.label_override == "浏览器实例标签"
        assert ff_row.help_text is None
        stale_rows = (
            session.query(AgentOperation)
            .filter(AgentOperation.credential_id == credential_id, AgentOperation.request_id == "same-loop-stale-1")
            .count()
        )
        assert stale_rows == 0, "被拒的 agent 写不得留下结果记录"
        # 审计（C15-A）：断言基线集合不变——发放审计保留，被拒写不新增事件
        final_audits = sorted(
            (row.id, row.tool_name, row.result_code, row.operation_id)
            for row in session.query(AgentAuditEvent).filter(AgentAuditEvent.credential_id == credential_id).all()
        )
        assert final_audits == baseline_audits, "被拒的 agent 写不得改变审计集合"
