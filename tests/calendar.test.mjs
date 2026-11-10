import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseICS, expand, calendarsFrom, dayKey } from "../mods/malfoid-calendar/lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const ics = (...events) => ["BEGIN:VCALENDAR", ...events.flatMap(e => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const titles = (list) => list.map(o => `${dayKey(o.start)} ${o.summary}`);

test("ICS: folded lines, escapes, all-day and UTC times", () => {
  const [a, b] = parseICS(ics(
    ["UID:1", "SUMMARY:Dig\\, site", "DESCRIPTION:long", " er text", "DTSTART;VALUE=DATE:20261110", "DTEND;VALUE=DATE:20261111"],
    ["UID:2", "SUMMARY:Call", "LOCATION:Room\\n2", "DTSTART:20261110T010000Z", "DTEND:20261110T020000Z"],
  ));
  assert.equal(a.summary, "Dig, site");
  assert.equal(a.allDay, true);
  assert.equal(a.start.getTime(), new Date(2026, 10, 10).getTime());
  assert.equal(b.start.getTime(), Date.UTC(2026, 10, 10, 1));
  assert.equal(b.end - b.start, 3600e3);
  assert.equal(b.location, "Room\n2");
});

test("ICS: TZID times convert to the absolute instant", () => {
  const [e] = parseICS(ics(["UID:1", "SUMMARY:x", "DTSTART;TZID=Asia/Taipei:20261110T090000", "DTEND;TZID=Asia/Taipei:20261110T100000"]));
  assert.equal(e.start.getTime(), Date.UTC(2026, 10, 10, 1));
});

test("expand: weekly BYDAY with COUNT, EXDATE removes one, override replaces one, cancelled dropped", () => {
  const list = parseICS(ics(
    ["UID:w", "SUMMARY:Standup", "DTSTART:20261102T010000Z", "DTEND:20261102T011500Z", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5", "EXDATE:20261104T010000Z"],
    ["UID:w", "SUMMARY:Standup moved", "RECURRENCE-ID:20261109T010000Z", "DTSTART:20261109T030000Z", "DTEND:20261109T031500Z"],
    ["UID:c", "SUMMARY:Gone", "STATUS:CANCELLED", "DTSTART:20261105T010000Z"],
  ));
  const out = expand(list, new Date(2026, 10, 1), new Date(2026, 11, 1));
  assert.deepEqual(out.map(o => [o.start.toISOString(), o.summary]), [
    ["2026-11-02T01:00:00.000Z", "Standup"],
    ["2026-11-09T03:00:00.000Z", "Standup moved"],
    ["2026-11-11T01:00:00.000Z", "Standup"],
    ["2026-11-16T01:00:00.000Z", "Standup"],
  ]);
});

test("expand: daily UNTIL, monthly skips short months, interval, window clipping", () => {
  const list = parseICS(ics(
    ["UID:d", "SUMMARY:D", "DTSTART;VALUE=DATE:20261128", "RRULE:FREQ=DAILY;UNTIL=20261202"],
    ["UID:m", "SUMMARY:M", "DTSTART;VALUE=DATE:20260131", "RRULE:FREQ=MONTHLY"],
    ["UID:y", "SUMMARY:Y", "DTSTART;VALUE=DATE:20201201", "RRULE:FREQ=YEARLY;INTERVAL=2"],
  ));
  assert.deepEqual(titles(expand(list, new Date(2026, 10, 1), new Date(2026, 11, 1))), ["2026-11-28 D", "2026-11-29 D", "2026-11-30 D"]);
  assert.deepEqual(titles(expand(list, new Date(2026, 11, 1), new Date(2027, 0, 1))), ["2026-12-01 D", "2026-12-01 Y", "2026-12-02 D", "2026-12-31 M"]);
  assert.deepEqual(titles(expand(list, new Date(2026, 1, 1), new Date(2026, 2, 1))), [], "Feb has no 31st");
});

test("config: only https URLs are accepted, strings or objects, invalid colors become null", () => {
  assert.deepEqual(calendarsFrom(JSON.stringify({ urls: [
    "https://calendar.google.com/a.ics", "http://x", "file:///etc/passwd", 3, null,
    { url: "https://b.ics", color: "#E06C75" }, { url: "https://c.ics", color: "red" }, { url: "file:///d", color: "#000000" },
  ] })), [
    { url: "https://calendar.google.com/a.ics", color: null },
    { url: "https://b.ics", color: "#E06C75" },
    { url: "https://c.ics", color: null },
  ]);
  assert.deepEqual(calendarsFrom("not json"), []);
  assert.deepEqual(calendarsFrom(null), []);
});

test("expand: keeps the calendar color of each event", () => {
  const list = parseICS(ics(["UID:1", "SUMMARY:x", "DTSTART;VALUE=DATE:20261110", "RRULE:FREQ=DAILY;COUNT=2"])).map(e => ({ ...e, color: "#123456" }));
  assert.deepEqual(expand(list, new Date(2026, 10, 1), new Date(2026, 11, 1)).map(o => o.color), ["#123456", "#123456"]);
});

test("calendar panel is wired: layout block, tab button, install list, shared config path", () => {
  const body = (function find(n) { return n.id === "panel-body" ? n : (n.children ?? []).map(find).find(Boolean); })({ children: JSON.parse(readFileSync(join(root, "layouts/malfoid.json"), "utf8")).children });
  assert.equal(body.children.find(n => n.id === "calendar").content.mod, "malfoid-calendar");
  const tabs = readFileSync(join(root, "mods/malfoid-tabs/main.js"), "utf8");
  assert.match(tabs, /"notes", "calendar"\]/, "panel must be in the remembered-panels list");
  assert.ok(readFileSync(join(root, "scripts/install.mjs"), "utf8").includes('"mods/malfoid-calendar"'));
  assert.ok(readFileSync(join(root, "mods/malfoid-calendar/main.js"), "utf8").includes("data/theme-calendar"), "all three themes share one config");
});
