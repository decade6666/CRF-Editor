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

const SOURCE_KEYS = ['project_name', 'project_version', 'form_name', 'form_code', 'display_label']

function makeSource(overrides = {}) {
  return {
    project_name: '研究A',
    project_version: '1.0',
    form_name: '随访表',
    form_code: 'FA1',
    display_label: null,
    ...overrides,
  }
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

describe('candidate extractor boundaries', () => {
  test('templateFieldSearchTexts tolerates undefined entries and missing aliases', async () => {
    const { templateFieldSearchTexts } = await loadModule()
    assert.deepEqual(templateFieldSearchTexts(undefined), [undefined, undefined])
    assert.deepEqual(templateFieldSearchTexts({ variable_name: 'A' }), ['A', undefined])
    assert.deepEqual(
      templateFieldSearchTexts({ label: '年龄', label_aliases: null }),
      [undefined, '年龄'],
    )
  })

  test('templateFieldFormCodes tolerates missing/null sources and blank codes', async () => {
    const { templateFieldFormCodes } = await loadModule()
    assert.deepEqual(templateFieldFormCodes(undefined), [])
    assert.deepEqual(templateFieldFormCodes({}), [])
    assert.deepEqual(templateFieldFormCodes({ sources: null }), [])
    assert.deepEqual(
      templateFieldFormCodes({ sources: [null, { form_code: 'FA1' }, { form_code: '' }, {}] }),
      [undefined, 'FA1', '', undefined],
    )
  })

  test('ranking ignores malformed entries instead of throwing', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      { key: '1:11' },
      { key: '1:12', sources: [null, {}] },
      { key: '1:13', sources: [makeSource({ form_code: '' })] },
      { ...BASE_ENTRY, key: '1:14', sources: [makeSource()] },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'fa').map((entry) => entry.key),
      ['1:14'],
    )
    // 'age' 只能经 1:14 的字段 OID 命中：残缺条目（1:11–1:13）在任何关键词下都不出现。
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'age').map((entry) => entry.key),
      ['1:14'],
    )
    assert.deepEqual(rankTemplateFieldMatches(entries, 'zzz').map((entry) => entry.key), [])
  })
})

describe('rankTemplateFieldMatches', () => {
  test('blank or whitespace keyword returns the original ordered list unchanged', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      { ...BASE_ENTRY },
      { ...BASE_ENTRY, key: '1:11', variable_name: 'WT', label: '体重' },
    ]
    assert.equal(rankTemplateFieldMatches(entries, ''), entries)
    assert.equal(rankTemplateFieldMatches(entries, '   '), entries)
  })

  test('four priority groups: field strong > form strong > field fuzzy > form fuzzy', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      { ...BASE_ENTRY, key: '1:11', label: 'dm检查' },
      { ...BASE_ENTRY, key: '1:12', variable_name: 'AGE', sources: [makeSource({ form_code: 'DM' })] },
      { ...BASE_ENTRY, key: '1:13', variable_name: 'DOMAIN_MAP' },
      { ...BASE_ENTRY, key: '1:14', variable_name: 'OTHER', sources: [makeSource({ form_code: 'DOMAIN' })] },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'dm').map((entry) => entry.key),
      ['1:11', '1:12', '1:13', '1:14'],
    )
  })

  test('within strong groups exact match precedes substring match', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      { ...BASE_ENTRY, key: '1:11', variable_name: 'LBX', label: '扩展' },
      { ...BASE_ENTRY, key: '1:12', label: 'lb' },
      { ...BASE_ENTRY, key: '1:13', variable_name: 'OTHER', sources: [makeSource({ form_code: 'LBX' })] },
      { ...BASE_ENTRY, key: '1:14', variable_name: 'AGE2', sources: [makeSource({ form_code: 'LB' })] },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'lb').map((entry) => entry.key),
      ['1:12', '1:11', '1:14', '1:13'],
    )
  })

  test('within fuzzy groups shared match quality ordering holds (shorter span first)', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      { ...BASE_ENTRY, key: '1:11', variable_name: 'C_A_D' },
      { ...BASE_ENTRY, key: '1:12', variable_name: 'CA_D' },
      { ...BASE_ENTRY, key: '1:13', variable_name: 'OTHER', sources: [makeSource({ form_code: 'CA_D' })] },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'cd').map((entry) => entry.key),
      ['1:12', '1:11', '1:13'],
    )
  })

  test('field-weak + form-strong dual hit lands in the form-strong group exactly once', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      { ...BASE_ENTRY, key: '1:11', label: 'dm检查' },
      // 字段侧仅子序列（弱）+ 表单 OID 包含（强）：应落在第 2 组且只出现一次，
      // 并排在纯字段模糊（1:13）与表单模糊（1:14）之前。
      { ...BASE_ENTRY, key: '1:12', variable_name: 'D_MAIN', sources: [makeSource({ form_code: 'DM' })] },
      { ...BASE_ENTRY, key: '1:13', variable_name: 'DOMAIN_MAP' },
      { ...BASE_ENTRY, key: '1:14', sources: [makeSource({ form_code: 'DOMAIN' })] },
    ]
    const ranked = rankTemplateFieldMatches(entries, 'dm')
    assert.deepEqual(ranked.map((entry) => entry.key), ['1:11', '1:12', '1:13', '1:14'])
    assert.equal(ranked.filter((entry) => entry.key === '1:12').length, 1)
  })

  test('equal-rank ties within one group preserve input order', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      // 表单强匹配并列（同为精确命中）：1:11 先于 1:12，之后是包含命中 1:13。
      { ...BASE_ENTRY, key: '1:11', sources: [makeSource({ form_code: 'VS' })] },
      { ...BASE_ENTRY, key: '1:12', sources: [makeSource({ form_code: 'VS' })] },
      { ...BASE_ENTRY, key: '1:13', sources: [makeSource({ form_code: 'VSX' })] },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'vs').map((entry) => entry.key),
      ['1:11', '1:12', '1:13'],
    )
    // 字段模糊并列（同为子序列 span 3）：1:11 先于 1:12，更长 span 的 1:13 靠后。
    const fuzzy = [
      { ...BASE_ENTRY, key: '1:11', variable_name: 'CAD_X' },
      { ...BASE_ENTRY, key: '1:12', variable_name: 'CBD_X' },
      { ...BASE_ENTRY, key: '1:13', variable_name: 'CA_B_D' },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(fuzzy, 'cd').map((entry) => entry.key),
      ['1:11', '1:12', '1:13'],
    )
  })

  test('typo candidates inside weak groups keep shared quality ordering (distance 1 before 2)', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    // 7 字关键词启用 2 次编辑距离（相似度下限放行 distance=2）：
    // 强命中在前，distance 1 的表单近似命中先于 distance 2，排序完全交给共享 ranker。
    const entries = [
      { ...BASE_ENTRY, key: '1:11', sources: [makeSource({ form_code: 'abcdefg_extra' })] },
      { ...BASE_ENTRY, key: '1:12', sources: [makeSource({ form_code: 'abcdef1' })] },
      { ...BASE_ENTRY, key: '1:13', sources: [makeSource({ form_code: 'abczzfg' })] },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'abcdefg').map((entry) => entry.key),
      ['1:11', '1:12', '1:13'],
    )
  })

  test('entry matching both field and form appears once in its highest group', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      {
        ...BASE_ENTRY,
        key: '1:11',
        variable_name: 'DUP_BOTH',
        sources: [makeSource({ form_code: 'DUP_FORM' })],
      },
      { ...BASE_ENTRY, key: '1:12', variable_name: 'OTHER', sources: [makeSource({ form_code: 'DUP_ONLY' })] },
    ]
    const ranked = rankTemplateFieldMatches(entries, 'dup')
    assert.deepEqual(ranked.map((entry) => entry.key), ['1:11', '1:12'])
    assert.equal(ranked.filter((entry) => entry.key === '1:11').length, 1)
  })

  test('form OID query returns merged entries from every matching source form', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      {
        ...BASE_ENTRY,
        key: '1:11',
        sources: [makeSource({ form_code: 'FA1' }), makeSource({ form_code: 'FA2', form_name: '第二表单' })],
      },
      { ...BASE_ENTRY, key: '1:12', sources: [makeSource({ form_code: 'FB1', form_name: '入组表' })] },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'fa').map((entry) => entry.key),
      ['1:11'],
    )
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'fa2').map((entry) => entry.key),
      ['1:11'],
    )
    // 'fb1'（3 字关键词）允许 1 次编辑距离：FB1 精确命中进入表单强匹配组，
    // FA1（fa1 → fb1 距离 1）是表单模糊匹配，排在强匹配之后。
    assert.deepEqual(
      rankTemplateFieldMatches(entries, 'fb1').map((entry) => entry.key),
      ['1:12', '1:11'],
    )
  })

  test('form names and project metadata are not search candidates', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      {
        ...BASE_ENTRY,
        sources: [
          makeSource({ project_name: '研究X', project_version: 'V1', form_name: '随访表', form_code: null }),
        ],
      },
    ]
    assert.deepEqual(rankTemplateFieldMatches(entries, '随访'), [])
    assert.deepEqual(rankTemplateFieldMatches(entries, '研究'), [])
    assert.deepEqual(rankTemplateFieldMatches(entries, 'v1'), [])
  })

  test('keyword is normalized for case and surrounding whitespace', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      { ...BASE_ENTRY, key: '1:11', sources: [makeSource({ form_code: 'DM' })] },
      { ...BASE_ENTRY, key: '1:12', label: 'dm检查' },
    ]
    assert.deepEqual(
      rankTemplateFieldMatches(entries, ' DM ').map((entry) => entry.key),
      rankTemplateFieldMatches(entries, 'dm').map((entry) => entry.key),
    )
  })

  test('entries without sources or with null form codes never match form queries', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      { ...BASE_ENTRY, key: '1:11', sources: [] },
      { ...BASE_ENTRY, key: '1:12', sources: [makeSource({ form_code: null })] },
      { ...BASE_ENTRY, key: '1:13', sources: [makeSource({ form_code: 'FA1' })] },
    ]
    assert.deepEqual(rankTemplateFieldMatches(entries, 'fa1').map((entry) => entry.key), ['1:13'])
  })

  test('does not mutate the input list, entries, or sources', async () => {
    const { rankTemplateFieldMatches } = await loadModule()
    const entries = [
      {
        ...BASE_ENTRY,
        key: '1:11',
        label_aliases: ['岁'],
        sources: [makeSource({ form_code: 'DM' }), makeSource({ form_code: null, form_name: null })],
      },
      { ...BASE_ENTRY, key: '1:12', label: 'dm检查' },
    ]
    const snapshot = JSON.stringify(entries)
    rankTemplateFieldMatches(entries, 'dm')
    rankTemplateFieldMatches(entries, '')
    assert.equal(JSON.stringify(entries), snapshot)
    assert.equal(entries.length, 2)
  })

  test('composes the shared ranker instead of duplicating fuzzy logic', async () => {
    const moduleSource = readFileSync(
      resolve(currentDir, '../src/composables/templateFieldSearch.js'),
      'utf8',
    )
    assert.match(moduleSource, /import \{ normalizeSearchText, rankFuzzyMatches \} from '\.\/searchRanking\.js'/)
    assert.doesNotMatch(moduleSource, /levenshtein|bestEditWindow|findSubsequence/)
  })
})

describe('source helpers', () => {
  test('formatTemplateFieldSource renders form OID and name with display-label suffix', async () => {
    const { formatTemplateFieldSource } = await loadModule()
    assert.equal(formatTemplateFieldSource(makeSource({ form_code: 'FA1', form_name: '血常规' })), 'FA1 血常规')
    assert.equal(
      formatTemplateFieldSource(makeSource({ form_code: 'FA1', form_name: '体格检查', display_label: '体重' })),
      'FA1 体格检查（显示为：体重）',
    )
  })

  test('form without OID renders its name only; code-only renders the code', async () => {
    const { formatTemplateFieldSource } = await loadModule()
    assert.equal(formatTemplateFieldSource(makeSource({ form_code: null })), '随访表')
    assert.equal(formatTemplateFieldSource(makeSource({ form_code: 'FA1', form_name: null })), 'FA1')
  })

  test('library-only source renders 仅字段库; null source renders empty', async () => {
    const { formatTemplateFieldSource } = await loadModule()
    assert.equal(
      formatTemplateFieldSource(makeSource({ form_code: null, form_name: null })),
      '仅字段库',
    )
    assert.equal(formatTemplateFieldSource(null), '')
  })

  test('API source shape keeps project metadata fields alongside form_code', () => {
    // 与后端 TemplateFieldSource 模型同步的最小形状守卫（AC5）。
    assert.deepEqual(Object.keys(makeSource()).sort(), SOURCE_KEYS.slice().sort())
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

  test('dialog searches through the template ranking wrapper and paginates 50 per page', () => {
    assert.match(dialogSource, /rankTemplateFieldMatches\(/)
    assert.doesNotMatch(dialogSource, /rankFuzzyMatches\(/)
    assert.match(dialogSource, /watch\(keyword, \(\) => \{\s*page\.value = 1\s*\}\)/)
    assert.match(dialogSource, /TEMPLATE_FIELD_PAGE_SIZE/)
    assert.match(dialogSource, /<el-pagination/)
    assert.match(dialogSource, /layout="total, prev, pager, next"/)
  })

  test('search hint mentions label, field OID and form OID', () => {
    assert.match(dialogSource, /placeholder="输入标签、字段 OID 或表单 OID 搜索"/)
  })

  test('copy cells are buttons and the table has no action column', () => {
    assert.match(dialogSource, /<button\s+type="button"\s+class="tfs-copy-cell"/)
    assert.doesNotMatch(dialogSource, /label="操作"/)
    assert.match(dialogSource, /copyTextToClipboard\(/)
    assert.match(dialogSource, /buildCopyToastText\(/)
  })

  test('source column shows inline wrapping lines without popover or copy behavior', () => {
    const sourceColumn = dialogSource.match(
      /<el-table-column label="来源"[^>]*>[\s\S]*?<\/el-table-column>/,
    )?.[0] || ''
    assert.ok(sourceColumn, 'source column block not found')
    const minWidth = Number(sourceColumn.match(/min-width="(\d+)"/)?.[1] || 0)
    assert.ok(minWidth >= 200, `source column min-width should be >= 200, got ${minWidth}`)
    assert.match(sourceColumn, /class="tfs-source-list"/)
    assert.match(sourceColumn, /class="tfs-source-line"/)
    assert.match(sourceColumn, /formatTemplateFieldSource\(source\)/)
    assert.doesNotMatch(sourceColumn, /el-popover/)
    assert.doesNotMatch(sourceColumn, /tfs-copy-cell/)
    assert.doesNotMatch(sourceColumn, /countTemplateFieldForms/)
    assert.doesNotMatch(dialogSource, /countTemplateFieldForms/)
    assert.doesNotMatch(dialogSource, /tfs-source-btn/)
    assert.doesNotMatch(dialogSource, /el-popover/)
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
