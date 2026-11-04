export const PORTRAITS = Array.from({ length: 10 }, (_, i) =>
  `mods/malfoid-tabs/art/portrait-${String(i + 1).padStart(2, "0")}.png`);

// 以 Tab ID 保存隨機結果；有效舊配圖優先保留，避免重畫、改名或排序時換臉。
export function assignPortraits(tabs, saved) {
  const known = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  const assigned = new Map();
  for (const { id } of tabs) {
    if (Object.hasOwn(known, id) && PORTRAITS.includes(known[id])) assigned.set(id, known[id]);
  }
  for (const { id } of tabs) {
    if (assigned.has(id)) continue;
    const used = new Set(assigned.values());
    const unused = PORTRAITS.filter(path => !used.has(path));
    const pool = unused.length ? unused : PORTRAITS;
    assigned.set(id, pool[Math.floor(Math.random() * pool.length)]);
  }
  return Object.fromEntries(assigned);
}
