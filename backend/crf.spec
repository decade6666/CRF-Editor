# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all
import os

block_cipher = None

# 整体收集所有依赖包，不遗漏任何子模块/数据文件
datas_extra, binaries_extra, hiddenimports_extra = [], [], []
for pkg in (
    'pydantic', 'pydantic_core',
    'fastapi', 'starlette',
    'uvicorn', 'anyio',
    'sqlalchemy',
    'lxml',
    'docx',
    'PIL',          # pillow
    'pystray',
    'yaml',         # pyyaml
    'h11',
    'multipart',    # python-multipart
    'click',
    'sniffio',
    'idna',
    'certifi',
    'charset_normalizer',
    'typing_extensions',
    'annotated_types',
):
    try:
        d, b, h = collect_all(pkg)
        datas_extra += d; binaries_extra += b; hiddenimports_extra += h
    except Exception:
        pass  # 包不存在时跳过，不中断打包

# Windows 系统运行库（确保在干净机器上也能跑）
_sys32 = 'C:\\Windows\\System32'
_vc_dlls = [
    'vcruntime140.dll',
    'vcruntime140_1.dll',
    'vcruntime140_threads.dll',
    'msvcp140.dll',
    'msvcp140_1.dll',
    'msvcp140_2.dll',
]
vc_binaries = [
    (os.path.join(_sys32, dll), '.')
    for dll in _vc_dlls
    if os.path.exists(os.path.join(_sys32, dll))
]

a = Analysis(
    ['app_launcher.py'],
    pathex=['.'],
    binaries=binaries_extra + vc_binaries,
    datas=[
        ('../frontend/dist', 'frontend_dist'),
        ('config.yaml', '.'),
    ] + datas_extra,
    hiddenimports=hiddenimports_extra + [
        'yaml',
        'sqlalchemy.dialects.sqlite',
        'sqlalchemy.dialects.sqlite.pysqlite',
        'docx',
        'lxml',
        'lxml.etree',
        'lxml._elementpath',
        'multipart',
        'email.mime.multipart',
        'email.mime.text',
        'h11',
        'pystray',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'uvicorn.logging',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.lifespan.on',
        'anyio._backends._asyncio',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],   # 不排除任何包，全量打入
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='CRF-Editor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,      # 禁用 UPX，避免杀毒误报和兼容性问题
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='crf-editor',
)
