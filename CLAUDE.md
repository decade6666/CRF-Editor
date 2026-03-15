# CRF 编辑器 — 项目 AI 上下文

## 项目概述

CRF（Case Report Form）编辑器，基于 FastAPI + Vue 3 的前后端分离 Web 应用，用于临床研究表单的设计与管理。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | FastAPI + Uvicorn + SQLAlchemy ORM + SQLite + Pydantic v2 |
| 前端 | Vue 3 + Vite + Element Plus + vuedraggable |
| 导出 | python-docx（Word 文档导出，仅 Windows） |
| 测试 | pytest + hypothesis |
| 打包 | PyInstaller（桌面发行版） |

## 项目结构

```
CRF-Editor/
├── backend/
│   ├── src/
│   │   ├── models/        # SQLAlchemy ORM 模型
│   │   ├── repositories/  # 数据访问层
│   │   ├── services/      # 业务逻辑层
│   │   ├── routers/       # FastAPI 路由层
│   │   └── schemas/       # Pydantic 请求/响应结构
│   ├── requirements.txt
│   └── main.py            # 应用入口
└── frontend/
    ├── src/
    │   ├── components/    # Vue 组件
    │   ├── composables/   # Vue composables
    │   └── App.vue
    ├── package.json
    └── vite.config.js
```

## 开发启动

```bash
# 生产模式
cd frontend && npm run build
cd ../backend && python main.py   # http://localhost:8000

# 开发模式（热更新）
cd backend && python main.py      # 终端 1
cd frontend && npm run dev        # 终端 2 → http://localhost:5173
```

## .context 项目上下文

> 项目使用 `.context/` 管理开发决策上下文。

- 编码规范：`.context/prefs/coding-style.md`
- 工作流规则：`.context/prefs/workflow.md`
- 决策历史：`.context/history/commits.md`

**规则**：修改代码前必读 prefs/，做决策时按 workflow.md 规则记录日志。
