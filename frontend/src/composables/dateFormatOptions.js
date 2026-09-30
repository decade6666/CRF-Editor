/**
 * 日期 / 日期时间 / 时间字段的格式选项唯一来源。
 *
 * 字段库（FieldsTab.vue）与表单设计器（FormDesignerTab.vue）共用；
 * 后端 startup 规范化映射（backend/src/database.py::_DATE_FORMAT_CANONICALS）
 * 以本列表为对齐基准（backend/tests/test_date_format_migration.py 解析本文件校验）。
 * 保持字面量 `key: ['…']` 形态：后端契约测试用正则直接解析本文件。
 */
export const DATE_FORMAT_OPTIONS = {
  日期: ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MMM/yyyy', 'dd-MMM-yyyy', 'yyyy/MM/dd'],
  日期时间: ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd HH', 'yyyy/MM/dd HH:mm:ss', 'dd/MM/yyyy HH:mm:ss'],
  时间: ['HH:mm:ss', 'HH:mm', 'HH', 'hh:mm:ss AP', 'hh:mm AP', 'hh AP'],
}

export const DEFAULT_DATE_FORMATS = {
  日期: 'yyyy-MM-dd',
  日期时间: 'yyyy-MM-dd HH:mm',
  时间: 'HH:mm',
}
