import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
let js = 0, json = 0;
function check(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) check(path);
    else if (/\.(js|mjs)$/.test(entry.name)) {
      execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
      js++;
    } else if (entry.name.endsWith(".json")) {
      JSON.parse(readFileSync(path, "utf8"));
      json++;
    }
  }
}
for (const folder of ["mods", "layouts", "themes", "scripts", "tests"]) check(resolve(root, folder));
JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
console.log(`PASS: node --check (${js} JavaScript files), JSON parse (${json + 1} files).`);
