import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { STATES, stateFor, spritePath, nextSidebarWidth, frameColor, iconKind, iconSrc, statusText, phaseOffset, ACTION_MS, SIDEBAR_WIDTH } from "../mods/malfoid-agents/lib.js";
import { PORTRAITS, assignPortraits } from "../mods/malfoid-tabs/portraits.js";
import { housePath } from "../mods/malfoid-spaces/houses.js";
import { clock, hash, position, blockHeight } from "../mods/malfoid-music/lib.js";
import { BACKGROUNDS, nextImage } from "../mods/malfoid-tabs/background.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = path => JSON.parse(readFileSync(join(root, path), "utf8"));

test("Space crests cycle Slytherin, Gryffindor, Ravenclaw, Hufflepuff in display order", () => {
  const expected = ["slytherin", "gryffindor", "ravenclaw", "hufflepuff", "slytherin", "gryffindor", "ravenclaw", "hufflepuff", "slytherin"];
  assert.deepEqual(expected.map((_, i) => housePath(i)), expected.map(name => `mods/malfoid-spaces/art/${name}.png`));
});

test("ten distinct square portraits are available for every tab type", () => {
  assert.equal(PORTRAITS.length, 10);
  const images = PORTRAITS.map(path => readFileSync(join(root, path)));
  for (const bytes of images) {
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), 256);
    assert.equal(bytes.readUInt32BE(20), 256);
  }
  assert.equal(new Set(images.map(bytes => bytes.toString("base64"))).size, 10);
});

test("new tabs receive unused random portraits until the pool is exhausted", () => {
  const tabs = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}` }));
  const first = assignPortraits(tabs.slice(0, 10), {});
  assert.equal(new Set(Object.values(first)).size, 10);
  const all = assignPortraits(tabs, first);
  assert.equal(Object.keys(all).length, 12);
  for (const path of Object.values(all)) assert.ok(PORTRAITS.includes(path));
  for (const [id, path] of Object.entries(first)) assert.equal(all[id], path);
});

test("saved tab portraits survive redraw, rename, reorder and reload", () => {
  const tabs = [{ id: "shell", name: "cmd" }, { id: "agent", name: "Codex" }];
  const first = assignPortraits(tabs, {});
  const saved = JSON.parse(JSON.stringify(first));
  assert.deepEqual(assignPortraits(tabs, saved), first);
  assert.deepEqual(assignPortraits([{ id: "agent", name: "New name" }, tabs[0]], saved), first);
  const next = assignPortraits([tabs[1], { id: "new-tab" }], saved);
  assert.equal(next.agent, first.agent);
  assert.ok(!Object.hasOwn(next, "shell"));
  assert.notEqual(next["new-tab"], next.agent);
});

test("invalid saved portraits cannot select arbitrary files or inherited keys", () => {
  const tabs = [{ id: "t1" }, { id: "__proto__" }];
  for (const saved of [null, [], "bad", { t1: "../../secret" }, Object.create({ t1: PORTRAITS[0] })]) {
    const result = assignPortraits(tabs, saved);
    assert.deepEqual(Object.keys(result), ["t1", "__proto__"]);
    assert.ok(Object.hasOwn(result, "__proto__"));
    for (const path of Object.values(result)) assert.ok(PORTRAITS.includes(path));
  }
});

test("four states select valid sprites; unknown values stay in the asset folder", () => {
  for (const state of STATES) {
    assert.equal(stateFor(state), state);
    const bytes = readFileSync(join(root, spritePath(state)));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16) * 4, bytes.readUInt32BE(20) * 3);
  }
  for (const value of [null, undefined, "thinking", "../../secret", {}, "constructor"]) {
    assert.equal(stateFor(value), "idle");
    assert.equal(spritePath(value), spritePath("idle"));
  }
});

test("sidebar folds to a rail wide enough for the platform and always unfolds to the layout width", () => {
  assert.equal(SIDEBAR_WIDTH, 190);
  assert.equal(json("layouts/malfoid.json").children.find(n => n.id === "sidebar").size.px, SIDEBAR_WIDTH);
  assert.match(readFileSync(join(root, "mods/malfoid-chrome/main.js"), "utf8"), new RegExp(`narrow\\(\\) \\? ${SIDEBAR_WIDTH} :`));
  assert.equal(nextSidebarWidth(SIDEBAR_WIDTH, "macos"), 76);
  assert.equal(nextSidebarWidth(SIDEBAR_WIDTH, "linux"), 44);
  assert.equal(nextSidebarWidth(76, "macos"), SIDEBAR_WIDTH);
  assert.equal(nextSidebarWidth(44, "windows"), SIDEBAR_WIDTH);
});

test("the macOS rail keeps a way back and other layouts' saved width cannot shrink Malfoid", () => {
  const agents = readFileSync(join(root, "mods/malfoid-agents/main.js"), "utf8");
  const chrome = readFileSync(join(root, "mods/malfoid-chrome/main.js"), "utf8");
  assert.match(agents, /\.on_click\(toggleSidebar\)/);
  assert.match(agents, /run\("layout\.resize", \{ id: "sidebar", px: nextSidebarWidth\(/);
  for (const source of [agents, chrome]) assert.ok(!source.includes('"sidebar.width"'));
});

test("a blocked agent keeps its gold frame while focused, in both card sizes", () => {
  const t = { blocked: "gold", accent: "teal", border: "line", working: "mint", idle: "grey" };
  for (const collapsed of [false, true]) {
    assert.equal(frameColor("blocked", true, t, collapsed), "gold");
    assert.equal(frameColor("working", true, t, collapsed), "teal");
  }
  assert.equal(frameColor("working", false, t, false), "line");
  assert.equal(frameColor("working", false, t, true), "mint");
});

test("working rotates label and pose together; other states stay put", () => {
  const seen = [0, 1].map((i) => [statusText("working", i * ACTION_MS), spritePath("working", i * ACTION_MS)]);
  assert.deepEqual(seen.map(([text]) => text), ["施法中", "思考中"]);
  assert.deepEqual(seen.map(([, path]) => path.split("/").pop()), ["working.png", "thinking.png"]);
  for (const [, path] of seen) {
    const bytes = readFileSync(join(root, path));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16) * 4, bytes.readUInt32BE(20) * 3);
  }
  assert.equal(statusText("working", 2 * ACTION_MS), "施法中");
  assert.equal(statusText("working", ACTION_MS - 1), "施法中");
  assert.equal(statusText("idle", ACTION_MS), "休息中");
  assert.equal(statusText("blocked", ACTION_MS), "等待指示");
  assert.equal(statusText("done", ACTION_MS), "已完成");
  assert.equal(spritePath("idle", ACTION_MS), spritePath("idle"));
});

test("neighbouring agents never show the same action", () => {
  // 兩個動作無法同時做到「相鄰永遠不同」與「錯開切換」，取前者：相鄰卡交錯，整列同時換。
  const cycle = ACTION_MS * 2;
  for (let ms = 0; ms < cycle; ms += 100) {
    for (const i of [0, 1, 2, 7]) {
      assert.notEqual(statusText("working", ms + phaseOffset(i)), statusText("working", ms + phaseOffset(i + 1)), `at ${ms}ms`);
    }
  }
});

test("agent cards draw the program icon the way its table entry says", () => {
  assert.equal(iconKind({ icon: "icons/claude.svg", tint: true }), "svg");
  assert.equal(iconKind({ icon: "icons/logo.svg", tint: false }), "image");
  assert.equal(iconKind({ icon: null, tint: true }), null);
  assert.equal(iconKind(undefined), null);
});

test("codex card uses the bundled glyph without Herdr's white tile; other programs keep Herdr's icon", () => {
  const file = `mods/malfoid-agents/art/codex.svg`;
  assert.equal(iconSrc({ key: "codex", icon: "icons/codex.svg" }), file);
  assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /#fff/i);
  assert.equal(iconSrc({ key: "claude", icon: "icons/claude.svg" }), "icons/claude.svg");
  assert.equal(iconSrc({ key: "toString", icon: null }), null);
  assert.equal(iconSrc(undefined), null);
});

test("Watch panel is gone: no mod, layout node, button or leftover files", () => {
  assert.ok(!existsSync(join(root, "mods/malfoid-inbox")));
  assert.ok(!existsSync(join(root, "mods/malfoid-tabs/downloads.js")));
  assert.ok(!JSON.stringify(json("layouts/malfoid.json")).includes("inbox"));
  const tabs = readFileSync(join(root, "mods/malfoid-tabs/main.js"), "utf8");
  assert.ok(!/inbox|watchFolder|Downloads/.test(tabs));
});

test("background rotation walks the list, wraps, and restarts from the first when the current image is unknown", () => {
  const list = ["a", "b", "c"];
  assert.equal(nextImage("a", list), "b");
  assert.equal(nextImage("c", list), "a");
  assert.equal(nextImage("x", list), "a");
  assert.equal(nextImage("a", ["a"]), null);
  for (const path of BACKGROUNDS) assert.ok(existsSync(join(root, path)), path);
  const find = (node, id) => node.id === id ? node : (node.children ?? []).map(child => find(child, id)).find(Boolean);
  assert.ok(BACKGROUNDS.includes(find(json("layouts/malfoid.json"), "main").content.pane.background.image), "layout default must be in the rotation list");
});

test("each panel shows its room icon in full color when empty, never over an error", () => {
  const panels = { "malfoid-files/main.js": "library", "malfoid-changes/main.js": "potions","malfoid-git-graph/graph.js": "observatory" };
  for (const [file, art] of Object.entries(panels)) {
    const path = `mods/malfoid-spaces/art/${art}.svg`;
    assert.ok(existsSync(join(root, path)), path);
    const source = readFileSync(join(root, "mods", file), "utf8");
    assert.match(source, /import \{[^}]*\bimage\b[^}]*\} from "gpui-kit"/, file);
    assert.ok(source.includes(`image("${path}").size(72)`), file);
    assert.match(source, /\.when\((?:!this\.error|!failed), [^\n]*\.svg"\)/, file);
  }
  assert.match(readFileSync(join(root, "mods/malfoid-changes/main.js"), "utf8"), /\? 132 :/, "Changes list must be tall enough for the icon");
});

test("panel buttons use bold 24px icons drawn for small sizes", () => {
  const tabs = readFileSync(join(root, "mods/malfoid-tabs/main.js"), "utf8");
  for (const [id, label] of Object.entries({ files: "Files", changes: "Changes", graph: "Git", lyrics: "Lyrics", notes: "Note" })) {
    const path = `mods/malfoid-tabs/art/panel-${id}.svg`;
    assert.ok(tabs.includes(`panelButton("${id}", "${label}", "${path}")`), id);
    const icon = readFileSync(join(root, path), "utf8");
    assert.match(icon, /viewBox="0 0 24 24"/, id);
    assert.match(icon, /stroke-width="2"/, id);
    assert.match(icon, /stroke="#D4AF37"/, id);
    assert.ok(!icon.includes("<rect"), `${id} must not waste pixels on a frame`);
  }
  assert.ok(tabs.includes(".child(image(icon).size(24).flex_none())"));
});

test("layout has unique IDs, valid theme, all local art and mod references", () => {
  const layout = json("layouts/malfoid.json");
  const ids = new Set();
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    if (value.id) { assert.ok(!ids.has(value.id), `Duplicate node: ${value.id}`); ids.add(value.id); }
    if (value.mod?.startsWith("malfoid-")) assert.ok(existsSync(join(root, "mods", value.mod, "main.js")));
    // Files 面板改用外部的 file-icons mod(Material Icon Theme 圖示),不再用 malfoid-files
    if (value.id === "files") assert.equal(value.content.mod, "file-icons");
    if (value.image) assert.ok(existsSync(join(root, value.image)), value.image);
    Object.values(value).forEach(visit);
  }
  visit(layout);
  assert.ok(existsSync(join(root, layout.preview)));
  const theme = json(`themes/${layout.theme}.json`);
  assert.equal(theme.ansi.length, 16);
  for (const color of [...theme.ansi, ...Object.values(theme.colors)]) assert.match(color, /^#[\da-f]{6}([\da-f]{2})?$/i);
  for (const state of STATES) assert.ok(theme.colors[state]);
  for (const folder of readdirSync(join(root, "mods"), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const source = readFileSync(join(root, "mods", folder.name, "main.js"), "utf8");
    for (const [, path] of source.matchAll(/"(mods\/malfoid-[^"$]+\.(?:png|svg|json))"/g)) assert.ok(existsSync(join(root, path)), path);
  }
  for (const name of ["gryffindor", "slytherin", "ravenclaw", "hufflepuff"]) {
    const bytes = readFileSync(join(root, "mods/malfoid-spaces/art", `${name}.png`));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), 256);
    assert.equal(bytes.readUInt32BE(20), 256);
    assert.equal(bytes[25], 6, "House crest must preserve RGBA transparency");
  }
});

test("text and status colors retain readable contrast on the panel background", () => {
  const t = json("themes/malfoid.json").colors;
  const light = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
  for (const key of ["foreground", "muted", "dim", "working", "blocked", "done", "idle"]) {
    assert.ok((light(t[key]) + 0.05) / (light(t.surface) + 0.05) >= 4.5, key);
  }
});

test("installer refuses missing dependencies and name collisions before copying", () => {
  const target = mkdtempSync(join(tmpdir(), "herdr-malfoid-test-"));
  const install = () => spawnSync(process.execPath, [join(root, "scripts/install.mjs")], { env: { ...process.env, HERDR_APP_HOME: target }, encoding: "utf8" });
  try {
    assert.notEqual(install().status, 0);
    assert.ok(!existsSync(join(target, "mods/malfoid-agents")));
    const fixture = name => {
      mkdirSync(join(target, "mods", name), { recursive: true });
      writeFileSync(join(target, "mods", name, "main.js"), "fixture");
    };
    for (const name of ["pane", "files", "changes", "workspace-status", "menu", "new-menu", "picker", "machine-add", "workspace-chrome", "git-graph"]) fixture(name);
    // file-icons 隨主題附帶，不是前置依賴：全新機器沒有它也要能一併裝好
    assert.ok(!existsSync(join(target, "mods/file-icons")));
    const result = install();
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(target, "themes/malfoid.json")));
    assert.ok(existsSync(join(target, "mods/file-icons/icons/folder.svg")));
    for (const name of ["agents", "tabs", "spaces", "chrome", "files", "changes", "git-graph", "music", "lyrics", "notes"]) {
      assert.ok(existsSync(join(target, `mods/malfoid-${name}/main.js`)), name);
    }
    const file = join(target, "mods/malfoid-agents/main.js");
    writeFileSync(file, "user edit");
    assert.notEqual(install().status, 0);
    assert.equal(readFileSync(file, "utf8"), "user edit");
    const other = join(target, "mods/git-graph/main.js");
    const update = spawnSync(process.execPath, [join(root, "scripts/install.mjs"), "--update"], { env: { ...process.env, HERDR_APP_HOME: target }, encoding: "utf8" });
    assert.equal(update.status, 0, update.stderr);
    assert.equal(readFileSync(file, "utf8"), readFileSync(join(root, "mods/malfoid-agents/main.js"), "utf8"));
    assert.equal(readFileSync(other, "utf8"), "fixture");
    assert.ok(!existsSync(join(target, "mods/malfoid-agents/gpui-kit.d.ts")));
  } finally { rmSync(target, { recursive: true, force: true }); }
});

test("installer keeps an existing file-icons unless --update", () => {
  const target = mkdtempSync(join(tmpdir(), "herdr-malfoid-icons-"));
  const run = (...args) => spawnSync(process.execPath, [join(root, "scripts/install.mjs"), ...args], { env: { ...process.env, HERDR_APP_HOME: target }, encoding: "utf8" });
  try {
    for (const name of ["pane", "files", "changes", "workspace-status", "menu", "new-menu", "picker", "machine-add", "workspace-chrome", "git-graph", "file-icons"]) {
      mkdirSync(join(target, "mods", name), { recursive: true });
      writeFileSync(join(target, "mods", name, "main.js"), "fixture");
    }
    const mine = join(target, "mods/file-icons/main.js");
    writeFileSync(mine, "my edit");
    // 另一個主題先裝過 file-icons：不算撞名，也不能被覆蓋
    assert.equal(run().status, 0);
    assert.equal(readFileSync(mine, "utf8"), "my edit");
    assert.equal(run("--update").status, 0);
    assert.equal(readFileSync(mine, "utf8"), readFileSync(join(root, "mods/file-icons/main.js"), "utf8"));
  } finally { rmSync(target, { recursive: true, force: true }); }
});

test("bundled file-icons ships its icons, the MIT license and the alpha prop", () => {
  const dir = join(root, "mods/file-icons");
  for (const name of ["main.js", "icons.js", "mod.json", "LICENSE-material-icon-theme.txt", "chevron-down.svg", "chevron-right.svg", "icons/file.svg", "icons/folder.svg"]) assert.ok(existsSync(join(dir, name)), name);
  assert.ok(readdirSync(join(dir, "icons")).length >= 1184);
  assert.match(readFileSync(join(dir, "main.js"), "utf8"), /props\(\)\?\.alpha/);
});

test("music clock reads m:ss and the position never runs past the track", () => {
  assert.deepEqual([0, 7.9, 187, 3900, -5, undefined].map(clock), ["0:00", "0:07", "3:07", "65:00", "0:00", "0:00"]);
  const s = { seconds: 100, duration: 120, at: 0, paused: false };
  assert.equal(position(s, 5000), 105);
  assert.equal(position(s, 60000), 120, "capped at the track length");
  assert.equal(position({ ...s, paused: true }, 60000), 100, "paused clock stands still");
  assert.equal(position({ ...s, duration: 0 }, 60000), 160, "a stream (duration 0) has no cap");
});

test("music block takes no room without a track, on the narrow rail, and is shorter for the permission hint", () => {
  assert.equal(blockHeight(null, false), 0);
  assert.equal(blockHeight({ title: "a" }, true), 0);
  assert.equal(blockHeight({ error: "denied" }, true), 0);
  assert.equal(blockHeight({ error: "denied" }, false), 36);
  assert.equal(blockHeight({ title: "a" }, false), 92);
});

test("music daemon name hash is FNV-1a so an edited daemon.js gets a new terminal name", () => {
  assert.equal(hash(""), "811c9dc5");
  assert.equal(hash("a"), "e40c292c");
  assert.notEqual(hash("daemon v1"), hash("daemon v2"));
});

test("music mod sits in the sidebar as a collapsed block, ships its icons and keeps the crash guards", () => {
  const sidebar = json("layouts/malfoid.json").children.find(n => n.id === "sidebar");
  const ids = sidebar.children.map(n => n.id);
  assert.deepEqual(ids.slice(ids.indexOf("music") - 1, ids.indexOf("music") + 2), ["sidebar-lists", "music", "sidebar-footer"]);
  const block = sidebar.children.find(n => n.id === "music");
  assert.equal(block.content.mod, "malfoid-music");
  assert.deepEqual([block.size.px, block.min], [0, 0]);
  const main = readFileSync(join(root, "mods/malfoid-music/main.js"), "utf8");
  assert.ok(main.includes('const BLOCK = "music"'), "mod must resize the layout block with this id");
  for (const icon of ["music", "skip-back", "rewind", "play", "pause", "fast-forward", "skip-forward"]) {
    assert.ok(existsSync(join(root, `mods/malfoid-music/${icon}.svg`)), icon);
    assert.ok(main.includes(`"${icon}"`), `${icon} unused`);
  }
  assert.ok(existsSync(join(root, "mods/malfoid-music/LICENSE-yt-music.txt")));
  const daemon = readFileSync(join(root, "mods/malfoid-music/daemon.js"), "utf8");
  // Ref() 錯誤指標一走到錯誤路徑 osascript 就 segfault（exit 139）；錯誤碼改在 AppleScript 內接住。
  assert.ok(!/\bRef\(\)/.test(daemon.replace(/\/\/.*$/gm, "")), "executeAndReturnError(Ref()) crashes osascript on errors");
  // 腳本 source 夾變動值會讓編譯快取失效、物件堆積後 osascript 當掉。
  assert.ok(!/Date\.now|Math\.random/.test(daemon.slice(0, daemon.indexOf("function run(argv)"))), "script sources must be constant");
});
