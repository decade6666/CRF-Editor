# CRF 编辑器

[English](./README.en.md) | **中文**

## 项目介绍

CRF（Case Report Form，病例报告表）编辑器是一个用于临床研究的表单设计和管理工具。系统支持创建、编辑和管理临床研究项目中的各类表单，并能将表单导出为标准的 Word 文档格式。

### 主要功能

- **项目管理**：创建和管理临床研究项目，包括试验名称、方案编号、版本信息等
- **访视管理**：定义和管理研究访视流程，支持访视序列和表单关联；支持矩阵式批量编辑访视与表单的关联关系
- **表单设计**：可视化全屏表单设计器，支持多种字段类型（文本、数值、日期、单选、多选等）、字段拖拽排序，并可为表单添加设计备注
- **实时预览与快编**：设计器底部提供实时预览，支持双击预览字段快速编辑标签、颜色、横向显示与默认值等实例属性
- **字段库**：统一管理字段定义，支持字段复用和标准化
- **代码列表**：管理选项列表和编码字典
- **单位管理**：统一管理测量单位和符号
- **Word 导出**：将表单导出为符合规范的 Word 文档，包含封面、目录、访视分布图和表单内容；内置短时频率限制，避免重复触发导出
- **访视表单预览**：在访视管理面板中直接预览各表单的字段内容布局
- **全局模糊搜索**：项目、访视、表单、字段、代码列表五个标签页均内置搜索框，快速定位目标内容
- **暗色模式**：支持亮色 / 暗色主题一键切换

## 技术架构

### 技术栈

**后端**

- **框架**：FastAPI + Uvicorn
- **数据库**：SQLAlchemy ORM + SQLite
- **数据校验**：Pydantic v2
- **配置管理**：PyYAML
- **文档导出**：python-docx
- **测试框架**：pytest + hypothesis

**前端**

- **框架**：Vue 3 + Vite
- **组件库**：Element Plus
- **拖拽排序**：vuedraggable

### 项目结构

```
CRF-Editor/
├── config.yaml              # 应用配置文件（可选，位于项目根目录）
├── backend/
│   ├── src/
│   │   ├── models/          # 数据模型层（SQLAlchemy ORM）
│   │   ├── repositories/    # 数据访问层
│   │   ├── services/        # 业务逻辑层
│   │   │   └── export_service.py  # Word 导出服务
│   │   ├── routers/         # API 路由层（FastAPI）
│   │   │   ├── projects.py  # 项目接口
│   │   │   ├── visits.py    # 访视接口
│   │   │   ├── forms.py     # 表单接口
│   │   │   ├── fields.py    # 字段接口
│   │   │   ├── codelists.py # 代码列表接口
│   │   │   ├── units.py     # 单位接口
│   │   │   └── export.py    # 导出接口
│   │   ├── schemas/         # 请求/响应数据结构（Pydantic）
│   │   ├── config.py        # 配置加载模块
│   │   └── database.py      # 数据库 Session 管理
│   ├── requirements.txt     # Python 依赖
│   └── main.py              # FastAPI 应用入口
└── frontend/
    ├── src/
    │   ├── components/      # Vue 组件
    │   ├── composables/     # Vue composables
    │   ├── styles/          # 全局样式
    │   └── App.vue          # 根组件
    ├── package.json         # 前端依赖
    └── vite.config.js       # Vite 配置
```

## 安装教程

### 环境要求

- Python 3.10 或更高版本
- Node.js 18 或更高版本（前端开发时需要）
- Windows 系统（Word 导出功能依赖 Windows）

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/your-username/CRF-Editor.git
cd CRF-Editor
```

2. 创建虚拟环境

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate
```

3. 安装后端依赖

```bash
pip install -r backend/requirements.txt
```

4. 安装前端依赖

```bash
cd frontend
npm install
```

5. （可选）自定义配置

编辑项目根目录下的 `config.yaml`，可配置数据库路径、上传目录、服务端口等：

```yaml
database:
  path: crf_editor.db
storage:
  upload_path: uploads
server:
  host: 0.0.0.0
  port: 8888
```

## 使用说明

### 启动服务

**方式一：生产模式**（先构建前端，再启动后端）

```bash
# 1. 构建前端
cd frontend
npm run build

# 2. 启动后端（后端托管前端静态文件）
cd ../backend
python main.py
```

服务启动后访问 `http://localhost:8888` 打开 Web 界面。

**方式二：开发模式**（前后端分别启动，热更新）

```bash
# 终端 1：启动后端
cd backend
python main.py

# 终端 2：启动前端开发服务器
cd frontend
npm run dev
```

前端开发服务器启动后访问 `http://localhost:5173`，API 请求自动代理到后端 8888 端口。

API 文档见 `http://localhost:8888/docs`。

### 基本操作流程

1. **创建项目**：在项目管理界面创建新的临床研究项目
2. **定义访视**：添加研究访视节点，设置访视序列
3. **设计表单**：使用表单设计器创建 CRF 表单
4. **添加字段**：从字段库选择或创建新字段，配置字段属性
5. **关联表单**：将表单关联到相应的访视节点
6. **导出文档**：将项目导出为 Word 文档

### Word 文档导出格式

导出的 Word 文档包含以下内容：

- **封面页**：试验名称、版本号、方案编号、中心编号、筛选号等信息
- **目录**：自动生成的文档目录
- **表单访视分布图**：矩阵表格显示表单与访视的关联关系
- **表单内容**：详细的表单字段定义和控件

## 参与贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: 添加某个功能'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

本项目采用 PolyForm Strict License 1.0.0 许可证，仅限非商业用途。详见 LICENSE 文件。

## 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。
