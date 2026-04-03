# CRF Editor 開發守則

## 專案概述
- **目標**：提供醫療 CRF (Case Report Form) 表單設計與管理工具。
- **技術棧**：
  - **後端**：Python (FastAPI) + SQLAlchemy (SQLite)。
  - **前端**：Vue 3 (Vite) + Element Plus + Vanilla CSS。

## 專案架構
- `backend/src/models/`：SQLAlchemy 數據模型。
- `backend/src/repositories/`：數據訪問層，封裝 CRUD 邏輯。
- `backend/src/services/`：業務邏輯層，處理複雜跨模型操作（如克隆、排序、導出）。
- `backend/src/routers/`：FastAPI 路由，處理請求響應。
- `frontend/src/components/`：Vue 組件。
- `frontend/src/composables/`：共享邏輯（API 調用、渲染器等）。

## 代碼規範
- **後端命名**：變量與函數使用 `snake_case`，類名使用 `PascalCase`。
- **前端命名**：組件文件使用 `PascalCase`，變量與函數使用 `camelCase`。
- **類型提示**：後端必須使用 Python Type Hints，前端優先使用 TypeScript 風格（雖為 JS 專案，但需保持清晰的對象結構）。

## 功能實作規範
- **排序管理**：
  - 必須使用 `backend/src/services/order_service.py` 提供的 `OrderService` 進行序號操作。
  - 排序字段統一命名為 `order_index`，基准為 **1-based**。
- **軟刪除 (回收站)**：
  - 需要回收站功能時，模型必須包含 `deleted_at: Mapped[Optional[datetime]]`。
  - 查詢時必須過濾 `deleted_at.is_(None)`。
- **數據完整性**：
  - 執行級聯刪除或克隆時，必須確保關聯資源（單位、字典、字段定義）的引用完整性。
- **API 響應**：
  - 統一使用 `src/schemas/` 下的 Pydantic 模型定義響應結構。

## 關鍵檔案交互規範
- 修改 `backend/src/models/` 後，必須同步更新 `backend/src/schemas/`。
- 修改後端 API 契約後，必須同步更新 `frontend/src/composables/useApi.js` 或組件內的調用邏輯。
- 修改表單渲染邏輯時，需同步檢查 `frontend/src/composables/useCRFRenderer.js` 與 `backend/src/services/export_service.py`。

## AI 決策規範
- **Bug 修復**：必須先寫測試或腳本重現 Bug，修復後驗證。
- **組件複用**：優先複用 Element Plus 組件與現有 Composable，禁止自行實現複雜 UI。
- **衝突處理**：若遇到排序不一致，以 `OrderService` 的 1-based `order_index` 為準。

## 禁止事項
- **禁止** 在 Router 中編寫複雜業務邏輯，必須下沉到 Service 或 Repository。
- **禁止** 繞過權限檢查。所有涉及項目的 API 必須驗證 `owner_id`（除非管理員批處理）。
- **禁止** 在生產代碼中使用 `print()`，請使用標準 logging（如果專案已配置）。
- **禁止** 提交未經驗證的數據庫 Schema 變更。
