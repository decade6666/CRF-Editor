export const DB_TYPE_SAIMEISI = '赛美斯'
export const DB_TYPE_OTHER = '其他'
export const MULTISELECT_FIELD_TYPES = Object.freeze(['多选', '多选（纵向）'])

/** 仅「赛美斯」允许新建/回选多选类型；缺省与 null 均视为不允许。 */
export function allowsMultiselect(dbType) {
  return dbType === DB_TYPE_SAIMEISI
}

export function isMultiselectFieldType(fieldType) {
  return MULTISELECT_FIELD_TYPES.includes(fieldType)
}

/**
 * 按项目数据库类型过滤字段类型下拉选项。
 * 多选类型：赛美斯 → 正常可选；其他 → 仅当等于当前字段类型时以 disabled 保留。
 *
 * @param {string[]} allTypes
 * @param {string} dbType
 * @param {string} currentType
 * @returns {{ value: string, label: string, disabled: boolean }[]}
 */
export function buildFieldTypeOptions(allTypes, dbType, currentType) {
  const multiAllowed = allowsMultiselect(dbType)
  const options = []
  for (const t of allTypes || []) {
    if (!isMultiselectFieldType(t) || multiAllowed) {
      options.push({ value: t, label: t, disabled: false })
      continue
    }
    if (t === currentType) {
      options.push({ value: t, label: t, disabled: true })
    }
  }
  return options
}
