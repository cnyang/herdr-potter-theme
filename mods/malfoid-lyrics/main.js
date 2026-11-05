// 歌詞面板：顯示 Apple Music 目前這首歌的歌詞，向自架的 lrclib 查詢。
// 做法參考 MusicTUI：先 /api/get 精確比對，404 再 /api/search；有時間軸的歌詞（LRC）高亮目前這句並置中，
// 純文字歌詞可自己捲動。端點讀 ~/.config/music/lyrics.json 的 endpoint（與 MusicTUI 共用），沒設定就不連網。
//
// 目前曲目與播放位置來自 malfoid-music 的 daemon 寫的 data/malfoid-music/state.json，不另開 daemon。
// 本 mod 啟動後即使面板沒開也會一直活著，所以計時器每次先確認面板開著：關著時不讀檔、不連網。
import { View, div } from "gpui-kit";
import { h_flex, v_flex, v_virtual_list, Scrollbar, VirtualListScrollHandle } from "gpui-base";
import { appHome, exec, home, layout, readTextFile, theme } from "herdr";
import { curlArgs, currentIndex, endpointFrom, lookup, parseCurl, position } from "./lib.js";

const BLOCK = "lyrics"; // layout 裡 panel-body 的子區塊 id
const LINE_H = 36; // px：每句固定高度，過長的句子截斷（虛擬清單需要已知高度）
const RETRY_MS = 15000; // 連不上伺服器時多久後再試
const LEAD = 0.5; // s：計時器每秒才看一次，提前半秒讓高亮平均落在正確的那句

const dataFile = () => `${appHome().replace(/\\/g, "/")}/data/malfoid-music/state.json`;
const configFile = () => `${home()}/.config/music/lyrics.json`;

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

// exec 在連不上時 curl 以非 0 結束：把 stderr 最後一行當原因丟出去，面板才讀得懂。
const http = async (target) => {
  const r = await exec("/usr/bin/curl", curlArgs(target));
  if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || `curl exit ${r.code}`);
  return parseCurl(r.stdout);
};

export default class MalfoidLyrics extends View {
  init(_props, cx) {
    this.cache = new Map(); // 曲名＋演出者 → { kind, lyrics?, why?, at }：每首歌每次執行只查一次
    this.list = VirtualListScrollHandle.new();
    this.track = null; // 目前曲目（state.json 的內容）
    this.key = null;
    this.idx = -1;
    this.sig = "";
    cx.timer.every(1000, (cx) => cx.spawn((cx) => this.tick(cx)));
  }

  async tick(cx) {
    if (!isOpen()) { this.sig = ""; return; }
    let s = null;
    try { s = JSON.parse((await readTextFile(dataFile())) ?? "null"); } catch { s = null; }
    this.track = s?.title ? s : null;
    const key = this.track ? `${s.artist}\u0000${s.title}` : null;
    const entry = key ? this.cache.get(key) : null;
    // 沒查過就查；連不上的過了 RETRY_MS 再試（先把時間往後推，重試期間畫面維持原樣）
    if (key && (!entry || (entry.kind === "down" && Date.now() - entry.at > RETRY_MS))) {
      this.cache.set(key, entry ? { ...entry, at: Date.now() } : { kind: "loading", at: Date.now() });
      cx.spawn((cx) => this.fetch(key, this.track, cx));
    }
    const shown = key ? this.cache.get(key) : null;
    const lyrics = shown?.kind === "found" ? shown.lyrics : null;
    const idx = lyrics?.synced ? currentIndex(lyrics.lines, position(this.track, Date.now()) + LEAD) : -1;
    const sig = `${key}|${shown?.kind}|${idx}`;
    if (sig === this.sig) return;
    // 換歌回到頂端；有時間軸就讓目前這句置中。
    if (idx >= 0) this.list.scroll_to_item(idx, "center");
    else this.list.scroll_to_item(0, "top");
    this.key = key; this.idx = idx; this.sig = sig;
    cx.notify();
  }

  async fetch(key, s, cx) {
    let text = null;
    try { text = await readTextFile(configFile()); } catch { text = null; }
    const base = endpointFrom(text);
    const result = base
      ? await lookup(http, base, { title: s.title, artist: s.artist, album: s.album ?? "", duration: s.duration })
      : { kind: "setup" };
    this.cache.set(key, { ...result, at: Date.now() });
    cx.notify();
  }

  message(t, title, detail) {
    return v_flex().flex_1().items_center().justify_center().gap(6).p(16)
      .child(div().text_size(13).text_color(t.muted).child(title))
      .when(Boolean(detail), (el) => el.child(div().text_size(11).text_color(t.dim).text_center().child(detail)));
  }

  body(t, lyrics) {
    const rows = (range) => Array.from({ length: range.end - range.start }, (_x, k) => {
      const i = range.start + k, cur = i === this.idx;
      return div().id(`lyric-${i}`).h(LINE_H).flex_none().px(16).flex().items_center().justify_center()
        // flex_shrink(1) 才會在面板邊緣出現省略號：gpui-kit 的 flex 子項預設不縮，沒有它句子只會被切掉。
        .child(div().flex_shrink(1).min_w(0).truncate()
          .text_size(cur ? 15 : 13.5).text_color(cur ? t.accent : i < this.idx ? t.dim : t.muted)
          .when(cur, (el) => el.font_semibold())
          .child(lyrics.lines[i].text));
    });
    return div().flex_1().min_h(0).relative()
      .child(v_virtual_list("lyrics-list", lyrics.lines.length, LINE_H, (i) => String(i), rows).track_scroll(this.list).size_full())
      .child(Scrollbar.vertical("lyrics-list").viewport_from_layout().absolute().inset_0());
  }

  render() {
    const t = theme(), s = this.track;
    const entry = this.key ? this.cache.get(this.key) : null;
    let content;
    if (!s) content = this.message(t, "Nothing playing");
    else if (!entry || entry.kind === "loading") content = this.message(t, "Loading…");
    else if (entry.kind === "none") content = this.message(t, "No lyrics found");
    else if (entry.kind === "setup") content = this.message(t, "No lyrics server set", '~/.config/music/lyrics.json  {"endpoint": "http://host:3300"}');
    else if (entry.kind === "down") content = this.message(t, "Cannot reach lyrics server", entry.why);
    else if (entry.lyrics.instrumental) content = this.message(t, "Instrumental");
    else content = this.body(t, entry.lyrics);
    return v_flex().id("lyrics").size_full().min_h(0).bg(`${t.chrome}99`).text_color(t.foreground).text_size(13)
      .child(h_flex().h(38).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Lyrics"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(s ? `${s.title} · ${s.artist}` : "")))
      .child(content);
  }
}
