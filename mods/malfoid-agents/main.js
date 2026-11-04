// 修改自 Traveler：魔法學院四態角色卡，跟隨 Herdr 即時狀態。
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run, setAgentOrder, layout, theme, window, setShared } from "herdr";
import { SIDEBAR_WIDTH, frameColor, nextSidebarWidth, spritePath, stateFor } from "./lib.js";

const STATUS = { working: "施法中", blocked: "等待指示", done: "已完成", idle: "休息中" };
const sidebarWidth = () => layout()?.children?.find(n => n.id === "sidebar")?.size?.px ?? SIDEBAR_WIDTH;

// macOS 收合後 traffic lights 佔滿 chrome 列，展開鈕只能放在這裡。
function toggleSidebar() {
  const px = sidebarWidth();
  setShared("sidebar.collapsed", px >= 160); // 舊版模組仍讀這個旗標
  run("layout.resize", { id: "sidebar", px: nextSidebarWidth(px, window()?.platform) });
}

export default class Malfoid extends View {
  card(a, t, collapsed) {
    const state = stateFor(a.status);
    const frame = frameColor(state, a.focused, t, collapsed);
    if (collapsed) {
      return div().id(`malfoid-${a.address}`).p(4).rounded(8).border(1)
        .border_color(frame).cursor_pointer()
        .on_click(() => run("agent.focus", { terminal: a.address }))
        .child(image("mods/malfoid-agents/art/portrait.png").size(42).rounded(6));
    }
    const statusColor = t[state];
    return h_flex()
      .id(`malfoid-${a.address}`)
      .w_full()
      .flex_none()
      .p(6)
      .gap(8)
      .items_center()
      .bg(`${t.surface}c8`)
      .border(1)
      .border_color(frame).rounded(10)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(image(spritePath(state)).w(72).h(96).flex_none())
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(4)
          .child(
            h_flex()
              .w_full()
              .min_w(0)
              .gap(8)
              .items_center()
              .child(div().flex_1().min_w(0).truncate().font_semibold().child(a.tab_name || a.address)),
          )
          .child(h_flex().gap(6).items_center()
            .child(div().size(6).rounded_full().bg(statusColor)
              .when(state === "working", el => el.loop("opacity", { from: 0.35, to: 1, period: 1600 })))
            .child(div().text_size(11).text_color(statusColor).child(STATUS[state])))
          .child(div().text_size(10).text_color(t.dim).truncate().child(a.program?.name || "Agent")),
      );
  }

  render() {
    const t = theme();
    const list = agents();
    const collapsed = sidebarWidth() < 160;
    setAgentOrder(list.map((a) => a.address));
    return v_flex()
      .id("malfoid")
      .size_full()
      .min_h(0)
      .text_color(t.foreground)
      .text_size(13)
      .when(!collapsed, el => el.child(h_flex().h(30).px(14).items_center()
        .child(div().text_size(11).text_color(t.dim).child("Agents"))))
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .gap(6)
          .p(6)
          .overflow_y_scrollbar()
          .children(list.map((a) => this.card(a, t, collapsed)))
          .when(list.length === 0, (el) =>
            el.child(v_flex().items_center().gap(12).p(12)
              .child(image(spritePath("idle")).w(collapsed ? 42 : 120).h(collapsed ? 56 : 160))
              .when(!collapsed, row => row.child(div().text_size(12).text_color(t.dim).child("等待魔法使加入")))),
          ),
      )
      .when(collapsed, el => el.child(h_flex().h(28).flex_none().items_center().justify_center()
        .child(div().id("sidebar-expand").px(8).rounded(6).text_color(t.dim)
          .hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Expand sidebar")
          .on_click(toggleSidebar)
          .child("»"))));
  }
}
