"""FastAPI 应用入口"""

import logging
import re

import os

from pathlib import Path
from contextlib import asynccontextmanager
from urllib.parse import unquote

from fastapi import FastAPI, Request

from fastapi.responses import FileResponse, Response, JSONResponse

from fastapi.exceptions import RequestValidationError

from sqlalchemy.exc import IntegrityError



from src.config import get_config, is_production_env

from src.database import init_db

from src.routers import projects, visits, forms, fields, codelists, units, export, settings, import_template, import_docx

from src.routers.auth import router as auth_router

from src.routers.admin import router as admin_router

from src.services.docx_screenshot_service import DocxScreenshotService

from src.utils import is_safe_path



_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
}


# 配置应用日志：uvicorn 只管自己的 logger，src.* 的日志需要单独挂 handler

# 放在 startup 事件中，确保在 uvicorn dictConfig 之后执行

def _setup_app_logging():

    app_logger = logging.getLogger("src")

    app_logger.setLevel(logging.INFO)

    if not app_logger.handlers:

        h = logging.StreamHandler()

        h.setFormatter(logging.Formatter(

            "%(levelname)-8s %(name)s - %(message)s"

        ))

        app_logger.addHandler(h)





def _validate_app_config() -> None:

    config = get_config()
    if is_production_env():
        if not os.environ.get("CRF_AUTH_SECRET_KEY", "").strip():
            raise RuntimeError("production 环境必须通过 CRF_AUTH_SECRET_KEY 提供 auth.secret_key")
        return
    if not config.auth.secret_key:
        raise RuntimeError("config.yaml 缺少 auth.secret_key")



def _build_fastapi_kwargs() -> dict:

    if is_production_env():
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {}


@asynccontextmanager
async def lifespan(app: FastAPI):

    _setup_app_logging()

    config = get_config()

    Path(config.upload_path).mkdir(parents=True, exist_ok=True)

    init_db()

    try:

        yield

    finally:

        logger = logging.getLogger("src.main")

        try:

            result = DocxScreenshotService.cleanup_old_caches(days=0)

            logger.info(

                "应用关闭，已清理截图缓存：删除 %d 个目录，释放 %.2f MB",

                result["deleted_count"], result["freed_bytes"] / 1024 / 1024

            )

        except Exception as e:

            logger.warning("清理截图缓存失败: %s", e)


_validate_app_config()
app = FastAPI(title="CRF编辑器", lifespan=lifespan, **_build_fastapi_kwargs())



app.include_router(auth_router, prefix="/api")

app.include_router(projects.router, prefix="/api")

app.include_router(visits.router, prefix="/api")

app.include_router(forms.router, prefix="/api")

app.include_router(fields.router, prefix="/api")

app.include_router(codelists.router, prefix="/api")

app.include_router(units.router, prefix="/api")

app.include_router(export.router, prefix="/api")

app.include_router(settings.router, prefix="/api")

app.include_router(import_template.router, prefix="/api")

app.include_router(import_docx.router, prefix="/api")

app.include_router(admin_router, prefix="/api")



# 打包后由 app_launcher.py 注入 CRF_STATIC_DIR，开发时用前端构建产物目录

_static_dir = os.environ.get("CRF_STATIC_DIR", str(Path(__file__).resolve().parent.parent / "frontend" / "dist"))

_assets_dir = Path(_static_dir) / "assets"

_WINDOWS_DRIVE_PREFIX_RE = re.compile(r"^[A-Za-z]:")


def _iter_asset_path_variants(filepath: str):

    """遍历原始路径及其有限次 URL 解码结果，用于拒绝危险输入。"""

    current = filepath

    seen = set()

    for _ in range(3):

        if current in seen:

            break

        seen.add(current)

        yield current

        decoded = unquote(current)

        if decoded == current:

            break

        current = decoded


def _validate_asset_raw_path(filepath: str):

    """在拼接到 assets 根目录前，先拒绝绝对路径、点段、反斜杠和编码绕过。"""

    if not filepath:

        return False, "资源路径不能为空"

    for candidate in _iter_asset_path_variants(filepath):

        if candidate.startswith(("/", "\\")):

            return False, "资源路径不合法"

        if "\\" in candidate:

            return False, "资源路径不合法"

        if _WINDOWS_DRIVE_PREFIX_RE.match(candidate):

            return False, "资源路径不合法"

        parts = candidate.split("/")

        if any(part in ("", ".", "..") for part in parts):

            return False, "资源路径不合法"

    return True, ""





@app.get("/assets/{filepath:path}", include_in_schema=False)

async def serve_asset(filepath: str):

    """提供静态资源，添加 no-cache 头确保浏览器每次验证资源是否最新

    （Vite hash命名策略：内容不变则hash不变，没有 no-cache 时浏览器可能用启发式缓存复用旧文件）

    """

    # 防止路径穿越攻击

    safe, err = _validate_asset_raw_path(filepath)
    if not safe:
        return Response(status_code=400, content=err)
    asset_path = Path(os.path.normpath(_assets_dir / filepath)).resolve()
    safe, err = is_safe_path(str(asset_path), allowed_dirs=[str(_assets_dir)])

    if not safe:

        return Response(status_code=400, content=err)

    if not asset_path.is_file():

        return Response(status_code=404)

    return FileResponse(

        str(asset_path),

        headers={"Cache-Control": "no-cache, must-revalidate"},

    )







def _apply_security_headers(response: Response) -> Response:

    for header, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):

    try:
        response = await call_next(request)
    except Exception:
        response = JSONResponse(status_code=500, content={"detail": "内部服务器错误"})
    return _apply_security_headers(response)


@app.exception_handler(RequestValidationError)

async def validation_error_handler(request: Request, exc: RequestValidationError):

    """将 Pydantic 422 验证错误转换为可读的中文字符串"""

    errors = exc.errors()

    messages = []

    for e in errors:

        loc = " → ".join(str(x) for x in e.get("loc", []))

        msg = e.get("msg", "参数错误")

        messages.append(f"{loc}: {msg}" if loc else msg)

    detail = "；".join(messages) if messages else "请求参数无效"

    return JSONResponse(status_code=422, content={"detail": detail})





@app.exception_handler(IntegrityError)

async def integrity_error_handler(request: Request, exc: IntegrityError):

    """将数据库唯一约束冲突转换为可读的 409 错误"""

    msg = str(exc.orig).lower() if exc.orig else str(exc).lower()

    if "variable_name" in msg or "uq_project_field" in msg:

        detail = "变量名已存在，请使用其他变量名"

    elif "form" in msg and "name" in msg:

        detail = "表单名称已存在，请使用其他名称"

    elif "visit" in msg and "name" in msg:

        detail = "访视名称已存在，请使用其他名称"

    elif "visit" in msg and "sequence" in msg:

        detail = "访视序号已存在，请使用其他序号"

    elif "codelist" in msg and "name" in msg:

        detail = "字典名称已存在，请使用其他名称"

    elif "uq_form_field" in msg:

        detail = "该字段已在表单中"

    elif "not null" in msg:

        detail = "数据库结构不兼容，请重启应用执行迁移"

        return JSONResponse(status_code=500, content={"detail": detail})

    else:

        detail = "数据已存在，请检查是否重复"

    return JSONResponse(status_code=409, content={"detail": detail})





@app.exception_handler(ValueError)

async def value_error_handler(request: Request, exc: ValueError):

    """将业务参数错误转换为 400 响应。"""

    return JSONResponse(status_code=400, content={"detail": str(exc)})





# Task 4.4: 项目导入错误转换为稳定 JSON（detail + code）
from src.routers.projects import ImportError as ProjectImportError


@app.exception_handler(ProjectImportError)
async def project_import_error_handler(request: Request, exc: ProjectImportError):
    """将项目导入错误转换为稳定 JSON 响应（detail + code）"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code},
    )


# Task 4.5: 项目导出错误转换为稳定 JSON（detail + code）
from src.services.export_service import ExportError


@app.exception_handler(ExportError)
async def export_error_handler(request: Request, exc: ExportError):
    """将项目导出错误转换为稳定 JSON 响应（detail + code）"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code},
    )



@app.get("/favicon.ico", include_in_schema=False)

def favicon():

    return Response(status_code=204)





@app.get("/")

def index():

    static_dir = os.environ.get("CRF_STATIC_DIR", str(Path(__file__).resolve().parent.parent / "frontend" / "dist"))

    index_file = Path(static_dir) / "index.html"

    if index_file.exists():

        # 禁用缓存，确保每次都返回最新的index.html

        return FileResponse(

            str(index_file),

            headers={

                "Cache-Control": "no-cache, no-store, must-revalidate",

                "Pragma": "no-cache",

                "Expires": "0"

            }

        )

    return Response(content="Frontend not built. Run 'npm run build' in frontend/", status_code=404)





if __name__ == "__main__":

    import uvicorn

    # 确保从 backend/ 目录启动，避免 reload 模式下子进程日志丢失

    _backend_dir = str(Path(__file__).resolve().parent)

    os.chdir(_backend_dir)

    config = get_config()

    # 自定义日志配置：在 uvicorn 默认基础上给 root logger 加 handler，

    # 让 src.* 的应用日志也能输出到控制台

    log_config = {

        "version": 1,

        "disable_existing_loggers": False,

        "formatters": {

            "default": {

                "()": "uvicorn.logging.DefaultFormatter",

                "fmt": "%(levelprefix)s %(message)s",

                "use_colors": True,

            },

            "access": {

                "()": "uvicorn.logging.AccessFormatter",

                "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',

            },

            "app": {

                "format": "%(levelname)-8s %(name)s - %(message)s",

            },

        },

        "handlers": {

            "default": {

                "formatter": "default",

                "class": "logging.StreamHandler",

                "stream": "ext://sys.stderr",

            },

            "access": {

                "formatter": "access",

                "class": "logging.StreamHandler",

                "stream": "ext://sys.stdout",

            },

            "app": {

                "formatter": "app",

                "class": "logging.StreamHandler",

                "stream": "ext://sys.stderr",

            },

        },

        "loggers": {

            "uvicorn": {"handlers": ["default"], "level": "INFO", "propagate": False},

            "uvicorn.error": {"level": "INFO"},

            "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},

            "src": {"handlers": ["app"], "level": "INFO", "propagate": False},

        },

    }

    uvicorn.run(

        "main:app",

        host=config.server.host,

        port=config.server.port,

        reload=True,

        reload_dirs=[_backend_dir],

        log_config=log_config,

    )
