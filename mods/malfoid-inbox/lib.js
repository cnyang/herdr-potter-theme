// 收件匣的純函式：不碰 herdr / gpui-kit，可以被 node 直接載入測試。
// 這裡只做字串與資料的處理；跑指令、畫畫面都在 main.js。

export const MAX_ITEMS = 200;

// 只有這幾種直接 open；其他檔案只在 Finder 顯示，點一下才不會執行 .command／.pkg。
const KINDS = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  mp4: "video",
  mov: "video",
  pdf: "pdf",
};

// 檔名一律當成單一檔名看待：不能有路徑、不能是隱藏檔。
function isPlainName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\0") &&
    !name.startsWith(".")
  );
}

// 資料夾結尾的斜線不影響比對，其他一律原樣。
function prefixOf(dir) {
  const s = typeof dir === "string" ? dir : "";
  const trimmed = s.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed + "/";
}

const PARTIAL = /\.(crdownload|download|part|partial|tmp)$/i;

function isListed(name) {
  return isPlainName(name) && !PARTIAL.test(name);
}

export function kindOf(name) {
  if (!isPlainName(name)) return null;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  const kind = KINDS[ext];
  return typeof kind === "string" ? kind : null;
}

export function listCommand(dir) {
  return {
    cmd: "/usr/bin/find",
    args: [
      dir, "-mindepth", "1", "-maxdepth", "1", "-type", "f",
      "-exec", "/usr/bin/stat", "-f", "%m %z %N", "{}", "+",
    ],
  };
}

// find + stat 的輸出格式是每行「mtime size 路徑」。
export function parseListing(stdout, dir) {
  const prefix = prefixOf(dir);
  const items = [];
  for (const raw of String(stdout ?? "").split("\n")) {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const m = /^(\d+) (\d+) (.+)$/.exec(text);
    if (!m) continue;
    const path = m[3];
    if (!path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length);
    if (!isListed(name)) continue;
    items.push({
      name,
      path,
      mtime: Number(m[1]),
      size: Number(m[2]),
      kind: kindOf(name) ?? "file",
    });
  }
  items.sort(
    (a, b) =>
      b.mtime - a.mtime ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return items.slice(0, MAX_ITEMS);
}

// %HT 只問型別，不跟隨符號連結。
export function statCommand(path) {
  return { cmd: "/usr/bin/stat", args: ["-f", "%HT", path] };
}

export function isRegularFile(stdout) {
  return String(stdout ?? "").trim() === "Regular File";
}

// 只處理資料夾第一層的檔案。
export function openCommand(path, dir) {
  const prefix = prefixOf(dir);
  if (typeof path !== "string" || !path.startsWith(prefix)) return null;
  const name = path.slice(prefix.length);
  if (!isListed(name)) return null;
  return { cmd: "/usr/bin/open", args: kindOf(name) ? [path] : ["-R", path] };
}

export function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`;
}
