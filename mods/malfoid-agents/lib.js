// 純資料處理：未知狀態回到休息姿態，圖片路徑只使用固定白名單。
export const STATES = ["idle", "working", "blocked", "done"];

export function stateFor(status) {
  return STATES.includes(status) ? status : "idle";
}

const STATUS = { blocked: "等待指示", done: "已完成", idle: "休息中" };

// 工作中輪替兩種動作。文字與圖由同一個時間算出，兩者才不會錯開。
export const ACTION_MS = 3000;
export const TICK_MS = 1000;
const WORKING_ACTIONS = [
  { text: "施法中", sprite: "working" },
  { text: "思考中", sprite: "thinking" },
];

function actionAt(ms) {
  return WORKING_ACTIONS[Math.floor(ms / ACTION_MS) % WORKING_ACTIONS.length];
}

// 第 i 張卡的時間偏移：差一格動作，相鄰卡永遠交錯顯示不同動作（整列同時換）。
export function phaseOffset(index) {
  return index * ACTION_MS;
}

export function statusText(status, ms = 0) {
  const state = stateFor(status);
  return state === "working" ? actionAt(ms).text : STATUS[state];
}

export function spritePath(status, ms = 0) {
  const state = stateFor(status);
  const sprite = state === "working" ? actionAt(ms).sprite : state;
  return `mods/malfoid-agents/states/${sprite}.png`;
}

// Malfoid 版面固定此寬度，需與 layouts/malfoid.json、malfoid-chrome 一致；
// 不讀共用的 sidebar.width，避免其他 layout 存的寬度影響側欄。
export const SIDEBAR_WIDTH = 190;

export function nextSidebarWidth(px, platform) {
  if (px < 160) return SIDEBAR_WIDTH;
  return platform === "macos" ? 76 : 44;
}

// Herdr 內建的 codex 圖示帶白色圓角底板，貼在卡片上會變成一塊白；
// 改用同形、去掉底板的字形。其他程式沿用 Herdr 提供的圖示。
const ICON_OVERRIDES = { codex: "mods/malfoid-agents/art/codex.svg" };

export function iconSrc(program) {
  return Object.hasOwn(ICON_OVERRIDES, program?.key) ? ICON_OVERRIDES[program.key] : program?.icon ?? null;
}

// 程式圖示：單色字形用 svg 上色，彩色圖用 image，沒有圖示就不畫。
export function iconKind(program) {
  if (!program?.icon) return null;
  return program.tint ? "svg" : "image";
}

// blocked 最優先：focused 的 accent 不可蓋掉金框，收合與展開一致。
export function frameColor(state, focused, t, collapsed) {
  if (state === "blocked") return t.blocked;
  if (focused) return t.accent;
  return collapsed ? t[state] : t.border;
}
