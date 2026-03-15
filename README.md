# CRF 编辑器

## 项目介绍

CRF（Case Report Form，病例报告表）编辑器是一个用于临床研究的表单设计和管理工具。系统支持创建、编辑和管理临床研究项目中的各类表单，并能将表单导出为标准的 Word 文档格式。

### 主要功能

- **项目管理**：创建和管理临床研究项目，包括试验名称、方案编号、版本信息等
- **访视管理**：定义和管理研究访视流程，支持访视序列和表单关联
- **表单设计**：可视化表单设计器，支持多种字段类型（文本、数值、日期、单选、多选等）
- **字段库**：统一管理字段定义，支持字段复用和标准化
- **代码列表**：管理选项列表和编码字典
- **单位管理**：统一管理测量单位和符号
- **Word 导出**：将表单导出为符合规范的 Word 文档，包含封面、目录、访视分布图和表单内容

## 技术架构

### 技术栈

- **后端框架**：FastAPI + Uvicorn
- **数据库**：SQLAlchemy ORM + SQLite
- **数据校验**：Pydantic v2
- **配置管理**：PyYAML
- **文档导出**：python-docx
- **测试框架**：pytest + hypothesis

### 项目结构

```
CRF-Editor/
├── src/
│   ├── models/          # 数据模型层（SQLAlchemy ORM）
│   ├── repositories/    # 数据访问层
│   ├── services/        # 业务逻辑层
│   │   └── export_service.py  # Word 导出服务
│   ├── routers/         # API 路由层（FastAPI）
│   │   ├── projects.py  # 项目接口
│   │   ├── visits.py    # 访视接口
│   │   ├── forms.py     # 表单接口
│   │   ├── fields.py    # 字段接口
│   │   ├── codelists.py # 代码列表接口
│   │   ├── units.py     # 单位接口
│   │   └── export.py    # 导出接口
│   ├── schemas/         # 请求/响应数据结构（Pydantic）
│   ├── config.py        # 配置加载模块
│   └── database.py      # 数据库 Session 管理
├── static/              # 前端静态文件
├── uploads/             # 上传文件目录（运行时生成）
├── config.yaml          # 应用配置文件（可选）
├── requirements.txt     # 项目依赖
└── main.py              # FastAPI 应用入口
```

## 安装教程

### 环境要求

- Python 3.10 或更高版本

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

3. 安装依赖

```bash
pip install -r requirements.txt
```

4. （可选）自定义配置

复制并编辑 `config.yaml`，可配置数据库路径、上传目录、服务端口等：

```yaml
database:
  path: crf_editor.db
storage:
  upload_path: uploads
server:
  host: 0.0.0.0
  port: 8000
```

## 使用说明

### 启动服务

```bash
python main.py
```

服务启动后访问 `http://localhost:8000` 打开 Web 界面，API 文档见 `http://localhost:8000/docs`。

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
