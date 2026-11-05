// 修改自 herdr-mods/yt-music（MIT，見 LICENSE-yt-music.txt）：改為控制本機 Apple Music，
// 放在 Malfoid 側欄底部：曲名、時間，以及上一首、倒退 10 秒、播放／暫停、快轉 10 秒、下一首。
//
// 全 app 只有一條連線。daemon.js 是唯一與 Music 通話的程序：以 herdr-core 終端 apm-<daemon.js 雜湊>
// 長駐（同名只能有一個活的，所以重載或第二份 mod 會沿用它）。曲目、播放狀態或位置跳動時它寫
// data/malfoid-music/state.json；本 mod 監看該資料夾（不輪詢），並以 data/malfoid-music/cmd.json 下指令。
// 第一次使用時 macOS 會詢問是否允許控制 Music（系統設定 > 隱私權與安全性 > 自動化）。
//
// 沒歌時區塊縮到 0 px，有歌時長回來；layout 裡的區塊 id 必須是 BLOCK。
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import * as fs from "fs/promises";
import { hc, appHome, readTextFile, watchFolder, theme, run, layout } from "herdr";
import { SEEK_SECONDS, blockHeight, clock, hash, position } from "./lib.js";

const NAME = "malfoid-music";
const BLOCK = "music";
const ICON = (name) => `mods/${NAME}/${name}.svg`;
const home = () => appHome().replace(/\\/g, "/");
const dataDir = () => `${home()}/data/${NAME}`;
const daemonFile = () => `${home()}/mods/${NAME}/daemon.js`;

const CONTROLS = [
  ["previous", "skip-back", "Previous"],
  ["back", "rewind", `Back ${SEEK_SECONDS} s`],
  ["toggle", null, null],
  ["forward", "fast-forward", `Forward ${SEEK_SECONDS} s`],
  ["next", "skip-forward", "Next"],
];

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) {
    const f = find(c, id);
    if (f) return f;
  }
  return null;
}

// 側欄收成窄條（< 160 px）時五顆按鈕放不下：與 malfoid-chrome 一樣以寬度判斷，不看旗標。
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

export default class MalfoidMusic extends View {
  init(_props, cx) {
    this.state = null; // { title, artist, paused, seconds, duration, at } 或 { error } 或 null
    // 兩次寫入之間由本 mod 自己推進時鐘，只有播放中才重畫；順便讓區塊跟上側欄寬度變化。
    cx.timer.every(1000, (cx) => { this.fit(); if (this.state?.title && !this.state.paused) cx.notify(); });
    // 資料夾事件漏掉時不能讓舊曲目一直掛著：播放中每 5 秒重讀一次，時鐘超過曲長也立刻重讀。
    this.ticks = 0;
    cx.timer.every(1000, (cx) => {
      const s = this.state;
      if (!s?.title || s.paused) return;
      const over = s.duration > 0 && s.seconds + (Date.now() - s.at) / 1000 > s.duration + 1;
      if (over || ++this.ticks % 5 === 0) cx.spawn((cx) => this.load(cx));
    });
    // daemon 可能在 mod 不知情時結束（herdr-core 重啟、osascript 當掉、舊版 mod 的 close()）：每 10 秒確認，沒活著就重啟。
    cx.timer.every(10000, (cx) => { if (this.daemon) cx.spawn(async () => { if (!(await this.daemonLive())) await this.startDaemon(); }); });
    cx.spawn(async (cx) => {
      await fs.mkdir(dataDir(), { recursive: true }).catch(() => {});
      await this.startDaemon();
      await this.load(cx);
      for (;;) {
        const changed = await watchFolder(dataDir());
        // state.json 以暫存檔改名的方式原子寫入，事件可能只列出暫存檔：除了 cmd.json，其餘變動都重讀。
        if (!changed.length || changed.some((p) => !p.endsWith("cmd.json"))) await this.load(cx);
      }
    });
  }

  // 只有一個 daemon：以只有一個活終端能持有的名稱啟動；舊版（別的雜湊）先收掉。
  async startDaemon() {
    const src = await readTextFile(daemonFile());
    this.daemon = `apm-${hash(src ?? "")}`;
    try {
      const ls = JSON.parse((await hc(["ls", "--json"])).stdout);
      for (const t of ls.terminals ?? []) {
        if (t.name?.startsWith("apm-") && t.name !== this.daemon && t.state === "live") await hc(["kill", t.address]);
      }
    } catch (_) {}
    // name_taken 代表已在執行：什麼都不用做。
    await hc(["run", "--name", this.daemon, "--bg", "--no-parent", "--rm", "--json", "--", "osascript", "-l", "JavaScript", daemonFile(), dataDir()]).catch(() => {});
  }

  async load(cx) {
    let s = null;
    try { s = JSON.parse((await readTextFile(`${dataDir()}/state.json`)) ?? "null"); } catch (_) { s = null; }
    this.state = s;
    this.fit();
    cx.notify();
  }

  fit() { this.showBlock(blockHeight(this.state, narrow())); }

  act(action, cx) {
    // 先在畫面上反應，daemon 下一次寫入會校正。
    if (action === "toggle" && this.state?.title) {
      const s = this.state, now = Date.now();
      this.state = { ...s, paused: !s.paused, seconds: position(s, now), at: now };
    }
    cx.notify();
    fs.writeFile(`${dataDir()}/cmd.json`, JSON.stringify({ action, n: Date.now() })).catch(() => {});
    cx.spawn(async () => { if (this.daemon && !(await this.daemonLive())) await this.startDaemon(); });
  }

  // 有東西可顯示時才佔空間。絕不 hide：被隱藏的區塊不會啟動 mod，daemon 也就永遠起不來。
  showBlock(px) {
    const node = find(layout(), BLOCK);
    if (!node) return;
    if (node.hidden) run("layout.show", { id: BLOCK });
    if (node.size?.px !== px) run("layout.resize", { id: BLOCK, px });
  }

  async daemonLive() {
    try {
      const ls = JSON.parse((await hc(["ls", "--json"])).stdout);
      return (ls.terminals ?? []).some((t) => t.name === this.daemon && t.state === "live");
    } catch (_) { return true; } // 判斷不出來：寧可不要多啟動一個
  }

  // 區塊消失（結束、換 layout）時收掉 daemon；單純重載則保留。
  async close() {
    if (this.daemon) await hc(["kill", this.daemon]).catch(() => {});
  }

  render() {
    const t = theme(), s = this.state;
    // 底色與側欄其他區塊相同（chrome + alpha），讓側欄底圖透出。
    const box = v_flex().id(NAME).size_full().px(12).justify_center().gap(6).overflow_hidden()
      .bg(`${t.chrome}c8`).border_t(1).border_color(t.border).text_size(12).text_color(t.muted);
    if (!s) return box;
    if (s.error === "denied") {
      return box.child(h_flex().gap(8).items_center()
        .child(svg(ICON("music")).size(12).flex_none().text_color(t.dim))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim)
          .tooltip("System Settings > Privacy & Security > Automation: allow Music")
          .child("Music: allow Automation access")));
    }
    const button = (id, icon, tip) => {
      const main = id === "toggle";
      return div().id(`apm-${id}`).size(main ? 28 : 24).flex_none().flex().items_center().justify_center()
        .rounded(main ? 14 : 4).cursor_pointer()
        .when(main, (el) => el.bg(t.raised).text_color(t.foreground))
        .when(!main, (el) => el.text_color(t.muted))
        .hover((el) => el.bg(t.hover).text_color(t.foreground)).tooltip(tip)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => this.act(id, cx))
        .child(svg(ICON(icon)).size(12));
    };
    const seconds = position(s, Date.now());
    const pct = s.duration > 0 ? Math.min(1, seconds / s.duration) : 0;
    return box
      // 1: 曲目
      .child(h_flex().gap(7).items_center().tooltip(`${s.title} · ${s.artist}`)
        .child(svg(ICON("music")).size(12).flex_none().text_color(s.paused ? t.dim : t.accent))
        .child(div().flex_shrink(1).min_w(0).truncate().text_color(s.paused ? t.muted : t.foreground).font_medium().child(s.title))
        .child(div().flex_shrink(2).min_w(0).truncate().text_color(t.dim).child(s.artist)))
      // 2: 進度
      .child(h_flex().gap(8).items_center().text_size(11)
        .child(div().w(34).flex_none().text_color(t.dim).child(clock(seconds)))
        // 進度條吃掉兩個時間框剩下的寬度；填色用百分比。不要用 on_size_change 的寬度手算：實測它含 Herdr zoom（1.2 倍），會把右邊的總長擠出區塊。
        .child(div().flex_1().min_w(40).h(4).rounded(2).bg(t.raised).child(div().h_full().rounded(2).w(`${pct * 100}%`).bg(s.paused ? t.dim : t.accent)))
        .child(div().w(34).flex_none().text_right().text_color(t.dim).child(clock(s.duration))))
      // 3: 控制鈕
      .child(h_flex().gap(6).items_center().justify_center().children(CONTROLS.map(([id, icon, tip]) =>
        id === "toggle" ? button(id, s.paused ? "play" : "pause", s.paused ? "Play" : "Pause") : button(id, icon, tip))));
  }
}
