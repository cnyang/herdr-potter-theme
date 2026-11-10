// 修改自 Traveler：學院徽章、墨綠面板與獨立主題資產路徑。
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, setShared, updates, layout } from "herdr";

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

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? 190 : window()?.platform === "macos" ? 76 : 44 });
}

class WorkspaceChrome extends View {
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/malfoid-chrome/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      return v_flex().size_full().rounded(13).overflow_hidden().bg(`${t.chrome}c8`).px(8).pt(4).pb(8).text_size(13)
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(div().size(6).rounded_full().bg(t.accent))))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    return h_flex().size_full().rounded(13).overflow_hidden().bg(`${t.chrome}c8`).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(6).items_center().child(image("mods/malfoid-chrome/hogwarts-crest.png").size(38)).child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/malfoid-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/malfoid-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}

export default class extends WorkspaceChrome {
  render(cx) { return withCorners(super.render(cx), 13); }
}
