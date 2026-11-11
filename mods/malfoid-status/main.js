// 修改自 Herdr 內建 workspace-status：圓角 13px、移除上緣分隔線，成為底部的浮動卡片。
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, exec } from "herdr";
import { SAMPLE_SH, parseSample, netRate, fmtRate } from "./lib.js";

const SAMPLE_MS = 3000; // 取樣間隔；一次取樣約 1.7 秒（top 要抽兩次樣）

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.stats = null; // { cpu, mem, down, up }；取樣失敗或不是 macOS 就是 null，狀態列不顯示
    this.prev = null; // 上一次的網路累計值，用來算速率
    this.busy = false;
    this.sample(cx);
    cx.timer.every(SAMPLE_MS, (cx) => this.sample(cx));
  }

  // 取樣的是目前 space 所在的機器，跟左邊的機器名稱一致；換機器後舊的累計值不能拿來算速率。
  sample(cx) {
    if (this.busy) return;
    this.busy = true;
    const machine = spaces().find((s) => s.active)?.machine ?? null;
    cx.spawn(async (cx) => {
      try {
        const cur = parseSample((await exec("sh", ["-c", SAMPLE_SH], { on: machine, timeout: 8000 })).stdout);
        const now = Date.now();
        const same = cur && this.prev && this.prev.machine === machine;
        this.stats = cur && { cpu: cur.cpu, mem: cur.mem, ...(same ? netRate(this.prev, cur, now - this.prev.at) : { down: 0, up: 0 }) };
        this.prev = cur && { rx: cur.rx, tx: cur.tx, machine, at: now };
      } catch {
        this.stats = this.prev = null; // 機器連不上：寧可不顯示，也不要留著過期的數字
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  // 固定最小寬度：數字位數變動時，右邊的元素不會跟著抖動。
  usage(st) {
    const cell = (w, text) => div().min_w(w).child(text);
    return h_flex().gap(12).items_center()
      .child(cell(54, `CPU ${st.cpu}%`))
      .child(cell(54, `MEM ${st.mem}%`))
      .child(cell(76, `↓ ${fmtRate(st.down)}`))
      .child(cell(76, `↑ ${fmtRate(st.up)}`));
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().rounded(13).overflow_hidden().bg(t.chrome).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .when(Boolean(this.stats), el => el.child(this.usage(this.stats)))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
