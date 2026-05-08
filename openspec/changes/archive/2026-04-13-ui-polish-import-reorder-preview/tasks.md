# Tasks: UI 优化、导入重复处理、拖拽排序修复与预览重构

## R2: 项目导入去重修复（优先级最高）

- [x] 2.1 修复 database.py form_field 迁移逻辑：检测 sort_order 列，回填到 order_index，移除或解除 NOT NULL 约束；删除行 274-280 的死代码分支
- [x] 2.2 改进 main.py IntegrityError handler：增加 NOT NULL 失败检测分支，返回更准确的错误提示
- [x] 2.3 手动验证：启动后端，导出项目 → 导入 → 确认成功创建命名正确的新项目

## R1: 侧边栏配色加深

- [x] 1.1 修改 main.css 亮色模式 sidebar 变量：--color-sidebar-bg 改为 var(--indigo-900)，调整 item/hover/active/border 透明度
- [x] 1.2 确认暗色模式无需额外修改（--indigo-900 已在 dark 中定义为 #18365a）

## R3: 字段排序修复

- [x] 3.1 重构 FieldsTab.vue updateOrder 函数：从 api.put 全量更新改为 api.post reorder 端点，参照 FormDesignerTab.vue updateFormOrder 模式
- [x] 3.2 修正 el-input-number 的 :max 绑定为 fields.value.length，搜索过滤时禁用手动序号修改

## R4: 模板导入预览弹窗重构

- [x] 4.1 修改 TemplatePreviewDialog.vue 布局：弹窗宽度改为 960px，移除 selectionMode 切换，改为左右分栏 flex 布局
- [x] 4.2 实现左侧预览面板：复用 SimulatedCRFForm，传入 computed filteredFields（基于 selectedIds 过滤），独立滚动
- [x] 4.3 实现右侧字段勾选面板：checkbox list + 全选/取消全选按钮，默认全选，独立滚动
- [x] 4.4 调整导入按钮逻辑：始终显示"导入选中字段"，全选时不传 field_ids（导入完整表单），部分选中时传 field_ids 数组
