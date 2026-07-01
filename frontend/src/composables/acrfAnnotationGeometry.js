export const ANNOTATION_FORM_KEY = '_form';

export const ANNOTATION_POSITION_MIN_Y = -200;
export const ANNOTATION_POSITION_MAX_Y = 200;

export const ACRF_ANNOTATION_FONT_SIZE_PT = 8.0;
export const ACRF_ANNOTATION_HEIGHT_CM = 0.7;
export const ACRF_ANNOTATION_PADDING_X_EMU = 22860;
export const ACRF_ANNOTATION_PADDING_Y_EMU = 18000;
export const ACRF_ANNOTATION_BORDER_WIDTH_EMU = 12700;
export const ACRF_ANNOTATION_BOX_WIDTH_MAX_CM = 4.6;
export const ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU = -120000;
export const ACRF_ANNOTATION_EMU_PER_01CM = 3600;

export const ACRF_ANNOTATION_BORDER_COLOR = '#C00000';
export const ACRF_ANNOTATION_BACKGROUND_COLOR = '#FFF2F2';
export const ACRF_ANNOTATION_TEXT_COLOR = '#C00000';

export const ANNOTATION_KIND_FIELD = 'field';
export const ANNOTATION_KIND_INLINE_HEADER = 'inline-header';
export const ANNOTATION_KIND_FORM = 'form';

export const ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND = Object.freeze({
  [ANNOTATION_KIND_FIELD]: ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU,
  [ANNOTATION_KIND_INLINE_HEADER]: ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU,
  [ANNOTATION_KIND_FORM]: ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU,
});

const EMU_PER_INCH = 914400;
const CSS_PX_PER_INCH = 96;
const CM_PER_INCH = 2.54;
const EMU_PER_CM = EMU_PER_INCH / CM_PER_INCH;
const EMU_PER_CSS_PX = EMU_PER_INCH / CSS_PX_PER_INCH;

// Word 导出使用 EMU，浏览器预览按 CSS 绝对单位排版。CSS 规范下 1in = 96px = 72pt，
// 因此这里固定使用 914400 EMU/in 与 96 px/in 做换算，保证拖动位移与导出 posOffset 同源。
export const CSS_PX_PER_CM = CSS_PX_PER_INCH / CM_PER_INCH;
export const CSS_PX_PER_01CM = CSS_PX_PER_CM / 100;

function normalizeAnnotationKey(key) {
  if (typeof key !== 'string') return '';
  return key.trim();
}

function formatCssNumber(value, digits = 4) {
  return Number(value)
    .toFixed(digits)
    .replace(/\.?0+$/, '');
}

export function clampAnnotationDelta01Cm(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.round(numeric);
  return Math.max(ANNOTATION_POSITION_MIN_Y, Math.min(ANNOTATION_POSITION_MAX_Y, rounded));
}

export function normalizeAnnotationPositions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  for (const [key, position] of Object.entries(value)) {
    const normalizedKey = normalizeAnnotationKey(key);
    if (!normalizedKey) continue;
    const y = clampAnnotationDelta01Cm(position?.y);
    if (y !== 0) normalized[normalizedKey] = { y };
  }
  return normalized;
}

export function readAnnotationDelta01Cm(annotationPositions, key) {
  const normalizedKey = normalizeAnnotationKey(key);
  if (!normalizedKey) return 0;
  return clampAnnotationDelta01Cm(normalizeAnnotationPositions(annotationPositions)?.[normalizedKey]?.y ?? 0);
}

export function hasAnnotationOverride(annotationPositions, key) {
  const normalizedKey = normalizeAnnotationKey(key);
  if (!normalizedKey) return false;
  return Object.prototype.hasOwnProperty.call(normalizeAnnotationPositions(annotationPositions), normalizedKey);
}

export function buildNextAnnotationPositions(annotationPositions, key, deltaY01cm) {
  const normalized = normalizeAnnotationPositions(annotationPositions);
  const normalizedKey = normalizeAnnotationKey(key);
  if (!normalizedKey) return normalized;
  const nextDelta = clampAnnotationDelta01Cm(deltaY01cm);
  if (nextDelta === 0) {
    delete normalized[normalizedKey];
  } else {
    normalized[normalizedKey] = { y: nextDelta };
  }
  return normalized;
}

export function annotationDeltaPxTo01Cm(deltaPx) {
  return clampAnnotationDelta01Cm(deltaPx / CSS_PX_PER_01CM);
}

export function emuToCssPx(emu) {
  return emu / EMU_PER_CSS_PX;
}

export function emuToCm(emu) {
  return emu / EMU_PER_CM;
}

export function resolveAnnotationDefaultOffsetEmu(kind = ANNOTATION_KIND_FIELD) {
  return ACRF_ANNOTATION_DEFAULT_OFFSET_EMU_BY_KIND[kind] ?? ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU;
}

export function resolveAnnotationTopCm(kind = ANNOTATION_KIND_FIELD, deltaY01cm = 0) {
  const defaultOffset = resolveAnnotationDefaultOffsetEmu(kind);
  const deltaOffset = clampAnnotationDelta01Cm(deltaY01cm) * ACRF_ANNOTATION_EMU_PER_01CM;
  return emuToCm(defaultOffset + deltaOffset);
}

export function estimateAnnotationWidthCm(text) {
  const normalizedText = String(text ?? '').trim();
  const weightedChars = [...normalizedText].reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 2 : 1), 0);
  const estimated = 0.45 + weightedChars * 0.2;
  return Math.min(ACRF_ANNOTATION_BOX_WIDTH_MAX_CM, Math.max(0.9, estimated));
}

export function buildAnnotationStyle({ text, kind = ANNOTATION_KIND_FIELD, deltaY01cm = 0 } = {}) {
  return {
    '--acrf-annotation-top': `${formatCssNumber(resolveAnnotationTopCm(kind, deltaY01cm))}cm`,
    '--acrf-annotation-height': `${formatCssNumber(ACRF_ANNOTATION_HEIGHT_CM)}cm`,
    '--acrf-annotation-width': `${formatCssNumber(estimateAnnotationWidthCm(text))}cm`,
    '--acrf-annotation-max-width': `${formatCssNumber(ACRF_ANNOTATION_BOX_WIDTH_MAX_CM)}cm`,
    '--acrf-annotation-padding-x': `${formatCssNumber(emuToCm(ACRF_ANNOTATION_PADDING_X_EMU))}cm`,
    '--acrf-annotation-padding-y': `${formatCssNumber(emuToCm(ACRF_ANNOTATION_PADDING_Y_EMU))}cm`,
    '--acrf-annotation-border-width': `${formatCssNumber(emuToCssPx(ACRF_ANNOTATION_BORDER_WIDTH_EMU))}px`,
    '--acrf-annotation-font-size': `${formatCssNumber(ACRF_ANNOTATION_FONT_SIZE_PT)}pt`,
  };
}
