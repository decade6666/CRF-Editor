import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import { api } from './useApi.js';

export const TOKEN_STORAGE_KEY = 'crf_token';
const WARNING_THRESHOLD_SECONDS = 5 * 60;
const SESSION_REFRESH_URL = '/api/auth/me';
const TIMER_INTERVAL_MS = 1000;

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized.padEnd(normalized.length + paddingLength, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function getDefaultTokenStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function createEmptyMessage() {
  return {
    warning() {},
    success() {},
    error() {},
  };
}

function formatRemainingSeconds(remainingSeconds) {
  if (!Number.isFinite(remainingSeconds)) return '';
  if (remainingSeconds <= 0) return '已过期';
  if (remainingSeconds < 60) return '会话即将过期';
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `会话剩余 ${minutes}:${String(seconds).padStart(2, '0')}`;
}

function resolveTimerStatus(remainingSeconds) {
  if (!Number.isFinite(remainingSeconds)) return 'normal';
  if (remainingSeconds <= 0) return 'danger';
  if (remainingSeconds <= WARNING_THRESHOLD_SECONDS) return 'warning';
  return 'normal';
}

export function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload));
  } catch {
    return null;
  }
}

export function getTokenRemainingSeconds(token, nowMs = Date.now()) {
  const payload = decodeJwtPayload(token);
  if (!Number.isFinite(payload?.exp)) return null;
  return Math.floor(payload.exp - nowMs / 1000);
}

export function createSessionWarningGuard(thresholdSeconds = WARNING_THRESHOLD_SECONDS) {
  let warned = false;
  return (remainingSeconds) => {
    const shouldWarn = remainingSeconds > 0 && remainingSeconds <= thresholdSeconds;
    if (!shouldWarn) {
      if (remainingSeconds > thresholdSeconds) warned = false;
      return false;
    }
    if (warned) return false;
    warned = true;
    return true;
  };
}

export function useSessionTimer(options = {}) {
  const {
    apiGet = api.get,
    clearIntervalFn = clearInterval,
    intervalMs = TIMER_INTERVAL_MS,
    message = createEmptyMessage(),
    now = Date.now,
    setIntervalFn = setInterval,
    tokenStorage = getDefaultTokenStorage(),
  } = options;

  const remainingSeconds = ref(null);
  const loading = ref(false);
  const shouldWarn = createSessionWarningGuard();
  let timerId = null;

  function recalculateRemainingTime({ notify = true } = {}) {
    const token = tokenStorage?.getItem(TOKEN_STORAGE_KEY);
    remainingSeconds.value = getTokenRemainingSeconds(token, now());
    if (notify && shouldWarn(remainingSeconds.value)) {
      message.warning('会话即将过期，请尽快续期或保存进度');
    }
  }

  async function refreshSession() {
    if (loading.value) return;
    loading.value = true;
    try {
      await apiGet(SESSION_REFRESH_URL);
      recalculateRemainingTime({ notify: false });
      message.success('会话已续期');
    } catch (error) {
      if (error?.status !== 401) message.error(error?.message || '会话续期失败，请稍后重试');
    } finally {
      loading.value = false;
    }
  }

  function stop() {
    if (timerId === null) return;
    clearIntervalFn(timerId);
    timerId = null;
  }

  recalculateRemainingTime({ notify: true });
  timerId = setIntervalFn(recalculateRemainingTime, intervalMs);

  if (getCurrentInstance()) onBeforeUnmount(stop);

  return {
    displayText: computed(() => formatRemainingSeconds(remainingSeconds.value)),
    loading,
    recalculateRemainingTime,
    refreshSession,
    remainingSeconds,
    status: computed(() => resolveTimerStatus(remainingSeconds.value)),
    stop,
  };
}
