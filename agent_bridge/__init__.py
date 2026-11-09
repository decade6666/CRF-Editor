"""CRF Editor MCP 适配器（stdio）。

独立的低依赖适配器：仅转发十个白名单业务命令到已认证的后端
agent API；绝不打开 SQLite、导入后端应用、执行 SQL、接受任意
HTTP 目标或调用 LLM。主机环境变量提供 API 基址与专用凭据。
"""

__version__ = "1.0.0"
