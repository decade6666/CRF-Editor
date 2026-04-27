# Tasks — multi-user-ui-improvements

## Phase A — Pure Frontend UI (No Backend Changes)

- [x] A.1 ProjectInfoTab.vue: Move 试验名称 el-form-item to first row of 封面页信息 section (Req 2)
- [x] A.2 CodelistsTab.vue: Wrap selected.name with el-tooltip and truncation style (Req 3)
- [x] A.3 CodelistsTab.vue: Align label column CSS with value column (font-size, vertical alignment) (Req 4)
- [x] A.4 App.vue: Replace del-btn span with el-button type=danger link text=删除, always visible (Req 7)

## Phase B — Frontend Sort Logic

- [x] B.1 CodelistsTab.vue: Add sortOrder ref defaulting to desc; on selected change, sort options descending by order_index (Req 5)
- [x] B.2 CodelistsTab.vue left table: Add ArrowUp/ArrowDown icon in 序号 column header; clicking toggles sortOrder; apply sort in filteredCodelists computed (Req 6)
- [x] B.3 CodelistsTab.vue right draggable: Add sort icon in custom header; bind :disabled="sortOrder !== 'default'" on draggable; sorted local ref drives display (Req 6)
- [x] B.4 UnitsTab.vue: Add sortOrder ref (default asc); add sort icon in 序号 header; apply sort in filteredUnits computed (Req 6)
- [x] B.5 FieldsTab.vue: Add sortOrder ref (default asc); add sort icon in 序号 header; apply sort in filteredFields computed (Req 6)
- [x] B.6 VisitsTab.vue: Add sortOrder ref (default asc); add sort icon in 序号 header; apply sort in filteredVisits computed (Req 6)
- [x] B.7 FormDesignerTab.vue: Add sortOrder ref and sort icon if 序号 column exists; apply sort in filtered computed (Req 6)
- [x] B.8 App.vue: Provide resetSortKey (or watch selectedProject) so all tab sort states reset to their defaults when selected project changes (Req 6)

## Phase C — Project Copy

- [x] C.1 Backend: Create backend/src/services/project_copy_service.py with ProjectCopyService.copy_within_db(session, project_id) implementing full ordered flush + ID remapping for all 9 entity types
- [x] C.2 Backend: Add POST /api/projects/{project_id}/copy endpoint in routers/projects.py; single transaction; return 201 ProjectResponse; rollback and raise 500 on failure
- [x] C.3 Frontend App.vue: Add 复制 el-button (type=primary, link) left of 删除; implement copyProject() with copyingProjectId loading state; refresh list and select new project on success; show error toast on failure (Req 8)

## Phase D — Multi-user Auth and Data Isolation

- [x] D.1 Backend: Create backend/src/auth/models.py with User SQLAlchemy model (username PK, hashed_password, is_admin, is_deleted, created_at) targeting users.db
- [x] D.2 Backend: Create backend/src/auth/engine.py with get_users_engine() and users SessionLocal; create data/users.db on startup; WAL + FK pragmas
- [x] D.3 Backend: Create backend/src/auth/service.py with hash_password, verify_password (bcrypt), create_signed_cookie, verify_signed_cookie (itsdangerous TimestampSigner, TTL 86400s)
- [x] D.4 Backend: Admin bootstrap in main.py startup: if users table empty, read ADMIN_PASSWORD env; if unset generate 16-char random password and print to console; create admin user with is_admin=1
- [x] D.5 Backend: Extend database.py: add get_user_engine(username) with engine cache dict, WAL/FK/busy_timeout pragmas, init_db_for_engine call; add dispose_user_engine(username) for soft-delete cleanup
- [x] D.6 Backend: Extend config.py: add username parameter to get_config(username) and update_config(username, ...); config path = data/{username}/config.yaml; create with defaults if absent; remove global LRU singleton
- [x] D.7 Backend: Create backend/src/auth/dependencies.py with require_user (verify cookie, load User, check not is_deleted, open user engine/session) and require_admin (require_user + assert is_admin) FastAPI Depends
- [x] D.8 Backend: Create routers/auth.py with POST /api/auth/login (verify password, set Cookie), POST /api/auth/logout (clear Cookie), GET /api/auth/me (return current user info)
- [x] D.9 Backend: Update all existing business routers (projects, codelists, units, fields, forms, visits, settings, import_template) to inject require_user and use user-scoped DB session and config
- [x] D.10 Backend: Update ai_review_service.py and export_service.py to accept user-scoped config object instead of calling global get_config()
- [x] D.11 Backend: Create routers/admin.py with GET /api/admin/users, POST /api/admin/users, POST /api/admin/users/{username}/reset-password, DELETE /api/admin/users/{username} (soft-delete), GET /api/admin/users/{username}/projects; all require require_admin
- [x] D.12 Backend: Extend ProjectCopyService with copy_across_db(src_session, dst_session, project_id) for admin push; add POST /api/admin/users/{src_username}/projects/{project_id}/push endpoint
- [x] D.13 Frontend: Create LoginPage.vue with username + password inputs, submit button, error message display; calls POST /api/auth/login on submit
- [x] D.14 Frontend App.vue: Add isLoggedIn ref and currentUser ref; on mount call GET /api/auth/me to restore session; wrap app body in v-if=isLoggedIn with LoginPage in v-else; add username display and 注销 button in header
- [x] D.15 Frontend: Create AdminPanel.vue with user list table, create user form, reset password dialog, soft-delete confirm, and push project dialog; accessible only when currentUser.is_admin
