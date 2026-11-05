// 歌詞邏輯（純函式）：移植自 MusicTUI 的 Lyrics.swift 與 LRCLibClient.swift。
// 模組不能匯入自己資料夾以外的 JS，所以 position 與 malfoid-music 各留一份。

// 一行歌詞 { time, text }：time 為相對歌曲開頭的秒數，純文字歌詞為 null。
const TS = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/; // mm:ss(.xx) 或 hh:mm:ss(.xx)
// 只有這些才是 LRC 中繼標籤；「[Verse 1: Jon]」這類歌詞內容不能被當成標籤吃掉。
const META = /^(ar|ti|al|au|by|offset|length|re|ve|tool)\s*:/i;

const timestamp = (s) => {
  const m = TS.exec(s);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

// 解析 LRC：一行可有多個時間標籤（副歌重複）；中繼標籤略過；沒有時間標籤的行當純文字。
// 結果依時間排序（穩定，同時間維持檔案順序），純文字行接在後面維持原順序。
export function parseLRC(raw) {
  const timed = [], plain = [];
  for (const rawLine of String(raw).replace(/[\r\n]+$/, "").split("\n")) {
    let rest = rawLine.replace(/\r/g, "");
    const times = [];
    let meta = false;
    for (;;) {
      const m = /^\[([^\]]*)\]/.exec(rest);
      if (!m) break;
      const t = timestamp(m[1]);
      if (t !== null) times.push(t);
      else if (META.test(m[1])) meta = true;
      else break; // 不是標籤，是歌詞內容（例如「[Chorus]」）
      rest = rest.slice(m[0].length);
    }
    const text = rest.trim();
    if (times.length) for (const time of times) timed.push({ time, text });
    else if (!meta) plain.push({ time: null, text });
  }
  timed.sort((a, b) => a.time - b.time);
  const lines = [...timed, ...plain];
  // 純文字歌詞前後常有空行（lrclib 的 plainLyrics 開頭有 [offset:0] 後的空行）
  const blank = (l) => l.time === null && !l.text;
  while (lines.length && blank(lines[0])) lines.shift();
  while (lines.length && blank(lines.at(-1))) lines.pop();
  return lines;
}

// 播放到 position 秒時該高亮的行索引：最後一行 time <= position；還沒唱到或沒有時間軸回 -1。
export function currentIndex(lines, position) {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].time;
    if (t === null) continue;
    if (t <= position) found = i;
    else break;
  }
  return found;
}

const INSTRUMENTAL = { lines: [], synced: false, instrumental: true };

// lrclib 的一筆紀錄 → { lines, synced, instrumental }；沒有歌詞回 null。
function fromRecord(r) {
  if (!r || typeof r !== "object") return null;
  const synced = String(r.syncedLyrics ?? ""), plain = String(r.plainLyrics ?? "");
  if (r.instrumental === true && !synced.trim() && !plain.trim()) return INSTRUMENTAL;
  if (synced.trim()) {
    const lines = parseLRC(synced);
    if (lines.some((l) => l.time !== null)) return { lines, synced: true, instrumental: false };
  }
  if (plain.trim()) return { lines: parseLRC(plain), synced: false, instrumental: false };
  return null;
}

const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

// /api/get 的單筆回應
export const decodeGet = (text) => fromRecord(json(text));

// /api/search 的陣列回應：優先第一筆有時間軸的，其次第一筆非純音樂的純文字。
export function decodeSearch(text) {
  const rs = json(text);
  if (!Array.isArray(rs)) return null;
  const all = rs.map(fromRecord).filter(Boolean);
  return all.find((l) => l.synced) ?? all.find((l) => !l.instrumental) ?? all[0] ?? null;
}

const url = (base, path, params) => {
  const q = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `${base.replace(/\/+$/, "")}${path}?${q}`;
};

// /api/get：精確比對。album 與 duration 只在已知時才送：送 0 會讓 lrclib 用 ±2 秒比對而永遠找不到。
export function getUrl(base, { title, artist, album, duration }) {
  const params = [["track_name", title], ["artist_name", artist]];
  if (album) params.push(["album_name", album]);
  if (duration > 0) params.push(["duration", String(Math.round(duration))]);
  return url(base, "/api/get", params);
}

// /api/search：模糊比對，精確查詢 404 時的退路。
export const searchUrl = (base, { title, artist }) => url(base, "/api/search", [["track_name", title], ["artist_name", artist]]);

// 用 curl 而不是 fetch：fetch 沒有逾時設定，伺服器掛著會讓面板永遠停在 Loading。
// 參數以陣列交給 exec（不經 shell）；-w 讓最後一行是 HTTP 狀態碼。
// 15 秒（同 MusicTUI）：自架伺服器對沒快取過的歌第一次查詢實測要 6 秒以上，之後只要幾毫秒。
export const curlArgs = (target) => ["-sS", "--max-time", "15", "-w", "\n%{http_code}", "--url", target];

export function parseCurl(stdout) {
  const i = stdout.lastIndexOf("\n");
  return i < 0 ? { code: Number(stdout), body: "" } : { code: Number(stdout.slice(i + 1)), body: stdout.slice(0, i) };
}

// ~/.config/music/lyrics.json（與 MusicTUI 共用）的 endpoint；不是 http(s) 就當沒設定。
export function endpointFrom(text) {
  const e = json(text ?? "null")?.endpoint;
  return typeof e === "string" && /^https?:\/\//i.test(e) ? e : null;
}

// 先精確查，找不到再模糊搜尋。http(url) 回 { code, body }，連不上就丟錯。
// 回傳 { kind: "found", lyrics } | { kind: "none" } | { kind: "down", why }
export async function lookup(http, base, track) {
  if (!track.title) return { kind: "none" };
  try {
    for (const target of [getUrl(base, track), searchUrl(base, track)]) {
      const { code, body } = await http(target);
      if (code === 200) {
        const lyrics = target.includes("/api/get?") ? decodeGet(body) : decodeSearch(body);
        if (lyrics) return { kind: "found", lyrics };
      } else if (code !== 404 || target.includes("/api/search?")) return { kind: "down", why: `HTTP ${code}` };
    }
  } catch (e) {
    return { kind: "down", why: e?.message ?? String(e) };
  }
  return { kind: "none" };
}

// 上次寫入的位置 + 經過的時間；暫停不動，不超過總長。
export const position = (s, now) => (s.paused ? s.seconds : Math.min(s.duration || Infinity, s.seconds + (now - s.at) / 1000));
