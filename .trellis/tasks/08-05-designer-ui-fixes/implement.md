# Implement — 设计器 4 项交互与样式修复

## 顺序（FormDesignerTab.vue 单文件串行）

1. **R1 前端** `frontend/src/composables/formDesignerPropertyEditor.js` + `FormDesignerTab.vue`
   - 抽 `normalizeDateFormat` 并导出；`syncFieldTypeSpecificProps` 调它。
   - `currentEditorPropState` 的 `date_format` 分支走 `normalizeDateFormat`。
   - `selectField` 普通分支：`?? null` 补四键 + 拍基线前同步跑 `syncFieldTypeSpecificProps`。
   - 测试：`formDesignerPropertyEditor.runtime.test.js` 加 `normalizeDateFormat` 回归（大写/已规范/非法值三态）。
2. **R1 导入器** `backend/src/services/docx_import_service.py:472,479` + `backend/tests/test_docx_import_rules.py:172`
3. **R1 迁移** `backend/src/database.py`（新 `_migrate_normalize_date_formats` + `init_db` 注册）+ 新脚本 `backend/scripts/normalize_date_formats.py`（仿 `migrate_template_db.py`，`--dry-run`）+ backend 测试（临时库幂等用例）
4. **R2 样式** `frontend/src/styles/main.css`（token、暗色 EP 覆盖、选中行+hover 规则、`.ff-item.ff-selected` 统一）+ `CodelistsTab.vue` / `UnitsTab.vue`（勾选行 `row-class-name`）+ `themePalette.test.js`（新 token 断言）
5. **R3 备注框** `FormDesignerTab.vue`（`:1778` 60；`:5932-5948` flex/max-width/margin-right）+ `formFieldPresentation.test.js:454` 断言 60
6. **R4 点击空白** `FormDesignerTab.vue`（`returnToFormProperties` + `onDesignerBlankClick` + 两处模板绑定）+ `formDesignerFormPropertyEditor.test.js`（更新 onCanvasBlankClick 断言 + 新增 onDesignerBlankClick 排除断言）

## 验证命令

```bash
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint && npm run build
cd backend && python3 -m pytest tests -q        # 或仓库根 python3 -m pytest backend/tests -q
```
> 禁止 `npm run format`（重排 src 树污染 diff）。

## 浏览器手动验证（AC8）

- 起后端 + `npm run dev`；用 `TEST_ACCOUNTS.local.md` 账号登录。
- ① 文本→日期→切走不弹未保存；② 明暗两主题选中行可见、悬停不丢；③ 长备注框自适应+留白+省略号+tooltip；④ 各空白点回表单属性、卡片/控件不切、未保存先弹确认。

## 风险点与回滚

- `FormDesignerTab.vue` 测试多为源码断言，任何改名/改绑定都可能击穿 → 每步改完跑 `node --test tests/*.test.js`。
- 生产库迁移前先备份；`normalize_date_formats.py` 先 `--dry-run`。
- 回滚：还原代码文件；库回滚 = 备份覆盖 + 重启。

## 收尾

- 任务分支推送 + PR（自动合并规则见仓库记忆）；PR 合并后归档任务。
- 数据迁移教程已写入主计划文件 `/root/.claude/plans/1-2-3-word-4-noble-pizza.md`。
