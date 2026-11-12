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

// ── Teams 未讀（網頁版，跑在 Zen 瀏覽器）─────────────────────────────────────────
// 不碰網路、不存 token：Teams 網頁版有未讀時分頁標題會變成「(1) 聊天 | … | Microsoft Teams」，
// 而 Zen（Firefox 系）每 ~15 秒把所有分頁標題寫進 session store（mozlz4 壓縮）。
// 這裡只讀那個本機檔案、只印出含 Microsoft Teams 的標題；cookie、表單資料等其他欄位一律不碰。
// String.raw：保留 \x00 讓 Python 自己解讀，不被 JS 先轉成 NUL 字元。
export const LZ4_PY = String.raw`
def unlz4(src):
    # 標準 LZ4 block：token 高 4 bit = literal 長度，低 4 bit = match 長度 - 4，15 代表後面還有擴充位元組
    dst, i = bytearray(), 0
    while i < len(src):
        tok = src[i]; i += 1
        lit = tok >> 4
        if lit == 15:
            while True:
                b = src[i]; i += 1; lit += b
                if b != 255: break
        dst += src[i:i + lit]; i += lit
        if i >= len(src): break
        off = src[i] | src[i + 1] << 8; i += 2
        ml = tok & 15
        if ml == 15:
            while True:
                b = src[i]; i += 1; ml += b
                if b != 255: break
        s = len(dst) - off
        for k in range(ml + 4): dst.append(dst[s + k])  # 逐位元組複製：offset < 長度時是重疊 match，不能用切片
    return bytes(dst)
`;

export const TEAMS_PY = String.raw`${LZ4_PY}
import glob, json, os, subprocess, sys

# Zen 沒在跑時 recovery.jsonlz4 是上次關閉前的舊檔，不能當現況
if subprocess.run(["pgrep", "-x", "zen"], capture_output=True).returncode: sys.exit()
pat = os.path.expanduser("~/Library/Application Support/zen/Profiles/*/sessionstore-backups/recovery.jsonlz4")
for f in glob.glob(pat):
    raw = open(f, "rb").read()
    if raw[:8] != b"mozLz40\x00": continue  # 魔術字串 + 4 bytes 解壓後長度，之後才是 LZ4 block
    for w in json.loads(unlz4(raw[12:])).get("windows", []):
        for t in w.get("tabs", []):
            es = t.get("entries") or []
            if not es: continue
            title = es[min(t.get("index", 1), len(es)) - 1].get("title", "")  # index 是 1 起算的目前歷史位置
            if "Microsoft Teams" in title: print(title.replace("\n", " "))
`;

// 標題行 → 未讀數。沒有 Teams 分頁 = null（狀態列不顯示）；有分頁但沒前綴 = 0；多個分頁取最大，不加總以免重複計算。
export function parseTeams(out) {
  const titles = String(out ?? "").split("\n").filter((l) => l.includes("Microsoft Teams"));
  if (!titles.length) return null;
  return Math.max(...titles.map((l) => Number(/^\((\d+)/.exec(l)?.[1] ?? 0)));
}

// ── Discord 未讀（網頁版，跑在 Chrome）──────────────────────────────────────────
// Chrome 的設定檔資料夾被 macOS 擋住讀不到，所以改用 AppleScript 即時問 Chrome 分頁標題。
// 第一次執行時 macOS 會請使用者允許 herdr 控制 Chrome（自動化權限）；拒絕就只是不顯示。
// 先判斷 is running：不然 tell 會把沒開的 Chrome 叫起來。只回傳含 Discord 的標題，其他分頁不外洩。
export const DISCORD_AS = `set out to ""
if application "Google Chrome" is running then
	tell application "Google Chrome"
		repeat with w in windows
			repeat with t in tabs of w
				set n to title of t
				if n contains "Discord" then set out to out & n & linefeed
			end repeat
		end repeat
	end tell
end if
return out`;

// Discord 標題：「(3) Discord | …」= 3 則提及/私訊；「• Discord | …」= 有未讀但沒提及；「Discord | …」= 已讀。
// 要求 Discord 在標題開頭（前綴之後），排除「… | Discord 開發人員入口網站」這類分頁。
// 回傳 null（沒有 Discord 分頁，不顯示）或 { mentions, unread }；多個分頁時提及取最大、未讀任一即算。
export function parseDiscord(out) {
  const tabs = String(out ?? "").split("\n")
    .map((l) => /^(?:\((\d+)\) |(•) )?Discord(?: \||$)/.exec(l.trim()))
    .filter(Boolean);
  if (!tabs.length) return null;
  return {
    mentions: Math.max(...tabs.map((m) => Number(m[1] ?? 0))),
    unread: tabs.some((m) => m[1] || m[2]),
  };
}
