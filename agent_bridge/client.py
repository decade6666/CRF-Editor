"""适配器 HTTP 客户端：固定同源路由、TLS 校验、禁重定向、有界响应。

绝不在工具参数/结果/日志中出现凭据；不做自动变更重试。响应体逐块
流式计数，超限立即停止读取并关闭连接；变更工具（共享应用除外）响应
超时按设计最多做一次固定结果查询（POST，携带原工具名与参数，后端按
同一身份规则绑定），无法确认时保持「结果未知」，绝不引导新建请求身份。
"""

from __future__ import annotations

import json
from typing import Optional

import httpx

ALLOWED_TOOLS = frozenset(
    {
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
)

# 有本地副作用的工具：响应丢失时结果可能已提交
MUTATING_TOOLS = frozenset(
    {
        "crf_add_form_field",
        "crf_update_form_field_instance",
        "crf_reorder_form_fields",
        "crf_preview_shared_definition_change",
        "crf_apply_shared_definition_change",
    }
)

APPLY_TOOL = "crf_apply_shared_definition_change"

# 响应超时后允许固定结果查询的工具（共享应用以 change_id 身份重试，不走 request_id 查询）
LOOKUP_TOOLS = MUTATING_TOOLS - {APPLY_TOOL}

MAX_RESPONSE_BYTES = 1024 * 1024
CONNECT_TIMEOUT_SECONDS = 5.0
READ_TIMEOUT_SECONDS = 30.0

MANIFEST_PATH = "/agent/tools"
OPERATION_RESULT_PATH = "/agent/operations/{request_id}"

# 稳定机器错误码（transport 不可重试类错误）
ERR_BACKEND_UNAVAILABLE = "BACKEND_UNAVAILABLE"
ERR_UNKNOWN_OUTCOME = "UNKNOWN_OUTCOME"
ERR_TOOL_REJECTED = "TOOL_REJECTED"
ERR_OUTPUT_INVALID = "OUTPUT_INVALID"
# 后端领域码（查询返回时为确定结论：该调用未执行）
ERR_IDENTITY_REUSED = "IDENTITY_REUSED"


class AgentClientError(Exception):
    """后端拒绝/不可达；message 为可展示原因，code 为稳定机器码。"""

    def __init__(self, message: str, code: str, status: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


class BackendClient:
    """同源、认证、有界的 agent API 客户端。"""

    def __init__(self, api_url: str, token: str, transport: Optional[httpx.Client] = None):
        self._api_url = api_url
        self._token = token
        if transport is None:
            self._client = httpx.Client(
                verify=True,
                follow_redirects=False,
                trust_env=False,  # 不读代理/netrc 环境凭据
                timeout=httpx.Timeout(connect=CONNECT_TIMEOUT_SECONDS, read=READ_TIMEOUT_SECONDS, write=10.0, pool=5.0),
            )
        else:
            self._client = transport

    def close(self) -> None:
        self._client.close()

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._token}"}

    def _read_bounded(self, response: httpx.Response) -> bytes:
        """逐块流式读取并计数；超限立即停止（不再拉取后续块）并关闭响应。

        已缓冲响应（内容型传输替身）走计数路径；真实网络响应逐块强制。
        """
        data = bytearray()
        try:
            if response.is_stream_consumed:
                content = response.content or b""
                if len(content) > MAX_RESPONSE_BYTES:
                    raise AgentClientError("后端响应超出大小上限", ERR_BACKEND_UNAVAILABLE, response.status_code)
                data.extend(content)
            else:
                for chunk in response.iter_raw():
                    if chunk:
                        data.extend(chunk)
                    if len(data) > MAX_RESPONSE_BYTES:
                        raise AgentClientError("后端响应超出大小上限", ERR_BACKEND_UNAVAILABLE, response.status_code)
        finally:
            response.close()
        return bytes(data)

    def _parse_json(self, body: bytes, status: int) -> dict:
        try:
            data = json.loads(body)
        except ValueError:
            raise AgentClientError("后端响应不是有效 JSON", ERR_BACKEND_UNAVAILABLE, status)
        if not isinstance(data, dict):
            raise AgentClientError("后端响应不是有效 JSON", ERR_BACKEND_UNAVAILABLE, status)
        return data

    def _request(self, method: str, path: str, payload: Optional[dict] = None) -> dict:
        url = self._api_url + path
        request = self._client.build_request(method, url, json=payload, headers=self._headers())
        try:
            # 流式发送/接收：读侧在 _read_bounded 内逐块计数
            response = self._client.send(request, stream=True)
        except httpx.TimeoutException:
            raise
        except httpx.ConnectError:
            raise AgentClientError("后端不可达（连接失败）", ERR_BACKEND_UNAVAILABLE)
        except httpx.HTTPError:
            raise AgentClientError("后端不可达或响应超时", ERR_BACKEND_UNAVAILABLE)
        try:
            status = response.status_code
            body = self._read_bounded(response)
        except AgentClientError:
            raise
        if status == 401:
            raise AgentClientError("凭据无效或已失效", ERR_TOOL_REJECTED, 401)
        if status >= 500:
            raise AgentClientError("后端内部错误", ERR_BACKEND_UNAVAILABLE, status)
        if status >= 400:
            data = self._parse_json_or_blank(body, status)
            detail = data.get("detail")
            message = detail if isinstance(detail, str) and detail else f"请求被拒绝（HTTP {status}）"
            raise AgentClientError(message, self._wire_code(data), status)
        return self._parse_json(body, status)

    def _parse_json_or_blank(self, body: bytes, status: int) -> dict:
        try:
            data = json.loads(body)
            return data if isinstance(data, dict) else {}
        except ValueError:
            return {}

    def _wire_code(self, data: dict) -> str:
        """后端 {detail, code} 中的稳定领域码；缺失时回落到通用拒绝码。"""
        code = data.get("code")
        return code if isinstance(code, str) and code else ERR_TOOL_REJECTED

    def fetch_manifest(self) -> dict:
        """获取后端认证清单（十工具 + 输入/输出 schema）。"""
        return self._request("GET", MANIFEST_PATH)

    def call_tool(self, name: str, arguments: dict) -> dict:
        """调用白名单工具；未知名称直接拒绝（不发请求）。

        变更工具（共享应用除外）的响应丢失（超时）→ 最多一次固定结果查询
        （携带原工具名与参数）；仍无法确认则返回 UNKNOWN_OUTCOME 并携带原
        请求身份，绝不引导用新身份重做。查询返回 IDENTITY_REUSED 属确定结论
        （该调用未执行），原样上抛；其余工具超时 → BACKEND_UNAVAILABLE。
        """
        if name not in ALLOWED_TOOLS:
            raise AgentClientError(f"未知工具: {name}", ERR_TOOL_REJECTED)
        try:
            return self._request("POST", f"/agent/tools/{name}", arguments)
        except httpx.TimeoutException:
            return self._uncertain_outcome(name, arguments)

    def _uncertain_outcome(self, name: str, arguments: dict) -> dict:
        request_id = arguments.get("request_id") if isinstance(arguments, dict) else None
        if name == APPLY_TOOL and isinstance(arguments, dict) and arguments.get("change_id") is not None:
            raise AgentClientError(
                f"变更 {arguments['change_id']} 的应用结果未知（响应超时）；"
                "请用相同 change_id 重试该工具（幂等），不要重新预览或新建提案",
                ERR_UNKNOWN_OUTCOME,
            )
        if name in LOOKUP_TOOLS and isinstance(request_id, str) and request_id:
            try:
                # 设计允许的至多一次固定结果查询（后端按同一身份规则绑定）
                return self.lookup_operation(name, arguments)
            except AgentClientError as exc:
                if exc.code == ERR_IDENTITY_REUSED:
                    # 确定结论：该 request_id 已绑定不同请求，本次调用未执行
                    raise
            except Exception:
                pass  # 查询自身失败（超时/不可达等）→ 保持结果未知
            raise AgentClientError(
                f"请求 {request_id} 结果未知（后端不可达或响应超时）；请用同一 request_id 重试，不要新建请求身份",
                ERR_UNKNOWN_OUTCOME,
            )
        raise AgentClientError("后端不可达或响应超时", ERR_BACKEND_UNAVAILABLE)

    def lookup_operation(self, name: str, arguments: dict) -> dict:
        """不确定写结果时按固定端点查询一次（携带原工具与参数）；404 → 结果未知。"""
        payload = {"tool_name": name, "arguments": arguments}
        path = OPERATION_RESULT_PATH.format(request_id=arguments["request_id"])
        try:
            return self._request("POST", path, payload)
        except AgentClientError as exc:
            if exc.status == 404:
                raise AgentClientError(
                    f"请求 {arguments['request_id']} 结果未知；请用同一 request_id 重试，不要新建",
                    ERR_UNKNOWN_OUTCOME,
                    404,
                )
            raise
