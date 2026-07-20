# 为仓库添加 gitleaks 密钥扫描

## Goal

为 CRF-Editor 仓库引入 gitleaks 密钥泄露扫描,防止真实密钥被误提交;参考 `~/github/ClaudeCode.md` 的 CI 做法,并经 Codex + Antigravity 交叉审查后按建议加固 allowlist 与 action pin。

## Requirements

1. 新增 GitHub Actions workflow `.github/workflows/gitleaks.yml`:
   - 触发: `pull_request`、`push`、`workflow_dispatch`、`schedule`(每日 4:00 UTC)
   - `permissions`: `contents: read` + `pull-requests: write`(gitleaks-action 默认 PR 评论需要)
   - 步骤: 全历史 checkout(`fetch-depth: 0`) → `gitleaks/gitleaks-action`
   - **action pin 到不可变 SHA**(供应链加固):
     - `actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd` # v5.0.1
     - `gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` # v3.0.0
   - env: `GITHUB_TOKEN`;`GITLEAKS_LICENSE` 仅组织账号需要(本仓库为个人账号 `decade6666`,可留空)
2. 新增仓库根目录 `.gitleaks.toml`:
   - `[extend] useDefault = true`
   - 使用现代 `[[allowlists]]` 数组语法(非已弃用的单表 `[allowlist]`)
   - **禁止**整目录路径白名单(`backend/tests/`、`frontend/tests/`、`.trellis/spec/`、`openspec/` 均不得整目录放行)
   - 仅放行:
     - 占位符示例文件:`.env.example`、`config.yaml.example`
     - 精确锚定的占位符字符串(`^...$`):CI/文档/测试中的假密码与截断 JWT 示例
3. 不改动应用代码、既有 CI 测试 job。
4. 轻量任务:PRD-only。

## Acceptance Criteria

- [x] `.github/workflows/gitleaks.yml` 存在且 YAML 可解析;action 已 pin 到 SHA
- [x] `.gitleaks.toml` 使用 `[[allowlists]]` + 锚定 regexes,无整目录白名单
- [x] 本地 dry-run 全历史(716 commits) 0 泄露
- [x] 故意插入假 AWS key 可被 detect 命中
- [x] Codex + Antigravity 交叉审查完成,建议已落地
- [x] 未修改业务代码与既有 CI 测试 job

## Notes

- 参考源:`/root/github/ClaudeCode.md/.github/workflows/gitleaks.yml`
- 交叉审查共识核心问题:整目录 allowlist 会让真实密钥漏检 → 已收窄为精确字符串
- checkout 主版本已升到 v5.0.1(官方存在 v6/v7;agy 曾误判 v6 虚构;Codex 关于 Node 20 退役的建议部分采纳——升 v5 已避开 Node 20)
- `.gitignore` 追加 `gitleaks-report*.json` / `gitleaks-report*.sarif`
- 验证:
  - `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/gitleaks.yml')); print('YAML ok')"`
  - `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect -s /repo -c /repo/.gitleaks.toml --no-banner` → `no leaks found`
