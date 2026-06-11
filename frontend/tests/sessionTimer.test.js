import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOKEN_STORAGE_KEY,
  createSessionWarningGuard,
  decodeJwtPayload,
  getTokenRemainingSeconds,
  useSessionTimer,
} from '../src/composables/useSessionTimer.js';

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function makeToken(payload) {
  return ['e30', encodePayload(payload), 'sig'].join('.');
}

function createTokenStorage(token) {
  const store = new Map([[TOKEN_STORAGE_KEY, token]]);
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test('decodes JWT payload exp and returns remaining seconds', () => {
  const payload = { sub: '1', username: 'DECADE', ver: 5, exp: 1700000060 };
  const token = makeToken(payload);

  assert.deepEqual(decodeJwtPayload(token), payload);
  assert.equal(getTokenRemainingSeconds(token, 1700000000000), 60);
});

test('warning guard fires once while staying inside five minute window', () => {
  const shouldWarn = createSessionWarningGuard();

  assert.equal(shouldWarn(301), false);
  assert.equal(shouldWarn(300), true);
  assert.equal(shouldWarn(120), false);
  assert.equal(shouldWarn(1), false);
  assert.equal(shouldWarn(0), false);
  assert.equal(shouldWarn(600), false);
  assert.equal(shouldWarn(300), true);
});

test('formats session timer display text by remaining lifetime', () => {
  let nowMs = 1700000000000;
  const token = makeToken({ sub: '1', username: 'DECADE', ver: 5, exp: 1700000060 });
  const timer = useSessionTimer({
    now: () => nowMs,
    tokenStorage: createTokenStorage(token),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });

  assert.equal(timer.displayText.value, '会话剩余 1 分钟');

  nowMs = 1700000001000;
  timer.recalculateRemainingTime({ notify: false });
  assert.equal(timer.displayText.value, '会话即将过期');

  nowMs = 1700000061000;
  timer.recalculateRemainingTime({ notify: false });
  assert.equal(timer.displayText.value, '已过期');
});


test('refresh action calls auth me once and recalculates local remaining time', async () => {
  const nowMs = 1700000000000;
  const token = makeToken({ sub: '1', username: 'DECADE', ver: 5, exp: 1700001800 });
  const refreshedToken = makeToken({ sub: '1', username: 'DECADE', ver: 5, exp: 1700003600 });
  const tokenStorage = createTokenStorage(token);
  const calls = [];
  const intervalCalls = [];
  const successMessages = [];

  const timer = useSessionTimer({
    apiGet: async (url) => {
      calls.push(url);
      tokenStorage.setItem(TOKEN_STORAGE_KEY, refreshedToken);
      return { username: 'DECADE' };
    },
    message: {
      warning() {},
      success(message) {
        successMessages.push(message);
      },
      error() {},
    },
    now: () => nowMs,
    tokenStorage,
    setIntervalFn: (_callback, intervalMs) => {
      intervalCalls.push(intervalMs);
      return 1;
    },
    clearIntervalFn: () => {},
  });

  assert.equal(timer.remainingSeconds.value, 1800);
  assert.equal(timer.displayText.value, '会话剩余 30 分钟');
  assert.deepEqual(intervalCalls, [30000]);

  await timer.refreshSession();

  assert.deepEqual(calls, ['/api/auth/me']);
  assert.equal(timer.remainingSeconds.value, 3600);
  assert.equal(timer.displayText.value, '会话剩余 60 分钟');
  assert.deepEqual(successMessages, ['会话已续期']);
  assert.equal(timer.loading.value, false);
});
