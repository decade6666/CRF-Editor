"""官方 MCP SDK v1 低层 stdio 服务器。

- `list_tools`：返回后端认证清单（静态 schema，本地引用，无远程解析）。
- `call_tool`：封闭 schema 校验 → 白名单转发；JSON 文本 + 结构化双输出；
  错误走 `isError=True`（不吞失败、不伪造成功）。
- 凭据只在主机环境；stdout 专用于协议帧，诊断只走 stderr。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    # 以文件路径直接启动（MCP 客户端典型配置）：先提升为包导入再继续
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = "agent_bridge"

import mcp.server.stdio
import mcp.types as types
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.models import InitializationOptions

from .client import (
    ALLOWED_TOOLS,
    ERR_BACKEND_UNAVAILABLE,
    ERR_OUTPUT_INVALID,
    ERR_UNKNOWN_OUTCOME,
    AgentClientError,
    BackendClient,
)
from .config import ConfigError, load_config, log_to_stderr

ADAPTER_NAME = "crf-editor"
ADAPTER_VERSION = "1.1.0"


_LOCAL_REF_KEYWORDS = ("$ref", "$dynamicRef", "$recursiveRef")


def _schema_ref_values(schema) -> list:
    """收集 schema 文档中全部引用关键字的字符串值。"""
    refs = []

    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key in _LOCAL_REF_KEYWORDS and isinstance(value, str):
                    refs.append(value)
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(schema)
    return refs


def _local_ref_resolvable(schema: dict, ref: str) -> bool:
    """本地引用必须可解析：'#' 或 '#/a/b' 且指针在文档内存在；其余一律拒绝。

    $dynamicRef/$recursiveRef 与 $ref 同样只接受本地值（无远程解析）。
    """
    if ref == "#":
        return True
    if not ref.startswith("#/"):
        return False
    node = schema
    for raw in ref[2:].split("/"):
        part = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(node, dict):
            if part not in node:
                return False
            node = node[part]
        elif isinstance(node, list):
            try:
                node = node[int(part)]
            except (ValueError, IndexError):
                return False
        else:
            return False
    return True


def _local_schema_check(schema) -> bool:
    """清单 schema 只允许本地可解析引用（$ref/$dynamicRef/$recursiveRef），无远程解析。"""
    if not isinstance(schema, dict):
        return False
    return all(_local_ref_resolvable(schema, ref) for ref in _schema_ref_values(schema))


def _schema_format_check(schema, tool_name: str, schema_kind: str) -> None:
    """对 input/output schema 做 Draft 2020-12 元 schema 格式校验（元 schema 内置于库，无远程解析）。

    构造 validator 不等于格式校验：存在但畸形的 schema（如 {'type': 42}）必须在
    服务任何工具之前被拒绝。拒绝信息脱敏：只报工具名与 schema 键，不回显
    schema/input 值，也不携带库原始 traceback。
    """
    import jsonschema

    try:
        jsonschema.Draft202012Validator.check_schema(schema)
    except Exception:
        raise ConfigError(f"工具 {tool_name} 的 {schema_kind} 格式不合法（Draft 2020-12 元校验未通过）")


def _output_validator(output_schema):
    """构建输出 schema 的本地校验器（清单门禁已保证 dict；构建失败即配置拒绝）。"""
    try:
        import jsonschema

        return jsonschema.validators.validator_for(output_schema)(output_schema)
    except Exception as exc:
        raise ConfigError(f"工具 outputSchema 无法构建本地校验器（{exc.__class__.__name__}）")


def build_server(backend: BackendClient, manifest: dict) -> Server:
    server = Server(ADAPTER_NAME)

    tools_payload = manifest.get("tools") if isinstance(manifest, dict) else None
    if not isinstance(tools_payload, list):
        raise ConfigError("后端清单缺少工具列表")
    names = []
    for tool in tools_payload:
        if not isinstance(tool, dict) or not isinstance(tool.get("name"), str):
            raise ConfigError("后端清单工具定义无效")
        names.append(tool["name"])
    if len(set(names)) != len(names):
        duplicates = sorted({name for name in names if names.count(name) > 1})
        raise ConfigError("后端清单存在重复工具名: " + json.dumps(duplicates))
    if set(names) != set(ALLOWED_TOOLS):
        raise ConfigError("后端清单与适配器白名单不一致: " + json.dumps(sorted(set(names) ^ set(ALLOWED_TOOLS))))
    for tool in tools_payload:
        input_schema = tool.get("inputSchema")
        output_schema = tool.get("outputSchema")
        if not isinstance(input_schema, dict) or not isinstance(output_schema, dict):
            raise ConfigError(f"工具 {tool['name']} 缺少可用的 input/output schema")
        if not _local_schema_check(input_schema):
            raise ConfigError(f"工具 {tool['name']} 的 inputSchema 含非本地或不可解析引用")
        if not _local_schema_check(output_schema):
            raise ConfigError(f"工具 {tool['name']} 的 outputSchema 含非本地或不可解析引用")
        _schema_format_check(input_schema, tool["name"], "inputSchema")
        _schema_format_check(output_schema, tool["name"], "outputSchema")

    _tool_by_name = {tool["name"]: tool for tool in tools_payload}
    _output_validators = {name: _output_validator(tool["outputSchema"]) for name, tool in _tool_by_name.items()}

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name=tool["name"],
                description=tool.get("description", ""),
                inputSchema=tool["inputSchema"],
                outputSchema=tool["outputSchema"],
            )
            for tool in tools_payload
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> types.CallToolResult:
        if name not in _tool_by_name:
            return _error_result(f"未知工具: {name}", ERR_UNKNOWN_TOOL)
        try:
            result = backend.call_tool(name, arguments or {})
        except AgentClientError as exc:
            return _error_result(exc.message, exc.code)
        # SDK 对 CallToolResult 返回路径不做 outputSchema 校验（须显式验证）：
        # 成功输出必须匹配清单声明的结构，不合格即拒绝且不回显内容
        import jsonschema

        validator = _output_validators.get(name)
        if validator is None:
            return _error_result("工具缺少输出校验器", ERR_OUTPUT_INVALID)
        try:
            validator.validate(result)
        except jsonschema.ValidationError:
            return _error_result("后端输出与清单声明的结构不一致", ERR_OUTPUT_INVALID)
        except Exception:
            # 畸形校验引用等库异常：安全协议错误，不回显 traceback/schema 载荷
            return _error_result("后端输出校验失败", ERR_OUTPUT_INVALID)
        return _ok_result(result)

    return server


ERR_UNKNOWN_TOOL = "UNKNOWN_TOOL"


def _ok_result(payload: dict) -> types.CallToolResult:
    text = json.dumps(payload, ensure_ascii=False)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=text)],
        structuredContent=payload,
        isError=False,
    )


def _error_result(message: str, code: str) -> types.CallToolResult:
    payload = {"error": {"message": message, "code": code}}
    text = json.dumps(payload, ensure_ascii=False)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=text)],
        structuredContent=payload,
        isError=True,
    )


def run() -> None:
    try:
        config = load_config()
    except ConfigError as exc:
        log_to_stderr(f"[crf-editor-adapter] 配置错误: {exc}")
        raise SystemExit(2)
    backend = BackendClient(config["api_url"], config["token"])
    try:
        manifest = backend.fetch_manifest()
    except AgentClientError as exc:
        log_to_stderr(f"[crf-editor-adapter] 后端清单获取失败: {exc.message} ({exc.code})")
        raise SystemExit(3)
    try:
        server = build_server(backend, manifest)
    except ConfigError as exc:
        log_to_stderr(f"[crf-editor-adapter] 清单校验失败: {exc}")
        raise SystemExit(4)

    async def _serve() -> None:
        async with mcp.server.stdio.stdio_server() as (read, write):
            await server.run(
                read,
                write,
                InitializationOptions(
                    server_name=ADAPTER_NAME,
                    server_version=ADAPTER_VERSION,
                    capabilities=server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    ),
                ),
            )

    import anyio

    try:
        anyio.run(_serve)
    finally:
        backend.close()


if __name__ == "__main__":
    run()
