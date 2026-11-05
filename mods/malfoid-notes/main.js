// 筆記面板：一份 markdown 筆記，存在本機 data/theme-notes/note.md，重開 app 或重開機都在。
// Edit 是多行輸入框，Preview 用 TextView.markdown 渲染；兩個 theme 共用同一個檔案，切換 theme 筆記不會消失。
//
// 存檔：輸入時只標記內容有變，每秒檢查一次，與磁碟不同才寫（lib.js 的 save，原子寫入）；輸入框失焦、切到 Preview 也立刻寫。
// 本 mod 啟動後面板沒開也活著，但沒有輪詢外部資源，只有這個 1 秒計時器，內容沒變時什麼都不做。
import { View, div } from "gpui-kit";
import { h_flex, v_flex, Textarea, TextareaState, TextView } from "gpui-base";
import * as fs from "fs/promises";
import { appHome, readTextFile, writeTextFile, theme } from "herdr";
import { save } from "./lib.js";

const dir = () => `${appHome().replace(/\\/g, "/")}/data/theme-notes`;
const file = () => `${dir()}/note.md`;
const io = { read: () => readTextFile(file()), write: (text, expected) => writeTextFile(file(), text, expected) };

export default class MalfoidNotes extends View {
  init(_props, cx) {
    this.s = { text: "", disk: null };
    this.area = TextareaState.new({ placeholder: "Write markdown…" });
    this.ready = false; // 讀檔成功前不准存檔，否則讀失敗時空白內容會蓋掉原本的筆記
    this.preview = false;
    this.err = null;
    this.saving = false;
    this.area.on("change", () => { this.s.text = this.area.value(); });
    this.area.on("blur", (_e, cx) => cx.spawn((cx) => this.flush(cx)));
    cx.timer.every(1000, (cx) => cx.spawn((cx) => this.flush(cx)));
    cx.spawn(async (cx) => {
      await fs.mkdir(dir(), { recursive: true }).catch(() => {});
      try {
        const text = await io.read();
        this.s = { text: text ?? "", disk: text };
        this.area.set_value(this.s.text);
        this.preview = this.s.text !== ""; // 有內容先看渲染結果，空的直接開始寫
        this.ready = true;
      } catch (e) {
        this.err = `Cannot read note: ${e?.message ?? e}`; // 例如超過 readTextFile 的 1 MiB 上限
      }
      cx.notify();
    });
  }

  async flush(cx) {
    if (!this.ready || this.saving) return;
    this.saving = true;
    const before = this.err;
    try {
      await save(this.s, io);
      this.err = null;
    } catch (e) {
      this.err = `Cannot save note: ${e?.message ?? e}`;
    } finally {
      this.saving = false;
    }
    if (this.err !== before) cx.notify();
  }

  mode(t, id, label, on, action) {
    return div().id(`note-${id}`).h(24).px(9).rounded(5).flex().items_center().text_size(12)
      .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover)).on_click(action).child(label);
  }

  render() {
    const t = theme();
    const msg = (text) => v_flex().flex_1().items_center().justify_center().p(16).child(div().text_size(13).text_color(t.muted).text_center().child(text));
    let body;
    if (this.err && !this.ready) body = msg(this.err);
    else if (!this.ready) body = msg("Loading…");
    else if (this.preview) {
      body = v_flex().id("note-preview").flex_1().min_h(0).overflow_y_scrollbar().p(14)
        .child(this.s.text.trim()
          ? TextView.markdown("note-md", this.s.text).selectable(true)
          : div().text_size(13).text_color(t.dim).child("Empty. Press Edit to write."));
    } else {
      body = Textarea.new(this.area).flex_1().min_h(0).w_full().p(14).text_size(13).text_color(t.foreground);
    }
    return v_flex().id("notes").size_full().min_h(0).bg(`${t.chrome}99`).text_color(t.foreground).text_size(13)
      .child(h_flex().h(38).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().font_semibold().child("Note"))
        .child(this.mode(t, "edit", "Edit", !this.preview, (_e, cx) => { this.preview = false; this.area.focus(); cx.notify(); }))
        .child(this.mode(t, "preview", "Preview", this.preview, (_e, cx) => { this.preview = true; cx.notify(); cx.spawn((cx) => this.flush(cx)); })))
      .child(body)
      .when(Boolean(this.err && this.ready), (el) => el.child(div().flex_none().px(14).py(6).text_size(11).text_color(t.blocked).child(this.err)));
  }
}
