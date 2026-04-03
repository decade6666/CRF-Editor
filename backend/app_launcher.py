"""打包入口 - PyInstaller 专用"""
import sys
import os
import traceback
import threading
from pathlib import Path


def get_base_dir() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


def get_exe_dir() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def setup_working_dir():
    os.chdir(get_exe_dir())


def patch_static_path():
    static_dir = get_base_dir() / "frontend_dist"
    os.environ["CRF_STATIC_DIR"] = str(static_dir)


def open_browser(port: int):
    """等服务器真正就绪后再打开浏览器"""
    import webbrowser, time
    from urllib.request import urlopen
    from urllib.error import URLError
    url = f"http://127.0.0.1:{port}"
    for _ in range(30):          # 最多等 15 秒
        time.sleep(0.5)
        try:
            urlopen(url, timeout=1)
            break                # 能连上了
        except (URLError, OSError):
            continue
    webbrowser.open(url)


def make_tray_icon():
    """生成一个简单的纯色图标（不依赖外部图片文件）"""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (64, 64), color=(24, 144, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([16, 16, 48, 48], fill=(255, 255, 255))
    return img


def run_server(port: int):
    """在子线程里启动 uvicorn，不阻塞主线程"""
    try:
        # console=False 时 sys.stdout/stderr 为 None，uvicorn 日志会崩
        # 重定向到 exe 同级的 app.log，顺便保留运行日志
        log_file = open(get_exe_dir() / "app.log", "a", encoding="utf-8", buffering=1)
        if sys.stdout is None:
            sys.stdout = log_file
        if sys.stderr is None:
            sys.stderr = log_file

        import uvicorn
        from main import app
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            reload=False,
            log_config=None,   # 禁用 uvicorn 默认日志配置，避免 isatty() 崩溃
        )
    except Exception:
        import traceback
        log_path = get_exe_dir() / "server_error.log"
        with open(log_path, "w", encoding="utf-8") as f:
            traceback.print_exc(file=f)
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            f"服务器启动失败！\n错误详情：{log_path}",
            "CRF编辑器 - 服务器错误",
            0x10,
        )


def main():
    setup_working_dir()
    patch_static_path()

    base = str(get_base_dir())
    if base not in sys.path:
        sys.path.insert(0, base)

    from src.config import get_config
    config = get_config()
    port = config.server.port

    # 后台线程启动服务器
    server_thread = threading.Thread(target=run_server, args=(port,), daemon=True)
    server_thread.start()

    # 后台线程打开浏览器
    browser_thread = threading.Thread(target=open_browser, args=(port,), daemon=True)
    browser_thread.start()

    # 主线程跑托盘图标（阻塞，退出托盘即退出程序）
    import pystray

    def on_open(icon, item):
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{port}")

    def on_quit(icon, item):
        icon.stop()
        os._exit(0)

    icon = pystray.Icon(
        name="CRF编辑器",
        icon=make_tray_icon(),
        title="CRF编辑器",
        menu=pystray.Menu(
            pystray.MenuItem("打开浏览器", on_open, default=True),
            pystray.MenuItem("退出", on_quit),
        ),
    )
    icon.run()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log_path = get_exe_dir() / "error.log"
        with open(log_path, "w", encoding="utf-8") as f:
            traceback.print_exc(file=f)
        # 弹出错误对话框（无控制台时也能看到）
        import ctypes
        msg = f"启动失败！\n错误详情已写入：{log_path}"
        ctypes.windll.user32.MessageBoxW(0, msg, "CRF编辑器 - 启动错误", 0x10)
        sys.exit(1)
