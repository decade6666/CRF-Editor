# Design: six small defect fixes

One defect = one RED test + one minimal fix + one commit. Line numbers come from the 2026-10-08 verification (`main` = `77e8f3f`); re-check them before editing.

## F1 — Shared FormField copy

- New module `backend/src/services/form_field_copy.py`:

  ```python
  _NON_COPIED = frozenset({"id", "form_id", "field_definition_id", "created_at", "updated_at"})
  COPIED_ATTRS: tuple[str, ...] = tuple(
      c.name for c in FormField.__table__.columns if c.name not in _NON_COPIED
  )

  def copy_form_field(src: FormField, *, form_id: int, field_definition_id: Optional[int], order_index: int) -> FormField:
      """按模型列复制字段实例的全部属性；新增列默认随之复制，避免多处复制清单漂移。"""
  ```

  - Derive the attribute list from the model columns instead of a hard-coded tuple. This exact bug came from a column added later (Task 3.6) that one copy site missed.
  - Verify the `FormField` columns first (`backend/src/models/form_field.py`). If a column must **not** be copied, add it to `_NON_COPIED` with a comment explaining why.
- Replace the three `FormField(...)` literals:

  | Call site | What it passes |
  |---|---|
  | `project_clone_service.py:~315` | remapped `field_definition_id`; renumbered `order_index` |
  | `import_service.py:~867` | remapped id; renumbered order |
  | `routers/forms.py:~307` | same-project `field_definition_id` as is; same `order_index` as today |

  - Keep each site's existing remap and order semantics. Only the attribute copying is shared.
- Tests:
  - `test_should_keep_field_styles_when_copying_form`: API `POST /api/forms/{id}/copy`. Seed `bg_color`, `text_color`, `label_bold=0`, `label_font_size`; assert all four on the copy.
  - `test_should_copy_every_payload_column_of_form_field`: unit test. `COPIED_ATTRS` equals the model columns minus `_NON_COPIED`.
  - Put them in `tests/test_form_copy.py`, or in the existing form-copy test module if one exists; grep first.

## F2 — Let `ExportError` through

- `export_service.py`, `export_project_to_word`: add `except ExportError: raise` immediately before the catch-all `except Exception` (~:528).
- `routers/export.py`, `export_word` (~:56-88): after `except HTTPException: raise`, add a branch that unlinks the temp file the same way the catch-all does today, then re-raises:

  ```python
  except ExportError:
      _unlink_quietly(tmp_path)   # or the existing inline unlink pattern
      raise
  ```

  - Keep the `if not ok` → 500 branch for other failures.
- `main.py:481` `export_error_handler` then returns `{detail, code}` with the error's status code (400).
- Tests:
  - rewrite `tests/test_export_acrf.py::test_acrf_export_rejects_invalid_annotation_positions` to `pytest.raises(ExportError)` with `.code == "EXPORT_DATA_INCOMPATIBLE"`;
  - add a router-level test: 400, body has `detail` + `code`, and no temp file left behind (patch `tempfile` or spy on the unlink).
- The frontend already shows `err.detail` (`App.vue` exportWord). No frontend change.

## F3 — Session-scoped token handling in `useApi.js`

- In every request method (`get` / `cachedGet` / `post` / `put` / `patch` / `del`, whatever the module actually exports), capture `const sentToken = localStorage.getItem('crf_token')` before `fetch`, and pass it to the status check.
- In the status check: if `localStorage.getItem('crf_token') !== sentToken`, skip **both** `_storeRefreshedToken` and `_handle401`. Still throw or return as today, so callers see the failure. When the tokens match, behavior is unchanged.
- Bypass sites are verified not to write tokens or handle 401, so leave them unchanged:
  - `App.vue` exportWord;
  - `LoginView.vue` (writes the token on login, intentionally);
  - `ProjectInfoTab.vue`;
  - `DocxScreenshotPanel.vue`.
- Contract: rewrite `.trellis/spec/guides/cross-stack-contracts.md` §3 rules 4–5 (:156-157):
  - "On a 401 whose request carried the current token, …";
  - "… overwrite `crf_token` only if the request carried the current token."

  Update its validation list (:164).
- Tests, in a new `frontend/tests/useApiSessionRace.test.js`, using the stub pattern of `frontend/tests/apiCacheInvalidation.test.js:8-27` (mutable `localStorage` stub, `installFetchStub`, plus a `window.dispatchEvent` counter):
  - a stale OK response carrying `x-refreshed-token` does not overwrite a newer token;
  - a stale 401 neither removes a newer token nor dispatches `crf:auth-expired`;
  - same-token regressions: a refresh still writes, and a 401 still logs out.

  Update `frontend/tests/appSettingsShell.test.js` if it asserts the old unconditional wording or source.
- This is a frontend change, so a Haiku read-only review is required (RB §6).

## F4 — Unlink the logo after commit

- `project_purge_service.py`:
  - `purge_project(session, project) -> Optional[Path]` deletes and flushes as today, but **returns** the resolved logo path (or `None`) instead of unlinking;
  - add `remove_logo_file(path: Optional[Path]) -> None`, which keeps today's `OSError` → `logger.warning` semantics;
  - fix the docstring.
- `recycle_bin_cleanup_service.py:~200-201`: `path = purge_project(...)`, then `session.commit()`, then `remove_logo_file(path)`.
- `routers/admin.py:174` `hard_delete_project`:
  - switch the dependency to `get_plain_session`, the project's documented session for composite writes that commit explicitly so files can be compensated (`database.py:1408-1414`);
  - then `path = purge_project(...)`, `session.commit()`, `remove_logo_file(path)`;
  - **do not** call `commit()` inside a `get_session` request. Its outer `begin()` context makes later session use raise `InvalidRequestError`, as documented in `database.py`.
  - Check that the existing 404 and 400 guards still run before any write.
  - The conftest `client` already overrides `get_plain_session` (conftest `_override_plain`).
- Tests:
  - extend `tests/test_admin_project_ops.py::test_hard_delete_removes_project_logo_file`, and add the analogous case in `tests/test_recycle_bin_cleanup.py`;
  - register `event.listen(Session, "after_commit", ...)`, scoped to the test, that records `logo_path.exists()` at commit time;
  - assert it was `True` at commit time and the file is gone afterwards;
  - remove the listener in teardown.

## F5 — Log unhandled 500s

- `main.py` `security_headers_middleware` (:335, `except Exception:` at :339): in that block add `logging.getLogger("src.main").exception("未处理异常 %s %s", request.method, request.url.path)` before building the 500 response.
  - Use the logger name already used in `main.py`; check it.
  - Per `.trellis/spec/backend/logging-guidelines.md`, do not log request bodies or headers.
- Test: extend `tests/test_app_security.py`. It already mounts a temporary `/_test-500` route (~:78-100). Capture records on that logger with `caplog` and assert an ERROR record with `exc_info` is present.

## F6 — Single deduction in the cleanup plan

- `recycle_bin_cleanup_service.py:169`: `total_bytes_after=total_after`.
- Test: extend `tests/test_recycle_bin_cleanup.py::test_size_rule_deletes_oldest_first_until_under_threshold`, or add a sibling test, asserting `plan.total_bytes_after == total − sizes of all selected projects`.

## Commit split

| # | Commit |
|---|---|
| 1 | `fix(forms): 表单复制保留字段全部展示属性，三条复制路径共用复制函数` |
| 2 | `fix(export): Word 导出的具体错误原样返回，不再被吞成通用失败` |
| 3 | `fix(auth): 迟到的响应不再覆盖或清除新会话的令牌` (frontend + contract §3) |
| 4 | `fix(admin): 彻底删除项目时先提交数据库再删除 Logo 文件` |
| 5 | `fix(main): 未处理异常返回 500 时记录完整堆栈` |
| 6 | `fix(recycle-bin): 清理计划的估算剩余容量不再重复扣减` |

Docs go into the commit they describe. Commits 5 and 6 may be squashed if the user prefers.

## Rollback

Each commit is independent and can be reverted alone. F3 also reverts its contract text.
