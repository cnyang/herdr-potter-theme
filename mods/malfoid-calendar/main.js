// 日曆面板：月曆格＋選定日的行程，資料來自 Google 日曆的「私密 iCal 網址」（唯讀同步）。
// 網址寫在 data/theme-calendar/config.json：{ "urls": ["https://calendar.google.com/calendar/ical/…/basic.ics"] }，
// 可放多個日曆；每項也可寫成 { "url": "…", "color": "#RRGGBB" } 指定顏色，沒指定就依順序套 theme 的四個狀態色。
// 三個 theme 共用同一份設定。私密網址等同密碼，只存在本機，不進 repo。
//
// 本 mod 啟動後面板沒開也活著，所以計時器先確認面板開著：關著時不讀檔、不連網。
// 開著時：第一次立即抓，之後每 REFRESH_MS 重抓；按 ↻ 立即重抓。
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import * as fs from "fs/promises";
import { appHome, exec, layout, readTextFile, theme } from "herdr";
import { calendarsFrom, dayKey, expand, parseICS } from "./lib.js";

const BLOCK = "calendar"; // layout 裡 panel-body 的子區塊 id
// 沒指定顏色的日曆依序用這些 theme token：每個 theme 都調過對比，深色（Tomb Raider、Malfoid）淺色（Husky）都看得清楚
const PALETTE = ["working", "blocked", "done", "unknown"];
// 事件上存 hex 或 token 名稱，render 時才解析，切換 theme 顏色跟著變
const paint = (t, c) => (c?.startsWith("#") ? c : t[c] ?? t.working);
const REFRESH_MS = 10 * 60e3;
const dir = () => `${appHome().replace(/\\/g, "/")}/data/theme-calendar`;
const configFile = () => `${dir()}/config.json`;

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) {
    const f = find(c, id);
    if (f) return f;
  }
  return null;
}

const isOpen = () => {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  return Boolean(panel && !panel.hidden && body?.active === BLOCK);
};

// curl 而不是 fetch：fetch 沒有逾時；參數以陣列交給 exec（不經 shell），-f 讓 HTTP 錯誤以非 0 結束
const get = async (url) => {
  const r = await exec("/usr/bin/curl", ["-sSfL", "--max-time", "20", "--url", url]);
  if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || `curl exit ${r.code}`);
  return r.stdout;
};

const pad = (n) => String(n).padStart(2, "0");
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default class MalfoidCalendar extends View {
  init(_props, cx) {
    const now = new Date();
    this.month = new Date(now.getFullYear(), now.getMonth(), 1);
    this.selected = dayKey(now);
    this.events = []; // parseICS 的結果（所有日曆合併）
    this.state = "idle"; // idle | loading | ready | setup | error
    this.err = null;
    this.at = 0; // 上次成功（或嘗試）抓取的時間
    this.busy = false;
    cx.timer.every(1000, (cx) => {
      if (isOpen() && !this.busy && Date.now() - this.at > REFRESH_MS) cx.spawn((cx) => this.load(cx));
    });
  }

  async load(cx) {
    this.busy = true;
    this.at = Date.now();
    if (this.state !== "ready") { this.state = "loading"; cx.notify(); }
    try {
      await fs.mkdir(dir(), { recursive: true }).catch(() => {});
      const cals = calendarsFrom(await readTextFile(configFile()));
      if (!cals.length) { this.state = "setup"; return; }
      // 單一日曆失敗不拖垮其他：有任何一個成功就顯示，錯誤列在底部
      const results = await Promise.allSettled(cals.map(c => get(c.url)));
      const ok = results.filter(r => r.status === "fulfilled");
      const bad = results.filter(r => r.status === "rejected");
      if (ok.length) {
        this.events = results.flatMap((r, i) => r.status === "fulfilled"
          ? parseICS(r.value).map(e => ({ ...e, color: cals[i].color ?? PALETTE[i % PALETTE.length] }))
          : []);
      }
      this.err = bad.length ? `Sync failed (${bad.length}/${cals.length}): ${bad[0].reason?.message ?? bad[0].reason}` : null;
      this.state = ok.length ? "ready" : "error";
    } catch (e) {
      this.err = `Cannot read config: ${e?.message ?? e}`;
      this.state = "error";
    } finally {
      this.busy = false;
      cx.notify();
    }
  }

  shift(n, cx) {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() + n, 1);
    cx.notify();
  }

  button(t, id, label, action) {
    return div().id(`cal-${id}`).h(28).px(8).rounded(5).flex().items_center().text_size(14)
      .bg(t.chrome).text_color(t.muted).hover((s) => s.bg(t.hover)).on_click(action).child(label);
  }

  grid(t, byDay, today) {
    const y = this.month.getFullYear(), m = this.month.getMonth();
    const first = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7)); // 週一開頭
    const rows = [];
    for (let w = 0; w < 6; w++) {
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + w * 7 + i);
        const key = dayKey(d), inMonth = d.getMonth() === m, sel = key === this.selected;
        cells.push(v_flex().id(`cal-d-${key}`).flex_1().h(42).rounded(5).items_center().justify_center().gap(2)
          .when(sel, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.selected = key; if (!inMonth) this.month = new Date(d.getFullYear(), d.getMonth(), 1); cx.notify(); })
          .child(div().text_size(15).text_color(key === today ? t.working : inMonth ? t.foreground : t.dim).when(key === today, (el) => el.font_semibold()).child(String(d.getDate())))
          // 當天有哪些日曆就各點一顆，最多 3 顆
          .child(h_flex().h(4).gap(2).children([...new Set((byDay.get(key) ?? []).map(o => o.color))].slice(0, 3)
            .map(c => div().size(4).rounded(2).bg(paint(t, c))))));
      }
      rows.push(h_flex().w_full().gap(2).children(cells));
    }
    return v_flex().px(10).gap(2)
      .child(h_flex().w_full().gap(2).children(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((n) => div().flex_1().text_center().text_size(13).text_color(t.dim).child(n))))
      .children(rows);
  }

  agenda(t, list) {
    const [y, m, d] = this.selected.split("-").map(Number);
    const title = new Date(y, m - 1, d).toDateString();
    return v_flex().id("cal-agenda").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(10).gap(8).border_t(1).border_color(t.border)
      .child(div().text_size(14).font_semibold().text_color(t.muted).child(title))
      .children(list.length ? list.map((o, i) => h_flex().id(`cal-e-${i}`).gap(10).items_start()
        .child(div().w(3).h(38).flex_none().rounded(2).bg(paint(t, o.color)))
        .child(div().w(104).flex_none().text_size(14).text_color(paint(t, o.color)).child(o.allDay ? "All day" : `${hm(o.start)}–${hm(o.end)}`))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(15).child(o.summary))
          .when(Boolean(o.location), (el) => el.child(div().text_size(13).text_color(t.dim).truncate().child(o.location)))))
        : [div().text_size(15).text_color(t.dim).child("No events.")]);
  }

  render() {
    const t = theme();
    const msg = (text) => v_flex().flex_1().items_center().justify_center().p(16).child(div().text_size(15).text_color(t.muted).text_center().child(text));
    const header = h_flex().h(38).flex_none().px(14).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().font_semibold().truncate().child(`${MONTHS[this.month.getMonth()]} ${this.month.getFullYear()}`))
      .child(this.button(t, "prev", "‹", (_e, cx) => this.shift(-1, cx)))
      .child(this.button(t, "today", "Today", (_e, cx) => { const n = new Date(); this.month = new Date(n.getFullYear(), n.getMonth(), 1); this.selected = dayKey(n); cx.notify(); }))
      .child(this.button(t, "next", "›", (_e, cx) => this.shift(1, cx)))
      .child(this.button(t, "sync", "↻", (_e, cx) => { if (!this.busy) cx.spawn((cx) => this.load(cx)); }));

    let body;
    if (this.state === "setup") body = msg(`Add your Google Calendar secret iCal address to\n${configFile()}\n\n{ "urls": ["https://calendar.google.com/calendar/ical/…/basic.ics"] }\n\nGoogle Calendar → Settings → your calendar → Integrate calendar → Secret address in iCal format. Then press ↻.`);
    else if (this.state === "error") body = msg(this.err);
    else if (this.state !== "ready") body = msg("Loading…");
    else {
      // 只展開畫面上看得到的 6 週，加上選定日（可能在格子外）
      const y = this.month.getFullYear(), m = this.month.getMonth();
      const from = new Date(y, m, -7), to = new Date(y, m + 1, 14);
      const all = expand(this.events, from, to);
      const byDay = new Map();
      for (const o of all) {
        // 跨日事件每一天都標點；全天事件的 DTEND 是隔天 00:00，不算進去
        for (let d = new Date(o.start.getFullYear(), o.start.getMonth(), o.start.getDate()); d < o.end || d.getTime() === o.start.getTime(); d.setDate(d.getDate() + 1)) {
          const k = dayKey(d);
          if (!byDay.has(k)) byDay.set(k, []);
          byDay.get(k).push(o);
        }
      }
      body = v_flex().flex_1().min_h(0).pt(8).gap(8)
        .child(this.grid(t, byDay, dayKey(new Date())))
        .child(this.agenda(t, byDay.get(this.selected) ?? []));
    }
    return v_flex().id("calendar").size_full().min_h(0).bg(`${t.chrome}99`).text_color(t.foreground).text_size(15)
      .child(header)
      .child(body)
      .when(Boolean(this.err && this.state === "ready"), (el) => el.child(div().flex_none().px(14).py(6).text_size(13).text_color(t.blocked).child(this.err)));
  }
}
