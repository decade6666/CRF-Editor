# frontend

CRF 编辑器前端模块，基于 Vue 3 + Vite + Element Plus，提供项目管理、表单设计、导入导出与管理员相关界面。

## 模块职责
- 提供登录后的单页应用壳层与主导航
- 管理项目、访视、表单、字段、单位、代码列表等核心界面
- 提供 Word 导入对比预览、模板导入预览、数据库导入导出与 Word 导出入口
- 管理主题切换、设置弹窗、AI 连接测试与管理员入口

## 关键入口
- `src/main.js`：创建并挂载 Vue 应用
- `src/App.vue`：应用壳层，负责主流程与全局状态
- `src/composables/useApi.js`：统一 API 访问与错误处理
- `src/composables/useCRFRenderer.js`：字段渲染与预览逻辑
- `vite.config.js`：开发服务器与构建配置

## 常用命令
```bash
npm install
npm run dev
npm run build
npm run lint
npm run format
node --test tests/*.test.js
```

## 开发模式
```bash
# 终端 1：启动后端
cd ../backend
python main.py

# 终端 2：启动前端
cd ../frontend
npm run dev
```

默认访问地址：`http://localhost:5173`

- 前端 dev server：`0.0.0.0:5173`
- API 代理目标：`http://127.0.0.1:8888`

## 构建与联调
```bash
npm run build
cd ../backend
python main.py
```

前端构建后由后端托管静态资源，浏览器访问 `http://localhost:8888`。

## 测试说明
- `tests/` 使用 `node:test` 做源码级回归校验
- 现有测试主要覆盖：
  - 应用壳层与设置弹窗结构
  - 端口与代理约定
  - 设计器预览与字段属性行为
  - 导入导出反馈与排序逻辑
  - 管理员视图结构

## 相关文档
- 模块 AI 上下文：`./.claude/CLAUDE.md`
- 项目总文档：`../README.md`
- 英文文档：`../README.en.md`
