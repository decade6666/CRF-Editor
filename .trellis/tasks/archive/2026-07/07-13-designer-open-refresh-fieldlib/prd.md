# 打开设计器自动刷新字段库（G5 / 需求 6）

> 父任务：`07-13-designer-fields-ux-batch`

## Goal

表单设计器左侧字段库在每次"打开设计弹窗"时自动刷新一遍，确保拉到最新的字段定义列表（避免在字段界面新增/改动后，设计器仍显示旧缓存）。

## Background and confirmed facts

- `openDesigner()`（`FormDesignerTab.vue:2750-2765`）调用 `ensureDesignerAuxiliaryDataLoaded()`。
- `ensureDesignerAuxiliaryDataLoaded()`（`2659-2672`）被 `designerAuxiliaryLoaded` / `designerAuxiliaryLoading` 门控：**已加载过就直接 return**，`Promise.all([loadFieldDefs(), loadCodelists(), loadUnits()])` 只跑一次。
- `loadFieldDefs()`（`226-228`）用 `api.cachedGet('/api/projects/{id}/field-definitions')` —— 即便再次调用，命中缓存也可能返回旧数据，需先 `api.invalidateCache`。
- 已有 `refreshKey` watch（`301-305`）会在全局刷新时 `loadFieldDefs()`；但打开弹窗这一动作当前不强制刷新。

## Requirements

- R1：每次 `openDesigner()` 打开设计弹窗时，强制刷新字段定义列表（字段库），拿到后端最新数据。
- R2：实现方式为打开时使字段定义缓存失效并重新拉取（`api.invalidateCache('/api/projects/{id}/field-definitions')` + `loadFieldDefs()`），或对 `ensureDesignerAuxiliaryDataLoaded` 增加"强制刷新字段定义"分支，绕过 `designerAuxiliaryLoaded` 缓存门控——但保留 codelists/units 的既有加载/缓存行为（除非确有必要一起刷）。
- R3：不引入重复并发拉取或打开卡顿；刷新失败沿用 `designerAuxiliaryLoadError` 现有错误提示路径。
- R4：不破坏 `designerAuxiliaryLoaded` 对 codelists/units 的一次性加载语义与后续 `refreshKey`/切项目重置逻辑。

## Acceptance Criteria

- [ ] AC1：在字段界面新增/修改字段后打开设计器，左侧字段库立即显示最新字段（无需手动全局刷新）。
- [ ] AC2：重复打开设计器每次都刷新字段定义，不使用过期缓存。
- [ ] AC3：打开失败时错误提示与既有一致；无并发重复请求或明显打开延迟。
- [ ] AC4：`node --test tests/*.test.js`、`npm run lint`、`npm run build` 通过；补充打开即刷新的源码级/行为回归。

## Out of scope

- 字段库的实时订阅/轮询刷新（仅"打开时刷新"）。
- codelists/units 是否也强制刷新（默认不改，若需一起刷在实现时说明）。

## Planning status

PRD-only 轻量任务。唯一实现选择：invalidate+reload vs. 门控加强制分支；直接实现即可。
