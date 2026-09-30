<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import { api } from '../composables/useApi'
import { rankFuzzyMatches } from '../composables/searchRanking'
import { copyTextToClipboard } from '../composables/clipboardCopy'
import {
  TEMPLATE_FIELD_PAGE_SIZE,
  buildCopyToastText,
  countTemplateFieldForms,
  formatTemplateFieldFormat,
  formatTemplateFieldSource,
  templateFieldSearchTexts,
} from '../composables/templateFieldSearch'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const loading = ref(false)
const loaded = ref(false)
const errorMsg = ref('')
const entries = ref([])
const keyword = ref('')
const page = ref(1)
const searchInputRef = ref(null)

// 懒挂载时 modelValue 已为 true，必须 immediate 才能触发首次加载（懒弹窗规则）
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (!loaded.value) load()
    focusSearch()
  },
  { immediate: true },
)

watch(keyword, () => {
  page.value = 1
})

const ranked = computed(() => rankFuzzyMatches(entries.value, keyword.value, templateFieldSearchTexts))
const pageRows = computed(() =>
  ranked.value.slice((page.value - 1) * TEMPLATE_FIELD_PAGE_SIZE, page.value * TEMPLATE_FIELD_PAGE_SIZE),
)

async function focusSearch() {
  await nextTick()
  searchInputRef.value?.focus?.()
}

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await api.get('/api/template-fields')
    entries.value = data.entries || []
    loaded.value = true
  } catch (e) {
    // 失败时保留已加载结果并保持弹窗打开，错误就地展示
    errorMsg.value = e.message
  } finally {
    loading.value = false
  }
}

function onVisibleChange(visible) {
  emit('update:modelValue', visible)
}

async function copyCell(text) {
  const value = String(text ?? '')
  const ok = await copyTextToClipboard(value)
  if (ok) ElMessage.success(buildCopyToastText(value))
  else ElMessage.error('复制失败，请手动选择文本复制')
}
</script>

<template>
  <el-dialog
    title="模板字段查询"
    class="template-field-search-dialog"
    :model-value="modelValue"
    :modal="false"
    modal-penetrable
    draggable
    append-to-body
    :lock-scroll="false"
    :close-on-click-modal="false"
    width="960px"
    @update:model-value="onVisibleChange"
  >
    <div v-loading="loading" class="tfs-content">
      <div class="list-toolbar">
        <el-input
          ref="searchInputRef"
          v-model="keyword"
          class="tfs-search-input"
          placeholder="输入标签或 OID 搜索"
          clearable
          size="small"
          :prefix-icon="Search"
        />
        <span class="tfs-count">共 {{ ranked.length }} 条</span>
        <div style="margin-left: auto" />
        <el-tooltip content="重新加载模板字段" placement="top" :show-after="300">
          <el-button size="small" :icon="Refresh" aria-label="重新加载模板字段" :disabled="loading" @click="load" />
        </el-tooltip>
      </div>

      <div v-if="errorMsg" class="tfs-error" role="alert">加载失败：{{ errorMsg }}</div>

      <template v-else>
        <el-table :data="pageRows" row-key="key" size="small" border max-height="60vh">
          <el-table-column prop="variable_name" label="OID" min-width="130">
            <template #default="{ row }">
              <button
                type="button"
                class="tfs-copy-cell"
                v-if="row.variable_name"
                :aria-label="`复制OID：${row.variable_name}`"
                @click="copyCell(row.variable_name)"
              >
                {{ row.variable_name }}
              </button>
              <span v-else class="tfs-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="label" label="标签" min-width="110" show-overflow-tooltip>
            <template #default="{ row }">
              <button
                type="button"
                class="tfs-copy-cell"
                v-if="row.label"
                :aria-label="`复制标签：${row.label}`"
                @click="copyCell(row.label)"
              >
                {{ row.label }}
              </button>
              <span v-else class="tfs-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="field_type" label="类型" min-width="80">
            <template #default="{ row }">
              <button
                type="button"
                class="tfs-copy-cell"
                v-if="row.field_type"
                :aria-label="`复制类型：${row.field_type}`"
                @click="copyCell(row.field_type)"
              >
                {{ row.field_type }}
              </button>
              <span v-else class="tfs-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column label="格式" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <button
                type="button"
                class="tfs-copy-cell"
                v-if="formatTemplateFieldFormat(row)"
                :aria-label="`复制格式：${formatTemplateFieldFormat(row)}`"
                @click="copyCell(formatTemplateFieldFormat(row))"
              >
                {{ formatTemplateFieldFormat(row) }}
              </button>
              <span v-else class="tfs-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column label="单位" min-width="90">
            <template #default="{ row }">
              <button
                type="button"
                class="tfs-copy-cell"
                v-if="row.unit_symbol"
                :aria-label="`复制单位：${row.unit_symbol}`"
                @click="copyCell(row.unit_symbol)"
              >
                {{ row.unit_symbol }}
              </button>
              <span v-else class="tfs-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column label="来源" min-width="100">
            <template #default="{ row }">
              <el-popover placement="left" trigger="click" :width="360">
                <template #reference>
                  <button type="button" class="tfs-source-btn">
                    {{ countTemplateFieldForms(row) > 0 ? `${countTemplateFieldForms(row)} 个表单` : '仅字段库' }}
                  </button>
                </template>
                <div class="tfs-source-list">
                  <div v-for="(source, index) in row.sources" :key="index" class="tfs-source-line">
                    {{ formatTemplateFieldSource(source) }}
                  </div>
                </div>
              </el-popover>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="page"
          class="tfs-pagination"
          layout="total, prev, pager, next"
          :page-size="TEMPLATE_FIELD_PAGE_SIZE"
          :total="ranked.length"
          size="small"
        />

        <div v-if="entries.length === 0" class="tfs-empty-tip">模板库中没有可查询的字段</div>
        <div v-else-if="ranked.length === 0" class="tfs-empty-tip">没有匹配的字段</div>
      </template>
    </div>
  </el-dialog>
</template>

<style scoped>
.tfs-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tfs-search-input {
  width: 220px;
}

.tfs-count {
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  white-space: nowrap;
}

.tfs-error {
  padding: 12px;
  border: 1px solid var(--color-danger-border);
  background: var(--color-danger-bg);
  color: var(--color-danger-text);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
}

.tfs-copy-cell {
  appearance: none;
  border: none;
  background: transparent;
  padding: 2px 4px;
  margin: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tfs-copy-cell:hover {
  background: var(--color-bg-hover);
}

.tfs-copy-cell:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.tfs-source-btn {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  color: var(--color-primary);
  cursor: pointer;
}

.tfs-source-btn:hover {
  text-decoration: underline;
}

.tfs-source-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.tfs-source-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  word-break: break-all;
}

.tfs-empty {
  color: var(--color-text-muted);
}

.tfs-empty-tip {
  text-align: center;
  color: var(--color-text-muted);
  padding: 20px 0;
}

.tfs-pagination {
  justify-content: flex-end;
}
</style>

<style>
/* append-to-body 把弹窗 teleport 到 body，scoped 样式无法命中弹窗根；用唯一类名锁宽。 */
.template-field-search-dialog {
  max-width: 94vw;
}
</style>
