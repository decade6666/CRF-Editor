# Spec 03: SQLite 并发优化

## 1. 变更位置

文件：`backend/src/database.py`，函数：`get_engine()`

---

## 2. 现有代码

```python
@event.listens_for(_engine, "connect")
def _enable_fk(dbapi_conn, connection_record):
    dbapi_conn.execute("PRAGMA foreign_keys = ON")
```

---

## 3. 变更后代码

将函数重命名为 `_configure_sqlite` 并追加三条 PRAGMA：

```python
@event.listens_for(_engine, "connect")
def _configure_sqlite(dbapi_conn, connection_record):
    dbapi_conn.execute("PRAGMA foreign_keys = ON")
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA busy_timeout=5000")
    dbapi_conn.execute("PRAGMA synchronous=NORMAL")
```

---

## 4. 参数说明

| PRAGMA | 值 | 效果 |
|--------|-----|------|
| `journal_mode` | `WAL` | Write-Ahead Logging 模式：多并发读 + 单写，读写不互阻塞 |
| `busy_timeout` | `5000`（毫秒） | 等待写锁最多 5 秒，超时才报 `SQLITE_BUSY`；防止并发写入时立即失败 |
| `synchronous` | `NORMAL` | WAL 模式下的安全级别：比 `FULL` 快，不丢失已提交事务 |

---

## 5. 注意事项

1. **WAL 文件持久化**：WAL 模式设置后写入数据库文件头，重启后自动生效。但 `busy_timeout` 是 per-connection 设置，必须在每次连接时通过 `connect` 事件重新设置。

2. **WAL 附属文件**：数据库目录下会出现 `<db_name>.db-wal` 和 `<db_name>.db-shm` 两个文件，这是正常现象。部署时需确保数据库目录可写，备份时需同时备份这三个文件。

3. **SQLite 并发写限制**：WAL 模式允许并发读，但写操作仍串行（每次只有一个写 Session）。`busy_timeout=5000` 确保写操作等待而非立即报错，对 CRF 编辑器的使用场景（偶发并发写）已足够。

4. **无需更改连接池配置**：现有 `create_engine` 使用 SQLAlchemy 默认的 `QueuePool`，配合 WAL + busy_timeout 足以处理多用户并发场景，无需额外调整 `pool_size`。
