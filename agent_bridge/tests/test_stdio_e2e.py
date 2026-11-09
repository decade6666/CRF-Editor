"""关键流程 E2E：真实后端进程 + 真实适配器子进程 + 官方 SDK ClientSession。

不 mock MCP 本身；一次性 HTTP 后端与运行时生成的临时凭据。
凭据只经 0600 握手文件与环境变量传递，绝不打印/断言其值。
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

REPO_ROOT = Path(__file__).resolve().parents[2]
AGENT_BRIDGE = REPO_ROOT / "agent_bridge"
SERVER_PATH = AGENT_BRIDGE / "server.py"
FIXTURE_SERVER_PATH = Path(__file__).resolve().parent / "backend_fixture_server.py"


@pytest.fixture(scope="module")
def backend(tmp_path_factory):
    """一次性 HTTP 后端进程（BACKEND_PY），返回握手信息字典。"""
    backend_py = os.environ.get("BACKEND_PY")
    if not backend_py:
        pytest.fail("E2E 需要 BACKEND_PY 环境变量（现有后端解释器）；缺失即失败，不允许静默跳过")

    # 测试进程自身 HTTP 访问（就绪探测/登录/属主端点）不走代理（回环地址）
    for proxy_var in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        os.environ.pop(proxy_var, None)

    tmp = tmp_path_factory.mktemp("e2e-backend")
    handshake_path = tmp / "handshake.json"
    env = dict(os.environ)
    env.pop("HTTP_PROXY", None)
    env.pop("HTTPS_PROXY", None)
    env.pop("http_proxy", None)
    env.pop("https_proxy", None)
    env["E2E_HANDSHAKE_PATH"] = str(handshake_path)
    process = subprocess.Popen(
        [backend_py, str(FIXTURE_SERVER_PATH)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(tmp),
    )
    deadline = time.time() + 30
    handshake = None
    while time.time() < deadline:
        if handshake_path.exists():
            handshake = json.loads(handshake_path.read_text(encoding="utf-8"))
            break
        if process.poll() is not None:
            stderr = process.stderr.read().decode("utf-8", "replace")
            raise RuntimeError(f"后端进程提前退出: {stderr[:2000]}")
        time.sleep(0.2)
    if handshake is None:
        process.kill()
        raise RuntimeError("后端握手超时")

    # 等待 HTTP 可用
    base = f"http://127.0.0.1:{handshake['port']}"
    deadline = time.time() + 20
    ready = False
    while time.time() < deadline:
        try:
            response = httpx.get(f"{base}/api/auth/me", timeout=2)
            ready = response.status_code in (401, 200)
            if ready:
                break
        except httpx.HTTPError:
            time.sleep(0.3)
    if not ready:
        process.kill()
        raise RuntimeError("后端 HTTP 就绪探测失败")

    handshake["base"] = base
    # 测试进程自身 HTTP 访问也不走代理（回环地址）
    for proxy_var in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        os.environ.pop(proxy_var, None)
    try:
        yield handshake
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
        # teardown 清理：握手文件（含一次性口令）与后端临时根目录（含一次性数据库）
        handshake_path.unlink(missing_ok=True)
        root = Path(handshake["tmp_root"])
        if root.is_dir() and root.name.startswith("crf-agent-e2e-"):
            shutil.rmtree(root, ignore_errors=True)


def _adapter_env(handshake: dict, token: str) -> dict:
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("CRF_") and k not in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy")
    }
    env.update(
        {
            "CRF_AGENT_API_URL": f"{handshake['base']}/api",
            "CRF_AGENT_TOKEN": token,
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    return env


def _login(handshake: dict) -> str:
    resp = httpx.post(
        f"{handshake['base']}/api/auth/login",
        json={"username": handshake["username"], "password": handshake["password"]},
        timeout=10,
    )
    assert resp.status_code == 200, "一次性用户登录失败"
    return resp.json()["access_token"]


def _call_tool(session: ClientSession, name: str, arguments: dict):
    result = session.call_tool(name, arguments)
    return result


def _assert_ok(result, context: str):
    assert not result.isError, f"{context} 失败: {_first_text(result)[:300]}"
    return result


def _first_text(result) -> str:
    return result.content[0].text if result.content else ""


def _payload(result) -> dict:
    return json.loads(_first_text(result))


@pytest.fixture(scope="module")
def session_env(backend):
    """登录属主 → 通过属主 HTTP 端点发放 agent 凭据 → 适配器环境变量。"""
    browser_token = _login(backend)
    create = httpx.post(
        f"{backend['base']}/api/projects/{backend['project_id']}/agent-access/credentials",
        json={"name": "e2e 凭据", "permission": "read_write", "expires_hours": 1},
        headers={"Authorization": f"Bearer {browser_token}"},
        timeout=10,
    )
    assert create.status_code == 201, create.text
    raw_token = create.json()["token"]
    return {"browser_token": browser_token, "agent_token": raw_token}


def test_full_ten_tool_loop_over_real_stdio(backend, session_env):
    """官方 SDK stdio_client + ClientSession 完整十工具回路。"""
    params = StdioServerParameters(
        command=sys.executable,
        args=[str(SERVER_PATH)],
        env=_adapter_env(backend, session_env["agent_token"]),
        cwd=str(REPO_ROOT),
    )

    import anyio

    async def _run() -> None:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                init = await session.initialize()
                assert init.serverInfo.name == "crf-editor"

                tools = await session.list_tools()
                names = {tool.name for tool in tools.tools}
                assert names == {
                    "crf_list_projects",
                    "crf_get_project_outline",
                    "crf_get_form_detail",
                    "crf_search_field_definitions",
                    "crf_get_reference_impact",
                    "crf_add_form_field",
                    "crf_update_form_field_instance",
                    "crf_reorder_form_fields",
                    "crf_preview_shared_definition_change",
                    "crf_apply_shared_definition_change",
                }

                pid = backend["project_id"]
                fid = backend["form_id"]
                fdid = backend["field_definition_id"]

                listing = _payload(_assert_ok(await _call_tool(session, "crf_list_projects", {}), "list_projects"))
                assert listing["data"]["projects"][0]["id"] == pid
                fingerprint = listing["project_fingerprint"]

                outline = _payload(
                    _assert_ok(await _call_tool(session, "crf_get_project_outline", {"project_id": pid}), "outline")
                )
                assert outline["project_fingerprint"] == fingerprint

                detail = _payload(
                    _assert_ok(
                        await _call_tool(session, "crf_get_form_detail", {"project_id": pid, "form_id": fid}),
                        "form_detail",
                    )
                )
                assert any(row["id"] == backend["form_field_id"] for row in detail["data"]["rows"])

                search = _payload(
                    _assert_ok(
                        await _call_tool(
                            session,
                            "crf_search_field_definitions",
                            {"project_id": pid, "query": "BASE_DEF"},
                        ),
                        "search",
                    )
                )
                assert search["data"]["candidates"][0]["variable_name"] == "BASE_DEF"

                # 删掉种子实例避免重复绑定，然后新增
                delete = httpx.delete(
                    f"{backend['base']}/api/form-fields/{backend['form_field_id']}",
                    headers={"Authorization": f"Bearer {session_env['browser_token']}"},
                    timeout=10,
                )
                assert delete.status_code == 204, delete.text

                # 删除已改变项目内容：重新读取指纹供写入工具做乐观校验
                fresh = _payload(
                    _assert_ok(
                        await _call_tool(session, "crf_get_project_outline", {"project_id": pid}),
                        "fresh_outline",
                    )
                )

                added = _payload(
                    _assert_ok(
                        await _call_tool(
                            session,
                            "crf_add_form_field",
                            {
                                "project_id": pid,
                                "form_id": fid,
                                "source": {"definition_id": fdid},
                                "instance": {"required": 1},
                                "position": None,
                                "expected_project_fingerprint": fresh["project_fingerprint"],
                                "request_id": "e2e-add-1",
                            },
                        ),
                        "add_form_field",
                    )
                )
                new_ff_id = added["data"]["form_field_id"]

                updated = _payload(
                    _assert_ok(
                        await _call_tool(
                            session,
                            "crf_update_form_field_instance",
                            {
                                "project_id": pid,
                                "form_field_id": new_ff_id,
                                "patch": {"help_text": "E2E 帮助"},
                                "expected_project_fingerprint": added["project_fingerprint"],
                                "request_id": "e2e-upd-1",
                            },
                        ),
                        "update_instance",
                    )
                )

                reordered = _payload(
                    _assert_ok(
                        await _call_tool(
                            session,
                            "crf_reorder_form_fields",
                            {
                                "project_id": pid,
                                "form_id": fid,
                                "ordered_form_field_ids": [new_ff_id],
                                "expected_project_fingerprint": updated["project_fingerprint"],
                                "request_id": "e2e-reorder-1",
                            },
                        ),
                        "reorder",
                    )
                )

                read_back = _payload(
                    _assert_ok(
                        await _call_tool(session, "crf_get_form_detail", {"project_id": pid, "form_id": fid}),
                        "read_back",
                    )
                )
                assert read_back["data"]["rows"][0]["id"] == new_ff_id
                assert read_back["data"]["rows"][0]["required"] is True

                # 共享变更：预览 → 未审批应用拒绝 → 属主审批 → 应用一次 → 重放
                preview = _payload(
                    _assert_ok(
                        await _call_tool(
                            session,
                            "crf_preview_shared_definition_change",
                            {
                                "project_id": pid,
                                "definition_id": fdid,
                                "patch": {"label": "E2E 共享标签"},
                                "expected_project_fingerprint": reordered["project_fingerprint"],
                                "request_id": "e2e-prev-1",
                            },
                        ),
                        "preview",
                    )
                )
                change_id = preview["data"]["change_id"]

                early_apply = await _call_tool(
                    session, "crf_apply_shared_definition_change", {"project_id": pid, "change_id": change_id}
                )
                assert early_apply.isError is True
                assert "审批" in _first_text(early_apply)

                approve = httpx.post(
                    f"{backend['base']}/api/projects/{pid}/agent-access/changes/{change_id}/approve",
                    json={"proposal_digest": preview["data"]["proposal_digest"]},
                    headers={"Authorization": f"Bearer {session_env['browser_token']}"},
                    timeout=10,
                )
                assert approve.status_code == 204, approve.text

                applied = _payload(
                    _assert_ok(
                        await _call_tool(
                            session,
                            "crf_apply_shared_definition_change",
                            {"project_id": pid, "change_id": change_id},
                        ),
                        "apply",
                    )
                )
                assert applied["data"]["applied"] is True

                replay = _payload(
                    _assert_ok(
                        await _call_tool(
                            session,
                            "crf_apply_shared_definition_change",
                            {"project_id": pid, "change_id": change_id},
                        ),
                        "apply_replay",
                    )
                )
                assert replay["data"]["replay"] is True

                # 陈旧提案：新预览（基于新指纹）但引用集随后被改 → 拒绝
                stale_preview = _payload(
                    _assert_ok(
                        await _call_tool(
                            session,
                            "crf_preview_shared_definition_change",
                            {
                                "project_id": pid,
                                "definition_id": fdid,
                                "patch": {"label": "陈旧目标"},
                                "expected_project_fingerprint": applied["project_fingerprint"],
                                "request_id": "e2e-prev-2",
                            },
                        ),
                        "stale_preview",
                    )
                )
                stale_change = stale_preview["data"]["change_id"]
                stale_ok = httpx.post(
                    f"{backend['base']}/api/projects/{pid}/agent-access/changes/{stale_change}/approve",
                    json={"proposal_digest": stale_preview["data"]["proposal_digest"]},
                    headers={"Authorization": f"Bearer {session_env['browser_token']}"},
                    timeout=10,
                )
                assert stale_ok.status_code == 204
                # 并发浏览器式写入（改变项目内容/引用集）
                touch = httpx.put(
                    f"{backend['base']}/api/projects/{pid}/field-definitions/{fdid}",
                    json={"label": "并发浏览器改写"},
                    headers={"Authorization": f"Bearer {session_env['browser_token']}"},
                    timeout=10,
                )
                assert touch.status_code == 200, touch.text

                stale_apply = await _call_tool(
                    session, "crf_apply_shared_definition_change", {"project_id": pid, "change_id": stale_change}
                )
                assert stale_apply.isError is True
                assert "指纹" in _first_text(stale_apply) or "变化" in _first_text(stale_apply)

    anyio.run(_run)


def test_adapter_rejects_bad_token_without_backend_data(backend):
    """坏凭据：适配器初始化即失败（list_tools 报错），不泄露后端数据。"""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=sys.executable,
        args=[str(SERVER_PATH)],
        env=_adapter_env(backend, "definitely-not-a-valid-token-000000000000"),
        cwd=str(REPO_ROOT),
    )

    import anyio

    async def _run() -> None:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                try:
                    await session.initialize()
                    await session.list_tools()
                    raised = False
                    message = ""
                except Exception as exc:
                    raised = True
                    message = str(exc)
                assert raised, "坏凭据下 initialize/list_tools 应失败"
                assert "清单" in message or "read" in message or "timed out" in message or "closed" in message

    anyio.run(_run)


# ── I1 回归：真实一次性后端上的生产适配器丢失响应恢复（真实存储信封 + 真实生成清单） ──


class _LostFirstMutatingPost(httpx.BaseTransport):
    """测试进程内注入传输：首个 agent 写 POST 原样透传到真实后端（提交真实发生）
    后丢弃响应（模拟提交后响应丢失）；其余请求原样透传并计数固定结果查询。
    每个变更工具 POST 记录 {tool, request_id/change_id} 身份（G2 完整派发记账；
    lost_posts 只计注入丢失，不代表派发总数）；绝不记录头/凭据，不改动生产代码。"""

    def __init__(self, inner: httpx.Client):
        self._inner = inner
        self.lost_posts = 0
        self.lookups = 0
        self.mutations: list = []  # 仅工具名与请求/变更身份，不含任何凭据或头

    def _record_mutation(self, request: httpx.Request) -> None:
        entry = {"tool": request.url.path.rsplit("/", 1)[-1]}
        try:
            body = json.loads(request.read())
        except ValueError:
            body = {}
        if isinstance(body, dict):
            for key in ("request_id", "change_id"):
                value = body.get(key)
                if isinstance(value, (str, int)) and not isinstance(value, bool) and value:
                    entry[key] = value
        self.mutations.append(entry)

    def _forward(self, request: httpx.Request) -> httpx.Response:
        forwarded = self._inner.build_request(
            request.method,
            str(request.url),
            headers=dict(request.headers),
            content=request.read(),
        )
        return self._inner.send(forwarded)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and "/agent/tools/" in request.url.path:
            self._record_mutation(request)
            if self.lost_posts == 0:
                self.lost_posts += 1
                try:
                    committed = self._forward(request)
                    committed.close()  # 提交已完成；响应按丢失场景丢弃
                except httpx.HTTPError:
                    pass  # 转发层自身失败同样按丢失处理
                raise httpx.ReadTimeout("injected: response lost after commit", request=request)
        if request.method == "POST" and "/agent/operations/" in request.url.path:
            self.lookups += 1
        return self._forward(request)


def _tool_http(backend: dict, agent_token: str, name: str, payload: dict) -> dict:
    """测试夹具用直连 HTTP 工具调用（独立一次性状态搭建与新鲜读取，非被测路径）。"""
    resp = httpx.post(
        f"{backend['base']}/api/agent/tools/{name}",
        json=payload,
        headers={"Authorization": f"Bearer {agent_token}"},
        timeout=10,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _independent_form_with_instance(backend: dict, session_env: dict, agent_token: str, marker: str) -> dict:
    """独立一次性表单 + 新写定义实例（不依赖种子 ID/顺序/其他测试的结果）。"""
    owner_headers = {"Authorization": f"Bearer {session_env['browser_token']}"}
    form_create = httpx.post(
        f"{backend['base']}/api/projects/{backend['project_id']}/forms",
        json={"name": f"恢复独立表单 {marker}", "code": f"RCV_{marker}_FORM"},
        headers=owner_headers,
        timeout=10,
    )
    assert form_create.status_code == 201, form_create.text
    form_id = form_create.json()["id"]

    fp = _tool_http(backend, agent_token, "crf_list_projects", {})["project_fingerprint"]
    added = _tool_http(
        backend,
        agent_token,
        "crf_add_form_field",
        {
            "project_id": backend["project_id"],
            "form_id": form_id,
            "source": {
                "new_definition": {
                    "variable_name": f"RCV_{marker}_DEF",
                    "label": "恢复回归字段",
                    "field_type": "文本",
                }
            },
            "instance": {},
            "expected_project_fingerprint": fp,
            "request_id": f"rcv-{marker}-setup-add-1",
        },
    )
    assert added["data"]["definition_created"] is True
    return {
        "form_id": form_id,
        "definition_id": added["data"]["definition_id"],
        "form_field_id": added["data"]["form_field_id"],
        "fingerprint": added["project_fingerprint"],
    }


def _recovery_harness(backend: dict, agent_token: str):
    """生产适配器恢复 harness：认证拉取真实生成清单 → 生产 BackendClient（注入
    传输）→ 生产 build_server（以真实清单的封闭 per-tool 输出 schema 校验）。
    返回 (server, backend_client, transport, real_manifest)。"""
    manifest_resp = httpx.get(
        f"{backend['base']}/api/agent/tools",
        headers={"Authorization": f"Bearer {agent_token}"},
        timeout=10,
    )
    assert manifest_resp.status_code == 200, manifest_resp.text
    real_manifest = manifest_resp.json()
    assert real_manifest.get("contract_version"), "认证清单缺少契约版本"
    # 区别于 conftest 静态夹具（data 是宽松 object）：生成清单的 data 是封闭 per-tool DTO
    update_tool = next(t for t in real_manifest["tools"] if t["name"] == "crf_update_form_field_instance")
    data_def = update_tool["outputSchema"]["$defs"]["AgentWriteData"]
    assert data_def.get("additionalProperties") is False, "生成清单的 data 必须是封闭 schema"

    inner = httpx.Client(trust_env=False, timeout=10)
    injection = _LostFirstMutatingPost(inner)
    # BackendClient.transport 形参是 httpx.Client；注入传输挂在该客户端之下
    http_client = httpx.Client(transport=injection, trust_env=False)
    from agent_bridge.client import BackendClient

    backend_client = BackendClient(f"{backend['base']}/api", agent_token, transport=http_client)
    from agent_bridge.server import build_server

    server = build_server(backend_client, real_manifest)
    return server, backend_client, injection, real_manifest


def test_local_write_recovery_returns_real_stored_envelope(backend, session_env):
    """I1（本地写）：真实提交后仅注入一次丢失响应，生产适配器经至多一次固定结果
    查询恢复真实存储信封，并由真实生成清单的封闭输出 schema 校验。

    边界说明：本测试驱动官方 MCP SDK 低层 Server 请求处理器（in-process harness，
    复用 tests/test_server.py::_invoke_call_tool）+ 生产 BackendClient/HTTP 传输，
    不是 stdio 子进程；进程级 stdio 回路已由 test_full_ten_tool_loop_over_real_stdio
    单独覆盖。"""
    import anyio
    import jsonschema

    from test_server import _invoke_call_tool

    pid = backend["project_id"]
    agent_token = session_env["agent_token"]
    state = _independent_form_with_instance(backend, session_env, agent_token, "UPD")

    server, _backend_client, transport, real_manifest = _recovery_harness(backend, agent_token)
    output_schema = next(
        t["outputSchema"] for t in real_manifest["tools"] if t["name"] == "crf_update_form_field_instance"
    )
    arguments = {
        "project_id": pid,
        "form_field_id": state["form_field_id"],
        "patch": {"help_text": "恢复回归帮助"},
        "expected_project_fingerprint": state["fingerprint"],
        "request_id": "rcv-upd-recover-1",
    }

    async def _run():
        return await _invoke_call_tool(server, "crf_update_form_field_instance", arguments)

    result = anyio.run(_run)

    # 首个（被丢失响应的）POST 已真实提交；适配器恰好做了一次固定结果查询
    assert transport.lost_posts == 1
    assert transport.lookups == 1
    assert result.isError is False, _first_text(result)[:300]
    recovered = json.loads(_first_text(result))
    assert result.structuredContent == recovered  # JSON 文本与结构化双输出一致
    # 真实存储信封：封闭 data 无指纹键，指纹只在信封顶层且与提交后项目状态一致
    assert "project_fingerprint" not in recovered["data"]
    assert recovered["data"]["form_field_id"] == state["form_field_id"]
    assert recovered["data"].get("replay") is None  # 原始首次结果（非重放标记）
    jsonschema.Draft202012Validator(output_schema).validate(recovered)
    fresh = _tool_http(backend, agent_token, "crf_list_projects", {})
    assert fresh["project_fingerprint"] == recovered["project_fingerprint"]

    # 身份不变、恰好一次写入：同 request_id 正常重放返回原结果（不再触发查询）
    async def _run_replay():
        return await _invoke_call_tool(server, "crf_update_form_field_instance", arguments)

    replay_result = anyio.run(_run_replay)
    assert replay_result.isError is False, _first_text(replay_result)[:300]
    replay_payload = json.loads(_first_text(replay_result))
    assert replay_payload["data"]["replay"] is True
    assert replay_payload["data"]["form_field_id"] == state["form_field_id"]
    assert transport.lookups == 1  # 重放路径不产生新的固定查询
    # G2：完整派发记账——恰好一次原始 update + 恰好一次同身份显式重放（共两次 POST）；
    # lost_posts 只计注入丢失；固定结果查询走 /agent/operations/，不进入该记账
    assert transport.mutations == [
        {"tool": "crf_update_form_field_instance", "request_id": "rcv-upd-recover-1"},
        {"tool": "crf_update_form_field_instance", "request_id": "rcv-upd-recover-1"},
    ]
    assert transport.lost_posts == 1


def test_preview_recovery_preserved_after_apply(backend, session_env):
    """I1（共享预览）：预览提案的丢失响应恢复 + 应用后存储预览结果保持不变。"""
    import anyio
    import jsonschema

    from test_server import _invoke_call_tool

    pid = backend["project_id"]
    agent_token = session_env["agent_token"]
    owner_headers = {"Authorization": f"Bearer {session_env['browser_token']}"}
    state = _independent_form_with_instance(backend, session_env, agent_token, "PRV")

    server, backend_client, transport, real_manifest = _recovery_harness(backend, agent_token)
    preview_schema = next(
        t["outputSchema"] for t in real_manifest["tools"] if t["name"] == "crf_preview_shared_definition_change"
    )
    preview_args = {
        "project_id": pid,
        "definition_id": state["definition_id"],
        "patch": {"label": "恢复预览共享标签"},
        "expected_project_fingerprint": state["fingerprint"],
        "request_id": "rcv-prev-recover-1",
    }

    async def _run_preview():
        return await _invoke_call_tool(server, "crf_preview_shared_definition_change", preview_args)

    preview_result = anyio.run(_run_preview)
    assert transport.lost_posts == 1
    assert transport.lookups == 1
    assert preview_result.isError is False, _first_text(preview_result)[:300]
    recovered_preview = json.loads(_first_text(preview_result))
    jsonschema.Draft202012Validator(preview_schema).validate(recovered_preview)
    change_id = recovered_preview["data"]["change_id"]
    digest = recovered_preview["data"]["proposal_digest"]
    assert change_id and len(digest) == 64

    # 属主审批（浏览器 HTTP 边界）→ 经同一 harness 正常应用一次
    approve = httpx.post(
        f"{backend['base']}/api/projects/{pid}/agent-access/changes/{change_id}/approve",
        json={"proposal_digest": digest},
        headers=owner_headers,
        timeout=10,
    )
    assert approve.status_code == 204, approve.text

    async def _run_apply():
        return await _invoke_call_tool(
            server, "crf_apply_shared_definition_change", {"project_id": pid, "change_id": change_id}
        )

    apply_result = anyio.run(_run_apply)
    assert apply_result.isError is False, _first_text(apply_result)[:300]
    applied = json.loads(_first_text(apply_result))
    assert applied["data"]["applied"] is True
    assert transport.lookups == 1  # 应用走 change_id 身份，不消耗 request_id 查询

    # 属主详情显示持久化应用证据；而预览 request_id 的存储结果在应用后原样保留
    detail = httpx.get(
        f"{backend['base']}/api/projects/{pid}/agent-access/changes/{change_id}",
        headers=owner_headers,
        timeout=10,
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["applied"] is True
    assert detail.json()["approval_state"] == "approved"

    preserved = backend_client.lookup_operation("crf_preview_shared_definition_change", preview_args)
    assert preserved == recovered_preview  # 应用不改写预览的存储结果（含应用前指纹）
    jsonschema.Draft202012Validator(preview_schema).validate(preserved)
    fresh_fp = _tool_http(backend, agent_token, "crf_list_projects", {})["project_fingerprint"]
    assert fresh_fp != preserved["project_fingerprint"]  # 内容已前进；保留的是历史预览信封
    assert transport.lookups == 2  # 合计恰好两次固定查询（恢复一次 + 保留验证一次）
    # G2：恰好一次原始 preview，随后恰好一次使用恢复 change_id 的已审批应用；
    # 属主详情读取与 /agent/operations/ 固定查询都不进入变更记账
    assert transport.mutations == [
        {"tool": "crf_preview_shared_definition_change", "request_id": "rcv-prev-recover-1"},
        {"tool": "crf_apply_shared_definition_change", "change_id": change_id},
    ]
