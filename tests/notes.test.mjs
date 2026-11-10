import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { save } from "../mods/malfoid-notes/lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));

// 假的磁碟：模擬 writeTextFile 的 expected 比對（不符就拒絕）
const disk = (initial) => {
  const d = { text: initial, writes: [] };
  d.io = {
    read: async () => d.text,
    write: async (text, expected) => {
      if (expected !== d.text) throw new Error("stale");
      d.writes.push(text);
      d.text = text;
    },
  };
  return d;
};

test("note save: writes only when the text differs from the disk, new file counts as empty", async () => {
  const d = disk(null);
  const s = { text: "", disk: null };
  assert.equal(await save(s, d.io), false, "empty note never creates a file");
  s.text = "# hi";
  assert.equal(await save(s, d.io), true);
  assert.deepEqual([d.text, s.disk], ["# hi", "# hi"]);
  assert.equal(await save(s, d.io), false, "unchanged text is not rewritten");
  assert.equal(d.writes.length, 1);
});

test("note save: clearing the note writes the empty text back", async () => {
  const d = disk("old");
  const s = { text: "", disk: "old" };
  assert.equal(await save(s, d.io), true);
  assert.equal(d.text, "");
});

test("note save: a stale snapshot rejects once, then the next round overwrites with the local text", async () => {
  const d = disk("a");
  const s = { text: "mine", disk: "a" };
  d.text = "edited elsewhere";
  await assert.rejects(save(s, d.io), /stale/);
  assert.equal(s.disk, "edited elsewhere", "disk snapshot is refreshed");
  assert.equal(d.text, "edited elsewhere", "nothing was overwritten yet");
  assert.equal(await save(s, d.io), true);
  assert.equal(d.text, "mine");
});

test("notes panel is wired: layout block, mod title, tab button state and the shared note path", () => {
  const body = (function find(n) { return n.id === "panel-body" ? n : (n.children ?? []).map(find).find(Boolean); })({ children: JSON.parse(readFileSync(join(root, "layouts/malfoid.json"), "utf8")).children });
  const block = body.children.find(n => n.id === "notes");
  assert.equal(block.content.mod, "malfoid-notes");
  const tabs = readFileSync(join(root, "mods/malfoid-tabs/main.js"), "utf8");
  assert.match(tabs, /"lyrics", "notes"[,\]]/, "panel must be in the remembered-panels list");
  const main = readFileSync(join(root, "mods/malfoid-notes/main.js"), "utf8");
  assert.ok(main.includes("data/theme-notes"), "Malfoid and Husky share one note file");
  // 讀檔失敗時 ready 必須維持 false，flush 才不會把空白內容寫回去蓋掉筆記。
  assert.match(main, /if \(!this\.ready \|\| this\.saving\) return/);
});
