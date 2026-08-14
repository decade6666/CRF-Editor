import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function readSource(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

const mainSource = readSource('src/main.js')

test('main.js registers the official Element Plus zh-cn locale', () => {
  assert.match(mainSource, /import zhCn from 'element-plus\/es\/locale\/lang\/zh-cn'/)
  assert.match(mainSource, /app\.use\(ElementPlus, \{ locale: zhCn \}\)/)
})

test('main.js does not override Element Plus default button texts', () => {
  assert.doesNotMatch(mainSource, /confirmButtonText|cancelButtonText|'确认'|"确认"/)
})

const PAGES = {
  'src/components/CodelistsTab.vue': { add: '新增字典', batchDelete: '批量删除字典' },
  'src/components/UnitsTab.vue': { add: '新增单位', batchDelete: '批量删除单位' },
  'src/components/FieldsTab.vue': { add: '新增字段', batchDelete: '批量删除字段' },
  'src/components/FormDesignerTab.vue': { add: '新建表单', batchDelete: '批量删除表单' },
  'src/components/VisitsTab.vue': { add: '新增访视', batchDelete: '批量删除访视' },
}

function scopedSource(file) {
  const source = readSource(file)
  if (file.includes('FormDesignerTab')) {
    // 仅外层表单列表区域；全屏设计器工具栏属于后续子任务
    const start = source.indexOf('class="fd-formlist"')
    const end = source.indexOf('openDesigner', start)
    return source.slice(start, end)
  }
  return source
}

for (const [file, { add, batchDelete }] of Object.entries(PAGES)) {
  test(`${file} toolbar uses icon add and always-visible batch delete buttons`, () => {
    const source = scopedSource(file)

    assert.match(source, new RegExp(`:icon="Plus" aria-label="${add}"`))
    assert.match(
      source,
      new RegExp(`:icon="Delete" aria-label="${batchDelete}"[\\s\\S]*?:disabled="!sel`),
    )
    assert.match(source, /<el-tooltip[\s\S]*?content="/)
    assert.doesNotMatch(source, /批量删除\(\{\{/)
  })
}

test('CodelistsTab option list also uses iconized toolbar buttons', () => {
  const source = readSource('src/components/CodelistsTab.vue')

  assert.match(source, /:icon="Plus" aria-label="新增选项"/)
  assert.match(source, /:icon="Delete" aria-label="批量删除选项"[\s\S]*?:disabled="!selOpts\.length"/)
})

test('action columns use semantic icon buttons with tooltips and aria-labels', () => {
  const codelists = readSource('src/components/CodelistsTab.vue')
  const units = readSource('src/components/UnitsTab.vue')
  const fields = readSource('src/components/FieldsTab.vue')
  const forms = scopedSource('src/components/FormDesignerTab.vue')
  const visits = readSource('src/components/VisitsTab.vue')

  for (const source of [codelists, fields, forms, visits]) {
    assert.match(source, /:icon="DocumentCopy" aria-label="复制"/)
  }
  for (const source of [codelists, units, forms, visits]) {
    assert.match(source, /:icon="EditPen" aria-label="编辑"/)
  }
  for (const source of [codelists, units, fields, forms, visits]) {
    assert.match(source, /:icon="Delete" aria-label="删除"/)
  }

  assert.match(visits, /:icon="View" aria-label="预览"/)
  assert.match(visits, /:icon="CircleClose" aria-label="移除"/)
  assert.match(codelists, /:icon="Plus" aria-label="新增选项"/)
})

test('visits batch edit keeps its text button while add and batch delete are icons', () => {
  const visits = readSource('src/components/VisitsTab.vue')

  assert.match(visits, /<el-button type="info" plain size="small" @click="showPreview = true">批量编辑<\/el-button>/)
  assert.doesNotMatch(visits, /:icon="Plus"[^>]*@click="showPreview = true"/)
})
