#!/usr/bin/env bash
# 访视预览拆分任务内浏览器 QA harness（copy-adapt 自 archive/2026-10/10-08-designer-split/research/qa/run_qa.sh，
# 不 import 归档文件）。它只读被测树，只在 /tmp/visits-preview-qa 下落运行产物，只停止自己 setsid 起的进程组。
set -euo pipefail
umask 077

TASK_QA=/home/decade/CRF-Editor/.trellis/tasks/10-08-visits-preview-split/research/qa-visits
QA_ROOT=/tmp/visits-preview-qa
BASELINE_WT=/tmp/visits-qa-baseline
FINAL_WT=/home/decade/CRF-Editor-visits-preview-split
SEED_ROOT=/tmp/designer-split-qa
PY=/home/decade/.venvs/crf-editor/bin/python
CHROME=/home/decade/.cache/browsers/chrome-headless-shell/linux-153.0.8010.47/chrome-headless-shell-linux64/chrome-headless-shell
# 唯一的种子备注文本：baseline 与 final 必须在同一份 DB 上应用同一条 UPDATE（PLAN §Seed facts (b)）。
NOTES_FORM_CODE=GOLD_FORCE_LANDSCAPE
LABEL=${1:?Usage: bash run_qa.sh <baseline|baseline2|final>}

case "$LABEL" in
  baseline|baseline2)
    WT="$BASELINE_WT"
    ;;
  final)
    if [[ "${QA_ALLOW_FINAL:-0}" != "1" ]]; then
      printf 'final 由 lead 另行触发：拆分树 %s 仍在被其他写者修改。\n' "$FINAL_WT" >&2
      printf '待 lead 通知后，先在该树执行 npm run build，再以 QA_ALLOW_FINAL=1 bash run_qa.sh final 运行。\n' >&2
      exit 3
    fi
    WT="$FINAL_WT"
    ;;
  *)
    printf 'Unsupported QA label: %s\n' "$LABEL" >&2
    exit 2
    ;;
esac

if [[ ! -d "$WT" ]]; then
  printf 'Tree under test is missing: %s\n' "$WT" >&2
  exit 1
fi
if [[ ! -f "$WT/frontend/dist/index.html" ]]; then
  printf 'frontend/dist is missing in %s; run `npm run build` in that tree first (the backend serves dist).\n' "$WT" >&2
  exit 1
fi
if [[ ! -f "$SEED_ROOT/seed.db" || ! -f "$SEED_ROOT/secrets.env" ]]; then
  printf 'Seed database / private QA credentials are missing under %s; refusing to mint new credentials. Ask the lead.\n' "$SEED_ROOT" >&2
  exit 1
fi

RUN_DIR="$QA_ROOT/$LABEL"
PROFILE_DIR="$QA_ROOT/${LABEL}-chrome-profile-$$"
mkdir -p "$QA_ROOT" "$RUN_DIR" "$PROFILE_DIR"
chmod 700 "$QA_ROOT" "$RUN_DIR" "$PROFILE_DIR"

chmod 600 "$SEED_ROOT/secrets.env"
set -a
# 由既有归档 harness 在本地生成，含 shell-quoted URL-safe 随机密钥；不写入仓库或日志。
source "$SEED_ROOT/secrets.env"
set +a
export -n QA_USERNAME QA_PASSWORD

port_is_free() {
  local port="$1"
  ! ss -H -ltnp | awk -v suffix=":$port" '$4 ~ (suffix "$") { found=1 } END { exit !found }'
}

BACKEND_PORT=8911
CHROME_PORT=9311
while ! port_is_free "$BACKEND_PORT" || ! port_is_free "$CHROME_PORT"; do
  BACKEND_PORT=$((BACKEND_PORT + 1))
  CHROME_PORT=$((CHROME_PORT + 1))
  if (( BACKEND_PORT > 8999 || CHROME_PORT > 9399 )); then
    printf 'No free QA port pair found. Existing listeners were left untouched.\n' >&2
    exit 1
  fi
done

# 运行前记录监听表，只用于证明本 harness 未触碰任何外部进程。
ss -ltnp > "$RUN_DIR/ports-before.txt"

{
  printf 'label=%s\nworktree=%s\n' "$LABEL" "$WT"
  printf 'git_head=%s\n' "$(git -C "$WT" rev-parse HEAD 2>/dev/null || printf 'unknown')"
  printf 'git_status=\n'
  git -C "$WT" status --porcelain 2>/dev/null | sed 's/^/  /' || printf '  (not a git worktree)\n'
  printf 'dist_manifest=\n'
  find "$WT/frontend/dist" -type f -printf '  %s %P\n' | sort -k2
} > "$RUN_DIR/tree-state.txt" 2>&1

DB_PATH="$RUN_DIR/crf.db"
rm -f "$DB_PATH-wal" "$DB_PATH-shm" "$DB_PATH-journal"
cp "$SEED_ROOT/seed.db" "$DB_PATH"
mkdir -p "$RUN_DIR/uploads"

"$PY" - "$DB_PATH" "$NOTES_FORM_CODE" <<'PY'
import sqlite3
import sys

db_path, form_code = sys.argv[1], sys.argv[2]
notes = "QA 备注第一行\n第二行"
con = sqlite3.connect(db_path)
try:
    cursor = con.execute("UPDATE form SET design_notes = ? WHERE code = ?", (notes, form_code))
    if cursor.rowcount != 1:
        raise SystemExit(f"design_notes seed update touched {cursor.rowcount} rows; expected exactly 1")
    con.commit()
    value = con.execute("SELECT design_notes FROM form WHERE code = ?", (form_code,)).fetchone()[0]
    if value != notes:
        raise SystemExit("design_notes seed verification failed")
finally:
    con.close()
print(f"design_notes seeded on {form_code}")
PY
sha256sum "$DB_PATH" | awk '{print $1}' > "$RUN_DIR/crf.db.sha256"

cd "$WT/backend"

BACKEND_PID=''
CHROME_PID=''
BACKEND_PGID=''
CHROME_PGID=''
CLEANUP_FAILED=0

stop_owned_group() {
  local pid="$1" pgid="$2" name="$3"
  [[ -n "$pid" && -n "$pgid" ]] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pgid" 2>/dev/null
    set +e
    wait "$pid"
    set -e
  fi
  if pgrep -g "$pgid" >/dev/null 2>&1; then
    kill -KILL -- "-$pgid" 2>/dev/null
    printf 'Terminated remaining processes in owned %s group %s.\n' "$name" "$pgid" >&2
    if pgrep -g "$pgid" >/dev/null 2>&1; then CLEANUP_FAILED=1; fi
  fi
}

cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  set +e
  stop_owned_group "$CHROME_PID" "$CHROME_PGID" chrome
  stop_owned_group "$BACKEND_PID" "$BACKEND_PGID" backend
  ss -ltnp > "$RUN_DIR/ports-after.txt"
  if ! port_is_free "$BACKEND_PORT" || ! port_is_free "$CHROME_PORT"; then
    printf 'A selected QA port is still occupied; no foreign process was signaled.\n' >&2
    CLEANUP_FAILED=1
  fi
  if (( CLEANUP_FAILED != 0 )) && (( exit_status == 0 )); then
    exit_status=1
  fi
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

setsid env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  CRF_ENV=production \
  CRF_DATABASE_PATH="$DB_PATH" \
  CRF_STORAGE_UPLOAD_PATH="$RUN_DIR/uploads" \
  CRF_AUTH_SECRET_KEY="$CRF_AUTH_SECRET_KEY" \
  CRF_ADMIN_BOOTSTRAP_PASSWORD="$CRF_ADMIN_BOOTSTRAP_PASSWORD" \
  CRF_SERVER_HOST=127.0.0.1 \
  CRF_SERVER_PORT="$BACKEND_PORT" \
  CRF_DISABLE_BACKGROUND_JOBS=1 \
  "$PY" main.py > "$RUN_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
BACKEND_PGID=$(ps -o pgid= -p "$BACKEND_PID" | tr -d ' ')

setsid env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  -u CRF_AUTH_SECRET_KEY -u CRF_ADMIN_BOOTSTRAP_PASSWORD -u QA_PASSWORD -u QA_USERNAME \
  "$CHROME" \
  --remote-debugging-port="$CHROME_PORT" \
  --headless --no-sandbox --disable-gpu \
  --user-data-dir="$PROFILE_DIR" about:blank > "$RUN_DIR/chrome.log" 2>&1 &
CHROME_PID=$!
CHROME_PGID=$(ps -o pgid= -p "$CHROME_PID" | tr -d ' ')

cat > "$RUN_DIR/processes.json" <<EOF
{
  "label": "$LABEL",
  "worktree": "$WT",
  "backend_pid": $BACKEND_PID,
  "backend_pgid": $BACKEND_PGID,
  "backend_port": $BACKEND_PORT,
  "chrome_pid": $CHROME_PID,
  "chrome_pgid": $CHROME_PGID,
  "chrome_port": $CHROME_PORT,
  "profile_dir": "$PROFILE_DIR"
}
EOF

if [[ "$BACKEND_PID" != "$BACKEND_PGID" || "$CHROME_PID" != "$CHROME_PGID" ]]; then
  printf 'Owned process groups were not established as expected; stopping without touching other processes.\n' >&2
  exit 1
fi

ready=0
for _ in $(seq 1 80); do
  if status=$(env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    curl --noproxy '*' --max-time 1 -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:$BACKEND_PORT/api/auth/me"); then
    :
  else
    status=000
  fi
  if [[ "$status" == 401 || "$status" == 200 ]]; then
    ready=1
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then break; fi
  sleep 0.2
done
if (( ready == 0 )); then
  printf 'Backend readiness failed; inspect %s/backend.log (processes will be stopped).\n' "$RUN_DIR" >&2
  exit 1
fi

ready=0
for _ in $(seq 1 80); do
  if env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    curl --noproxy '*' --max-time 1 -fsS "http://127.0.0.1:$CHROME_PORT/json/version" >/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$CHROME_PID" 2>/dev/null; then break; fi
  sleep 0.2
done
if (( ready == 0 )); then
  printf 'Chrome DevTools readiness failed; inspect %s/chrome.log (processes will be stopped).\n' "$RUN_DIR" >&2
  exit 1
fi

printf 'Running visit-preview QA label=%s tree=%s backend_port=%s chrome_port=%s backend_pid=%s chrome_pid=%s\n' \
  "$LABEL" "$WT" "$BACKEND_PORT" "$CHROME_PORT" "$BACKEND_PID" "$CHROME_PID"

env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  -u CRF_AUTH_SECRET_KEY -u CRF_ADMIN_BOOTSTRAP_PASSWORD -u QA_PASSWORD -u QA_USERNAME \
  node "$TASK_QA/qa_driver.mjs" "$LABEL" "$BACKEND_PORT" "$CHROME_PORT" "$RUN_DIR" "$SEED_ROOT/secrets.env"

printf 'Completed label=%s; artifacts=%s\n' "$LABEL" "$RUN_DIR"
printf 'Parity (visit-preview JSON vs Word export) NOT RUN: the visit preview dialog exposes no preview-JSON export; see README.\n'
