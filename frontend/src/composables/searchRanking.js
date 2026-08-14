export function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getCandidateTexts(item, getCandidates) {
  const candidates = getCandidates(item);
  const values = Array.isArray(candidates) ? candidates : [candidates];
  return values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => normalizeSearchText(value))
    .filter((value) => value.length > 0);
}

// ── 受限编辑距离 ────────────────────────────────────────────────

function levenshteinBounded(a, b, maxDist) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  let curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// 关键词在候选文本中的最佳近似子串窗口：返回 { distance, start } 或 null。
function bestEditWindow(keyword, text, maxDist) {
  const k = keyword.length;
  let best = null;
  for (let start = 0; start <= text.length; start++) {
    const maxLen = Math.min(k + maxDist, text.length - start);
    for (let len = Math.max(0, k - maxDist); len <= maxLen; len++) {
      const distance = levenshteinBounded(keyword, text.slice(start, start + len), maxDist);
      if (
        distance <= maxDist &&
        (!best || distance < best.distance || (distance === best.distance && start < best.start))
      ) {
        best = { distance, start };
      }
    }
  }
  return best;
}

// 1–2 字不启用错字容错；3–5 字最多 1 次增删改；6 字以上最多 2 次。
function allowedEditDistance(keywordLength) {
  if (keywordLength <= 2) return 0;
  if (keywordLength <= 5) return 1;
  return 2;
}

// 相关性下限：相似度 = 1 - distance / keyword.length >= 0.7（仅 6 字以上生效）。
function meetsSimilarityFloor(keywordLength, distance) {
  if (keywordLength < 6) return true;
  return distance * 10 <= keywordLength * 3;
}

// 有序跳字/子序列匹配：返回 { span, start } 或 null（最左贪心，起点最早）。
function findSubsequence(keyword, text) {
  let ki = 0;
  let start = -1;
  let end = -1;
  for (let ti = 0; ti < text.length && ki < keyword.length; ti++) {
    if (text[ti] === keyword[ki]) {
      if (ki === 0) start = ti;
      end = ti;
      ki += 1;
    }
  }
  if (ki !== keyword.length) return null;
  return { span: end - start + 1, start };
}

// ── 排序 ─────────────────────────────────────────────────────────

// 层级：0 精确 > 1 连续包含 > 2 有序子序列 > 3 受限编辑距离
function computeCandidateRank(keyword, text) {
  if (text.includes(keyword)) return { tier: 1, quality: [text.length] };
  const sub = findSubsequence(keyword, text);
  if (sub) return { tier: 2, quality: [sub.span, sub.start] };
  const maxDist = allowedEditDistance(keyword.length);
  if (maxDist <= 0) return null;
  const window = bestEditWindow(keyword, text, maxDist);
  if (!window || !meetsSimilarityFloor(keyword.length, window.distance)) return null;
  return { tier: 3, quality: [window.distance, window.start] };
}

function getSearchRank(item, keyword, getCandidates) {
  let best = null;
  for (const text of getCandidateTexts(item, getCandidates)) {
    if (text === keyword) return { tier: 0, quality: [] };
    const rank = computeCandidateRank(keyword, text);
    if (rank && (!best || rank.tier < best.tier || (rank.tier === best.tier && compareQuality(rank.quality, best.quality) < 0))) {
      best = rank;
    }
  }
  return best;
}

function compareQuality(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function rankFuzzyMatches(items, keyword, getCandidates) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return items;

  return items
    .map((item, index) => ({
      item,
      index,
      rank: getSearchRank(item, normalizedKeyword, getCandidates),
    }))
    .filter((entry) => entry.rank)
    .sort((a, b) => {
      if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
      const qualityDiff = compareQuality(a.rank.quality, b.rank.quality);
      if (qualityDiff !== 0) return qualityDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}
