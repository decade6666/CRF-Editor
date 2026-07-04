# Design — 修复 docx 导入页码匹配与缓存

## 边界与影响面
- 单一模块：`backend/src/services/docx_screenshot_service.py`。
- 无路由/契约/前端改动：`page_ranges`/`field_pages` 形状不变，`ScreenshotStatusResponse` 不变，`DocxScreenshotPanel.vue` 不动。
- 无新依赖：PyMuPDF(`fitz`) 已在用，`doc.get_toc()` 是其内置能力。

## 数据流（修复后）
```
_run / _refresh_page_ranges
  └─ _detect_form_pages(pdf_path, form_names, total_pages)
       ├─ outline = _read_pdf_outline(pdf_path)      # [(title, page)], PyMuPDF get_toc
       ├─ ranges = _map_forms_via_outline(form_names, outline, total_pages)   # R1.1/R1.2
       │     若某表单未命中大纲 → 记入 unresolved
       └─ 若 outline 为空 或 有 unresolved:
             page_texts = 提取页文本
             _map_forms_via_text(unresolved 或 全部, page_texts, total_pages)  # 复用修正后 is_toc_page (R1.4)
  └─ _detect_field_pages(...)  # 逻辑不变，吃正确的 page_ranges
```

## 关键设计

### D1 大纲读取 `_read_pdf_outline(pdf_path) -> List[Tuple[str,int]]`
- `doc.get_toc(simple=True)` 返回 `[[level, title, page], ...]`；取 `(title, page)`，忽略 level（表单标题可能是 L2，但也可能是 L1，用 level 过滤不稳健，改用标题匹配）。
- 页号已是 1-based，与 PNG 页号同源一致。
- 读取失败/空 → 返回 `[]`，触发文本兜底。

### D2 大纲→表单映射 `_map_forms_via_outline(form_names, outline, total_pages)`
- 预处理每个 outline 标题：`stripped = re.sub(r'^\s*\d+(\.\d+)*\.?\s*', '', title)`，再 `normalize_text`。
- 匹配优先级（每个 form_name）：
  1. `normalize(form_name) == normalize(stripped)`（精确，首选）；
  2. 否则 `normalize(form_name) in normalize(stripped)` 中标题最长者（contains 兜底）；
  3. 都无 → 该 form 记 unresolved，不写 range。
- 冲突处理：一个 form 命中多个大纲条目时取**页号最小**者作为起始（首次出现）。
- 起止页：把命中的 `(form, start)` 连同**所有** outline 页号一起排序，`end = 下一个更大 outline 页号 - 1`，最后一个 = `total_pages`，并 `end = max(end, start)`。
  - 用"所有 outline 页号"而非"仅命中表单页号"算边界，避免子标题（如 `7.1 吸烟饮酒史`）把父表单范围错误吞并。

### D3 修正 `is_toc_page(text)`（R1.4）— 密度/占比主导
伪代码：
```
def is_toc_page(text):
    if not text.strip(): return False
    matched = [n for n in form_names if normalize(n) in normalize(text)]
    # 子串去重：按长度降序，短名不因被长名包含而被误计/漏计
    independent = []
    for n in sorted(matched, key=len, reverse=True):
        if not any(n != m and normalize(n) in normalize(m) for m in independent):
            independent.append(n)
    hit = len(independent)
    total = len(form_names)
    # 主判据：绝对命中数高，或占总表单比例高（兼顾小型 CRF）
    if hit >= 5 or (total > 0 and hit / total >= 0.4):
        return True
    # 灰区 2-4 命中：短而密=索引页，长文=内容页交叉引用
    if 2 <= hit <= 4:
        return len(text) < 500
    return False
```
- 删除 `len(text) < 400` 前置返回。
- 阈值依据实测：真索引页 p4/5/6 命中 11-14（≥5 → True）；真目录 p2/3 命中 25-29（≥5 → True）；内容页典型命中 1-2（False）。灰区规则覆盖"命中 2-4 且短"的边缘索引页，同时用长度反指标保护长内容页。

### D4 文本兜底映射 `_map_forms_via_text(targets, page_texts, total_pages)`
- 即现有 `_detect_form_pages` 主体逻辑（首个 `match 且 not is_toc_page` 的页），但只对 `targets`（未被大纲解析的表单）执行，并使用 D3 修正后的 `is_toc_page`。
- 与大纲结果合并后统一按起始页排序重算 end（复用 D2 的边界规则或对合并集重算）。

### D5 缓存签名（R2）
- `Screenshottask` 新增字段：`detect_signature: Optional[str] = None`（或 `Tuple[str,...]`）。
- 签名函数：`_forms_signature(forms_data) = tuple(sorted(f.get("name","") for f in forms_data))`。
- `_run` 检测完成后写 `task.detect_signature = sig`。
- `start()` done 分支：
  ```
  if existing.status == "done":
      if forms_data:
          sig = _forms_signature(forms_data)
          if sig != existing.detect_signature:
              _refresh_page_ranges(temp_id, existing, forms_data)
              existing.detect_signature = sig
      return existing
  ```
- 全程在 `with _tasks_lock` 内（现有 start 已持锁）。`_refresh_page_ranges` 自身较重但仅在签名变化时触发；保持其在锁内以避免并发重复计算（thundering herd）。

## 可测试性重构（R3.2 / AC6）
- 抽出纯函数（不碰文件系统）：
  - `_map_forms_via_outline(form_names, outline, total_pages)` — 入参 `outline: List[(title,page)]`，纯计算。
  - `is_toc_page` 提为可独立调用（接收 `text` + `form_names`），或抽 `_toc_hit_stats`。
  - `_map_forms_via_text(targets, page_texts, total_pages)` — 入参 `page_texts: List[str]`。
- `_detect_form_pages` 变成薄编排：打开 PDF 拿 outline/page_texts，再调纯函数。单测直接喂合成 `outline`/`page_texts`，无需 LibreOffice。

## 权衡
- 选择大纲优先而非纯启发式：页号取真值、对未来文档鲁棒；代价是多一层 outline 解析与 fallback 分支。已被实测证据支撑（55 条精确大纲）。
- 保留文本兜底：源 docx 若无标题样式则无大纲，仍能退化工作（此时依赖 D3 修正后的判据）。
- 缓存放在进程内 `ScreenshotTask`：与现有任务生命周期一致，temp_id 清理即失效；不引入外部缓存复杂度。

## 回滚
- 改动集中在单文件的检测与 start 分支；如需回滚，`git checkout` 该文件即可，无迁移、无契约变更。
