import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { SAMPLE_SH, parseSample, netRate, fmtRate, LZ4_PY, TEAMS_PY, parseTeams } from "../mods/malfoid-status/lib.js";

test("parseSample reads 'cpu mem rx tx' and rejects anything else", () => {
  assert.deepEqual(parseSample("19 67 21686625831 42168474060\n"), { cpu: 19, mem: 67, rx: 21686625831, tx: 42168474060 });
  for (const bad of ["", "\n", "1 2 3", "1 2 3 4 5", "a b c d", "1 2 NaN 4", "1 2 -3 4"]) assert.equal(parseSample(bad), null, JSON.stringify(bad));
  // 非 macOS 的機器：腳本什麼都不印，狀態列就不顯示用量
  assert.equal(parseSample(undefined), null);
});

test("parseSample clamps percentages into 0..100", () => {
  const s = parseSample("-3 140 0 0");
  assert.equal(s.cpu, 0);
  assert.equal(s.mem, 100);
});

test("netRate is bytes per second; a counter that goes backwards reads as 0", () => {
  assert.deepEqual(netRate({ rx: 1000, tx: 500 }, { rx: 3000, tx: 1500 }, 2000), { down: 1000, up: 500 });
  // 介面重置或計數器回繞：不能出現負速率
  assert.deepEqual(netRate({ rx: 9000, tx: 9000 }, { rx: 100, tx: 100 }, 3000), { down: 0, up: 0 });
  assert.deepEqual(netRate({ rx: 0, tx: 0 }, { rx: 100, tx: 100 }, 0), { down: 0, up: 0 });
});

test("fmtRate switches B/s, KB/s, MB/s at 1024 and never prints 1000+ KB/s", () => {
  assert.equal(fmtRate(0), "0 B/s");
  assert.equal(fmtRate(1023), "1023 B/s");
  assert.equal(fmtRate(1536), "2 KB/s");
  assert.equal(fmtRate(1023 * 1024), "1.0 MB/s");
  assert.equal(fmtRate(1.5 * 1048576), "1.5 MB/s");
  assert.equal(fmtRate(250 * 1048576), "250.0 MB/s");
});

// 腳本與解析器的合約：在本機（macOS）真的跑一次
test("sample script prints something parseSample accepts", { skip: process.platform !== "darwin" }, () => {
  const r = spawnSync("sh", ["-c", SAMPLE_SH], { encoding: "utf8", timeout: 15000 });
  const s = parseSample(r.stdout);
  assert.ok(s, `stdout: ${JSON.stringify(r.stdout)} stderr: ${r.stderr}`);
  assert.ok(s.cpu >= 0 && s.cpu <= 100 && s.mem > 0 && s.mem <= 100);
});

test("sample script prints nothing off macOS, so the bar hides the stats", () => {
  const r = spawnSync("sh", ["-c", SAMPLE_SH.replace('"$(uname)"', '"Plan9"')], { encoding: "utf8" });
  assert.equal(parseSample(r.stdout), null);
});

test("parseTeams reads the '(N)' prefix of a Teams tab title", () => {
  assert.equal(parseTeams("(1) 聊天 | 王小明 (您) | Microsoft Teams\n"), 1);
  assert.equal(parseTeams("(12) Activity | Microsoft Teams"), 12);
  // 有 Teams 分頁但沒有前綴 = 沒有未讀，是 0 不是 null
  assert.equal(parseTeams("聊天 | 專案討論群 | Microsoft Teams"), 0);
});

test("parseTeams is null when there is no Teams tab, so the bar hides the badge", () => {
  for (const none of ["", "\n", undefined, null, "(5) 收件匣 - Outlook"]) assert.equal(parseTeams(none), null, JSON.stringify(none));
});

test("parseTeams takes the largest count across several Teams tabs instead of summing", () => {
  assert.equal(parseTeams("(2) A | Microsoft Teams\n(5) B | Microsoft Teams\nMicrosoft Teams"), 5);
});

// Python 內嵌的 LZ4 解碼器：literal 長度擴充、重疊 match（offset < length）都要對
test("LZ4_PY decodes literal-only, extended-literal and overlapping-match blocks", { skip: process.platform !== "darwin" }, () => {
  const dec = (hex) => spawnSync("python3", ["-I", "-c", `${LZ4_PY}\nimport sys\nsys.stdout.buffer.write(unlz4(bytes.fromhex(sys.argv[1])))`, hex], { encoding: "utf8" }).stdout;
  assert.equal(dec("35616263030020" + "5859"), "abcabcabcabcXY");
  assert.equal(dec("f005" + "61".repeat(20)), "a".repeat(20));
});

// 腳本與解析器的合約：只能印出含 Microsoft Teams 的標題行，其餘（其他分頁、cookie）一律不外洩
test("TEAMS_PY exits cleanly and prints only Teams tab titles", { skip: process.platform !== "darwin" }, () => {
  const r = spawnSync("python3", ["-I", "-c", TEAMS_PY], { encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 0, r.stderr);
  for (const line of r.stdout.split("\n").filter(Boolean)) assert.match(line, /Microsoft Teams/);
});
