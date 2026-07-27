import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

describe('dbType field type wiring', () => {
  it('App.vue provides projectDbType from selectedProject', () => {
    const src = read('src/App.vue')
    assert.match(src, /provide\('projectDbType',\s*projectDbType\)/)
    assert.match(src, /computed\(\(\)\s*=>\s*selectedProject\.value\?\.db_type\s*\|\|\s*'其他'\)/)
    assert.match(src, /db_type:\s*'其他'/)
  })

  it('FieldsTab injects projectDbType and uses disabled options', () => {
    const src = read('src/components/FieldsTab.vue')
    assert.match(src, /inject\('projectDbType'/)
    assert.match(src, /buildFieldTypeOptions\(/)
    assert.match(src, /:disabled="t\.disabled"/)
    assert.match(src, /isChoiceField\(/)
    assert.doesNotMatch(
      src,
      /\['单选',\s*'多选',\s*'单选（纵向）',\s*'多选（纵向）'\]\.includes\(editProp\.field_type\)/,
    )
  })

  it('FormDesignerTab injects projectDbType and uses disabled options', () => {
    const src = read('src/components/FormDesignerTab.vue')
    assert.match(src, /inject\('projectDbType'/)
    assert.match(src, /buildFieldTypeOptions\(/)
    assert.match(src, /designerAvailableFieldTypes/)
    assert.match(src, /:disabled="t\.disabled"/)
  })

  it('ProjectInfoTab places 数据库类型 after 版本号', () => {
    const src = read('src/components/ProjectInfoTab.vue')
    const versionIdx = src.indexOf('label="版本号"')
    const dbTypeIdx = src.indexOf('label="数据库类型"')
    const coverIdx = src.indexOf('封面页信息')
    assert.ok(versionIdx > 0)
    assert.ok(dbTypeIdx > versionIdx)
    assert.ok(coverIdx > dbTypeIdx)
    assert.match(src, /db_type:\s*p\.db_type\s*\|\|\s*'其他'/)
    assert.match(src, /el-radio-group/)
    assert.match(src, /label="赛美斯"/)
    assert.match(src, /label="其他"/)
  })
})
