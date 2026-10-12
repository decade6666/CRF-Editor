#!/usr/bin/env bash
set -euo pipefail
umask 077

WT=/home/decade/CRF-Editor-designer-split
TASK_QA=/home/decade/CRF-Editor/.trellis/tasks/10-08-designer-split/research/qa
QA_ROOT=/tmp/designer-split-qa
PY=/home/decade/.venvs/crf-editor/bin/python
CHROME=/home/decade/.cache/browsers/chrome-headless-shell/linux-153.0.8010.47/chrome-headless-shell-linux64/chrome-headless-shell
LABEL=${1:?Usage: bash run_qa.sh <label>}

case "$LABEL" in
  baseline|baseline2|step1|step2|final)
    case "$LABEL" in
      baseline|baseline2|step1|step2|final) ;;
      *) printf 'Unsupported QA label: %s\n' "$LABEL" >&2; exit 2 ;;
    esac
    ;;
  *) printf 'Unsupported QA label: %s\n' "$LABEL" >&2; exit 2 ;;
esac

RUN_DIR="$QA_ROOT/$LABEL"
PROFILE_DIR="$QA_ROOT/${LABEL}-chrome-profile-$$"
mkdir -p "$QA_ROOT" "$RUN_DIR" "$PROFILE_DIR"
chmod 700 "$QA_ROOT" "$RUN_DIR" "$PROFILE_DIR"

if [[ ! -f "$QA_ROOT/seed.db" ]]; then
  (cd "$WT/backend" && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    "$PY" "$TASK_QA/seed_qa_db.py")
fi
if [[ ! -f "$QA_ROOT/secrets.env" ]]; then
  printf 'Missing private QA credentials under %s\n' "$QA_ROOT" >&2
  exit 1
fi
chmod 600 "$QA_ROOT/secrets.env"
set -a
# This file is generated locally by seed_qa_db.py and contains shell-quoted URL-safe secrets.
source "$QA_ROOT/secrets.env"
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

# Record the complete listener table before starting only the selected ports.
ss -ltnp > "$RUN_DIR/ports-before.txt"
DB_PATH="$RUN_DIR/crf.db"
rm -f "$DB_PATH-wal" "$DB_PATH-shm" "$DB_PATH-journal"
cp "$QA_ROOT/seed.db" "$DB_PATH"
mkdir -p "$RUN_DIR/uploads"
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

printf 'Running browser QA label=%s backend_port=%s chrome_port=%s backend_pid=%s chrome_pid=%s\n' \
  "$LABEL" "$BACKEND_PORT" "$CHROME_PORT" "$BACKEND_PID" "$CHROME_PID"

env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  -u CRF_AUTH_SECRET_KEY -u CRF_ADMIN_BOOTSTRAP_PASSWORD -u QA_PASSWORD -u QA_USERNAME \
  node "$TASK_QA/qa_driver.mjs" "$LABEL" "$BACKEND_PORT" "$CHROME_PORT" "$RUN_DIR" "$QA_ROOT/secrets.env"

# parity CLI 在 ratio<1 时退出 1，但仍把完整 JSON 报告写到 stdout；此处始终保留报告，
# 由后续断言判断（order 必须一致，且报告需与冻结基线逐字段相同），不用 --allow-mismatch 掩盖差异。
(cd "$WT/backend" && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  "$PY" scripts/compare_word_table_parity.py "$RUN_DIR/preview.json" "$RUN_DIR/export.docx") \
  > "$RUN_DIR/parity.json" 2> "$RUN_DIR/parity.stderr" || true
if [[ ! -s "$RUN_DIR/parity.json" ]]; then
  printf 'Parity report was not produced; see %s/parity.stderr.\n' "$RUN_DIR" >&2
  exit 1
fi
node --input-type=module -e '
  import fs from "node:fs";
  const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (report.form_order_matches !== true) {
    console.error("Parity form order mismatch.");
    process.exit(1);
  }
  console.log(`Parity: ${report.exact_cell_count}/${report.exact_cell_denominator} cells; order=${report.form_order_matches}; ratio=${report.exact_cell_ratio}; mismatches=${report.mismatches.length}`);
' "$RUN_DIR/parity.json"

if [[ -f /tmp/designer-split-qa/baseline/parity.json && "$RUN_DIR" != /tmp/designer-split-qa/baseline ]]; then
  node --input-type=module -e '
    import fs from "node:fs";
    import { isDeepStrictEqual } from "node:util";
    const baseline = JSON.parse(fs.readFileSync("/tmp/designer-split-qa/baseline/parity.json", "utf8"));
    const current = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!isDeepStrictEqual(baseline, current)) {
      console.error("Parity report differs from the frozen baseline; a declared difference set change needs review.");
      process.exit(1);
    }
    console.log(`Parity identical to baseline (ratio=${current.exact_cell_ratio}, mismatches=${current.mismatches.length}).`);
  ' "$RUN_DIR/parity.json"
fi

printf 'Completed label=%s; artifacts=%s\n' "$LABEL" "$RUN_DIR"
