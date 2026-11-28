<script setup>
import { computed, onActivated, onDeactivated, onMounted, ref } from 'vue';
import DesignBaselinePreview from './DesignBaselinePreview.vue';
import { useDesignBaselines } from '../composables/useDesignBaselines.js';
import { baselineTables } from '../composables/designBaselinePreview.js';
import { formatBytes } from '../composables/byteSize.js';

const active = ref(false);
const {
  projects,
  projectsTotal,
  projectPage,
  projectId,
  rows,
  total,
  page,
  loading,
  context,
  label,
  remark,
  manualWeights,
  columnWidths,
  creating,
  opening,
  stale,
  pending,
  detail,
  deleting,
  error,
  loadProjects,
  loadHistory,
  openCapture,
  resetCapture,
  toggleWidths,
  setWeight,
  submit,
  queryRequest,
  showDetail,
  remove,
  download,
} = useDesignBaselines(active);
const previewForm = ref(null);
const tables = computed(() => baselineTables(previewForm.value));
const textLocked = computed(() => creating.value || Boolean(pending.value));
const canCreate = computed(
  () => context.value && !creating.value && !pending.value && !stale.value && columnWidths.value && label.value.trim(),
);
onMounted(() => {
  active.value = true;
});
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
</script>

<template>
  <section class="archive-page">
    <header class="archive-header">
      <div>
        <h2>备份与留档</h2>
        <p>正式留档保存一份不可变设计和 eCRF / aCRF 两份 Word 原件；普通导出不会自动留档。</p>
      </div>
    </header>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="本页仅管理正式留档。产品数据库交换文件不含历史及原件，不是完整系统备份；手动正式留档不会自动清理。"
    />
    <div class="project-toolbar">
      <span id="archive-project-label">目标项目</span>
      <el-select
        v-model="projectId"
        clearable
        placeholder="选择活动项目"
        data-test="archive-project"
        aria-labelledby="archive-project-label"
      >
        <el-option
          v-for="project in projects"
          :key="project.id"
          :value="project.id"
          :label="`${project.name}（${project.owner_username || '无归属'}）`"
        />
      </el-select>
      <el-button @click="loadProjects(projectPage)">刷新项目</el-button>
      <el-pagination
        v-if="projectsTotal > 100"
        small
        layout="prev, pager, next"
        :page-size="100"
        :total="projectsTotal"
        :current-page="projectPage"
        @current-change="loadProjects"
      />
    </div>
    <el-alert v-if="error" type="warning" :title="error" :closable="false" class="archive-message" />
    <div class="list-toolbar">
      <h3>正式留档记录</h3>
      <el-button
        type="primary"
        :disabled="!projectId || Boolean(context) || opening"
        :loading="opening"
        @click="openCapture"
        >新建正式留档</el-button
      >
      <el-button :disabled="!projectId" @click="loadHistory(page)">刷新记录</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" empty-text="请选择项目或创建正式留档" class="archive-table">
      <el-table-column prop="label" label="留档标签" min-width="160" />
      <el-table-column prop="created_at" label="创建时间（UTC）" min-width="210" />
      <el-table-column prop="creator_name" label="创建人" min-width="100" />
      <el-table-column label="原件与操作" min-width="360">
        <template #default="{ row }">
          <el-button link type="primary" @click="showDetail(row)">查看设计</el-button>
          <el-button link type="primary" @click="download(row, 'ecrf')">下载 eCRF</el-button>
          <el-button link type="primary" @click="download(row, 'acrf')">下载 aCRF</el-button>
          <el-button link type="danger" :disabled="deleting" @click="remove(row)">删除整对</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-if="total > 20"
      :current-page="page"
      :page-size="20"
      :total="total"
      layout="prev, pager, next, total"
      @current-change="loadHistory"
    />

    <section v-if="context" class="capture-card" aria-labelledby="capture-title">
      <h3 id="capture-title">新建正式留档</h3>
      <p>本次仅保存服务器上已提交的设计、标注和 Logo；不会取得其他浏览器的草稿或列宽，也不会修改项目 CRF 版本。</p>
      <el-form label-position="top" :disabled="textLocked">
        <el-form-item label="留档标签">
          <el-input v-model="label" maxlength="100" show-word-limit data-test="archive-label" aria-label="留档标签" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="remark"
            type="textarea"
            :rows="2"
            maxlength="2000"
            show-word-limit
            data-test="archive-remark"
            aria-label="留档备注"
          />
        </el-form-item>
      </el-form>
      <div class="hash-line">
        设计校验值（SHA-256，用来核对设计未变化）：<code>{{ context.content_hash }}</code>
      </div>
      <img v-if="context.logo_data_url" :src="context.logo_data_url" class="capture-logo" alt="本次冻结的项目 Logo" />
      <DesignBaselinePreview
        :key="context.source_revision"
        :snapshot="context.snapshot"
        :column-widths="columnWidths || {}"
        @form-change="previewForm = $event"
      />
      <details class="width-editor">
        <summary>本次独立列宽设置（默认服务器自动版式）</summary>
        <p>勾选表格后输入各列的相对宽度；例如 30、70 表示三七分。仅影响本次两份原件，不读取或覆盖设计器缓存。</p>
        <div v-for="table in tables" :key="table.key" class="table-width-row">
          <el-checkbox
            :model-value="Boolean(manualWeights[table.key])"
            :disabled="textLocked"
            @change="toggleWidths(table, $event)"
            >{{ table.label }} · 手动列宽</el-checkbox
          >
          <div v-if="manualWeights[table.key]" class="column-weights">
            <label v-for="(value, index) in manualWeights[table.key]" :key="index">
              第 {{ index + 1 }} 列
              <el-input-number
                :model-value="value"
                :min="1"
                :max="1000"
                :precision="3"
                :disabled="textLocked"
                :aria-label="`${table.label}第${index + 1}列相对宽度`"
                @update:model-value="setWeight(table.key, index, $event)"
              />
            </label>
          </div>
        </div>
        <p v-if="!columnWidths" role="alert">请为所有手动列宽输入正数后再创建。</p>
      </details>
      <el-alert
        v-if="stale"
        type="warning"
        :closable="false"
        title="设计已变化。请重新加载预览并核对；标签和备注将保留，独立列宽需要重新设置。"
      />
      <div v-if="pending" class="request-state" aria-live="polite">
        <p>
          请求编号：<code>{{ pending.body.request_id }}</code>
        </p>
        <p>
          状态：{{
            pending.status === 'failed'
              ? '未完成，可显式重试'
              : pending.status === 'deleted'
                ? '留档已删除'
                : '待核对；不会自动重试'
          }}。关闭页面不会撤销已经发出的生成请求。
        </p>
        <el-button :disabled="creating" @click="queryRequest">查询请求状态</el-button>
        <el-button
          v-if="pending.status === 'failed' || pending.status === 'pending'"
          :disabled="creating"
          @click="submit(true)"
          >显式重试同一请求</el-button
        >
      </div>
      <div class="capture-actions">
        <el-button :disabled="creating" @click="resetCapture">取消新建</el-button>
        <el-button v-if="stale || pending" :disabled="creating" @click="openCapture({ preserveText: true })"
          >重新加载预览</el-button
        >
        <el-button type="primary" :disabled="!canCreate" :loading="creating" @click="submit(false)"
          >生成并保存双份原件</el-button
        >
      </div>
    </section>

    <el-dialog
      v-if="detail"
      :model-value="true"
      title="正式留档设计"
      width="min(1100px, calc(100vw - 24px))"
      append-to-body
      @update:model-value="detail = null"
    >
      <h3>{{ detail.label }}</h3>
      <p>{{ detail.remark || '无备注' }}</p>
      <div class="hash-line">
        设计校验值：<code>{{ detail.content_hash }}</code>
      </div>
      <div class="hash-line">
        版式校验值：<code>{{ detail.layout_hash }}</code>
      </div>
      <div v-for="artifact in detail.artifacts" :key="artifact.kind" class="hash-line">
        {{ artifact.kind.toUpperCase() }} · {{ formatBytes(artifact.byte_count) }} · <code>{{ artifact.sha256 }}</code>
      </div>
      <DesignBaselinePreview :snapshot="detail.snapshot" :column-widths="detail.column_widths" />
      <template #footer><el-button @click="detail = null">关闭</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.archive-page {
  padding: 8px;
  min-width: 0;
  color: var(--color-text-primary);
}
.archive-header h2 {
  margin: 0;
  font-size: 20px;
}
.archive-header p,
.capture-card p,
.width-editor p {
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.project-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-block: 20px;
}
.project-toolbar .el-select {
  width: 340px;
  max-width: 100%;
}
.list-toolbar {
  flex-wrap: wrap;
}
.list-toolbar h3 {
  margin: 0 auto 0 0;
  font-size: 16px;
}
.archive-table {
  width: 100%;
}
.archive-message {
  margin-block: 12px;
}
.capture-card {
  margin-block: 24px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-card);
}
.capture-card h3 {
  margin-top: 0;
}
.capture-logo {
  display: block;
  max-width: 220px;
  max-height: 80px;
  object-fit: contain;
  margin-block: 12px;
}
.hash-line {
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.width-editor {
  margin-block: 16px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}
.width-editor summary {
  cursor: pointer;
}
.table-width-row {
  margin-block: 12px;
}
.column-weights {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.column-weights label {
  display: grid;
  gap: 4px;
  font-size: 12px;
}
.request-state {
  margin-block: 12px;
  overflow-wrap: anywhere;
}
.capture-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.capture-actions .el-button {
  margin-left: 0;
}
@media (max-width: 600px) {
  .capture-card {
    padding: 12px;
  }
  .project-toolbar .el-select {
    width: 100%;
  }
}
</style>
