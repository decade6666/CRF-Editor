#!/bin/bash
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/backend
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY no_proxy NO_PROXY
export CRF_DISABLE_BACKGROUND_JOBS=1
exec /home/decade/.venvs/crf-editor/bin/python -m pytest "$@"
