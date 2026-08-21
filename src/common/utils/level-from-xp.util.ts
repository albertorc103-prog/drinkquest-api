/** Alineado con XpEngine.levelFromTotalXp en la app Android. */
export function levelFromTotalXp(totalXp: number): number {
  let remaining = Math.max(0, totalXp);
  let level = 1;
  while (level < 50) {
    const need = 180 + (level - 1) * 40;
    if (remaining < need) return level;
    remaining -= need;
    level += 1;
  }
  return 50;
}
