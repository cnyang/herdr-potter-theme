import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { SAMPLE_SH, parseSample, netRate, fmtRate } from "../mods/malfoid-status/lib.js";

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
