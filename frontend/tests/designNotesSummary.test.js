import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADER_NOTES_MAX_LENGTH,
  normalizeDesignNotesTooltip,
  summarizeDesignNotes,
} from '../src/composables/designNotesSummary.js';

const longLine = 'A'.repeat(HEADER_NOTES_MAX_LENGTH + 10);

test('single-line notes pass through unchanged', () => {
  assert.equal(summarizeDesignNotes('第一行'), '第一行');
  assert.equal(summarizeDesignNotes('  缩进行  '), '缩进行');
});

test('multiline notes show only the first non-empty line with ellipsis', () => {
  assert.equal(summarizeDesignNotes('第一行\n第二行'), '第一行…');
  assert.equal(summarizeDesignNotes('行一\r\n行二\r\n行三'), '行一…');
  assert.equal(summarizeDesignNotes('行一\r行二'), '行一…');
});

test('leading blank lines are skipped before picking the first line', () => {
  assert.equal(summarizeDesignNotes('\n\n第一行\n第二行'), '第一行…');
  assert.equal(summarizeDesignNotes('   \n第一行'), '第一行');
});

test('a long first line is truncated with ellipsis', () => {
  assert.equal(summarizeDesignNotes(longLine), `${'A'.repeat(HEADER_NOTES_MAX_LENGTH)}…`);
  assert.equal(summarizeDesignNotes(longLine + '\n第二行'), `${'A'.repeat(HEADER_NOTES_MAX_LENGTH)}…`);
});

test('whitespace and blank lines inside the first line collapse', () => {
  assert.equal(summarizeDesignNotes('  第一行\t含  连续空格  '), '第一行 含 连续空格');
});

test('empty, whitespace-only and null notes produce an empty summary', () => {
  assert.equal(summarizeDesignNotes(''), '');
  assert.equal(summarizeDesignNotes('   \n\n  '), '');
  assert.equal(summarizeDesignNotes(null), '');
  assert.equal(summarizeDesignNotes(undefined), '');
});

test('ellipsis is not added for a single line even when it exactly fits the limit', () => {
  assert.equal(summarizeDesignNotes('A'.repeat(HEADER_NOTES_MAX_LENGTH)), 'A'.repeat(HEADER_NOTES_MAX_LENGTH));
});

test('normalizeDesignNotesTooltip preserves line breaks and strips surrounding blank lines', () => {
  assert.equal(normalizeDesignNotesTooltip('第一行\n  第二行缩进'), '第一行\n  第二行缩进');
  assert.equal(normalizeDesignNotesTooltip('行一\r\n行二'), '行一\n行二');
  assert.equal(normalizeDesignNotesTooltip('\n\n第一行\n\n'), '第一行');
  assert.equal(normalizeDesignNotesTooltip(null), '');
});

test('normalizeDesignNotesTooltip strips whitespace-only edge lines but keeps interior blank lines', () => {
  assert.equal(normalizeDesignNotesTooltip('   \n第一行\n\n第二行  \n第三行'), '第一行\n\n第二行  \n第三行');
  assert.equal(normalizeDesignNotesTooltip('\t\n第一行\n\t'), '第一行');
});
