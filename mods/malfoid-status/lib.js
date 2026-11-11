// 系統用量取樣。一支 sh 腳本印一行「cpu% mem% rx tx」，rx/tx 是累計位元組，速率由前後兩次相減得出。
// 只支援 macOS：其他系統 uname 不符，什麼都不印，parseSample 回 null，狀態列就不顯示用量。
export const SAMPLE_SH = `
if [ "$(uname)" = Darwin ]; then
  # CPU：top 取兩次樣（第一次是開機以來的平均，不能用），取第二次的 100 - idle
  cpu=$(top -l 2 -n 0 -s 1 | awk '/CPU usage/ {v = 100 - ($7 + 0)} END {printf "%.0f", v}')
  # 記憶體：照活動監視器的算法 = (App 記憶體 + 系統核心 + 已壓縮) / 實體記憶體；App = 匿名頁 - 可清除頁
  mem=$(vm_stat | awk -v total="$(sysctl -n hw.memsize)" '/page size/ {ps = $8} /Anonymous pages/ {a = $3} /Pages purgeable/ {p = $3} /Pages wired down/ {w = $4} /occupied by compressor/ {c = $5} END {printf "%.0f", (a - p + w + c) * ps * 100 / total}')
  # 網路：只加總 en* 實體介面的 <Link#> 那一列（同一介面的其他列是位址，會重複計算）
  # -n 不能省：沒有它 netstat 會對每個位址做反向 DNS，一次要 5 秒
  net=$(netstat -inb | awk '$1 ~ /^en[0-9]+$/ && $3 ~ /^<Link/ {i += $7; o += $10} END {printf "%.0f %.0f", i, o}')
  echo "$cpu $mem $net"
fi
`;

const clamp = (n) => Math.min(100, Math.max(0, n));

// 輸出不是剛好四個有限數字（或計數器為負）就當作取樣失敗。
export function parseSample(out) {
  const f = String(out ?? "").trim().split(/\s+/).map(Number);
  if (f.length !== 4 || !f.every(Number.isFinite) || f[2] < 0 || f[3] < 0) return null;
  return { cpu: clamp(f[0]), mem: clamp(f[1]), rx: f[2], tx: f[3] };
}

// 兩次累計值相減除以經過時間（毫秒）；計數器倒退（介面重置、換機器）算 0，不出現負速率。
export function netRate(prev, cur, ms) {
  if (!(ms > 0)) return { down: 0, up: 0 };
  const per = (a, b) => Math.max(0, b - a) * 1000 / ms;
  return { down: per(prev.rx, cur.rx), up: per(prev.tx, cur.tx) };
}

// B/s → KB/s → MB/s，以 1024 進位；四捨五入後不讓 KB 出現 1000 以上。
export function fmtRate(b) {
  if (b < 1024) return `${Math.round(b)} B/s`;
  const kb = b / 1024;
  return Math.round(kb) < 1000 ? `${Math.round(kb)} KB/s` : `${(kb / 1024).toFixed(1)} MB/s`;
}
