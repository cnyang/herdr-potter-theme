import test from "node:test";
import assert from "node:assert/strict";
import { parseLRC, currentIndex, decodeGet, decodeSearch, getUrl, searchUrl, curlArgs, parseCurl, lookup, endpointFrom, position } from "../mods/malfoid-lyrics/lib.js";

const synced = "[ar:Bon Jovi]\r\n[offset:0]\r\n[00:12.50]Once upon a time\r\n[00:20.00]Not so long ago\r\n[00:12.50][01:05]\r\n";

test("LRC: timestamps sort, meta tags and CRLF are dropped, repeated tags expand", () => {
  assert.deepEqual(parseLRC(synced), [
    { time: 12.5, text: "Once upon a time" },
    { time: 12.5, text: "" },
    { time: 20, text: "Not so long ago" },
    { time: 65, text: "" },
  ]);
  assert.deepEqual(parseLRC("[1:02:03.5]x"), [{ time: 3723.5, text: "x" }]);
});

test("LRC: plain text keeps [Chorus]-style lines, drops [offset:0] and edge blank lines", () => {
  assert.deepEqual(parseLRC("[offset:0]\r\n\r\nOnce upon\r\n[Chorus]\r\nWoah\r\n\r\n"), [
    { time: null, text: "Once upon" },
    { time: null, text: "[Chorus]" },
    { time: null, text: "Woah" },
  ]);
});

test("current line is the last one already sung; none before the first or without a time axis", () => {
  const lines = parseLRC(synced);
  assert.equal(currentIndex(lines, 5), -1);
  assert.equal(currentIndex(lines, 12.5), 1);
  assert.equal(currentIndex(lines, 30), 2);
  assert.equal(currentIndex(lines, 999), 3);
  assert.equal(currentIndex(parseLRC("a\nb"), 30), -1);
});

test("decode: synced beats plain, instrumental is an answer, empty is a miss", () => {
  const rec = (o) => JSON.stringify({ instrumental: false, plainLyrics: "", syncedLyrics: "", ...o });
  assert.equal(decodeGet(rec({ syncedLyrics: "[00:01.00]hi", plainLyrics: "hi" })).synced, true);
  assert.equal(decodeGet(rec({ plainLyrics: "hi" })).synced, false);
  assert.equal(decodeGet(rec({ instrumental: true })).instrumental, true);
  assert.equal(decodeGet(rec({})), null);
  assert.equal(decodeGet("not json"), null);
  // 搜尋結果：優先第一筆有時間軸的
  const results = JSON.stringify([{ plainLyrics: "plain" }, { syncedLyrics: "[00:01.00]sync" }]);
  assert.equal(decodeSearch(results).synced, true);
  assert.equal(decodeSearch("[]"), null);
  assert.equal(decodeSearch("{}"), null);
});

test("URLs: trailing slash trimmed, text escaped, album and duration only when known", () => {
  const track = { title: "Livin' On a Prayer", artist: "Bon Jovi", album: "", duration: 0 };
  assert.equal(getUrl("http://h:3300/", track), "http://h:3300/api/get?track_name=Livin'%20On%20a%20Prayer&artist_name=Bon%20Jovi");
  assert.equal(getUrl("http://h:3300", { ...track, album: "A&B", duration: 249.4 }),
    "http://h:3300/api/get?track_name=Livin'%20On%20a%20Prayer&artist_name=Bon%20Jovi&album_name=A%26B&duration=249");
  assert.equal(searchUrl("http://h", track), "http://h/api/search?track_name=Livin'%20On%20a%20Prayer&artist_name=Bon%20Jovi");
});

test("curl output: the last line is the HTTP status, args never go through a shell", () => {
  assert.deepEqual(parseCurl('{"a":1}\n200'), { code: 200, body: '{"a":1}' });
  assert.deepEqual(parseCurl("line1\nline2\n404"), { code: 404, body: "line1\nline2" });
  const args = curlArgs("http://h/api/get?x=1");
  assert.equal(args.at(-2), "--url");
  assert.equal(args.at(-1), "http://h/api/get?x=1");
});

test("endpoint comes from the config file; anything but http(s) is no endpoint", () => {
  assert.equal(endpointFrom('{"endpoint":"http://10.0.0.1:3300"}'), "http://10.0.0.1:3300");
  for (const bad of [null, "", "{", "{}", '{"endpoint":""}', '{"endpoint":"file:///etc/passwd"}', '{"endpoint":5}']) assert.equal(endpointFrom(bad), null);
});

test("lookup: exact match first, fuzzy search on 404, honest answers otherwise", async () => {
  const track = { title: "t", artist: "a", album: "", duration: 0 };
  const rec = JSON.stringify({ syncedLyrics: "[00:01.00]hi" });
  const fake = (routes) => async (url) => {
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) throw new Error("no route");
    if (hit[1] instanceof Error) throw hit[1];
    return hit[1];
  };
  assert.equal((await lookup(fake({ "/api/get": { code: 200, body: rec } }), "http://h", track)).kind, "found");
  assert.equal((await lookup(fake({ "/api/get": { code: 404, body: "" }, "/api/search": { code: 200, body: `[${rec}]` } }), "http://h", track)).kind, "found");
  assert.equal((await lookup(fake({ "/api/get": { code: 404, body: "" }, "/api/search": { code: 200, body: "[]" } }), "http://h", track)).kind, "none");
  assert.deepEqual(await lookup(fake({ "/api/get": { code: 500, body: "" } }), "http://h", track), { kind: "down", why: "HTTP 500" });
  assert.deepEqual(await lookup(fake({ "/api/get": new Error("timed out") }), "http://h", track), { kind: "down", why: "timed out" });
  assert.deepEqual(await lookup(fake({}), "http://h", { ...track, title: "" }), { kind: "none" });
});

test("lyrics clock follows the music state: moves while playing, stands still paused, capped at the end", () => {
  const s = { seconds: 100, duration: 120, at: 0, paused: false };
  assert.equal(position(s, 5000), 105);
  assert.equal(position(s, 60000), 120);
  assert.equal(position({ ...s, paused: true }, 60000), 100);
});

test("Lyrics tab button opens a panel-body child that the layout and the mod agree on", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const layout = JSON.parse(read("layouts/malfoid.json"));
  const stack = (function find(n) { return n.id === "panel-body" ? n : (n.children ?? []).map(find).find(Boolean); })(layout);
  assert.deepEqual(stack.children.find((c) => c.id === "lyrics")?.content, { mod: "malfoid-lyrics" });
  const main = read("mods/malfoid-lyrics/main.js");
  assert.ok(main.includes('const BLOCK = "lyrics"'), "mod looks for its own stack child by this id");
  assert.ok(/const enabled = .*"lyrics"\];/.test(read("mods/malfoid-tabs/main.js")), "per-space panel restore must know the lyrics panel");
  // 面板關著時計時器不能讀檔或連網（mod 啟動後即使面板被切走也一直活著）
  assert.match(main, /async tick\(cx\) \{\s*if \(!isOpen\(\)\)/);
  // lrclib 端點只能來自設定檔，不能偷偷退回公開伺服器
  assert.ok(!/lrclib\.net/.test(main + read("mods/malfoid-lyrics/lib.js")));
});
