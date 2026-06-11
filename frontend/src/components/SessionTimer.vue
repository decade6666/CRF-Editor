<template>
  <el-button
    v-if="displayText"
    class="session-timer"
    :class="`session-timer--${status}`"
    text
    :loading="loading"
    :disabled="loading"
    :title="buttonTitle"
    :aria-label="buttonTitle"
    @click="refreshSession"
  >
    <el-icon v-if="!loading" aria-hidden="true"><Clock /></el-icon>
    <span class="session-timer__text">{{ displayText }}</span>
  </el-button>
</template>

<script setup>
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Clock } from '@element-plus/icons-vue';
import { useSessionTimer } from '../composables/useSessionTimer';

const { displayText, loading, refreshSession, status } = useSessionTimer({ message: ElMessage });

const buttonTitle = computed(() => (loading.value ? '正在续期会话' : `${displayText.value}，点击续期`));
</script>

<style scoped>
.session-timer {
  color: var(--color-header-text);
  min-height: 32px;
  padding: 0 8px;
}

.session-timer:hover,
.session-timer:focus-visible {
  color: var(--color-header-text);
  background: rgba(255, 255, 255, 0.14);
}

.session-timer--warning,
.session-timer--warning:hover,
.session-timer--warning:focus-visible {
  color: var(--color-warning);
}

.session-timer--danger,
.session-timer--danger:hover,
.session-timer--danger:focus-visible {
  color: var(--color-danger);
}

.session-timer__text {
  margin-left: 4px;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .session-timer__text {
    display: none;
  }
}
</style>
