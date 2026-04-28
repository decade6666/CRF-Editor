# CRF 编辑器 — 项目 AI 上下文

> **本文档描述 FastAdmin 目标架构，是迁移目标的唯一参考。** 旧版文档可通过 `git log` 查阅。

## 1. Project Overview

CRF（Case Report Form）编辑器，用于临床研究病例报告表的设计与管理。目标架构基于 **FastAdmin**（PHP + ThinkPHP 5.1 + Bootstrap 3 + AdminLTE 2）全栈方案，采用纯 Web 部署（Nginx + PHP-FPM + MySQL），取代原有 Python/Vue 桌面混合方案。

核心能力：
- 项目级 CRF 结构管理（访视、表单、字段、代码表、单位）
- 三层字段模型：FieldDefinition（项目级字段库）→ FormField（表单级实例）→ Field（兼容旧模型）
- 访视-表单多对多矩阵编排
- 表单可视化设计器（拖拽排序）
- Word 文档导出（PHPWord）/ DOCX 导入 / AI 审查
- 代码表与单位的项目级复用

## 2. Business Domain Vocabulary

| 术语 | 英文 | 定义 |
|------|------|------|
| 项目 | Project | 一个临床试验的 CRF 设计项目，所有实体的根聚合 |
| 访视 | Visit | 临床试验中的一次受试者来访，包含一组表单 |
| 表单 | Form | 一张 CRF 页面，包含若干字段 |
| 字段定义 | FieldDefinition | 项目级字段库中的可复用字段模板，定义变量名、类型、精度、关联代码表/单位 |
| 表单字段 | FormField | 字段定义在具体表单中的实例，可覆盖标签、必填性、帮助文本、默认值 |
| 字段（旧） | Field | 旧版直接绑定表单的字段模型，向后兼容保留 |
| 日志行 | LogRow | `FormField.is_log_row=1` 且 `field_definition_id=NULL` 的特殊行，用作表单分节标记 |
| 代码表 | Codelist | 项目级枚举值集合（如性别：男/女） |
| 代码表选项 | CodelistOption | 代码表中的单个选项，含 code、decode、trailing_underscore 标记 |
| 单位 | Unit | 项目级度量单位（如 mg、kg、L） |
| 访视-表单关联 | VisitForm | 访视与表单的多对多中间表，含排序序号 |
| 引用检查 | ReferenceCheck | 删除前检查实体是否被其他实体引用（如 FieldDefinition 被 FormField 引用） |
| 复制重命名 | CopyWithRename | 复制实体时自动追加后缀避免名称冲突 |
| 批量重排序 | BatchReorder | 拖拽排序后批量更新 weigh 字段 |
| 序号压缩 | SequenceCompression | 删除中间项后重新压缩序号使其连续 |

## 3. Tech Stack Snapshot

| 层 | 技术 |
|----|------|
| 语言 | PHP 7.4+（推荐 8.0+） |
| 框架 | ThinkPHP 5.1 + FastAdmin 1.x |
| 数据库 | MySQL 5.6–8.0（InnoDB, utf8mb4） |
| 前端框架 | Bootstrap 3 + AdminLTE 2 |
| JS 模块化 | RequireJS + jQuery |
| 模板引擎 | ThinkPHP 内置模板（HTML） |
| Word 导出 | PHPWord（Composer 依赖） |
| HTTP 客户端 | Guzzle（AI 审查外部 API 调用） |
| Web 服务器 | Nginx + PHP-FPM（生产）/ PHP 内置服务器（开发） |
| 包管理 | Composer |

## 4. Target Architecture Overview

FastAdmin 采用 MVC + 公共模型层架构：

```
请求 → Nginx → public/index.php → ThinkPHP 路由
  → Controller (app/admin/controller/)     ← 继承 Backend 基类
    → Model (app/common/model/)            ← ActiveRecord ORM
    → Validate (app/admin/validate/)       ← 请求验证
    → View (app/admin/view/)               ← HTML 模板
    → JS (public/assets/js/backend/)       ← RequireJS 模块

辅助层：
  → Library (app/common/library/ | extend/) ← 跨模型业务逻辑
  → Addons (addons/)                        ← 插件扩展
  → Lang (app/admin/lang/zh-cn/)            ← 语言包
```

**路径说明**：ThinkPHP 5.1 物理目录为 `application/`，但 PHP 命名空间为 `app\`。本文档中非目录树上下文统一使用命名空间写法 `app/`。

**核心约定**：
- 所有后台 Controller 继承 `\app\common\controller\Backend`
- Model 放在 `app/common/model/`（全局共享），不放 `app/admin/model/`
- Validator 放在 `app/admin/validate/`
- 跨模型业务逻辑放在 `app/common/library/` 或 `extend/`
- JS 模块与 Controller 严格 1:1 映射
- CRUD 生成器自动产出 Controller + Model + View + JS + Lang + Menu

## 5. Directory Structure

```
CRF-Editor/                          # FastAdmin 项目根
├── application/                     # 物理目录；PHP 命名空间为 app\
│   ├── admin/
│   │   ├── controller/              # 后台控制器
│   │   │   ├── Project.php
│   │   │   ├── Visit.php
│   │   │   ├── Form.php
│   │   │   ├── Field.php
│   │   │   ├── Fielddefinition.php
│   │   │   ├── Codelist.php
│   │   │   ├── Unit.php
│   │   │   ├── Export.php           # 手写：PHPWord 导出
│   │   │   ├── Import.php           # 手写：DOCX 导入
│   │   │   ├── Aireview.php         # 手写：AI 审查
│   │   │   └── Settings.php         # 手写：系统配置
│   │   ├── model/                   # （空，模型统一在 common/model/）
│   │   ├── view/                    # 后台 HTML 模板
│   │   │   ├── project/
│   │   │   ├── visit/
│   │   │   ├── form/
│   │   │   │   ├── index.html       # 表单列表
│   │   │   │   ├── add.html
│   │   │   │   ├── edit.html
│   │   │   │   ├── design.html      # 表单设计器（手写）
│   │   │   │   └── preview.html     # 表单预览（手写）
│   │   │   ├── field/
│   │   │   ├── fielddefinition/
│   │   │   ├── codelist/
│   │   │   ├── unit/
│   │   │   └── visitform/           # 访视-表单矩阵（手写）
│   │   ├── validate/                # ThinkPHP 验证器
│   │   │   ├── Project.php
│   │   │   ├── Visit.php
│   │   │   └── ...
│   │   └── lang/
│   │       └── zh-cn/               # 中文语言包（CRUD 自动生成）
│   │           ├── project.php
│   │           └── ...
│   ├── common/
│   │   ├── controller/
│   │   │   └── Backend.php          # FastAdmin 后台基类（框架提供）
│   │   ├── model/                   # 公共模型（所有模块共享）
│   │   │   ├── Project.php
│   │   │   ├── Visit.php
│   │   │   ├── Form.php
│   │   │   ├── VisitForm.php
│   │   │   ├── Field.php
│   │   │   ├── FieldDefinition.php
│   │   │   ├── FormField.php
│   │   │   ├── Codelist.php
│   │   │   ├── CodelistOption.php
│   │   │   └── Unit.php
│   │   └── library/                 # 公共业务逻辑
│   │       ├── ExportService.php    # PHPWord 导出逻辑
│   │       ├── ImportService.php    # DOCX 导入逻辑
│   │       └── AiReviewService.php  # AI 审查 HTTP 调用
│   └── config/
│       └── database.php             # 数据库配置（prefix: 'fa_'）
├── public/
│   ├── index.php                    # 入口文件（Nginx docroot 指向此目录）
│   └── assets/
│       └── js/
│           └── backend/             # 后台 JS 模块（RequireJS）
│               ├── project.js
│               ├── visit.js
│               ├── form.js          # 含表单设计器逻辑
│               ├── field.js
│               ├── fielddefinition.js
│               ├── codelist.js
│               ├── unit.js
│               ├── visitform.js     # 访视-表单矩阵
│               └── settings.js     # 系统配置
├── addons/                          # FastAdmin 插件目录
├── extend/                          # 自定义扩展类
├── vendor/                          # Composer 依赖
├── composer.json
├── .env                             # 环境配置（数据库、API 密钥）
└── think                            # ThinkPHP CLI 入口
```

## 6. Controller Conventions

所有后台控制器继承 `\app\common\controller\Backend`，标准模板：

```php
<?php
namespace app\admin\controller;

use app\common\controller\Backend;

class Example extends Backend
{
    protected $model = null;

    public function _initialize()
    {
        parent::_initialize();
        $this->model = new \app\common\model\Example;
    }
}
```

### 标准属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `$model` | Model | null | 绑定的 ORM 模型实例，`_initialize()` 中赋值 |
| `$noNeedLogin` | array | [] | 免登录 action 列表 |
| `$noNeedRight` | array | [] | 免 RBAC 权限检查 action 列表 |
| `$dataLimit` | bool/string | false | 数据权限范围：`false`=全部, `'personal'`=仅自己, `'auth'`=按角色 |
| `$dataLimitField` | string | 'admin_id' | 数据权限字段名 |
| `$relationSearch` | bool | false | 是否启用关联模型搜索 |
| `$modelValidate` | bool/string | false | 自动验证：`true`=同名验证器, `'ValidatorClass'`=指定验证器 |
| `$searchFields` | string | 'id' | 默认搜索字段（逗号分隔） |
| `$importFile` | string | '' | 导入模板路径 |

### 标准 CRUD Action

| Action | 方法 | 用途 | 是否需要覆写 |
|--------|------|------|-------------|
| index | GET | 列表（分页+搜索） | 极少 |
| add | GET/POST | 新增表单+保存 | 经常（自定义字段处理） |
| edit | GET/POST | 编辑表单+保存 | 经常 |
| del | POST | 删除（软/硬） | 有时（引用检查） |
| multi | POST | 批量操作 | 极少 |
| recyclebin | GET | 回收站列表 | 无需（自动） |
| restore | POST | 从回收站恢复 | 无需（自动） |
| destroy | POST | 永久删除 | 无需（自动） |
| selectpage | GET | Ajax 下拉搜索 | 极少 |
| import | POST | Excel/CSV 导入 | 有时 |

### `_initialize()` 职责

1. 调用 `parent::_initialize()`
2. 实例化 `$this->model`
3. 注入视图变量（下拉选项、状态映射等）
4. 准备关联查询配置

### 覆写指南

- **add/edit**：需要处理关联数据、文件上传、自定义字段时覆写
- **del**：需要引用检查（ReferenceCheck）时覆写，检查后调用 `parent::del()`
- **index**：需要自定义查询条件、JOIN 时覆写

## 7. Model Conventions

模型统一放在 `app/common/model/`，继承 `\think\Model`：

```php
<?php
namespace app\common\model;

use think\Model;
use think\model\concern\SoftDelete;  // 仅 4 张表使用

class Example extends Model
{
    use SoftDelete;  // 仅 project/visit/form/field_definition

    protected $name = 'example';           // 表名（不含前缀）
    protected $pk = 'id';                  // 主键
    protected $autoWriteTimestamp = 'int';  // int(10) UNIX 时间戳
    protected $createTime = 'createtime';
    protected $updateTime = 'updatetime';
    protected $deleteTime = 'deletetime';  // 仅软删除表
    protected $defaultSoftDelete = null;   // NULL 表示未删除
}
```

### 关键配置

| 配置 | 值 | 说明 |
|------|-----|------|
| `$autoWriteTimestamp` | `'int'` | 自动写入 int(10) UNIX 时间戳 |
| `$defaultSoftDelete` | `null` | deletetime 为 NULL 表示未删除 |
| SoftDelete trait | 仅 4 表 | project, visit, form, field_definition |

### 关系定义

```php
// 一对多
public function visits()
{
    return $this->hasMany('Visit', 'project_id');
}

// 多对一
public function project()
{
    return $this->belongsTo('Project', 'project_id');
}

// 多对多（通过中间表）
public function forms()
{
    return $this->belongsToMany('Form', 'visit_form', 'form_id', 'visit_id');
}
```

### weigh 排序字段

8 张表使用 `weigh` 字段实现拖拽排序：fa_visit, fa_form, fa_visit_form, fa_form_field, fa_codelist, fa_codelist_option, fa_unit, fa_field_definition。

模型中需配置：`protected $insert = ['weigh' => 0];` 或在 `_initialize` 中设默认值。

### 访问器/修改器

```php
// 访问器：读取时转换
public function getStatusTextAttr($value, $data)
{
    $list = ['normal' => '正常', 'hidden' => '隐藏'];
    return $list[$data['status']] ?? '';
}

// 修改器：写入时转换
public function setBeginTimeAttr($value)
{
    return is_numeric($value) ? $value : strtotime($value);
}
```

## 8. Validator & Service Class Conventions

### 验证器（Validator）

放在 `app/admin/validate/`，继承 `\think\Validate`：

```php
<?php
namespace app\admin\validate;

use think\Validate;

class Visit extends Validate
{
    protected $rule = [
        'name'       => 'require|max:255',
        'project_id' => 'require|integer',
        'sequence'   => 'require|integer|egt:1',
    ];

    protected $message = [
        'name.require'    => '访视名称不能为空',
        'sequence.egt'    => '序号必须大于等于1',
    ];

    protected $scene = [
        'add'  => ['name', 'project_id', 'sequence'],
        'edit' => ['name', 'sequence'],
    ];
}
```

**启用方式**：Controller 设置 `$modelValidate = true`（自动匹配同名验证器）或 `$modelValidate = 'Visit'`。

### 服务/Library 类

跨模型业务逻辑放在 `app/common/library/` 或 `extend/`：

| 位置 | 适用场景 |
|------|---------|
| `app/common/library/` | 项目内公共逻辑（ExportService, ImportService, AiReviewService） |
| `extend/` | 可跨项目复用的通用工具类 |

### 分层原则

- **Controller**（薄）：接收请求、调用 Model/Service、返回响应
- **Model**（厚）：数据查询、关系、作用域、访问器/修改器
- **Service/Library**：跨模型业务逻辑（导出、导入、AI 审查）
- **Validate**：输入验证规则（独立于 Controller）

## 9. Frontend JS Module Conventions

每个 Controller 对应一个 RequireJS 模块，路径 `public/assets/js/backend/<controller>.js`：

```javascript
define(['jquery', 'bootstrap', 'backend', 'table', 'form'],
    function ($, undefined, Backend, Table, Form) {
    var Controller = {
        index: function () {
            Table.api.init({
                url: 'example/index',
                columns: [[
                    {checkbox: true},
                    {field: 'id', title: 'ID', sortable: true},
                    {field: 'name', title: __('Name')},
                    {field: 'createtime', title: __('Createtime'),
                     formatter: Table.api.formatter.datetime,
                     operate: 'RANGE', addclass: 'datetimerange'},
                    {field: 'operate', title: __('Operate'),
                     events: Table.api.events.operate,
                     formatter: Table.api.formatter.operate}
                ]]
            });
        },
        add: function () { Controller.api.bindevent(); },
        edit: function () { Controller.api.bindevent(); },
        api: {
            bindevent: function () {
                Form.api.bindevent($("form[role=form]"));
            }
        }
    };
    return Controller;
});
```

### 核心 API 模式

| 模式 | API | 用途 |
|------|-----|------|
| 表格初始化 | `Table.api.init({url, columns})` | 服务端分页 Bootstrap-table |
| 表单绑定 | `Form.api.bindevent($form)` | 自动 Ajax 提交 + 验证 |
| 弹窗对话框 | `Fast.api.open(url, title)` / `Layer.open({...})` | 模态框打开 add/edit |
| 下拉搜索 | `data-source="example/selectpage"` | Selectpage 可搜索下拉 |
| 拖拽排序 | `dragsort_url: 'example/weigh'` | 原生拖拽排序（通过 weigh 字段） |
| 通知提示 | `Toastr.success(msg)` / `Toastr.error(msg)` | 用户反馈 |
| 日期格式化 | `Table.api.formatter.datetime` | UNIX 时间戳显示 |
| 多语言 | `__('Key')` | 从语言包获取翻译 |

### 1:1 映射规则

| Controller | JS 模块路径 |
|------------|------------|
| `admin/controller/Project.php` | `public/assets/js/backend/project.js` |
| `admin/controller/Visit.php` | `public/assets/js/backend/visit.js` |
| `admin/controller/Form.php` | `public/assets/js/backend/form.js` |
| `admin/controller/Field.php` | `public/assets/js/backend/field.js` |
| `admin/controller/Fielddefinition.php` | `public/assets/js/backend/fielddefinition.js` |
| `admin/controller/Codelist.php` | `public/assets/js/backend/codelist.js` |
| `admin/controller/Unit.php` | `public/assets/js/backend/unit.js` |
| `admin/controller/Export.php` | `public/assets/js/backend/export.js` |
| `admin/controller/Import.php` | `public/assets/js/backend/import.js` |
| `admin/controller/Aireview.php` | `public/assets/js/backend/aireview.js` |
| `admin/controller/Settings.php` | `public/assets/js/backend/settings.js` |

## 10. CRUD Generator Workflow

### 前置条件

1. 表使用单一主键 `id`（int auto-increment）
2. 字段有完整注释（CRUD 生成器依赖注释生成语言包和组件映射）
3. 遵循字段后缀约定（触发自动组件绑定）

### 字段后缀约定

| 后缀 | 自动组件 | 示例 |
|------|---------|------|
| `_time` | 日期时间选择器 | `begin_time` |
| `_image` | 图片上传 | `company_logo_image` |
| `_file` | 文件上传 | `template_file` |
| `_switch` | 开关切换 | `is_active_switch` |
| `_ids` | 多选（关联 ID） | `tag_ids` |
| `_list` | 列表数据 | `option_list` |
| `_data` | JSON 数据 | `extra_data` |
| `_json` | JSON 编辑器 | `config_json` |
| `_range` | 范围选择 | `age_range` |
| `_tag` | 标签输入 | `keyword_tag` |

### 枚举注释格式

字段注释中的枚举格式会自动生成语言包和筛选 Tab：

```sql
`status` enum('normal','hidden') NOT NULL DEFAULT 'normal' COMMENT '状态:normal=正常,hidden=隐藏'
`field_type` varchar(50) NOT NULL COMMENT '字段类型:text=文本,number=数值,date=日期,choice=选择'
```

### 生成命令

```bash
# 基本生成
php think crud -t <table_name> -c <controller_name>

# 示例
php think crud -t fa_project -c Project
php think crud -t fa_visit -c Visit
php think crud -t fa_field_definition -c Fielddefinition

# 强制覆盖（⚠️ 仅在用户明确批准后使用 -f）
php think crud -t fa_project -c Project -f
```

### 生成产物

| 产物 | 路径 | 说明 |
|------|------|------|
| Controller | `app/admin/controller/<Name>.php` | 继承 Backend |
| Model | `app/common/model/<Name>.php` | 继承 Model |
| View | `app/admin/view/<name>/index.html` | 列表+增删改模板 |
| JS | `public/assets/js/backend/<name>.js` | RequireJS 模块 |
| Lang | `app/admin/lang/zh-cn/<name>.php` | 语言包 |
| Menu | 数据库 `fa_auth_rule` | 菜单权限记录 |

### 生成后定制清单

1. [ ] 检查 Controller 属性（`$relationSearch`, `$modelValidate` 等）
2. [ ] 补充 Model 关系定义（hasMany, belongsTo）
3. [ ] 检查 View 表单字段是否完整
4. [ ] 调整 JS 列定义（formatter, events）
5. [ ] 补充验证器规则
6. [ ] 验证语言包完整性

### CRUD 适用性矩阵

| 模块 | CRUD 模式 | 原因 |
|------|-----------|------|
| Project | Generate + Customize | 标准 CRUD + 额外字段（logo, sponsor） |
| Visit | Generate + Customize | CRUD + 排序 + 复制 |
| Form | **Hand-write** | 复杂表单设计器，拖拽排序 |
| Field | Generate | 简单 CRUD 表格 |
| FieldDefinition | Generate + Customize | CRUD + codelist/unit 关联 |
| FormField | **Hand-write** | 非独立 CRUD，嵌入表单设计器 |
| Codelist | Generate + Customize | 嵌套表格（含选项） |
| CodelistOption | **Hand-write** | 嵌套在 Codelist 内，非独立 |
| Unit | Generate | 简单 CRUD |
| VisitForm | **Hand-write** | 矩阵视图，非标准 CRUD |
| Settings | **Hand-write** | 系统配置，无独立数据表 |
| Export | **Hand-write** | PHPWord 集成，复杂逻辑 |
| Import | **Hand-write** | DOCX 解析，模板匹配 |
| AIReview | **Hand-write** | 外部 API 集成 |

## 11. Database Design Specification

### 全局规则

| 规则 | 值 |
|------|-----|
| 表前缀 | `fa_` |
| 引擎 | InnoDB |
| 字符集 | utf8mb4 |
| 主键 | 单列 `id` int auto-increment（CRUD 生成器要求） |
| 外键命名 | `<entity>_id` |
| 时间戳类型 | int(10) unsigned，Model 自动管理 |
| 审计字段 | `createtime` int(10), `updatetime` int(10)（**例外**：fa_visit_form 中间表无审计字段） |
| 字段注释 | **必填** — CRUD 生成器依赖注释生成语言包和组件 |

### 软删除策略

| 表 | 软删除 | 原因 |
|----|--------|------|
| fa_project | YES（deletetime） | 核心实体，需要回收站 |
| fa_visit | YES（deletetime） | 核心实体，需要回收站 |
| fa_form | YES（deletetime） | 核心实体，需要回收站 |
| fa_field_definition | YES（deletetime） | 核心实体，需要回收站 |
| fa_field | NO | 硬删除 |
| fa_visit_form | NO | 关联表，随父级硬删除 |
| fa_form_field | NO | 关联表，随父级硬删除 |
| fa_codelist | NO | 硬删除 |
| fa_codelist_option | NO | 随父级硬删除 |
| fa_unit | NO | 硬删除 |

### weigh 排序策略

8 张表启用拖拽排序：fa_visit, fa_form, fa_visit_form, fa_form_field, fa_codelist, fa_codelist_option, fa_unit, fa_field_definition。

### Entity Matrix

#### fa_project

| 属性 | 值 |
|------|-----|
| 用途 | 临床试验 CRF 设计项目（根聚合） |
| CRUD 模式 | Generate + Customize |
| 主键 | id (int, AI) |
| 外键 | — |
| 唯一约束 | — |
| 排序字段 | — |
| 审计字段 | createtime, updatetime |
| 软删除 | deletetime |
| 关键业务字段 | name, version, trial_name, crf_version, crf_version_date, protocol_number, sponsor, company_logo_path, data_management_unit |

#### fa_visit

| 属性 | 值 |
|------|-----|
| 用途 | 临床试验访视（受试者来访节点） |
| CRUD 模式 | Generate + Customize |
| 主键 | id (int, AI) |
| 外键 | project_id → fa_project.id (CASCADE) |
| 唯一约束 | (project_id, name), (project_id, code), (project_id, weigh) |
| 排序字段 | weigh（替代原 sequence） |
| 审计字段 | createtime, updatetime |
| 软删除 | deletetime |
| 关键业务字段 | name, code, weigh |

#### fa_form

| 属性 | 值 |
|------|-----|
| 用途 | CRF 表单页面 |
| CRUD 模式 | Hand-write（表单设计器） |
| 主键 | id (int, AI) |
| 外键 | project_id → fa_project.id (CASCADE) |
| 唯一约束 | (project_id, name), (project_id, code) |
| 排序字段 | weigh（替代原 order_index） |
| 审计字段 | createtime, updatetime |
| 软删除 | deletetime |
| 关键业务字段 | name, code, domain, weigh, design_notes |

#### fa_visit_form

| 属性 | 值 |
|------|-----|
| 用途 | 访视-表单多对多中间表 |
| CRUD 模式 | Hand-write（矩阵视图） |
| 主键 | id (int, AI) |
| 外键 | visit_id → fa_visit.id (CASCADE), form_id → fa_form.id (CASCADE) |
| 唯一约束 | (visit_id, form_id), (visit_id, weigh) |
| 排序字段 | weigh（替代原 sequence） |
| 审计字段 | — |
| 软删除 | — |
| 关键业务字段 | visit_id, form_id, weigh |

#### fa_field

| 属性 | 值 |
|------|-----|
| 用途 | 旧版字段模型（直接绑定表单） |
| CRUD 模式 | Generate |
| 主键 | id (int, AI) |
| 外键 | form_id → fa_form.id (CASCADE), codelist_id → fa_codelist.id (SET NULL), unit_id → fa_unit.id (SET NULL) |
| 唯一约束 | — |
| 排序字段 | — |
| 审计字段 | createtime, updatetime |
| 软删除 | — |
| 关键业务字段 | variable_name, label, field_type, integer_digits, decimal_digits, date_format, is_multi_record, table_type |
| 注释要求 | field_type 需使用枚举注释格式 |

#### fa_field_definition

| 属性 | 值 |
|------|-----|
| 用途 | 项目级字段库（可复用字段模板） |
| CRUD 模式 | Generate + Customize |
| 主键 | id (int, AI) |
| 外键 | project_id → fa_project.id (CASCADE), codelist_id → fa_codelist.id (SET NULL), unit_id → fa_unit.id (SET NULL) |
| 唯一约束 | (project_id, variable_name) |
| 排序字段 | weigh（替代原 order_index） |
| 审计字段 | createtime, updatetime |
| 软删除 | deletetime |
| 关键业务字段 | variable_name, label, field_type, integer_digits, decimal_digits, date_format, is_multi_record, table_type |
| 注释要求 | field_type 需使用枚举注释格式 |

#### fa_form_field

| 属性 | 值 |
|------|-----|
| 用途 | 字段定义在表单中的实例（含覆盖属性） |
| CRUD 模式 | Hand-write（嵌入表单设计器） |
| 主键 | id (int, AI) |
| 外键 | form_id → fa_form.id (CASCADE), field_definition_id → fa_field_definition.id (RESTRICT) **nullable** |
| 唯一约束 | (form_id, field_definition_id) |
| 排序字段 | weigh（替代原 sort_order） |
| 审计字段 | createtime, updatetime |
| 软删除 | — |
| 关键业务字段 | is_log_row, weigh, required, label_override, help_text, default_value, inline_mark |
| 特殊规则 | field_definition_id 可为 NULL（日志行 is_log_row=1 时） |

#### fa_codelist

| 属性 | 值 |
|------|-----|
| 用途 | 项目级枚举代码表 |
| CRUD 模式 | Generate + Customize |
| 主键 | id (int, AI) |
| 外键 | project_id → fa_project.id (CASCADE) |
| 唯一约束 | (project_id, code) |
| 排序字段 | weigh（替代原 order_index） |
| 审计字段 | createtime, updatetime |
| 软删除 | — |
| 关键业务字段 | name, code, description |

#### fa_codelist_option

| 属性 | 值 |
|------|-----|
| 用途 | 代码表选项 |
| CRUD 模式 | Hand-write（嵌套在 Codelist 内） |
| 主键 | id (int, AI) |
| 外键 | codelist_id → fa_codelist.id (CASCADE) |
| 唯一约束 | (codelist_id, code, decode) |
| 排序字段 | weigh（替代原 order_index） |
| 审计字段 | createtime, updatetime |
| 软删除 | — |
| 关键业务字段 | code, decode, trailing_underscore, weigh |
| 特殊规则 | trailing_underscore 标记选项 code 末尾追加下划线 |

#### fa_unit

| 属性 | 值 |
|------|-----|
| 用途 | 项目级度量单位 |
| CRUD 模式 | Generate |
| 主键 | id (int, AI) |
| 外键 | project_id → fa_project.id (CASCADE) |
| 唯一约束 | (project_id, code) |
| 排序字段 | weigh（替代原 order_index） |
| 审计字段 | createtime, updatetime |
| 软删除 | — |
| 关键业务字段 | symbol, code |

### Constraint Preservation

#### 作用域唯一约束

| 表 | 约束 | 说明 |
|----|------|------|
| fa_visit | (project_id, name) | 项目内访视名唯一 |
| fa_visit | (project_id, code) | 项目内访视编码唯一 |
| fa_form | (project_id, name) | 项目内表单名唯一 |
| fa_form | (project_id, code) | 项目内表单编码唯一 |
| fa_codelist | (project_id, code) | 项目内代码表编码唯一 |
| fa_unit | (project_id, code) | 项目内单位编码唯一 |
| fa_field_definition | (project_id, variable_name) | 项目内变量名唯一 |
| fa_visit_form | (visit_id, form_id) | 每个访视中表单不重复 |
| fa_form_field | (form_id, field_definition_id) | 每个表单中字段定义不重复 |
| fa_codelist_option | (codelist_id, code, decode) | 代码表内选项不重复 |

#### SET NULL 规则

| 外键 | ON DELETE | 说明 |
|------|-----------|------|
| fa_field.codelist_id | SET NULL | 删除代码表时字段保留，codelist_id 置 NULL |
| fa_field.unit_id | SET NULL | 删除单位时字段保留，unit_id 置 NULL |
| fa_field_definition.codelist_id | SET NULL | 同上 |
| fa_field_definition.unit_id | SET NULL | 同上 |

#### 引用检查要求

删除前必须检查是否被引用，由 Controller 的 `del()` 覆写实现：

| 被删除实体 | 检查引用 | 阻止条件 |
|-----------|---------|---------|
| FieldDefinition | FormField.field_definition_id | 被任何 FormField 引用时阻止删除 |
| Codelist | FieldDefinition.codelist_id + Field.codelist_id | 被任何字段引用时阻止删除 |
| Unit | FieldDefinition.unit_id + Field.unit_id | 被任何字段引用时阻止删除 |
| Form | VisitForm.form_id | 被任何访视关联时提示（可强制删除） |

#### Nullable FK 规则

- `fa_form_field.field_definition_id`：日志行（is_log_row=1）时为 NULL，此时该行仅作为表单分节标记
- `fa_field.codelist_id`、`fa_field.unit_id`：非选择型/无单位字段时为 NULL
- `fa_field_definition.codelist_id`、`fa_field_definition.unit_id`：同上

#### CASCADE 行为

- Project 删除 → 级联删除所有 Visit, Form, FieldDefinition, Codelist, Unit
- Visit 删除 → 级联删除 VisitForm
- Form 删除 → 级联删除 FormField, Field
- Codelist 删除 → 级联删除 CodelistOption
- FieldDefinition 删除 → RESTRICT（被 FormField 引用时阻止删除，需先通过 ReferenceCheck）

## 12. Entity Relationship Diagram

```
┌──────────┐
│ Project  │ (根聚合)
└────┬─────┘
     │
     ├──1:N──→ Visit
     │           │
     │           └──1:N──→ VisitForm ←──N:1── Form
     │                      (M:N 中间表)       │
     ├──1:N──→ Form ◄─────────────────────────┘
     │           │
     │           ├──1:N──→ FormField ──N:1──→ FieldDefinition (nullable)
     │           │         (表单级实例)         (项目级模板)
     │           │
     │           └──1:N──→ Field (旧模型)
     │                       ├──N:1──→ Codelist (nullable, SET NULL)
     │                       └──N:1──→ Unit (nullable, SET NULL)
     │
     ├──1:N──→ FieldDefinition
     │           ├──N:1──→ Codelist (nullable, SET NULL)
     │           └──N:1──→ Unit (nullable, SET NULL)
     │
     ├──1:N──→ Codelist
     │           └──1:N──→ CodelistOption
     │
     └──1:N──→ Unit
```

**三层字段模型**：
1. **FieldDefinition**（项目级）：定义变量名、类型、精度、关联代码表/单位 — 可跨表单复用
2. **FormField**（表单级）：FieldDefinition 在具体表单中的实例，可覆盖标签、必填性等 — 含 is_log_row 分节标记
3. **Field**（旧模型）：直接绑定表单的字段，向后兼容保留

## 13. Migration Mapping Table

### 数据库映射（SQLite → MySQL）

| 当前表 | 目标表 | 关键变更 |
|--------|--------|---------|
| project | fa_project | +createtime/updatetime/deletetime; created_at→createtime |
| visit | fa_visit | +createtime/updatetime/deletetime; sequence→weigh |
| form | fa_form | +createtime/updatetime/deletetime; order_index→weigh |
| visit_form | fa_visit_form | sequence→weigh |
| field | fa_field | +createtime/updatetime; field_type 改用枚举注释 |
| field_definition | fa_field_definition | +createtime/updatetime/deletetime; order_index→weigh |
| form_field | fa_form_field | +createtime/updatetime; sort_order→weigh |
| codelist | fa_codelist | +createtime/updatetime; order_index→weigh |
| codelist_option | fa_codelist_option | +createtime/updatetime; order_index→weigh |
| unit | fa_unit | +createtime/updatetime; order_index→weigh |

### 后端组件映射（Python → PHP）

| 当前（Python） | 目标（PHP） | CRUD 模式 |
|----------------|-------------|-----------|
| routers/projects.py | controller/Project.php | Generate + Customize |
| routers/visits.py | controller/Visit.php | Generate + Customize |
| routers/forms.py | controller/Form.php | Hand-write |
| routers/fields.py | controller/Field.php | Generate |
| — | controller/Fielddefinition.php | Generate + Customize |
| — | controller/Codelist.php | Generate + Customize |
| routers/units.py | controller/Unit.php | Generate |
| routers/export.py | controller/Export.php | Hand-write |
| routers/import_docx.py | controller/Import.php | Hand-write |
| routers/settings.py | controller/Settings.php | Hand-write |
| services/export_service.py | library/ExportService.php | — |
| services/ai_review_service.py | library/AiReviewService.php | — |
| services/field_rendering.py | View 模板 + JS formatter | — |
| repositories/* | Model 直接查询 | — (ActiveRecord 取代 Repository) |
| schemas/* | validate/*.php | — (ThinkPHP Validate 取代 Pydantic) |

### 前端组件映射（Vue 3 → FastAdmin）

| 当前（Vue 3） | 目标（FastAdmin） | 说明 |
|----------------|-------------------|------|
| App.vue | AdminLTE 布局 | 内置侧边栏 + 顶栏 |
| ProjectInfoTab.vue | view/project/index.html | Bootstrap 表单 |
| VisitsTab.vue | view/visit/index.html | Bootstrap-table + CRUD |
| FormDesignerTab.vue | view/form/design.html + form.js | **最复杂** — 拖拽重新设计 |
| FieldsTab.vue | view/field/index.html | Bootstrap-table |
| CodelistsTab.vue | view/codelist/index.html | 嵌套表格（含选项） |
| UnitsTab.vue | view/unit/index.html | 简单 CRUD 表格 |
| SimulatedCRFForm.vue | view/form/preview.html | 服务端渲染预览 |
| TemplatePreviewDialog.vue | Layer.js 模态框 | 模板预览 |
| DocxCompareDialog.vue | Layer.js 模态框 | 并排对比 |
| DocxScreenshotPanel.vue | 移除或服务端实现 | wkhtmltoimage 截图 |
| useApi.js | $.ajax / Backend.api | jQuery Ajax 封装 |
| useOrderableList.js | Bootstrap-table + jQuery Sortable | 拖拽排序 |
| useCRFRenderer.js | PHP View 模板 | 服务端 HTML 渲染 |
| BatchEditMatrixDialog.vue | view/visitform/index.html | 矩阵视图 |
| FormPreviewDialog.vue | view/form/preview.html | 表单预览弹窗 |

## 14. Non-CRUD Modules

以下模块无法使用 CRUD 生成器，需完全手写：

### Export（Word 导出）

- **Controller**: `Export.php` — 接收 project_id，调用 ExportService
- **Library**: `ExportService.php` — 使用 PHPWord 生成 .docx
- **逻辑**: 遍历项目的访视→表单→字段，按 CRF 格式渲染 Word 文档
- **依赖**: `phpoffice/phpword`（Composer）

### Import（DOCX 导入）

- **Controller**: `Import.php` — 接收上传的 .docx 文件
- **Library**: `ImportService.php` — 解析 DOCX 结构，匹配模板，反向生成表单/字段
- **依赖**: `phpoffice/phpword`（Composer）

### AIReview（AI 审查）

- **Controller**: `Aireview.php` — 接收表单/字段数据，调用外部 AI API
- **Library**: `AiReviewService.php` — 使用 Guzzle HTTP 调用外部 API
- **配置**: API 密钥存 `.env`，通过 `env('AI_API_KEY')` 读取

### FormDesigner（表单设计器）

- **Controller**: `Form.php` 的 `design` action（手写）
- **View**: `view/form/design.html` — 拖拽排序界面
- **JS**: `form.js` — jQuery Sortable 实现拖拽，Ajax 保存 FormField 排序
- **核心交互**: 从 FieldDefinition 库拖入字段到表单 → 创建 FormField → 调整排序/覆盖属性

### FormPreview（表单预览）

- **Controller**: `Form.php` 的 `preview` action（手写）
- **View**: `view/form/preview.html` — 服务端渲染 CRF 表单预览
- **逻辑**: 读取 FormField + FieldDefinition，按排序渲染为 HTML 表格/表单

### VisitFormMatrix（访视-表单矩阵）

- **Controller**: `Visitform.php`（手写）— 矩阵式管理访视与表单的关联
- **View**: `view/visitform/index.html` — 矩阵网格视图（行=访视，列=表单）
- **JS**: `visitform.js` — 复选框切换关联，拖拽调整排序

## 15. Non-Database State

| 类型 | 路径/位置 | 说明 |
|------|----------|------|
| 项目 Logo | `public/uploads/project_logo/` | 项目标识图片 |
| DOCX 临时文件 | `runtime/temp/` | 导出/导入过程中的临时 .docx |
| 导出缓存 | `runtime/cache/export/` | 生成的 Word 文档缓存 |
| AI 服务配置 | `.env` 中 `AI_API_KEY`, `AI_API_URL` | AI 审查外部 API 凭据 |
| 上传附件 | `public/uploads/` | 通用文件上传目录 |
| 导入模板 | `public/assets/template/` | DOCX 导入模板文件 |
| 运行时日志 | `runtime/log/` | ThinkPHP 运行日志 |

## 16. Development & Deployment

### 开发环境搭建

```bash
# 1. 安装 Composer 依赖
composer install

# 2. 配置数据库（application/config/database.php 或 .env）
DB_HOST=127.0.0.1
DB_NAME=crf_editor
DB_USER=root
DB_PWD=
DB_PREFIX=fa_
DB_CHARSET=utf8mb4

# 3. 导入数据库（首次）
mysql -u root crf_editor < install/crf_editor.sql

# 4. 启动开发服务器
php think run -H 0.0.0.0 -p 8000
# 访问 http://localhost:8000
```

### 生产部署（Nginx + PHP-FPM）

```nginx
server {
    listen 80;
    server_name crf.example.com;
    root /path/to/CRF-Editor/public;   # docroot 指向 public/
    index index.php;

    location / {
        try_files $uri $uri/ /index.php$is_args$args;
    }

    location ~ \.php$ {
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
```

### 环境配置（.env）

```ini
[app]
app_debug = false

[database]
hostname = 127.0.0.1
database = crf_editor
username = root
password =
hostport = 3306
prefix = fa_
charset = utf8mb4

[ai]
AI_API_KEY = your-api-key
AI_API_URL = https://api.example.com/review
```

## 17. AI Assistant Work Rules

### 决策树：新功能开发

```
收到新功能需求
  ├─→ Step 0: 查阅 CRUD 适用性矩阵（Section 10）
  │     ├─ 模块标记 "Generate" → 设计 Schema + 注释 → php think crud → 验证产物 → 定制
  │     ├─ 模块标记 "Generate + Customize" → 同上，但需大量覆写
  │     └─ 模块标记 "Hand-write" → 跳过 CRUD，手写全部代码
  │
  ├─→ Step 1: Schema First — 先设计表结构和字段注释
  │     ├─ 遵循全局规则（fa_ 前缀、int(10) 时间戳、单主键）
  │     ├─ 枚举字段必须写注释（CRUD 生成器依赖）
  │     └─ 后缀约定（_time, _image, _switch 等）
  │
  ├─→ Step 2: 生成或手写代码
  │     ├─ CRUD 生成器产物：Controller + Model + View + JS + Lang + Menu
  │     └─ 手写模块：参考 Section 6-9 约定
  │
  └─→ Step 3: 验证
        ├─ CRUD 产物不覆盖已定制代码（除非用户明确批准 -f）
        ├─ 关系定义完整
        └─ 引用检查逻辑到位
```

### 禁止事项

1. **禁止** 对 Hand-write 模块运行 `php think crud`
2. **禁止** 使用 `-f` 强制覆盖，除非用户明确批准
3. **禁止** 在未设计 Schema 和注释的情况下直接写 Controller/Model
4. **禁止** 将 Model 放在 `app/admin/model/`（应放 `app/common/model/`）
5. **禁止** 跳过引用检查直接硬删除有依赖的实体

### 检查清单

- [ ] Schema 设计完成，字段注释完整？
- [ ] CRUD 矩阵已查阅，生成模式正确？
- [ ] Model 关系定义完整？
- [ ] Validator 规则覆盖所有必填/格式要求？
- [ ] JS 模块与 Controller 1:1 映射？
- [ ] 引用检查逻辑在 `del()` 中实现？
- [ ] 软删除仅用于 4 张核心表？
- [ ] weigh 字段用于需要拖拽排序的表？

## 18. Glossary

| 术语 | 说明 |
|------|------|
| **FieldDefinition** | 项目级字段模板，定义变量名/类型/精度/代码表/单位，可跨表单复用 |
| **FormField** | FieldDefinition 在具体表单中的实例，含覆盖属性（label, required, help_text）和排序 |
| **Field** | 旧版字段模型，直接绑定表单，向后兼容保留 |
| **LogRow** | FormField 中 is_log_row=1 的特殊行，field_definition_id 为 NULL，作为表单分节标记 |
| **ReferenceCheck** | 删除实体前检查是否被其他实体引用，阻止有依赖的删除 |
| **CopyWithRename** | 复制实体时自动追加后缀（如 "_副本"）避免唯一约束冲突 |
| **BatchReorder** | 拖拽排序后批量更新 weigh 字段值 |
| **SequenceCompression** | 删除中间项后重新压缩 weigh 序号使其连续（如 1,3,4 → 1,2,3） |
| **VisitFormMatrix** | 访视-表单多对多关联的矩阵视图，行=访视，列=表单 |
| **trailing_underscore** | CodelistOption 的标记位，值为 1 时选项 code 末尾追加下划线（特殊编码需求） |
| **weigh** | FastAdmin 拖拽排序字段，int 类型，替代原系统的 sequence/order_index/sort_order |

## .context 项目上下文

> 项目使用 `.context/` 管理开发决策上下文。

- 编码规范：`.context/prefs/coding-style.md`
- 工作流规则：`.context/prefs/workflow.md`
- 决策历史：`.context/history/commits.md`

**规则**：修改代码前必读 prefs/，做决策时按 workflow.md 规则记录日志。
