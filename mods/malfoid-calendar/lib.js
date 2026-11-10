// 日曆的純邏輯：解析 Google 日曆「私密 iCal 網址」抓回的 .ics，並把重複事件展開到指定區間。
// 不依賴 herdr，node --test 可直接測。

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MAX_STEPS = 20000; // 重複事件最多往後推幾步（每日事件約 55 年），防止壞資料造成無窮迴圈

// config.json 的 urls → [{ url, color }]。每項可以是網址字串，或 { "url": "…", "color": "#RRGGBB" }。
// 只收 https，避免 file:// 之類被 curl 讀本機檔；color 不是 #RRGGBB 就回 null，由面板依順序套 theme 色。
export function calendarsFrom(text) {
  let v;
  try { v = JSON.parse(text ?? "null"); } catch { return []; }
  if (!Array.isArray(v?.urls)) return [];
  return v.urls
    .map(u => (typeof u === "string" ? { url: u } : u))
    .filter(u => typeof u?.url === "string" && /^https:\/\//i.test(u.url))
    .map(u => ({ url: u.url, color: typeof u.color === "string" && /^#[0-9a-f]{6}$/i.test(u.color) ? u.color : null }));
}

export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const unescape = (s) => s.replace(/\\([nN]|[\\;,])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

// 指定時區在某個 UTC 瞬間的偏移（毫秒）；執行環境沒有 Intl 或時區名稱無效時當作本機時間
function tzOffset(utcMs, tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs)).map(x => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
  } catch {
    return -new Date(utcMs).getTimezoneOffset() * 60e3;
  }
}

// DTSTART 等日期值 → { date, allDay }。格式：20261110 / 20261110T090000 / 20261110T090000Z，可帶 TZID。
export function parseDate(value, tz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m.map((x, i) => (i && i < 7 && x !== undefined ? Number(x) : x));
  if (h === undefined) return { date: new Date(y, mo - 1, d), allDay: true };
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (z) return { date: new Date(wall), allDay: false };
  if (!tz) return { date: new Date(y, mo - 1, d, h, mi, s), allDay: false }; // floating：照本機時間
  // 兩輪修正，夏令時間交界附近也落在正確的瞬間
  let t = wall - tzOffset(wall, tz);
  t = wall - tzOffset(t, tz);
  return { date: new Date(t), allDay: false };
}

export function parseICS(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n"); // RFC 5545 折行
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: new Set() }; continue; }
    if (line === "END:VEVENT") {
      if (cur?.start) {
        cur.end ??= new Date(cur.start.getTime() + (cur.allDay ? 86400e3 : 0));
        events.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(";");
    const value = line.slice(colon + 1);
    const tz = params.find(p => p.startsWith("TZID="))?.slice(5).replace(/^"|"$/g, "");
    switch (name.toUpperCase()) {
      case "UID": cur.uid = value; break;
      case "SUMMARY": cur.summary = unescape(value); break;
      case "LOCATION": cur.location = unescape(value); break;
      case "STATUS": cur.status = value.toUpperCase(); break;
      case "DTSTART": { const r = parseDate(value, tz); if (r) { cur.start = r.date; cur.allDay = r.allDay; } break; }
      case "DTEND": cur.end = parseDate(value, tz)?.date; break;
      case "RECURRENCE-ID": cur.recurrenceId = parseDate(value, tz)?.date.getTime(); break;
      case "EXDATE": for (const v of value.split(",")) { const r = parseDate(v, tz); if (r) cur.exdates.add(r.date.getTime()); } break;
      case "RRULE": cur.rrule = Object.fromEntries(value.split(";").map(kv => kv.split("="))); break;
    }
  }
  return events;
}

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// 依 freq 往後推 n 個單位；月／年遇到不存在的日期（2/31）回 null 跳過，不像 JS 那樣溢位到下個月
function step(start, freq, n) {
  if (freq === "DAILY") return addDays(start, n);
  if (freq === "WEEKLY") return addDays(start, 7 * n);
  const x = new Date(start);
  if (freq === "MONTHLY") x.setMonth(x.getMonth() + n);
  else if (freq === "YEARLY") x.setFullYear(x.getFullYear() + n);
  else return n === 0 ? x : null;
  return x.getDate() === start.getDate() ? x : null;
}

// 依時間順序產生每次發生的開始時間（含之後會被 EXDATE 排除的，COUNT 依 RFC 也算它們）
// ponytail: 只支援 FREQ/INTERVAL/COUNT/UNTIL 與 WEEKLY 的 BYDAY；「每月第二個週二」這類 BYDAY/BYMONTHDAY/BYSETPOS 只照 DTSTART 那天重複，真的遇到再補
function* occurrences(ev) {
  const r = ev.rrule;
  if (!r) { yield ev.start; return; }
  const interval = Number(r.INTERVAL) || 1;
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? parseDate(r.UNTIL)?.date.getTime() ?? Infinity : Infinity;
  const byday = r.FREQ === "WEEKLY" && r.BYDAY ? r.BYDAY.split(",").map(d => DAYS.indexOf(d.slice(-2))).filter(i => i >= 0) : null;
  let n = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    let batch;
    if (byday) {
      const monday = addDays(ev.start, i * 7 * interval - ((ev.start.getDay() + 6) % 7)); // 週起始 WKST=MO
      batch = byday.map(d => addDays(monday, (d + 6) % 7)).filter(t => t >= ev.start).sort((a, b) => a - b);
    } else {
      const t = step(ev.start, r.FREQ, i * interval);
      batch = t ? [t] : [];
    }
    for (const t of batch) {
      if (t.getTime() > until || n >= count) return;
      n++;
      yield t;
    }
  }
}

// 展開成 [from, to) 區間內的所有發生，依開始時間排序。被單次修改的那一次由 RECURRENCE-ID 事件取代。
export function expand(events, from, to) {
  const overridden = new Set(events.filter(e => e.recurrenceId != null).map(e => `${e.uid}\u0000${e.recurrenceId}`));
  const out = [];
  for (const ev of events) {
    if (ev.status === "CANCELLED") continue;
    const dur = ev.end - ev.start;
    const master = ev.recurrenceId == null;
    for (const s of master ? occurrences(ev) : [ev.start]) {
      if (s >= to) break;
      const ms = s.getTime();
      if (master && (ev.exdates.has(ms) || overridden.has(`${ev.uid}\u0000${ms}`))) continue;
      if (ms + Math.max(dur, 1) > from.getTime()) {
        out.push({ summary: ev.summary ?? "(No title)", location: ev.location ?? "", start: s, end: new Date(ms + dur), allDay: ev.allDay, color: ev.color });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || Number(b.allDay) - Number(a.allDay));
}
