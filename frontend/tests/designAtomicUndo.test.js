import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeleteProfileCommand } from '../src/composables/formDesignerPropertyEditor.js';
import { useDesignerHistory } from '../src/composables/useDesignerHistory.js';

test('new-field shared-definition undo is one allowlisted binding-profile command, not two separately committed writes', () => {
  const definition = { variable_name: 'AGE', label: '实际提交前的字段', field_type: '数值' };
  assert.deepEqual(buildDeleteProfileCommand({
    cleanupDefinitionId: null, restoreDefinitionId: 17, restoreDefinition: definition,
  }), {
    definition_operation: { operation: 'update_shared', update_shared: { target_definition_id: 17, definition } },
    binding: { mode: 'keep' }, instance: { mode: 'delete' },
  });
});

for (const direction of ['undo', 'redo']) {
  test(`a committed ${direction} followed by a failed refresh cannot keep the same command available for duplicate replay`, async () => {
    const history = useDesignerHistory();
    let commits = 0;
    const error = Object.assign(new Error('刷新失败，写入已提交'), { committed: true });
    const action = async () => { commits++; throw error; };
    history.record({ ids: { ffId: 7 }, undo: direction === 'undo' ? action : async () => {}, redo: action });
    if (direction === 'redo') await history.undo();
    await assert.rejects(history[direction](), (actual) => actual === error);
    assert.equal(direction === 'undo' ? history.canUndo.value : history.canRedo.value, false);
    await history[direction]();
    assert.equal(commits, 1);
  });
}
