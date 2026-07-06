# 修复 AI 测试连接不跟随 307 重定向的假阴性

## Goal

修复「AI 复核配置 → 测试连接」在目标 API 返回 307 重定向时误报 `连接失败: AI调用失败（OpenAI和Anthropic格式均不通）` 的假阴性，使测试连接与真实复核路径行为一致，跟随重定向后能正确判定连通。

用户价值：中转型 OpenAI/Anthropic 端点（如 `https://cch.decadej.com`）配置后能通过测试连接，不再因路径规范化重定向被误判为不可用。

## Background

- 复现日志：`url=https://cch.decadej.com model=gpt-5.4`，OpenAI 与 Anthropic 两种格式请求均返回 `status=307`，随后判定两格式均失败。
- httpx 0.28.1 默认 `follow_redirects=False`。307（Temporary Redirect）保留 POST 方法与请求体；同源重定向时 httpx 保留 `Authorization` 头。
- 用户填写的 URL 缺 `/v1`，拼接出 `https://cch.decadej.com/chat/completions`，中转服务用 307 重定向到规范路径（如 `/v1/chat/completions`）。跟随该重定向即可连通。

## Confirmed Facts (代码证据)

- `backend/src/services/ai_review_service.py`
  - `_call_llm_openai`（`:176`）与 `_call_llm_anthropic`（`:223`）在 `client is None` 时创建本地 `httpx.AsyncClient(..., follow_redirects=False)`。
  - `test_ai_connection`（`:348`）以 `client=None` 调用上述两个 helper → 走本地 client → 不跟随 307 → `raise_for_status()` 抛 `HTTPStatusError` → 两格式均判失败（`:387` 返回失败）。
  - 真实复核路径 `review_forms`（`:329`）使用共享 `httpx.AsyncClient(..., follow_redirects=True)` 并作为 `client` 传入 helper → 会跟随 307。
  - **缺陷本质**：两条路径 `follow_redirects` 行为不一致，测试连接是真实复核的假阴性。
- `backend/src/routers/settings.py:265` 调用 `test_ai_connection`；URL 已过 `is_safe_url` 校验（`:257`）。
- 测试环境：`pytest-asyncio 1.3.0` 已装（`pytest.ini` 未配 `asyncio_mode`）；`respx` 未装；httpx 自带 `MockTransport` 可用。当前 `backend/tests/` 无 AI 服务测试文件。

## Requirements

- R1：将 `_call_llm_openai` 与 `_call_llm_anthropic` 中 `client is None` 分支的本地 client 改为 `follow_redirects=True`，与真实复核路径一致。
- R2：不改变已由 `review_forms` 传入的共享 client 行为（其已为 `True`）。
- R3：不放宽 URL 安全校验（`is_safe_url` 仍在路由层生效）；不引入新的运行时依赖。
- R4：新增回归测试，覆盖 307→200 场景，证明 `test_ai_connection` 能跟随重定向并返回成功；使用 `asyncio.run()` + `httpx.MockTransport`，不依赖 `asyncio_mode` 配置或 `respx`。
- R5（307 修复后暴露的相邻缺陷）：`POST /settings/ai/test`（`routers/settings.py:231`）必须像 `PUT /settings`（`:192-197`）一样处理脱敏 key 回传——当 `payload.ai_api_key == mask_secret(cfg.api_key)` 时，改用真实存储 `cfg.api_key`，避免前端回传脱敏占位 `*******` 导致 401。证据：save+reload 后测试连接日志 `key=*******`、两格式均 401（重定向已跟随，纯认证失败）。

## Out of Scope

- URL 自动补全 `/v1` / 去多余斜杠等规范化（用户已否决，保留为后续可选项）。
- 端到端浏览器验证 UI 弹窗文案。
- 变更日志输出格式（当前 307 已在日志可见，无需改动）。

## Acceptance Criteria

- [x] AC1：`ai_review_service.py:176`/`:223` 两处 `client is None` 分支本地 client 已为 `follow_redirects=True`；`review_forms:329` 共享 client 保持 `True`。
- [x] AC2：`tests/test_ai_review_service.py` 覆盖 OpenAI 307→200 与 Anthropic 回退后 307→200，`test_ai_connection` 返回 `ok=True` 且 `detected_format` 分别为 `openai`/`anthropic`。
- [x] AC3：`test_local_client_uses_follow_redirects_true` 断言本地 client 构造 `follow_redirects=True`（防回退）。
- [x] AC4：`python3 -m pytest tests/test_ai_review_service.py` 3 passed；全量 `python3 -m pytest` 562 passed + 4 xfailed，无新增依赖、无回归。
- [x] AC5：`test_ai`（`settings.py:242-243`）在传入 key 等于 `mask_secret(存储 key)` 时还原为真实 `cfg.api_key`；`tests/test_settings_ai_test.py` 两用例（脱敏占位还原 / 新输入 key 不被覆盖）通过。全量 `python3 -m pytest` 564 passed + 4 xfailed。

## Validation Commands

```bash
cd backend && python -m pytest tests/test_ai_review_service.py -q
cd backend && python -m pytest -q
```

## Risky Files / Rollback

- 唯一改动源文件：`backend/src/services/ai_review_service.py`（两行 `follow_redirects` + 无逻辑分支变化），回退成本极低。
- 新增测试：`backend/tests/test_ai_review_service.py`。
