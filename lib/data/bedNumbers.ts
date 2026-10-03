/**
 * Which bed numbers are taken. Every screen must show the same beds in red, so the numbers are
 * stored with the counts (bed_inventory.occupied_beds) and brought in line with the count by one
 * rule, the same here and in the database (bedlink_fit_occupied in the bed_numbers SQL):
 *   - numbers outside 1..total are dropped
 *   - too many taken: the highest numbers are freed first
 *   - too few taken: the lowest free numbers are taken first
 * So a hold or a "-1" turns the lowest green bed red, and a "+1" frees the highest red one.
 */
export function fitOccupied(occupied: readonly number[] | null | undefined, total: number, available: number): number[] {
  const beds = Math.max(0, Math.floor(total));
  const free = Math.min(Math.max(0, Math.floor(available)), beds);
  const target = beds - free;

  const kept = Array.from(new Set(occupied ?? []))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= beds)
    .sort((a, b) => a - b)
    .slice(0, target);

  const taken = new Set(kept);
  for (let n = 1; n <= beds && kept.length < target; n++) {
    if (!taken.has(n)) kept.push(n);
  }
  return kept.sort((a, b) => a - b);
}

export function sameBeds(a: readonly number[] | null | undefined, b: readonly number[] | null | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((n, i) => n === y[i]);
}
