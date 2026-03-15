@echo off
chcp 65001 >nul
echo ========================================
echo  CRF-Editor - 打包脚本
echo ========================================
echo.

set VENV_PYINSTALLER=.venv\Scripts\pyinstaller.exe

:: 检查 venv 是否存在
if not exist ".venv\Scripts\python.exe" (
    echo [错误] 未找到虚拟环境 .venv，请先运行：python -m venv .venv
    pause
    exit /b 1
)

:: 检查 venv 里的 PyInstaller
if not exist "%VENV_PYINSTALLER%" (
    echo [安装] 正在安装 PyInstaller 到虚拟环境...
    .venv\Scripts\pip.exe install pyinstaller
)

:: 清理旧产物
if exist "dist\crf-editor" (
    echo [清理] 删除旧的 dist 目录...
    rmdir /s /q "dist\crf-editor"
)
if exist build (
    rmdir /s /q build
)

:: 开始打包（使用 venv 里的 pyinstaller）
echo [打包] 正在打包，请稍候...
%VENV_PYINSTALLER% crf.spec --noconfirm

if errorlevel 1 (
    echo.
    echo [失败] 打包失败，请检查上方错误信息
    pause
    exit /b 1
)

echo.
echo [完成] 打包成功！
echo 输出目录: dist\crf-editor\
echo 运行方式: 双击 dist\crf-editor\CRF-Editor.exe
echo.
pause
