// OID 字符集前端校验（req2）
// 契约与后端 backend/src/schemas/_common.py 对齐：OID 只允许字母、数字、`.`、`_`、`-`。
// 可选字段空/空白视为未设（放行）；必填字段去空白后不得为空。

export const OID_PATTERN = /^[A-Za-z0-9._-]+$/;
export const OID_ERROR = 'OID 只允许由字母、数字、“-”、“_”和“.”组成';

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
