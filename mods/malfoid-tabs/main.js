// 修改自 Traveler：魔法學院頭像、青綠焦點框與金色等待提示。
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";
import { assignPortraits } from "./portraits.js";
import { ROTATE_MS, nextImage } from "./background.js";
// localStorage 內容可能損毀；壞資料退回預設，不讓模組初始化失敗。
function stored(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.panels = stored("panels");
    this.portraits = stored("portraits");
    cx.timer.every(ROTATE_MS, () => this.rotateBackground());
  }

  // 改中央 pane 的 image 後用 layout.set 寫回整棵樹（個人 layout 才允許）；換圖後磁碟上的 layout 會與 repo 預設不同，--update 會還原。
  rotateBackground() {
    const tree = JSON.parse(JSON.stringify(layout())), bg = find(tree, "main")?.content?.pane?.background;
    const next = bg && nextImage(bg.image);
    if (!next) return;
    bg.image = next;
    run("layout.set", { layout: tree });
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const allSpaces = spaces();
    const space = allSpaces.find(p => p.active);
    const shown = space?.tabs ?? [];
    const portraits = assignPortraits(allSpaces.flatMap(s => s.tabs ?? []), this.portraits);
    if (JSON.stringify(portraits) !== JSON.stringify(this.portraits)) {
      this.portraits = portraits;
      localStorage.setItem("portraits", JSON.stringify(portraits));
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action, pill) => div().id(id).size(pill ? 36 : 26).flex_none().flex().items_center().justify_center().text_color(t.dim)
      .when(pill, el => el.rounded(8).text_size(18).bg(t.surface).border(1).border_color(t.border)).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const allPanes = panes(); // 每次讀取都會複製全部 pane，整個 render 只讀一次。
    const item = (c, i) => {
      const program = allPanes.find(p => p.tab === c.id && p.program?.agent)?.program ?? allPanes.find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      // 選中分頁整圈 3px 框線（同 agents/spaces 的 focusRing），blocked 仍用 blocked 色；必須是最後一個 child
      const ring = c.status === "blocked" ? t.blocked : t.accent;
      return h_flex().id(`tab-${c.id}`).relative().h(42).rounded(9).px(11).gap(8).items_center().flex_none().text_size(13.5)
        .border(1).border_color(c.status === "blocked" ? t.blocked : c.active ? t.accent : t.border).bg(c.active ? t.selected : t.surface).text_color(c.active ? t.accent : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .child(image(portraits[c.id]).size(30).rounded(6).flex_none())
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))))
        .when(c.active, el => el.child(div().absolute().top(-1).left(-1).right(-1).bottom(-1).border(3).border_color(ring).rounded(9)));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = [...(shared("workspace.panels") ?? ["files", "changes"]), "graph", "lyrics", "notes", "calendar"];
    this.syncPanel(space, panel, body, enabled);
    // 工具列專用 24px 粗線圖示，用 image() 保留金色。
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).relative().h(36).px(12).gap(6).flex_none().items_center()
        .text_size(13).rounded(8).border(1).border_color(on ? t.accent : t.border).bg(on ? t.selected : t.surface).text_color(on ? t.accent : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(image(icon).size(24).flex_none()).child(label)
        // 開啟中的面板按鈕：同分頁的整圈 3px 框線，必須是最後一個 child
        .when(on, el => el.child(div().absolute().top(-1).left(-1).right(-1).bottom(-1).border(3).border_color(t.accent).rounded(8)));
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center()
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }), true))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/malfoid-tabs/art/panel-files.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/malfoid-tabs/art/panel-changes.svg")))
      .child(panelButton("graph", "Git", "mods/malfoid-tabs/art/panel-graph.svg"))
      .child(panelButton("lyrics", "Lyrics", "mods/malfoid-tabs/art/panel-lyrics.svg"))
      .child(panelButton("notes", "Note", "mods/malfoid-tabs/art/panel-notes.svg"))
      .child(panelButton("calendar", "Calendar", "mods/malfoid-tabs/art/panel-calendar.svg"))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/malfoid-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/malfoid-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/malfoid-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
