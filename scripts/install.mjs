import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.env.HERDR_APP_HOME || join(homedir(), ".config", "herdr-app");
const files = [
  "mods/malfoid-agents", "mods/malfoid-tabs", "mods/malfoid-spaces", "mods/malfoid-chrome",
  "mods/malfoid-files", "mods/malfoid-changes", "mods/malfoid-git-graph",
  "mods/malfoid-music", "mods/malfoid-lyrics", "mods/malfoid-notes", "mods/file-icons", "layouts/malfoid.json", "layouts/malfoid.svg", "themes/malfoid.json",
];
const update = process.argv.includes("--update");
// file-icons 與其他主題共用：已存在就保留（不算撞名），只有 --update 才覆蓋
const shared = ["mods/file-icons"];
const dependencies = ["pane", "files", "changes", "workspace-status", "menu", "new-menu", "picker", "machine-add", "workspace-chrome", "git-graph"];

// 完整預檢後才複製；撞名預設停止，避免覆蓋個人主題或設定。
// --update 只覆寫上面列出的 malfoid 路徑，供已安裝者更新；來源已刪的檔案不會移除。
for (const name of dependencies) {
  if (!existsSync(join(target, "mods", name, "main.js"))) throw new Error(`Missing Herdr mod: ${name}`);
}
if (!update) for (const file of files) {
  if (!shared.includes(file) && existsSync(join(target, file))) throw new Error(`Already exists; nothing copied: ${join(target, file)}`);
}
for (const folder of ["mods", "layouts", "themes"]) mkdirSync(join(target, folder), { recursive: true });
for (const file of files) if (update || !shared.includes(file) || !existsSync(join(target, file))) cpSync(join(root, file), join(target, file), {
  recursive: true, force: update, errorOnExist: !update,
  filter: path => !/(?:gpui-kit\.d\.ts|herdr\.d\.ts|jsconfig\.json)$/.test(path),
});
console.log(`${update ? "Updated" : "Installed"} Malfoid in ${target}`);
console.log('Next: check all ten mods, then herdr-app do layout.switch \'{"name":"malfoid"}\'');
