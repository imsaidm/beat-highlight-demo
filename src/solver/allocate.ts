export interface AllocItem {
  readonly min: number;
  readonly max: number;
  readonly weight: number;
}

/**
 * Integer "water-filling": split `total` beats across items so every item gets
 * [min, max] beats, preferring multiples of `unit`, with extra beats going to
 * the item with the highest weight-per-beat. Deterministic (ties -> lower index).
 * Returns null when infeasible.
 */
export function allocateBeats(total: number, items: readonly AllocItem[], unit: number): number[] | null {
  if (items.length === 0) return total === 0 ? [] : null;
  if (items.some((it) => it.min > it.max)) return null;
  const minSum = items.reduce((a, it) => a + it.min, 0);
  const maxSum = items.reduce((a, it) => a + it.max, 0);
  if (minSum > total || maxSum < total) return null;

  const pick = (alloc: readonly number[], step: number): number => {
    let best = -1;
    let bestRatio = -Infinity;
    items.forEach((it, i) => {
      if (alloc[i]! + step > it.max) return;
      const ratio = it.weight / alloc[i]!;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = i;
      }
    });
    return best;
  };

  let alloc = items.map((it) => it.min);
  let remaining = total - minSum;
  for (const step of [unit, 1]) {
    while (remaining >= step) {
      const i = pick(alloc, step);
      if (i < 0) break;
      alloc = alloc.map((v, j) => (j === i ? v + step : v));
      remaining -= step;
    }
  }
  return remaining === 0 ? alloc : null;
}
