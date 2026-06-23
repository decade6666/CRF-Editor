export function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getCandidateTexts(item, getCandidates) {
  const candidates = getCandidates(item);
  const values = Array.isArray(candidates) ? candidates : [candidates];
  return values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

function getSearchRank(item, keyword, getCandidates) {
  const matchedLengths = getCandidateTexts(item, getCandidates)
    .map((text) => normalizeSearchText(text))
    .filter((text) => text.includes(keyword))
    .map((text) => ({ exact: text === keyword, length: text.length }));

  if (!matchedLengths.length) return null;
  const exactMatch = matchedLengths.some((match) => match.exact);
  const shortestLength = Math.min(...matchedLengths.map((match) => match.length));
  return { exactMatch, shortestLength };
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
      if (a.rank.exactMatch !== b.rank.exactMatch) return a.rank.exactMatch ? -1 : 1;
      if (a.rank.shortestLength !== b.rank.shortestLength) return a.rank.shortestLength - b.rank.shortestLength;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}
