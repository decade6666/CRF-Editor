import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const currentDir = import.meta.dirname

const dialogSource = readFileSync(
  resolve(currentDir, '../src/components/TemplateFieldSearchDialog.vue'),
  'utf8',
)
const appSource = readFileSync(resolve(currentDir, '../src/App.vue'), 'utf8')
const formDesignerSource = readFileSync(resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const rendererSource = readFileSync(resolve(currentDir, '../src/composables/useCRFRenderer.js'), 'utf8')

async function loadModule() {
  return import('../src/composables/templateFieldSearch.js')
}

async function loadRendererModule() {
  return import('../src/composables/useCRFRenderer.js')
}

function assertInOrder(source, patterns, message) {
  let cursor = 0
  for (const pattern of patterns) {
    const match = pattern.exec(source.slice(cursor))
    assert.ok(match, message || `missing ordered pattern: ${pattern}`)
    cursor += match.index + match[0].length
  }
}

const BASE_ENTRY = {
  key: '1:10',
  variable_name: 'AGE',
  label: '年龄',
  field_type: '数值',
  integer_digits: 3,
  decimal_digits: 1,
  date_format: null,
  checkbox_label: null,
  codelist_name: null,
  options: [],
  unit_symbol: 'cm',
  label_aliases: [],
  sources: [],
}

describe('formatTemplateFieldFormat', () => {
  test('numeric renders integer/decimal digit parts and omits null parts', async () => {
    const { formatTemplateFieldFormat } = await loadModule()
    assert.equal(formatTemplateFieldFormat({ ...BASE_ENTRY }), '整数3位 小数1位')
    assert.equal(
      formatTemplateFieldFormat({ ...BASE_ENTRY, decimal_digits: null }),
      '整数3位',
    )
    assert.equal(
      formatTemplateFieldFormat({ ...BASE_ENTRY, integer_digits: null }),
      '小数1位',
    )
    assert.equal(
      formatTemplateFieldFormat({ ...BASE_ENTRY, integer_digits: null, decimal_digits: null }),
      '',
    )
  })

  test('date types use date_format or the shared renderer defaults', async () => {
    const { formatTemplateFieldFormat } = await loadModule()
    const { DEFAULT_DATE_FORMATS } = await loadRendererModule()
    assert.equal(
      formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '日期', date_format: 'dd/MM/yyyy' }),
      'dd/MM/yyyy',
    )
    assert.equal(formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '日期' }), DEFAULT_DATE_FORMATS['日期'])
    assert.equal(
      formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '日期时间' }),
      DEFAULT_DATE_FORMATS['日期时间'],
    )
    assert.equal(formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '时间' }), DEFAULT_DATE_FORMATS['时间'])
  })

  test('checkbox prefixes □ and falls back to the default ✔ character', async () => {
    const { formatTemplateFieldFormat } = await loadModule()
    assert.equal(formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '复选' }), '□✔')
    assert.equal(
      formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '复选', checkbox_label: '有' }),
      '□有',
    )
  })

  test('choice types render codelist name with code=decode options', async () => {
    const { formatTemplateFieldFormat } = await loadModule()
    const options = [
      { code: '1', decode: '男' },
      { code: '2', decode: '女' },
    ]
    assert.equal(
      formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '单选', codelist_name: '性别', options }),
      '性别：1=男, 2=女',
    )
    assert.equal(
      formatTemplateFieldFormat({
        ...BASE_ENTRY,
        field_type: '多选（纵向）',
        codelist_name: '症状',
        options: [{ code: null, decode: '无' }],
      }),
      '症状：无',
    )
  })

  test('choice without codelist renders the unset hint; plain types render empty', async () => {
    const { formatTemplateFieldFormat } = await loadModule()
    assert.equal(formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '单选' }), '未设置字典')
    assert.equal(formatTemplateFieldFormat({ ...BASE_ENTRY, field_type: '文本' }), '')
  })
})

describe('templateFieldSearchTexts + shared ranking', () => {
  test('candidate texts are OID, label, then aliases', async () => {
    const { templateFieldSearchTexts } = await loadModule()
    assert.deepEqual(templateFieldSearchTexts({ ...BASE_ENTRY, label_aliases: ['岁'] }), [
      'AGE',
      '年龄',
      '岁',
    ])
  })

  test('label query finds the OID and OID query finds the label', async () => {
    const { templateFieldSearchTexts } = await loadModule()
    const { rankFuzzyMatches } = await import('../src/composables/searchRanking.js')
    const entries = [
      { ...BASE_ENTRY },
      { ...BASE_ENTRY, key: '1:11', variable_name: 'SEX', label: '性别' },
    ]
    assert.deepEqual(
      rankFuzzyMatches(entries, '年龄', templateFieldSearchTexts).map((entry) => entry.variable_name),
      ['AGE'],
    )
    assert.deepEqual(
      rankFuzzyMatches(entries, 'sex', templateFieldSearchTexts).map((entry) => entry.label),
      ['性别'],
    )
  })

  test('form-level display alias matches its entry', async () => {
    const { templateFieldSearchTexts } = await loadModule()
    const { rankFuzzyMatches } = await import('../src/composables/searchRanking.js')
    const entries = [
      { ...BASE_ENTRY, label_aliases: ['体重'] },
      { ...BASE_ENTRY, key: '1:11', variable_name: 'WT', label: '体重' },
    ]
    assert.deepEqual(
      rankFuzzyMatches(entries, '体重', templateFieldSearchTexts).map((entry) => entry.variable_name),
      ['AGE', 'WT'],
    )
  })
})

describe('source helpers', () => {
  test('countTemplateFieldForms counts only sources placed on a form', async () => {
    const { countTemplateFieldForms } = await loadModule()
    assert.equal(
      countTemplateFieldForms({
        ...BASE_ENTRY,
        sources: [
          { project_name: '研究A', project_version: '1.0', form_name: '血常规', display_label: null },
          { project_name: '研究B', project_version: null, form_name: null, display_label: null },
        ],
      }),
      1,
    )
    assert.equal(countTemplateFieldForms({ ...BASE_ENTRY, sources: [] }), 0)
  })

  test('formatTemplateFieldSource renders project/form line with display-label suffix', async () => {
    const { formatTemplateFieldSource } = await loadModule()
    assert.equal(
      formatTemplateFieldSource({
        project_name: '研究A',
        project_version: '1.0',
        form_name: '血常规',
        display_label: null,
      }),
      '研究A 1.0 / 血常规',
    )
    assert.equal(
      formatTemplateFieldSource({
        project_name: '研究A',
        project_version: '2.0',
        form_name: '体格检查',
        display_label: '体重',
      }),
      '研究A 2.0 / 体格检查（显示为：体重）',
    )
  })

  test('library-only source renders the 仅字段库 tail', async () => {
    const { formatTemplateFieldSource } = await loadModule()
    assert.equal(
      formatTemplateFieldSource({ project_name: '研究A', project_version: '1.0', form_name: null, display_label: null }),
      '研究A 1.0 / 仅字段库',
    )
  })
})

describe('buildCopyToastText', () => {
  test('prefixes 已复制 and truncates beyond 30 characters with ellipsis', async () => {
    const { buildCopyToastText } = await loadModule()
    assert.equal(buildCopyToastText('AGE'), '已复制 AGE')
    const long = 'a'.repeat(31)
    const toast = buildCopyToastText(long)
    assert.equal(toast, `已复制 ${'a'.repeat(30)}…`)
    assert.equal(toast.length, 4 + 31)
  })
})

describe('constants and renderer defaults', () => {
  test('page size is 50', async () => {
    const { TEMPLATE_FIELD_PAGE_SIZE } = await loadModule()
    assert.equal(TEMPLATE_FIELD_PAGE_SIZE, 50)
  })

  test('useCRFRenderer exports DEFAULT_DATE_FORMATS used by renderCtrl without inline literals', async () => {
    const { DEFAULT_DATE_FORMATS } = await loadRendererModule()
    assert.deepEqual(DEFAULT_DATE_FORMATS, {
      '日期': 'yyyy-MM-dd',
      '日期时间': 'yyyy-MM-dd HH:mm',
      '时间': 'HH:mm',
    })
    assert.equal((rendererSource.match(/'yyyy-MM-dd HH:mm'/g) || []).length, 1)
    const renderCtrlBody = rendererSource.slice(rendererSource.indexOf('export function renderCtrl'))
    assert.match(renderCtrlBody, /DEFAULT_DATE_FORMATS\['日期'\]/)
    assert.match(renderCtrlBody, /DEFAULT_DATE_FORMATS\['日期时间'\]/)
    assert.match(renderCtrlBody, /DEFAULT_DATE_FORMATS\['时间'\]/)
    assert.doesNotMatch(renderCtrlBody, /field\.date_format \|\| 'yyyy-MM-dd/)
  })
})

describe('TemplateFieldSearchDialog wiring', () => {
  test('dialog is non-modal, draggable, penetrable and teleported', () => {
    assert.match(dialogSource, /:modal="false"/)
    assert.match(dialogSource, /modal-penetrable/)
    assert.match(dialogSource, /draggable/)
    assert.match(dialogSource, /append-to-body/)
    assert.match(dialogSource, /:lock-scroll="false"/)
    assert.match(dialogSource, /:close-on-click-modal="false"/)
  })

  test('dialog width caps at 94vw through a non-scoped teleported root rule', () => {
    assert.match(dialogSource, /width="960px"/)
    assert.match(
      dialogSource,
      /<style>\s*\/\*[\s\S]*\*\/\s*\.template-field-search-dialog \{[\s\S]*max-width: 94vw;[\s\S]*\}\s*<\/style>/,
    )
  })

  test('dialog loads the index through useApi once per open and keeps state after', () => {
    assert.match(dialogSource, /api\.get\('\/api\/template-fields'\)/)
    assert.doesNotMatch(dialogSource, /cachedGet/)
    assert.match(
      dialogSource,
      /watch\(\s*\(\) => props\.modelValue,\s*\(open\) => \{[\s\S]*\},\s*\{ immediate: true \},?\s*\)/,
    )
  })

  test('dialog searches through shared ranking and paginates 50 per page', () => {
    assert.match(dialogSource, /rankFuzzyMatches\(/)
    assert.match(dialogSource, /templateFieldSearchTexts/)
    assert.match(dialogSource, /watch\(keyword, \(\) => \{\s*page\.value = 1\s*\}\)/)
    assert.match(dialogSource, /TEMPLATE_FIELD_PAGE_SIZE/)
    assert.match(dialogSource, /<el-pagination/)
    assert.match(dialogSource, /layout="total, prev, pager, next"/)
  })

  test('copy cells are buttons and the table has no action column', () => {
    assert.match(dialogSource, /<button\s+type="button"\s+class="tfs-copy-cell"/)
    assert.doesNotMatch(dialogSource, /label="操作"/)
    assert.match(dialogSource, /copyTextToClipboard\(/)
    assert.match(dialogSource, /buildCopyToastText\(/)
  })
})

describe('App.vue entry wiring', () => {
  test('regular header gains an edit-mode-gated icon button next to 设置', () => {
    assertInOrder(appSource, [
      /aria-label="打开设置" title="设置"/,
      /aria-label="模板字段查询"/,
      /aria-label=.*切换到浅色模式/,
    ])
    const buttonTag = appSource.match(/<el-button[^>]*aria-label="模板字段查询"[^>]*>/)?.[0] || ''
    assert.match(buttonTag, /v-if="editMode"/)
    assert.match(buttonTag, /title="模板字段查询"/)
    assert.match(buttonTag, /@click="openTemplateFieldSearch"/)
  })

  test('admin branch has no template field search entry', () => {
    const adminBranch = appSource.match(/<template v-else-if="isAdmin">[\s\S]*?<\/template>/)?.[0] || ''
    assert.doesNotMatch(adminBranch, /模板字段查询/)
    assert.doesNotMatch(adminBranch, /openTemplateFieldSearch/)
  })

  test('dialog mounts lazily and stays mounted for the session', () => {
    assert.match(
      appSource,
      /<TemplateFieldSearchDialog\s+v-if="hasOpenedTemplateFieldSearch"\s+v-model="showTemplateFieldSearch"\s*\/>/,
    )
  })

  test('openTemplateFieldSearch restacks by close, nextTick, reopen', () => {
    assert.match(
      appSource,
      /function openTemplateFieldSearch\(\) \{[\s\S]*hasOpenedTemplateFieldSearch\.value = true;[\s\S]*showTemplateFieldSearch\.value = false;[\s\S]*await nextTick\(\);[\s\S]*showTemplateFieldSearch\.value = true;[\s\S]*\}/,
    )
  })

  test('leaving edit mode closes the dialog', () => {
    assert.match(
      appSource,
      /watch\(editMode, \(enabled\) => \{\s*if \(!enabled\) showTemplateFieldSearch\.value = false;\s*\}\)/,
    )
  })

  test('FormDesignerTab forwards the open event', () => {
    assert.match(appSource, /<FormDesignerTab[^>]*@open-template-field-search="openTemplateFieldSearch"/)
  })
})

describe('FormDesignerTab fullscreen entry', () => {
  test('emits include open-template-field-search', () => {
    assert.match(formDesignerSource, /const emit = defineEmits\(\['import-template', 'open-template-field-search'\]\)/)
  })

  test('button sits in the fullscreen header after the eCRF/aCRF switch and is edit-mode gated', () => {
    assertInOrder(formDesignerSource, [
      /<template #header="\{ titleId, titleClass \}">/,
      /data-test="designer-form-switch"/,
      /<el-switch[\s\S]*?v-if="editMode"[\s\S]*?v-model="viewMode"/,
      /data-test="designer-template-field-search"/,
    ])
    const buttonTag = formDesignerSource.match(/<el-button[^>]*data-test="designer-template-field-search"[^>]*>/)?.[0] || ''
    assert.match(buttonTag, /v-if="editMode"/)
    assert.match(buttonTag, /aria-label="模板字段查询"/)
    assert.match(formDesignerSource, /<el-tooltip content="模板字段查询"/)
    assert.match(formDesignerSource, /emit\('open-template-field-search'\)/)
  })
})

describe('clipboard access isolation', () => {
  test('navigator.clipboard / execCommand appear only in clipboardCopy.js', () => {
    const srcDir = resolve(currentDir, '../src')
    const files = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(js|vue)$/.test(name)) files.push(full)
      }
    }
    walk(srcDir)
    const offenders = files.filter((file) => {
      if (file.endsWith('clipboardCopy.js')) return false
      const source = readFileSync(file, 'utf8')
      return /navigator\.clipboard|execCommand/.test(source)
    })
    assert.deepEqual(offenders, [])
    assert.match(
      readFileSync(resolve(currentDir, '../src/composables/clipboardCopy.js'), 'utf8'),
      /navigator\.clipboard[\s\S]*execCommand/,
    )
  })
})
