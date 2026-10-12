# 设计器 Word 预览基线 QA

这是 `designer-split` 的任务内验收工具，不属于产品代码。它从 worktree 构建前端，复制固定种子数据库到每次独立运行，启动自己的后端和 headless Chrome，通过 CDP 驱动真实页面；不会修改 `src/`、测试或数据库源文件。

## 基线命令

```bash
cd /home/decade/CRF-Editor-designer-split/frontend && npm run build
bash /home/decade/CRF-Editor/.trellis/tasks/10-08-designer-split/research/qa/run_qa.sh baseline
bash /home/decade/CRF-Editor/.trellis/tasks/10-08-designer-split/research/qa/run_qa.sh baseline2
env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  node /home/decade/CRF-Editor/.trellis/tasks/10-08-designer-split/research/qa/qa_compare.mjs baseline baseline2
```

后续每个 refactor 步骤使用 `bash run_qa.sh step1` / `step2`；最终标签为 `final`。比较时运行 `node qa_compare.mjs baseline <label>`。所有 Node/CDP 调用都应清除代理环境变量。`run_qa.sh` 会确认端口空闲，默认使用 backend `8911` 与 Chrome `9311`；占用时两者一起递增到下一组空闲端口。它只记录并停止自己启动的 PID / process group。不要停止其他监听进程。

## 覆盖内容

- 固定 viewport 为 `1600×1800` CSS px、DPR 1，保证竖向 A4 页面完全落在视口内；页面加载后等待 `document.fonts.ready`、动画完成和两次 `requestAnimationFrame`，截图前将鼠标移到 `(0,0)`。每个表单在 eCRF / aCRF、主画布 / 全屏设计器组合下各采集一张页面裁剪 PNG、DOM 指纹和伪状态探针，共 24 组。viewport 高度高于设计草案中的 `1000px`，因为实测约 `1123px` 的竖向 Word 页面无法在 `1000px` 视口中完整显示；该尺寸对所有标签固定。
- 指纹记录每个节点的标签、class、节点自身文本、0.5px 精度 rect 和固定 computed-style 列表；不记录 Vue 的 `data-v-*` 属性。探针通过 `CSS.forcePseudoState` 读取启用/禁用注释重置按钮的 hover opacity、交互 cursor，以及列拖拽伪元素的 normal / hover / active 样式。
- 从页面 DOM 导出与 `load_preview_table_fields` 兼容的 `{forms:[{name,tables}]}` JSON；提取按 cross-stack-contracts §5 的文本模型直接从实时 DOM 推导（跳过 `.wp-acrf-annotation` 注记后代、`<br>` 计一个换行、选项组按渲染器规则连接、自动填写线按行内 `min-width` 还原下划线根数、单元格首尾空白裁剪）。通过页面内 `fetch` 导出 eCRF `.docx`，再调用后端严格 parity CLI，报告完整保留（不使用 `--allow-mismatch`）。断言：表单顺序一致，且每次运行的 `parity.json` 与冻结基线逐字段相同（`baseline2/step1/step2/final` 自动与 `baseline` 比对）。
- 基线实测：ratio `0.9240506329`（73/79 单元格，24/29 行），`form_order_matches=true`，6 处差异为已声明的既有文本模型差异（与拆分无关，见 `qa_driver.mjs` `capturePreview` 注释）：下拉框预览按单选项渲染而导出按纵向选项渲染（1 处）、空选项单选预览回落 `○是 ○否` 而导出按下划线占位（1 处，§5「Empty-choice placeholder」行已声明）、混合横向内联组文本列自适应填写线 ceil 与后端 floor 相差 1 根（2 处）、空表单预览无 `<table>` 而导出保留空表行（2 处 `missing_preview_cell`）。这些差异在 `baseline`/`baseline2` 与其他标签之间必须逐字段稳定；若某标签的 parity 报告与基线不同，视为该步骤引入的回归并阻断。
- aCRF 注释拖拽 / PATCH / reload / reset、两种预览中的双击快编、列宽 main→fullscreen→main 往返、两种预览的行高拖拽都会写入 `behaviour.json`。仅 `baseline`、`baseline2` 和 `final` 执行设计器字典快捷新增并立即选择检查；该检查在选择新字典后会把未保存的 `codelist_id` 写入字段属性，关闭全屏时会出现「字段属性未保存」确认框——验收选择「取消」丢弃绑定（只检查「立即可选」），确认框标题记录在结果的 `leavePrompts` 字段。
- 两次运行截图 PNG 先做字节比较；字节不同时，`qa_compare.mjs` 启动自己的 headless Chrome，用 canvas 计算逐像素差异数及边界框。它还严格比较指纹、探针、预览 JSON、行为结果、parity 和浏览器错误。

## 种子与分支覆盖

`seed_qa_db.py` 通过文件路径导入既有 `export_golden_harness.py` 的种子函数，额外创建可登录的普通用户并将项目归属给该用户。种子数据库只在 `/tmp/designer-split-qa/seed.db` 创建一次；每次 run 从它复制新 DB。随机认证密钥、管理员引导密码和普通用户密码只写入 `/tmp/designer-split-qa/secrets.env`（权限 `0600`），不写入仓库或日志。运行产物都在 `/tmp/designer-split-qa/<label>/`。

| 表单 | 主要分支 |
|---|---|
| `Legacy portrait controls` | normal 标签/值表、单选/多选/下拉/单位/日期时间控制、换行默认值、log 行、`标签` 结构行、带换行覆盖的多行标签、`_form` 与字段 OID aCRF 偏移 |
| `Legacy forced landscape` | 强制横向 normal 表 |
| `Auto mixed landscape` | 自动横向表单、normal 字段与 5 列 inline 表 |
| `Inline only 4` | 6 列 inline 表与自动临时横向 |
| `Inline only 5` | 6 列 inline 表与强制纵向 |
| `Empty legacy form` | 空表单标题 / 无字段 |

当前真实 UI 的 `buildFormDesignerRenderGroups()` 只产出 `normal` / `inline` 两种 group；组件模板中虽保留 `unified` 下的 regular / full-row / inline-block 代码，但此种子和任何真实表单都无法经 UI 进入该分支。为遵守“不注入 Vue 状态、不改源码”的限制，基线不会伪造覆盖它；该路径由组件挂载测试负责验证。普通 group 中的 normal 字段、log/标签整行结构和独立 inline group 均由真实页面覆盖。

## 基线结果（2026-10-11）

- `baseline` 与 `baseline2` 两次完整运行 + `qa_compare.mjs baseline baseline2`：PASS — 24/24 截图逐字节相同（0 差异像素），指纹 / 伪状态探针 / 几何 / preview JSON / 行为结果 / parity 报告 / 浏览器错误全部一致；两次运行 console error 与网络失败均为 0；harness 确定性成立。后端 8911 / Chrome 9311，运行进程组每次运行后自行停止（`ports-after.txt` 复核）。
- 行为检查 5/5 通过：注释拖拽-持久化-刷新-重置（主画布与全屏 × 字段与表单，4 例）、双击快编（两种预览）、列宽 main→fullscreen→main 往返、行高双预览持久化、字典快捷新增立即可选（选择后产生「字段属性未保存」确认框，按 §覆盖内容 说明选择取消）。
- parity 基线：73/79 单元格（ratio 0.924），表单顺序一致，6 处已声明既有差异（见上）。`baseline2` 的 parity 报告与 `baseline` 逐字段相同。
- 分支覆盖限制：真实 UI 的 `buildFormDesignerRenderGroups()` 只产出 `normal` / `inline` 两种 group；组件模板中 `unified` 分支的 regular / full-row / inline-block 代码无法通过任何种子表单经 UI 进入（不注入 Vue 状态、不改源码），由组件挂载测试负责验证（见下）。

## 最终验收（final，2026-10-11 运行）

在任务分支同步 main 后的合并树（main→task，尚未 task→main；设计器三个组件 `FormDesignerTab` / `DesignerWordPreview` / `DesignerAcrfAnnotation` 的 md5 与 `step2` 记录一致）上运行，命令与基线一致，仅标签换成 `final`：

```bash
cd /home/decade/CRF-Editor-designer-split/frontend && npm run build
bash /home/decade/CRF-Editor/.trellis/tasks/10-08-designer-split/research/qa/run_qa.sh final
env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  node /home/decade/CRF-Editor/.trellis/tasks/10-08-designer-split/research/qa/qa_compare.mjs baseline final
```

- `qa_compare.mjs baseline final`：PASS — 24/24 截图逐字节相同（0 差异像素），指纹 / 伪状态探针 / 几何 / preview JSON / 行为结果 / parity 报告 / 浏览器错误全部与冻结基线一致。四次比较（`baseline baseline2`、`baseline step1`、`baseline step2`、`baseline final`）全部 PASS，比较产物为 `/tmp/designer-split-qa/compare-baseline-<label>.json`（冻结树上的 `step1` 复跑另存为 `compare-baseline-step1-prev.json`，同为 PASS）。本 harness 只覆盖设计器主画布 / 全屏与 eCRF / aCRF 两套预览；App 拆分新增的 Word 导入向导流程不在覆盖范围内。
- 行为检查：`baseline` / `baseline2` / `final` 为 5/5（含字典快捷新增立即可选），`step1` / `step2` 按 §覆盖内容 的设计只运行 4/4 通用检查（不含字典快捷新增），全部 `pass=true` 且与基线逐字段一致。
- parity：严格 CLI 为 `(cd <worktree>/backend && python scripts/compare_word_table_parity.py <run>/preview.json <run>/export.docx)`，不使用 `--allow-mismatch`；实测 ratio 73/79 = `0.9240506329`，**不是 1.0**，`form_order_matches=true`，6 处已声明既有差异（§覆盖内容 清单）在 `baseline` / `baseline2` / `step1` / `step2` / `final` 之间逐字段不变。注：ratio<1 时该 CLI 固定退出码 1，`run_qa.sh` 因此始终保留完整报告、按字段（表单顺序 + 与冻结基线逐字段相同）断言而非按退出码；用既有 final 产物复跑 CLI 复核：退出码 1、报告与运行记录逐字段相同。
- 分支覆盖限制不变：`unified` 分支仍无法经任何种子表单由真实 UI 进入（见 §种子与分支覆盖），仍由组件挂载测试负责。
- `final` 与其他运行一样，自有 backend / Chrome 进程组在结束时自行停止；`ports-after.txt` 复核 backend `8911` / Chrome `9311` 无监听（不触碰其他进程）。

## JPEG 证据

`baseline` 与 `final` 运行各会在 `/tmp/designer-split-qa/<label>/` 生成代表表单的 4 张 JPEG（质量 70），共 8 张已留存到本任务目录：

```bash
QA=/home/decade/CRF-Editor/.trellis/tasks/10-08-designer-split/research/qa
cp /tmp/designer-split-qa/baseline/baseline-main-ecrf.jpg "$QA/evidence/"
cp /tmp/designer-split-qa/baseline/baseline-main-acrf.jpg "$QA/evidence/"
cp /tmp/designer-split-qa/baseline/baseline-fullscreen-ecrf.jpg "$QA/evidence/"
cp /tmp/designer-split-qa/baseline/baseline-fullscreen-acrf.jpg "$QA/evidence/"
cp /tmp/designer-split-qa/final/final-main-ecrf.jpg "$QA/evidence/"
cp /tmp/designer-split-qa/final/final-main-acrf.jpg "$QA/evidence/"
cp /tmp/designer-split-qa/final/final-fullscreen-ecrf.jpg "$QA/evidence/"
cp /tmp/designer-split-qa/final/final-fullscreen-acrf.jpg "$QA/evidence/"
```

当前 `research/qa/evidence/` 共 8 张：`baseline-` / `final-` 前缀 × `main` / `fullscreen` × `ecrf` / `acrf`（逐字节相同）。PNG、指纹、探针、行为和 parity 原始产物留在 `/tmp`；只有这 8 张 JPEG 放在 `research/qa/evidence/`。
