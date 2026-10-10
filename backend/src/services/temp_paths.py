"""Word 导入 / 截图共享的临时目录单一来源（design.md D2）。

叶子模块：只定义常量，不得导入任何服务模块。
"""

from pathlib import Path

# 绝对路径、与工作目录无关；解析到 <repo>/backend/uploads/docx_temp。
# 仅允许被 DocxImportService.TEMP_DIR 与 DocxScreenshotService.BASE_DIR 两处
# 类属性赋值引用；其余运行时代码一律读类属性，保证测试重定向不被绕过。
DOCX_TEMP_DIR = str(Path(__file__).resolve().parent.parent.parent / "uploads" / "docx_temp")
