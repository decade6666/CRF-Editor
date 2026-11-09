<script setup>
import { computed, ref, toRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAgentAccess } from '../composables/useAgentAccess'
import { copyTextToClipboard } from '../composables/clipboardCopy'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  projectId: { type: Number, required: true },
})
const emit = defineEmits(['update:modelValue'])

const projectId = toRef(props, 'projectId')
const {
  credentials,
  changes,
  changesTotal,
  changesHasMore,
  loadingCredentials,
  loadingChanges,
  issuedToken,
  selectedChange,
  invalidate,
  clearIssuedToken,
  clearSelectedChange,
  refresh: refreshBoth,
  loadChanges,
  loadMoreChanges,
  loadChangeDetail,
  issueCredential,
  revokeCredential,
  decideChange,
} = useAgentAccess(projectId)

const activeTab = ref('credentials')
const tokenVisible = ref(false)
const deciding = ref(false)
const newCredentialName = ref('')
const newCredentialPermission = ref('read')
const newCredentialExpires = ref(24)

const MASKED_TOKEN = '••••••••••••••••'
// 弹窗宽度经 Element Plus width prop 落到 .el-dialog 的内联 --el-dialog-width（主题以
// width: var(--el-dialog-width) 解析），CSS min() 随视口实时生效：桌面 860px 上限、
// 窄屏（如 390px）不越出屏幕，关闭/批准/拒绝控件保持可达。实测 scoped :deep 祖先
// 选择器命中不了该元素，不得回退到它。
const dialogWidth = 'min(860px, calc(100vw - 24px))'
const tokenDisplay = computed(() =>
  issuedToken.value && tokenVisible.value ? issuedToken.value : MASKED_TOKEN
)
const changePatchText = computed(() =>
  selectedChange.value ? JSON.stringify(selectedChange.value.patch ?? {}) : ''
)
// 服务端仍是权威：过期/已处理的提案只在前端禁用操作按钮
const decisionUnavailable = computed(() => {
  const change = selectedChange.value
  if (!change) return true
  if (change.approval_state !== 'pending') return true
  if (change.expires_at && new Date(change.expires_at) <= new Date()) return true
  return false
})
// 执行状态来自服务端持久化应用证据（applied），过期只作展示标记
const changeExpired = computed(() => {
  const change = selectedChange.value
  return Boolean(change?.expires_at && new Date(change.expires_at) <= new Date())
})

watch(
  () => props.modelValue,
  (visible) => {
    tokenVisible.value = false
    if (visible) {
      refresh()
    } else {
      // 关闭即作废全部在途响应（含一次性令牌），重开不会复活旧结果
      invalidate()
      clearIssuedToken()
    }
  },
  { immediate: true }
)

watch(() => props.projectId, () => {
  tokenVisible.value = false
  if (props.modelValue) refresh()
})

function onVisibleChange(visible) {
  if (!visible) {
    invalidate()
    clearIssuedToken()
  }
  emit('update:modelValue', visible)
}

function permissionLabel(permission) {
  return permission === 'read_write' ? '读写' : '只读'
}

function approvalLabel(state) {
  if (state === 'pending') return '待审批'
  if (state === 'approved') return '已批准'
  if (state === 'rejected') return '已拒绝'
  return '—'
}

function executionLabel(change) {
  // 内部 status='done' 仅表示命令完成；已执行必须来自服务端持久化应用证据
  return change?.applied ? '已执行' : '未执行'
}

function fmtValue(value) {
  if (value === null) return '（清空）'
  if (value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function errorMessage(error) {
  return error?.message || '未知错误'
}

async function refresh() {
  try {
    await refreshBoth()
  } catch (e) {
    ElMessage.error('加载失败：' + errorMessage(e))
  }
}

async function submitIssue() {
  const name = newCredentialName.value.trim()
  if (!name) {
    ElMessage.warning('请输入凭据名称')
    return
  }
  const expires = Number(newCredentialExpires.value)
  if (!expires || expires < 1 || expires > 168) {
    ElMessage.warning('有效期需在 1-168 小时之间')
    return
  }
  try {
    const issued = await issueCredential({ name, permission: newCredentialPermission.value, expires_hours: expires })
    if (issuedToken.value) {
      newCredentialName.value = ''
      ElMessage.success('凭据已发放')
    } else if (issued) {
      // 弹窗已关闭/已切换：令牌已被丢弃，不提示成功也不展示
      ElMessage.info('凭据已发放，但弹窗上下文已失效，请重新打开查看列表')
    }
  } catch (e) {
    ElMessage.error('发放失败：' + errorMessage(e))
  }
}

async function revoke(row) {
  try {
    await revokeCredential(row.id)
    ElMessage.success('已吊销')
  } catch (e) {
    ElMessage.error('吊销失败：' + errorMessage(e))
  }
}

async function openDetail(row) {
  try {
    await loadChangeDetail(row.change_id)
  } catch (e) {
    ElMessage.error('加载提案详情失败：' + errorMessage(e))
  }
}

async function decide(approve) {
  const change = selectedChange.value
  if (!change || deciding.value || decisionUnavailable.value) return
  deciding.value = true
  try {
    await decideChange(change.change_id, change.proposal_digest, approve)
    ElMessage.success(approve ? '已批准' : '已拒绝')
    clearSelectedChange()
    await loadChanges()
  } catch (e) {
    ElMessage.error('操作失败：' + errorMessage(e))
  } finally {
    deciding.value = false
  }
}

async function copyToken() {
  if (!issuedToken.value) return
  const ok = await copyTextToClipboard(issuedToken.value)
  if (ok) {
    ElMessage.success('已复制到剪贴板')
  } else {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="Agent 访问"
    :width="dialogWidth"
    @update:model-value="onVisibleChange"
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="凭据" name="credentials">
        <div data-test="credentials-tab">
          <div class="agent-access-toolbar">
            <el-button size="small" data-test="refresh-credentials" :loading="loadingCredentials" @click="refresh">刷新</el-button>
            <span class="agent-access-hint">Agent 凭据仅项目属主可发放；令牌只在发放时显示一次。</span>
          </div>
          <el-table :data="credentials" size="small">
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column label="权限" width="80">
              <template #default="{ row }">{{ permissionLabel(row.permission) }}</template>
            </el-table-column>
            <el-table-column prop="expires_at" label="过期时间" min-width="150" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.revoked" type="info" size="small">已吊销</el-tag>
                <el-tag v-else type="success" size="small">启用</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button
                  size="small"
                  type="danger"
                  link
                  data-test="revoke-credential"
                  :disabled="row.revoked"
                  @click="revoke(row)"
                >吊销</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-form class="agent-access-issue-form" inline @submit.prevent>
            <el-form-item label="名称">
              <el-input v-model="newCredentialName" data-test="credential-name" placeholder="如 ci 机器人" />
            </el-form-item>
            <el-form-item label="权限">
              <el-radio-group v-model="newCredentialPermission">
                <el-radio value="read">只读</el-radio>
                <el-radio value="read_write">读写</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="有效期（小时）">
              <el-input-number v-model="newCredentialExpires" data-test="credential-expires" :min="1" :max="168" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" data-test="issue-credential" @click="submitIssue">发放凭据</el-button>
            </el-form-item>
          </el-form>

          <el-alert v-if="issuedToken" type="warning" :closable="false" data-test="issued-token-panel">
            <template #title>令牌仅显示一次：关闭弹窗或切换项目后即被清除，请立即复制保存。</template>
            <div class="agent-access-token-row">
              <code data-test="issued-token">{{ tokenDisplay }}</code>
              <el-button size="small" data-test="issued-token-toggle" @click="tokenVisible = !tokenVisible">
                {{ tokenVisible ? '隐藏' : '显示' }}
              </el-button>
              <el-button size="small" type="primary" data-test="issued-token-copy" @click="copyToken">复制</el-button>
            </div>
          </el-alert>
        </div>
      </el-tab-pane>

      <el-tab-pane label="共享提案" name="changes">
        <div class="agent-access-toolbar">
          <el-button size="small" data-test="refresh-changes" :loading="loadingChanges" @click="refresh">刷新</el-button>
          <span class="agent-access-hint">共 {{ changesTotal }} 条；MCP 编辑产生的共享定义变更在此审批，批准/拒绝绑定展示的摘要。</span>
        </div>
        <el-table :data="changes" size="small">
          <el-table-column prop="change_id" label="变更" width="70" />
          <el-table-column prop="tool_name" label="工具" min-width="220" />
          <el-table-column label="审批状态" width="90">
            <template #default="{ row }">{{ approvalLabel(row.approval_state) }}</template>
          </el-table-column>
          <el-table-column label="执行状态" width="90">
            <template #default="{ row }">{{ executionLabel(row) }}</template>
          </el-table-column>
          <el-table-column prop="expires_at" label="过期时间" min-width="150" />
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button size="small" link type="primary" data-test="change-detail" @click="openDetail(row)">查看详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="changesHasMore" class="agent-access-load-more">
          <el-button size="small" data-test="load-more-changes" :loading="loadingChanges" @click="loadMoreChanges">加载更多</el-button>
        </div>

        <div v-if="selectedChange" data-test="change-detail-panel" class="agent-access-detail">
          <div class="agent-access-detail-head">
            <strong>提案 #{{ selectedChange.change_id }}</strong>
            <span class="agent-access-hint">
              状态：{{ approvalLabel(selectedChange.approval_state) }} / {{ executionLabel(selectedChange) }}<template v-if="changeExpired">（已过期）</template>
            </span>
            <el-button size="small" data-test="close-change-detail" @click="clearSelectedChange">收起</el-button>
          </div>
          <div class="agent-access-detail-line">修改内容：<code>{{ changePatchText }}</code></div>
          <div class="agent-access-detail-line">
            影响范围：
            <ul class="agent-access-detail-list">
              <li v-for="item in selectedChange.impact" :key="item.form_id">
                表单 #{{ item.form_id }} {{ item.form_oid ? `（OID ${item.form_oid}）` : '' }}「{{ item.form_name }}」
                <span v-if="item.visit_names?.length">，访视：{{ item.visit_names.join('、') }}</span>
                <span>，实例 {{ item.instance_ids.length }} 个</span>
                <ul v-if="item.attribute_changes?.length" class="agent-access-detail-list">
                  <li v-for="change in item.attribute_changes" :key="change.key">
                    {{ change.key }}: {{ fmtValue(change.before) }} → {{ fmtValue(change.after) }}
                    <el-tag v-if="change.derived" size="small" type="warning">派生</el-tag>
                  </li>
                </ul>
                <ul v-if="item.instance_changes?.length" class="agent-access-detail-list">
                  <li v-for="entry in item.instance_changes" :key="entry.instance_id">
                    实例 #{{ entry.instance_id }}：
                    <template v-for="(change, idx) in entry.changes" :key="change.key">
                      <span v-if="idx > 0">；</span>{{ change.key }}: {{ fmtValue(change.before) }} → {{ fmtValue(change.after) }}
                    </template>
                  </li>
                </ul>
                <ul v-if="item.label_overrides_preserved?.length" class="agent-access-detail-list">
                  <li v-for="entry in item.label_overrides_preserved" :key="entry.instance_id">
                    实例 #{{ entry.instance_id }} 保留本地标签覆盖「{{ entry.label_override }}」（共享修改不改变其显示）
                  </li>
                </ul>
              </li>
            </ul>
          </div>
          <div class="agent-access-detail-line">
            语义差异：
            <ul class="agent-access-detail-list">
              <li v-for="change in selectedChange.semantic_diff" :key="change.key">
                {{ change.key }}: {{ fmtValue(change.before) }} → {{ fmtValue(change.after) }}
                <el-tag v-if="change.derived" size="small" type="warning">派生</el-tag>
              </li>
            </ul>
          </div>
          <div class="agent-access-detail-line">
            摘要：<code data-test="proposal-digest">{{ selectedChange.proposal_digest }}</code>
          </div>
          <div>
            <el-button
              size="small"
              type="primary"
              data-test="approve-change"
              :disabled="deciding || decisionUnavailable"
              @click="decide(true)"
            >批准</el-button>
            <el-button
              size="small"
              type="danger"
              data-test="reject-change"
              :disabled="deciding || decisionUnavailable"
              @click="decide(false)"
            >拒绝</el-button>
            <span v-if="decisionUnavailable" class="agent-access-hint">该提案已处理或已过期，操作不可用</span>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<style scoped>
/* 长内容自行换行或滚动；弹窗宽度上限由 el-dialog 的 width prop（dialogWidth）负责。 */
.agent-access-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.agent-access-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.agent-access-issue-form {
  margin-top: 12px;
}

.agent-access-token-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.agent-access-token-row code {
  word-break: break-all;
}

.agent-access-load-more {
  margin-top: 8px;
  text-align: center;
}

.agent-access-detail {
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.agent-access-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.agent-access-detail-line {
  margin-bottom: 6px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.agent-access-detail-line code {
  word-break: break-all;
}

.agent-access-detail-list {
  margin: 4px 0 0;
  padding-left: 20px;
}
</style>
