# 访视预览拆分基线 QA（visits-preview-split）

本目录是 `.trellis/tasks/10-08-visits-preview-split` 的任务内浏览器验收工具，不属于产品代码。它拷贝改写自
`.trellis/tasks/archive/2026-10/10-08-designer-split/research/qa/`（归档文件保持只读、不 import、不修改），
绑定规格见同目录 `PLAN.md`。

## 它做什么

从被测树构建产物（后端直接托管 `frontend/dist`）启动自己的后端 + headless Chrome，通过 CDP 驱动真实页面：
登录固定种子库 → 打开 访视流程 → 头部 el-switch 切「列表」(single) → 点访视行 → 点 `aria-label="预览"`。
每次运行在 `/tmp/visits-preview-qa/<label>/` 下落全部产物；仓库内只保留小体量 JPEG 证据。不注入 Vue 状态、
不修改被测源码、不 import 归档 harness 的模块。

## 基线命令（已完成）

```bash
git -C /home/decade/CRF-Editor worktree add --detach /tmp/visits-qa-baseline 0d111a1
cp -a /home/decade/CRF-Editor/frontend/node_modules /tmp/visits-qa-baseline/frontend/node_modules
(cd /tmp/visits-qa-baseline/frontend && npm run build)   # 后端托管 dist，必须先构建
bash /home/decade/CRF-Editor/.trellis/tasks/10-08-visits-preview-split/research/qa-visits/run_qa.sh baseline
bash /home/decade/CRF-Editor/.trellis/tasks/10-08-visits-preview-split/research/qa-visits/run_qa.sh baseline2
node /home/decade/CRF-Editor/.trellis/tasks/10-08-visits-preview-split/research/qa-visits/qa_compare.mjs baseline baseline2
```

`final` 由 lead 另行触发：拆分树 `/home/decade/CRF-Editor-visits-preview-split` 在运行前必须先 `npm run build`，
再执行 `QA_ALLOW_FINAL=1 bash run_qa.sh final`（未设该变量时脚本 fail-fast 退出 3，避免在别人正在改的树上跑）。

## 环境与凭据

- 后端：`CRF_ENV=production` + `CRF_DATABASE_PATH=<run>/crf.db`（`seed.db` 的副本）+ 动态端口（8911 / 9311 起，
  两端口一起递增到下一组空闲）；只记录并停止自己 `setsid` 起的进程组，运行前后各存一份 `ports-*.txt`。
- 凭据与种子：复用 `/tmp/designer-split-qa/secrets.env`（0600）与 `seed.db`，**不生成新凭据**；缺失即退出 1 并要求找 lead。
- Python：`env -u http_proxy … /home/decade/.venvs/crf-editor/bin/python`；Chrome：`chrome-headless-shell`（153.0.8010.47）。
- 每次运行都从 `seed.db` 复制新库，并**逐字节一致地**执行同一条种子 UPDATE（baseline 与 final 共用）：
  `UPDATE form SET design_notes='QA 备注第一行\n第二行' WHERE code='GOLD_FORCE_LANDSCAPE'`；更新后记录 `crf.db.sha256`
  与 `tree-state.txt`（HEAD / git status / dist 文件清单）以证明两棵被测树各自干净。

## 场景（每个 run 全跑；截图 + DOM 指纹 + 注解探针）

| key | 内容 |
|---|---|
| `s1-portrait-ecrf` | `Legacy portrait controls` 预览（eCRF）：页面类名、标题、行/单元格数、eCRF 零注解 |
| `s2-portrait-acrf` | 同表单 aCRF：字段注解文本集合与 API 字段集合（排除 标签 结构行）精确相等 |
| `s3-landscape-ecrf` | `Legacy forced landscape` 预览：`.word-page` 必须带 `landscape` 类，竖版表单不得带 |
| `s4-notes-ecrf` | 备注种子表单：`aside.wp-notes` 可见且文本含种子的两行 |
| `s5-annotation-offset` | 竖版表单 aCRF：`--acrf-annotation-top` 等于持久化 offset 推导值（form `_form` y=25 → `0.1752cm`；`GOLD_TEXT_UNIT` y=-40 → `-0.4748cm`） |
| `s6-drag-persist` | 拖拽 → PATCH `/api/forms/1` → 关闭重开后的位置 |
| `s7-sequence-guard` | 预览/拖拽前后右侧访视表单「序号」列与矩阵 sequence 快照不变（整视口截图） |

console 全量收集（含 warning 类型）；网络摘要含 PATCH 的 `postData`。

## 行为断言（`behaviour.json`，7 条，每条含 `pass`）

`visit-preview-ecrf-renders`、`visit-preview-acrf-annotations`、`visit-preview-landscape-class`、
`visit-preview-notes-aside`、`visit-preview-annotation-offset`、`visit-preview-drag-persist`、
`visit-form-sequence-guard`。

baseline 上因 F1（预览只拿到矩阵行的 `{id,name}`，丢失 `domain` / `design_notes` / `paper_orientation` /
`annotation_positions`）必然失败的 4 条标记为 `knownRed: true` **原样记录**，不改断言迁就：
`landscape-class`、`notes-aside`、`annotation-offset`、`drag-persist`。final 这 4 条必须 `pass: true`
且不得带 `knownRed`；其余 3 条在两次 baseline 与 final 之间必须逐字段一致。

**已知偏差（记录，不隐藏）**：场景 6 在 baseline 上表单域注解根本不渲染，因此拖拽目标按数据回退到字段注解
`GOLD_TEXT_UNIT`（`stage: "field-annotation-fallback"`）——它同时实测到 F1 的第四个症状：持久化 offset 未应用，
预览起点是默认偏移 `-0.0748cm` 而非持久化的 `-0.4748cm`，因此拖拽 12px 后写入的 y 与「起点 + 3」不符
（实测写入 32，期望 -8）。final 上表单域注解应存在，脚本自动改回拖表单注解（`stage: "form-annotation"`）。

## 实现细节（为什么这样做）

- **截图确定性**：弹窗「加载中 → 内容就绪」会让同一页面出现 1px 级竖直漂移（y=192/193 交替）；裁剪框取整后
  整幅 PNG 平移。`preparePageForCapture` 要求连续两次采样完全一致的 rect 才返回，最多 60 次。修复前
  `baseline vs baseline2` 有 1 个场景 5 万+ 差异像素，修复后 7/7 截图逐字节相同。
- **canvas 像素差异**：与归档实现同款，字节不同时用自带 headless Chrome 的 canvas 统计差异像素与包围盒；
  只作定性，判定依据是字节比较（`byteIdenticalImageCount`）。
- **`qa_compare.mjs` 不作归属判定**：它输出逐场景差异（含首个指纹/探针差异路径）与未覆盖清单，由 lead 对照
  `design.md` §D8 判定「是否落在已声明变更面」。判定口径：截图字节、场景记录、行为结果（含 `knownRed` 标记）、
  console 计数、网络失败。baseline 两次相比时 `knownRed` 标记一致，因此比较通过。
- 场景 7 是整视口截图，`fingerprint` / `probe` 为 `null`，比较器对这种不可比场景跳过（`null`，不算差异）。
- **`qa_compare.mjs baseline final` 的 `pass` 为 false 属预期**：它要求两张截图逐字节相同，而 D8 声明了可见
  差异（备注、横向类、表单域注解、偏移、aria 文案）。归属由 lead 按 §final 结果 的差异清单对照 §D8 判定；
  本脚本只报告、不判定归属。

## 基线结果（2026-10-12）

- `run_qa.sh baseline` 与 `run_qa.sh baseline2`：两次均完成，行为 3/7 pass + 4 条 baseline known-red；
  console messages / errors / warnings 与网络失败均为 **0**（`console.json` 三分类计数）。
- `qa_compare.mjs baseline baseline2`：**PASS** — 7/7 截图逐字节相同（0 差异像素），场景记录、行为结果
  （含 knownRed 标记）、console 计数、网络失败全部一致。报告：`/tmp/visits-preview-qa/compare-baseline-baseline2.json`。
- 后端 8911 / Chrome 9311 每次运行后自行停止（`ports-after.txt` 复核无该端口监听；未触碰其他进程）。
- parity（访视预览 JSON vs Word 导出）：**未运行**。访视预览弹窗不产出可抽取的预览 JSON（设计器
  `capturePreview` 的 DOM 抽取路径在访视弹窗不可得），按 PLAN 记录为 not-run，未使用 `--allow-mismatch`，
  未伪造报告。

## final 结果（2026-10-12，树 `/home/decade/CRF-Editor-visits-preview-split` @0d111a1 + 工作区改动）

源码 sha256（与 lead 冻结值一致）：`VisitFormPreviewDialog.vue` `050aab57…b845e`、
`useVisitPreviewAnnotation.js` `9dd2b6da…dc34`、`VisitsTab.vue` `48914278…84dd`；dist 已于 12:57 刷新。
运行不写入被测树（运行前后 `git status` 逐行一致）。

**行为：7/7 pass，0 known-red。** 4 条 baseline 红全部转绿，3 条 baseline 绿保持绿；详情见
`/tmp/visits-preview-qa/final/behaviour.json`：
- `landscape-class`：`word-page word-page--a4 landscape word-page--with-notes`；竖版表单无 `landscape`。
- `notes-aside`：`ariaLabel=设计备注`，两行种子文本原样渲染。
- `annotation-offset`：表单域注解 `DM` `--acrf-annotation-top: 0.1752cm`（= y25），`GOLD_TEXT_UNIT` `-0.4748cm`（= y-40）。
- `drag-persist`：`stage: form-annotation`，拖拽 12px 后 PATCH `/api/forms/1`
  `{"annotation_positions":{"_form":{"y":57},"GOLD_TEXT_UNIT":{"y":-40}}}`（25 + 32 = 57，与 px→0.01cm 换算一致；
  body 形状与 baseline 的 `{annotation_positions:{…}}` 相同），关闭重开后 `0.4952cm` 与期望相等。

**console / 网络**：final messages **0** / errors **0** / warnings **0** / 网络失败 **0**，与 baseline 计数相同。
D6「Failed to resolve component: Loading」在 baseline 与 final 都未作为 warning 出现——生产构建会剥离 Vue
dev-only 告警（`grep` 两棵树 dist 均无 `Failed to resolve component` / `Vue warn` 字符串），因此该 warning 的
浏览器证据在本 harness 中**不具备可得性**；工作区组件里可核对的等价证据：基线 `VisitsTab.vue` 渲染
`<Loading />` 但 import 列表无 `Loading`（仅 `CircleClose, Delete, DocumentCopy, Plus, View`），
final `VisitFormPreviewDialog.vue:4` 显式 `import { Loading } from '@element-plus/icons-vue'`。

**compare baseline↔final 差异清单（5 场景；逐项归属 D8）**：

| 场景 | 差异 | 归属 |
|---|---|---|
| s1-portrait-ecrf | 无（逐字节相同，probe 0 项差异） | — |
| s2-portrait-acrf | 表单域注解新增 1 个（count 15→16），字段注解整体后移一位；该 span 的 class/text/top/aria/resetDisabled 及红色注记像素行（y 248–289 等） | D8.1 表单域注解 + D8.3 aria 文案 + D8.1 持久化偏移 |
| s3-landscape-ecrf | `.word-page` 类名增 `landscape`（尺寸 794×1123 → 1072×794）；备注 aside 出现（483,300 px 为整页重排的边界框）；残余 y37–52 / y84–151 文本带（`#e3e3e3→#d3d3d3`、`#bfbfbf→#ffffff` 边框重排） | D8.1 显式纸张方向 + D8.1 备注 |
| s4-notes-ecrf | 同上（同一表单） | 同上 |
| s5-annotation-offset | 与 s2 同型：表单域注解 + 重置按钮启用 + 字段偏移生效 | D8.1 + D8.3 |
| s6-drag-persist | 表单域注解 top `-0.0748cm → 0.4952cm`、重置按钮 `disabled true→false`、aria 文案变更；像素仅落在注解框（x1890/2160 列的 3 px 宽竖条与水平边框，共 7,124 px） | D8.1 持久化 + D8.3 |

未发现映射不到 D8 的像素/文本/行为差异。`scenarios.json` 逐字段一致；`qa_compare` 的 `pass=false` 属预期——
其规则要求两张截图逐字节相同，而 D8 声明了可见差异，结论由 lead 按上表归属判定。`compare-baseline2-final.json`
与本次逐项一致（两次 baseline 互为佐证）。

**parity**：仍未运行（见上「已知偏差」）。

## 证据留存

`evidence/` 仅 12 张 JPEG（质量 70，共 556K，< 800K 上限）：`baseline-s1..s6` 与 `final-s1..s6`。原始 PNG、指纹、
探针、console、网络摘要、`crf.db`、parity 结论均在 `/tmp/visits-preview-qa/<label>/`。

## 当前进程 / 临时树状态

- 本 harness 的 backend / Chrome 进程组在每次运行结束时自行停止（`ports-after.txt` 复核 8911/9311 无监听）；
  未触碰的项目常驻后端（8888 / 8902）与其 `backend.log` 均保持原样。
- `/tmp/visits-qa-baseline`（detached worktree @0d111a1，含已构建 dist 与 `cp -a` 的 node_modules）**按要求保留**，
  便于 lead 复核/复跑 baseline；确认后再 `git -C /home/decade/CRF-Editor worktree remove /tmp/visits-qa-baseline`。
- `/tmp/visits-preview-qa/` 下保留 baseline / baseline2 / final 三份原始产物与两份 compare 报告；14 个
  `*-chrome-profile-*` / `compare-profile-*` 临时 profile 目录已用 `rm -rf` 清理（现共 11M）。
