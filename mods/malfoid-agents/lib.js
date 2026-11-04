// 純資料處理：未知狀態回到休息姿態，圖片路徑只使用固定白名單。
export const STATES = ["idle", "working", "blocked", "done"];

export function stateFor(status) {
  return STATES.includes(status) ? status : "idle";
}

export function spritePath(status) {
  const state = stateFor(status);
  if (state === "working") return "mods/malfoid-agents/states/working-actions-v2.gif";
  return `mods/malfoid-agents/states/${state}.png`;
}

// Malfoid 版面固定此寬度，需與 layouts/malfoid.json、malfoid-chrome 一致；
// 不讀共用的 sidebar.width，避免其他 layout 存的寬度影響側欄。
export const SIDEBAR_WIDTH = 190;

export function nextSidebarWidth(px, platform) {
  if (px < 160) return SIDEBAR_WIDTH;
  return platform === "macos" ? 76 : 44;
}

// blocked 最優先：focused 的 accent 不可蓋掉金框，收合與展開一致。
export function frameColor(state, focused, t, collapsed) {
  if (state === "blocked") return t.blocked;
  if (focused) return t.accent;
  return collapsed ? t[state] : t.border;
}
