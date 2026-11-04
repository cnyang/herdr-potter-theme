// Downloads 監看的純函式：放在分頁列，因為面板關著時不會載入，提醒要靠常駐的 mod。
// mod 之間不能 import（路徑含 .. 會被拒絕），下載中副檔名與 malfoid-inbox/lib.js 各留一份。
const PARTIAL = /\.(crdownload|download|part|partial|tmp)$/i;

export function listNames(stdout, dir) {
  const prefix = dir + "/";
  return String(stdout ?? "").split("\n")
    .filter(path => path.startsWith(prefix))
    .map(path => path.slice(prefix.length))
    .filter(name => !name.includes("/") && !name.startsWith(".") && !PARTIAL.test(name));
}

export function newFilesNote(before, now) {
  const seen = new Set(before);
  const added = now.filter(name => !seen.has(name));
  if (added.length === 0) return null;
  const extra = added.length > 2 ? ` +${added.length - 2} more` : "";
  return { title: "New download", body: added.slice(0, 2).join(", ") + extra, level: "info" };
}
