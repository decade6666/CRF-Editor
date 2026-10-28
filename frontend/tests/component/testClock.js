// Real-clock tests must not lose Vue events when the host wall clock is corrected backward.
export function createNonDecreasingNow(readNow) {
  let latest = -Infinity;
  return () => {
    latest = Math.max(latest, readNow());
    return latest;
  };
}
