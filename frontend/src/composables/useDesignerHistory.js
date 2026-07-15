import { ref, computed } from 'vue';

// 表单设计器内存撤销/恢复：维护 undo/redo 双栈，上限 20 步，刷新即清空。
// 每条记录 { label, ids, undo, redo }：
//   - ids：本条命令引用的后端 id（数字或数字数组）；撤销删除会产生新 id，需通过 remapId 回写。
//   - undo / redo：async (ids, { remapId }) => Promise；回放正向 / 逆向操作。
// undo / redo 在执行期间加 busy 锁，禁止并发触发；回放抛错时不改动栈，交由调用方提示并保持一致。
export const MAX_HISTORY = 20;

function cloneIds(ids) {
  const next = {};
  for (const key of Object.keys(ids || {})) {
    const value = ids[key];
    next[key] = Array.isArray(value) ? [...value] : value;
  }
  return next;
}

function remapEntryIds(ids, oldId, newId) {
  for (const key of Object.keys(ids)) {
    const value = ids[key];
    if (Array.isArray(value)) {
      ids[key] = value.map((item) => (item === oldId ? newId : item));
    } else if (value === oldId) {
      ids[key] = newId;
    }
  }
}

export function useDesignerHistory() {
  const undoStack = ref([]);
  const redoStack = ref([]);
  const busy = ref(false);
  let generation = 0;

  const canUndo = computed(() => !busy.value && undoStack.value.length > 0);
  const canRedo = computed(() => !busy.value && redoStack.value.length > 0);

  function remapId(oldId, newId) {
    if (oldId == null || newId == null || oldId === newId) return;
    for (const entry of undoStack.value) remapEntryIds(entry.ids, oldId, newId);
    for (const entry of redoStack.value) remapEntryIds(entry.ids, oldId, newId);
  }

  // 记录一条新命令：回放期间拒绝写入；超出上限丢弃最旧，执行新操作清空 redo 栈。
  function record(entry) {
    if (busy.value) return false;
    if (!entry || typeof entry.undo !== 'function' || typeof entry.redo !== 'function') return false;
    const normalized = {
      label: entry.label || '',
      ids: cloneIds(entry.ids),
      undo: entry.undo,
      redo: entry.redo,
    };
    const next = [...undoStack.value, normalized];
    if (next.length > MAX_HISTORY) next.shift();
    undoStack.value = next;
    redoStack.value = [];
    return true;
  }

  async function undo() {
    if (busy.value || !undoStack.value.length) return;
    const entry = undoStack.value[undoStack.value.length - 1];
    const replayGeneration = generation;
    // 回放可能在中途 remapId 后再抛错；先快照 ids，失败时还原，保证栈内容不被污染。
    const idsSnapshot = cloneIds(entry.ids);
    busy.value = true;
    try {
      await entry.undo(entry.ids, { remapId });
      if (replayGeneration !== generation) return;
      undoStack.value = undoStack.value.slice(0, -1);
      redoStack.value = [...redoStack.value, entry];
    } catch (err) {
      entry.ids = idsSnapshot;
      throw err;
    } finally {
      busy.value = false;
    }
  }

  async function redo() {
    if (busy.value || !redoStack.value.length) return;
    const entry = redoStack.value[redoStack.value.length - 1];
    const replayGeneration = generation;
    const idsSnapshot = cloneIds(entry.ids);
    busy.value = true;
    try {
      await entry.redo(entry.ids, { remapId });
      if (replayGeneration !== generation) return;
      redoStack.value = redoStack.value.slice(0, -1);
      undoStack.value = [...undoStack.value, entry];
    } catch (err) {
      entry.ids = idsSnapshot;
      throw err;
    } finally {
      busy.value = false;
    }
  }

  function clear() {
    generation += 1;
    undoStack.value = [];
    redoStack.value = [];
  }

  return { undoStack, redoStack, busy, canUndo, canRedo, record, remapId, undo, redo, clear };
}
