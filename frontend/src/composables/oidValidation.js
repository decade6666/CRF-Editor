// OID 字符集前端校验（req2）
// 契约与后端 backend/src/schemas/_common.py 对齐：OID 只允许字母、数字、`.`、`_`、`-`。
// 可选字段空/空白视为未设（放行）；必填字段去空白后不得为空。
// 注意：码表「选项」的 code 为自由文本（与标签一致，不限制字符内容），不适用本模块。
import { DB_TYPE_SAIMEISI } from './fieldTypeAvailability.js';

// 赛美斯手工 OID 长度限制：仅数据库类型为「赛美斯」时，人工修改保存的字段 OID ≤ 8 位、
// 表单 OID ≤ 10 位；未改动的系统自动值 / 历史值 / 复制默认值豁免。豁免判据是与基线的
// 值比较——「FIELD_ / FORM_ 前缀形态」不构成豁免（用户可手输同形超长值）。
export const FIELD_OID_MAX_LENGTH = 8;
export const FORM_OID_MAX_LENGTH = 10;
export const FIELD_OID_LENGTH_ERROR = '赛美斯数据库的字段 OID 最多为 8 位';
export const FORM_OID_LENGTH_ERROR = '赛美斯数据库的表单 OID 最多为 10 位';

/**
 * 编辑保存的 OID 长度策略：返回错误消息，无错返回 null。
 * 数据库类型非「赛美斯」、kind 未知、候选与基线（去空白后）一致、或未超上限时不限制。
 * @param {{ dbType: string, kind: 'field'|'form', candidate: string, baseline: string|null }} input
 */
export function editedOidLengthError({ dbType, kind, candidate, baseline }) {
  if (dbType !== DB_TYPE_SAIMEISI) return null;
  const maxLength = kind === 'field' ? FIELD_OID_MAX_LENGTH : kind === 'form' ? FORM_OID_MAX_LENGTH : 0;
  if (!maxLength) return null;
  const next = candidate == null ? '' : String(candidate).trim();
  const original = baseline == null ? '' : String(baseline).trim();
  if (next === original) return null;
  if (next.length <= maxLength) return null;
  return kind === 'form' ? FORM_OID_LENGTH_ERROR : FIELD_OID_LENGTH_ERROR;
}

/**
 * 录入层强制上限：赛美斯项目返回字段/表单 OID 的 maxlength（键入/粘贴到上限即无法继续填充），
 * 其余返回 undefined（el-input/autocomplete 不渲染 maxlength，行为不变）。
 * maxlength 不影响程序化赋值——27 位生成默认值、候选换绑水合等超长基线仍可原样预填（豁免不变）。
 */
export function oidMaxLength(dbType, kind) {
  if (dbType !== DB_TYPE_SAIMEISI) return undefined;
  if (kind === 'field') return FIELD_OID_MAX_LENGTH;
  if (kind === 'form') return FORM_OID_MAX_LENGTH;
  return undefined;
}

export const OID_PATTERN = /^[A-Za-z0-9._-]+$/;
export const OID_ERROR = 'OID 只允许由字母、数字、“-”、“_”和“.”组成';

/**
 * 录入层 ASCII 大写归一（大写 OID 录入）：仅转换 ASCII a-z 为 A-Z；
 * 不动空白、数字、`.`/`_`/`-` 与非 ASCII 字符（如 ß 不得经 toUpperCase 膨胀为 SS）。
 * 仅用于用户键入/粘贴事件的实际编辑，以及新复制 OID 的生成（buildCopyVariableName）；
 * 程序化水合（加载、候选选择、回填既有复制草稿种子、恢复）不得调用。
 * 与后端写入点 backend/src/schemas/_common.py::upper_ascii_oid 语义一致。
 */
export function toUpperAsciiOid(value) {
  return String(value ?? '').replace(/[a-z]/g, (ch) => ch.toUpperCase());
}

// 可选 OID：null/空/纯空白放行；有值才校验字符集。
export function isValidOptionalOid(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return text === '' || OID_PATTERN.test(text);
}

// 必填 OID：去空白后必须非空且符合字符集。
export function isValidRequiredOid(value) {
  if (value == null) return false;
  const text = String(value).trim();
  return text !== '' && OID_PATTERN.test(text);
}
