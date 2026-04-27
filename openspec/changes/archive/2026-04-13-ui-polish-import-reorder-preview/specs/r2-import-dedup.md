# Spec: R2 — 项目导入去重修复

## 需求
导出项目后再导入，不应报 "数据已存在" 错误，应自动重命名并成功导入。

## 根因
`database.py:274-280` 迁移代码逻辑 bug：
```python
if "order_index" not in cols:      # 外层
    if "order_index" in cols:      # 内层 — 永远 false（死代码）
```
导致 legacy `sort_order NOT NULL` 列未迁移，clone 插入 FormField 时触发 NOT NULL 失败。

## 修复方案

### Step 1: 修正 form_field 迁移
在 `_migrate_project_soft_delete_and_ordering()` 中增加 `sort_order` 检测：
```python
cols = [c["name"] for c in insp.get_columns("form_field")]
if "sort_order" in cols:
    # 用 sort_order 回填 order_index
    if "order_index" not in cols:
        conn.execute(text(
            'ALTER TABLE form_field ADD COLUMN order_index INTEGER DEFAULT 1 NOT NULL'
        ))
    conn.execute(text(
        'UPDATE form_field SET order_index = sort_order WHERE order_index = 1 AND sort_order IS NOT NULL'
    ))
    # 重建表移除 sort_order（SQLite 限制）
    # 或降级：将 sort_order 默认值设为 0 解除 NOT NULL 约束
```

### Step 2: 修正死代码
删除行 275 的无效分支 `if "order_index" in cols:`，保留直接添加 `order_index` 的逻辑。

### Step 3: 改进 IntegrityError handler
```python
# main.py integrity_error_handler 增加分支：
if "not null" in msg:
    detail = "数据库结构不兼容，请重启应用执行迁移"
```

## 约束
- C2-1: 不破坏已有数据
- C2-2: 迁移应幂等（重复执行安全）
- C2-3: 保持向后兼容（新建数据库无 sort_order 时跳过）

## 影响文件
| 文件 | 类型 | 说明 |
|------|------|------|
| `backend/src/database.py` | TO_MODIFY | 修正 form_field 迁移逻辑 |
| `backend/main.py` | TO_MODIFY | 改进 IntegrityError handler |

## PBT 性质
- **幂等性**：导出→导入 N 次，生成 N 个独立项目
- **单调性**：名称递增 "(导入1)" "(导入2)" ...
- **round-trip**：导出→导入→再导出→比对数据无损

## 验证标准
- [ ] 导出项目后立即导入成功，名为 "原名 (导入)"
- [ ] 重复导入多次均成功，名称递增
- [ ] 不出现 "数据已存在" 错误
- [ ] 迁移后应用正常启动
