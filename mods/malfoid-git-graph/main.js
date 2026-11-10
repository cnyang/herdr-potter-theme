import { View } from "gpui-kit";
import { props } from "herdr";
import { theme as cornerTheme } from "herdr";
import { div as cornerDiv } from "gpui-kit";

// 節點 background 的圖片不吃 radius，方角會露在圓角外；從外側用 canvas 色粗框蓋住四個角。
// r = 開口半徑（卡片圓角）；bottom=false 只遮上緣（pane 標題列）；border=true 補 1px 邊框（面板本身沒畫邊框時）。
const withCorners = (el, r, bottom = true, border = false) => {
  const t = cornerTheme(), w = 24;
  return cornerDiv().relative().size_full().overflow_hidden().child(el)
    .child(cornerDiv().absolute().top(-w).left(-w).right(-w).bottom(bottom ? -w : -400).border(w).border_color(t.canvas).rounded(r + w))
    .when(border, (e) => e.child(cornerDiv().absolute().top(0).left(0).right(0).bottom(0).rounded(r).border_1().border_color(t.border)));
};
import { Graph } from "./graph.js";
import { Menu } from "./menu.js";
import { Dialog } from "./dialog.js";
import { Update } from "./update.js";
import { Settings } from "./settings.js";

// One mod, several roles: the graph (a panel or a pane), and over the window the
// right-click menu, the dialogs its actions ask first, the update window and
// the Manygit settings (props.role).
export default class GitGraph extends View {
  init(_props, cx) {
    const role = props()?.role;
    this.part = role === "menu" ? new Menu() : role === "dialog" ? new Dialog() : role === "update" ? new Update() : role === "settings" ? new Settings() : new Graph();
    this.part.init(cx);
  }

  render(cx) { const el = this.part.render(cx); return props()?.role ? el : withCorners(el, 14, true, true); }
}
