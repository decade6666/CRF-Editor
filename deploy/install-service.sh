#!/usr/bin/env bash
# 安装 / 卸载 CRF Editor 生产 systemd 服务（后台运行 + 开机自启 + 崩溃自动重启）
# 用法：
#   sudo bash deploy/install-service.sh            # 安装（默认）
#   sudo bash deploy/install-service.sh uninstall  # 卸载（保留数据与配置）
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT=/etc/systemd/system/crf-editor.service
ENV_DIR=/etc/crf-editor
ENV_FILE="$ENV_DIR/crf-editor.env"
ENV_EXAMPLE="$APP_DIR/deploy/crf-editor.env.example"
UNIT_TEMPLATE="$APP_DIR/deploy/crf-editor.service.template"
SERVICE_NAME=crf-editor
PLACEHOLDER_SECRET="__GENERATED_SECRET__"
PLACEHOLDER_BOOTSTRAP="change-this-before-production"

log() { printf '[crf-editor] %s\n' "$*"; }
die() { printf '[crf-editor] 错误: %s\n' "$*" >&2; exit 1; }

require_root() {
    [[ "$(id -u)" -eq 0 ]] || die "需要 root 权限，请用 sudo 运行"
    command -v systemctl >/dev/null 2>&1 || die "未找到 systemctl，本方案仅支持 systemd 发行版"
}

verify_python() {
    local py="$1"
    "$py" -c "import uvicorn, fastapi, passlib, fitz" >/dev/null 2>&1
}

pick_python() {
    if [[ -x "$APP_DIR/backend/.venv-linux/bin/python" ]]; then
        echo "$APP_DIR/backend/.venv-linux/bin/python"
    elif [[ -x "$APP_DIR/.venv/bin/python" ]]; then
        echo "$APP_DIR/.venv/bin/python"
    fi
}

ensure_python() {
    local py
    py="$(pick_python || true)"
    if [[ -n "$py" ]] && verify_python "$py"; then
        echo "$py"
        return
    fi
    log "未找到可用虚拟环境或依赖不完整，正在创建 backend/.venv-linux ..."
    command -v python3 >/dev/null 2>&1 || die "未找到 python3"
    python3 -m venv "$APP_DIR/backend/.venv-linux"
    py="$APP_DIR/backend/.venv-linux/bin/python"
    "$py" -m pip install -r "$APP_DIR/backend/requirements.txt"
    verify_python "$py" || die "依赖安装后仍不完整，请检查 backend/requirements.txt"
    echo "$py"
}

generate_env_file() {
    local secret
    secret="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
    mkdir -p "$ENV_DIR"
    chmod 700 "$ENV_DIR"
    sed -e "s/${PLACEHOLDER_SECRET}/${secret}/" "$ENV_EXAMPLE" > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log "已生成 $ENV_FILE（密钥已自动填充）"
    die "请编辑 $ENV_FILE 设置 CRF_ADMIN_BOOTSTRAP_PASSWORD 后重新运行本脚本"
}

check_env_file() {
    [[ -f "$ENV_FILE" ]] || generate_env_file
    if grep -q "$PLACEHOLDER_BOOTSTRAP" "$ENV_FILE"; then
        die "请先编辑 $ENV_FILE 设置 CRF_ADMIN_BOOTSTRAP_PASSWORD（生产管理员初始密码），再重新运行本脚本"
    fi
    if grep -q "$PLACEHOLDER_SECRET" "$ENV_FILE"; then
        die "$ENV_FILE 中 CRF_AUTH_SECRET_KEY 仍是占位符，请填入随机长密钥后重新运行"
    fi
    if ! grep -q '^CRF_ENV=production' "$ENV_FILE"; then
        log "警告: $ENV_FILE 未设置 CRF_ENV=production，服务将以开发模式运行（不启用生产安全收敛）"
    fi
}

install_service() {
    local py unit
    require_root
    py="$(ensure_python)"
    check_env_file
    if [[ ! -f "$APP_DIR/frontend/dist/index.html" ]]; then
        log "警告: 未找到 frontend/dist/index.html，Web 页面将不可用；请先执行 cd frontend && npm run build"
    fi
    sed -e "s#__APP_DIR__#${APP_DIR}#g" -e "s#__PYTHON_BIN__#${py}#g" \
        "$UNIT_TEMPLATE" > "$UNIT.new"
    mv "$UNIT.new" "$UNIT"
    systemctl daemon-reload
    systemctl enable --now "$SERVICE_NAME"
    log "已启用并启动 $SERVICE_NAME："
    systemctl --no-pager --full status "$SERVICE_NAME"
    log "查看实时日志: journalctl -u $SERVICE_NAME -f"
    log "如之前用 nohup / python main.py 手动启动过实例，请先停掉，否则 ${SERVICE_NAME} 会因端口占用反复重启"
}

uninstall_service() {
    require_root
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl disable --now "$SERVICE_NAME"
    fi
    rm -f "$UNIT"
    systemctl daemon-reload
    log "已停止并删除 $SERVICE_NAME"
    log "以下内容保留未删除（数据与配置）:"
    log "  - $ENV_DIR/（环境变量，含生产密钥）"
    log "  - $APP_DIR/database/（SQLite 数据库）"
    log "  - $APP_DIR/uploads/（项目 Logo 等上传文件）"
    log "  - $APP_DIR/config.yaml（若存在）"
}

cmd="${1:-install}"
case "$cmd" in
    install) install_service ;;
    uninstall) uninstall_service ;;
    *) die "未知子命令: $cmd（支持 install / uninstall）" ;;
esac
