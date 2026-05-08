# Implementation Tasks — fix-empty-word-export

## Tasks

- [x] 1.1 读取 `export_service.py`，确认 `_add_forms_content()` 早返回位置及 `_build_form_table()` 实际签名
- [x] 1.2 将 `_add_forms_content()` 中 `if not project.forms: return` 替换为 `self._build_form_table(doc, [])` + `return`，确保空表单项目仍产生第 3 张表
- [x] 1.3 确认 `export_service.py` 顶部已有 `logger = logging.getLogger(__name__)`；若无则添加 `import logging` 与 logger 定义
- [x] 1.4 将 `except Exception` 块内的 `print() + traceback.print_exc()` 替换为 `logger.exception("导出失败 project_id=%s", project_id)`
- [x] 2.1 在 `test_export_service.py` 中新增测试 `test_export_no_forms_produces_3_tables`：创建无表单项目，导出后断言 `len(doc.tables) >= 3`
- [x] 2.2 运行 `python -m pytest backend/tests/test_export_service.py backend/tests/test_export_validation.py -v`，确认全部通过
- [x] 3.1 运行完整测试套件 `python -m pytest backend/tests/ -v`，确认无回归
