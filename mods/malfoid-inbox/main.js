// 主題專用複本：以半透明底色透出學院背景，保留原本面板操作。
// 收件匣：列出 ~/Downloads 第一層的檔案，點一下用 macOS 預設 App 開啟。
// 媒體檔用預設 App 開，其他檔案只在 Finder 顯示。
// 只讀：不刪檔、不寫檔、不連網，檔名一律當文字顯示，exec 一律用參數陣列。
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, home, theme, watchFolder } from "herdr";
import {
  formatSize, isRegularFile, listCommand, openCommand, parseListing,
  statCommand,
} from "./lib.js";

const INBOX_DIR = home() + "/Downloads";
const BADGE = { image: "Image", video: "Video", pdf: "PDF" };

function clockText(seconds) {
  const d = new Date(seconds * 1000);
  const two = (n) => `0${n}`.slice(-2);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export default class Inbox extends View {
  init(_props, cx) {
    this.items = [];
    this.error = null;
    this.loading = true;
    this.notice = null;
    cx.spawn(async (cx) => {
      await this.load(cx);
      for (;;) {
        try {
          await watchFolder(INBOX_DIR);
        } catch {
          this.error = "Cannot watch Downloads";
          cx.notify();
          return;
        }
        await this.load(cx);
      }
    });
  }

  async load(cx) {
    const listed = listCommand(INBOX_DIR);
    const result = await exec(listed.cmd, listed.args).catch(() => null);
    if (!result || result.code !== 0) {
      this.items = [];
      this.error = `Cannot read Downloads: ${INBOX_DIR}`;
    } else {
      this.items = parseListing(result.stdout, INBOX_DIR);
      this.error = null;
    }
    this.loading = false;
    cx.notify();
  }

  // 點一列：先確認還是收件匣裡的一般檔案，再交給 open。
  launch(item, cx) {
    cx.spawn(async (cx) => {
      const stat = statCommand(item.path);
      const checked = await exec(stat.cmd, stat.args).catch(() => null);
      const command = checked && checked.code === 0 && isRegularFile(checked.stdout)
        ? openCommand(item.path, INBOX_DIR)
        : null;
      if (!command) {
        this.notice = `Cannot open: ${item.name}`;
        cx.notify();
        return;
      }
      const opened = await exec(command.cmd, command.args).catch(() => null);
      this.notice = opened && opened.code === 0 ? null : `Cannot open: ${item.name}`;
      cx.notify();
    });
  }

  badge(item, t) {
    return h_flex()
      .w(40)
      .h(40)
      .flex_none()
      .items_center()
      .justify_center()
      .bg(t.raised)
      .child(div().text_size(11).text_color(t.dim).child(BADGE[item.kind] ?? "File"));
  }

  row(item, index, t) {
    return h_flex()
      .id(`inbox-row-${index}`)
      .h(52)
      .flex_none()
      .px(10)
      .gap(10)
      .items_center()
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_event, cx) => this.launch(item, cx))
      .child(this.badge(item, t))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .child(div().truncate().child(item.name))
          .child(
            div()
              .text_size(11)
              .text_color(t.dim)
              .child(`${formatSize(item.size)} · ${clockText(item.mtime)}`),
          ),
      );
  }

  render(cx) {
    const t = theme();
    const rows = this.items.map((item, index) => this.row(item, index, t));
    return v_flex()
      .id("inbox")
      .size_full()
      .min_h(0)
      .bg(`${t.chrome}99`)
      .text_color(t.foreground)
      .text_size(13)
      .child(
        h_flex()
          .h(38)
          .flex_none()
          .px(14)
          .gap(8)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .child(div().font_semibold().child("Watch"))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(`${this.items.length} file${this.items.length === 1 ? "" : "s"}`)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .p(6)
          .children(rows)
          .when(Boolean(this.notice), (el) => el.child(div().p(8).text_size(12).text_color(t.blocked).child(this.notice)))
          .when(Boolean(this.error), (el) => el.child(div().p(8).text_size(12).text_color(t.blocked).child(this.error)))
          .when(!this.error && this.items.length === 0, (el) =>
            el.child(v_flex().items_center().gap(8).p(8)
              .when(!this.error, (e) => e.child(image("mods/malfoid-spaces/art/hall.svg").size(72)))
              .child(div().text_size(12).text_color(t.dim).child(this.loading ? "Loading…" : "Downloads is empty"))
              .child(div().text_size(11).text_color(t.muted).child(INBOX_DIR))),
          ),
      );
  }
}
