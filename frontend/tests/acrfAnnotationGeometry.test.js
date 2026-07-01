import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANNOTATION_FORM_KEY,
  ANNOTATION_KIND_FIELD,
  ANNOTATION_KIND_FORM,
  ANNOTATION_KIND_INLINE_HEADER,
  ACRF_ANNOTATION_BACKGROUND_COLOR,
  ACRF_ANNOTATION_BORDER_COLOR,
  ACRF_ANNOTATION_BORDER_WIDTH_EMU,
  ACRF_ANNOTATION_BOX_WIDTH_MAX_CM,
  ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND,
  ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU,
  ACRF_ANNOTATION_EMU_PER_01CM,
  ACRF_ANNOTATION_FONT_SIZE_PT,
  ACRF_ANNOTATION_HEIGHT_CM,
  ACRF_ANNOTATION_PADDING_X_EMU,
  ACRF_ANNOTATION_PADDING_Y_EMU,
  ACRF_ANNOTATION_TEXT_COLOR,
  CSS_PX_PER_01CM,
  annotationDeltaPxTo01Cm,
  buildAnnotationStyle,
  buildNextAnnotationPositions,
  clampAnnotationDelta01Cm,
  readAnnotationDelta01Cm,
  resolveAnnotationTopCm,
} from '../src/composables/acrfAnnotationGeometry.js';

test('aCRF annotation geometry mirrors backend constants and three anchor defaults', () => {
  assert.equal(ANNOTATION_FORM_KEY, '_form');
  assert.equal(ACRF_ANNOTATION_FONT_SIZE_PT, 8.0);
  assert.equal(ACRF_ANNOTATION_HEIGHT_CM, 0.7);
  assert.equal(ACRF_ANNOTATION_PADDING_X_EMU, 22860);
  assert.equal(ACRF_ANNOTATION_PADDING_Y_EMU, 18000);
  assert.equal(ACRF_ANNOTATION_BORDER_WIDTH_EMU, 12700);
  assert.equal(ACRF_ANNOTATION_BOX_WIDTH_MAX_CM, 4.6);
  assert.equal(ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU, -120000);
  assert.equal(ACRF_ANNOTATION_EMU_PER_01CM, 3600);
  assert.equal(ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND[ANNOTATION_KIND_FIELD], -120000);
  assert.equal(ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND[ANNOTATION_KIND_INLINE_HEADER], -120000);
  assert.equal(ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND[ANNOTATION_KIND_FORM], -120000);

  const expectedTopCm = -120000 / 360000;
  assert.ok(Math.abs(resolveAnnotationTopCm(ANNOTATION_KIND_FIELD, 0) - expectedTopCm) < 1e-9);
  assert.ok(Math.abs(resolveAnnotationTopCm(ANNOTATION_KIND_INLINE_HEADER, 0) - expectedTopCm) < 1e-9);
  assert.ok(Math.abs(resolveAnnotationTopCm(ANNOTATION_KIND_FORM, 0) - expectedTopCm) < 1e-9);
});

test('aCRF drag converts px to 0.01cm integers and clamps to backend range', () => {
  assert.equal(annotationDeltaPxTo01Cm(0), 0);
  assert.equal(annotationDeltaPxTo01Cm(CSS_PX_PER_01CM * 12), 12);
  assert.equal(annotationDeltaPxTo01Cm(CSS_PX_PER_01CM * -17), -17);
  assert.equal(annotationDeltaPxTo01Cm(CSS_PX_PER_01CM * 500), 200);
  assert.equal(clampAnnotationDelta01Cm(-999), -200);
  assert.equal(clampAnnotationDelta01Cm(999), 200);
});

test('aCRF preview style uses shared red palette and backend-sized box metrics', () => {
  const style = buildAnnotationStyle({
    text: 'LBTESTCD',
    kind: ANNOTATION_KIND_FIELD,
    deltaY01cm: 0,
  });

  assert.equal(ACRF_ANNOTATION_BORDER_COLOR, '#C00000');
  assert.equal(ACRF_ANNOTATION_BACKGROUND_COLOR, '#FFF2F2');
  assert.equal(ACRF_ANNOTATION_TEXT_COLOR, '#C00000');
  assert.equal(style['--acrf-annotation-font-size'], '8pt');
  assert.equal(style['--acrf-annotation-height'], '0.7cm');
  assert.equal(style['--acrf-annotation-max-width'], '4.6cm');
  assert.equal(style['--acrf-annotation-padding-x'], '0.0635cm');
  assert.equal(style['--acrf-annotation-padding-y'], '0.05cm');
  assert.equal(style['--acrf-annotation-border-width'], '1.3333px');
});

test('resetting an annotation removes the persisted override instead of storing zero', () => {
  assert.deepEqual(
    buildNextAnnotationPositions(
      {
        [ANNOTATION_FORM_KEY]: { y: -20 },
        LBTESTCD: { y: 14 },
      },
      'LBTESTCD',
      0,
    ),
    {
      [ANNOTATION_FORM_KEY]: { y: -20 },
    },
  );
});

test('annotation position keys are normalized by trimming outer whitespace', () => {
  assert.equal(readAnnotationDelta01Cm({ '  LBTESTCD  ': { y: 14 } }, 'LBTESTCD'), 14);
  assert.deepEqual(
    buildNextAnnotationPositions(
      {
        '  LBTESTCD  ': { y: 14 },
      },
      ' LBTESTCD ',
      20,
    ),
    {
      LBTESTCD: { y: 20 },
    },
  );
});
