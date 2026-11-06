// 中央 pane 背景圖輪播。新圖放進 mods/malfoid-chrome/ 後把路徑加進清單；只有一張時不換圖。
export const BACKGROUNDS = [
  "mods/malfoid-chrome/hallway-background-v2.png",
  "mods/malfoid-chrome/bg-common-room.png",
  "mods/malfoid-chrome/bg-library.png",
  "mods/malfoid-chrome/bg-observatory.png",
  "mods/malfoid-chrome/bg-cloister.png",
  "mods/malfoid-chrome/bg-potions.png",
];
export const ROTATE_MS = 10 * 60 * 1000;

// 回傳清單中接在 current 後面的圖（到尾端回到第一張）；current 不在清單
// （例如手動換過）就從第一張開始。清單不足兩張沒得換，回 null。
export function nextImage(current, list = BACKGROUNDS) {
  if (list.length < 2) return null;
  return list[(list.indexOf(current) + 1) % list.length];
}
