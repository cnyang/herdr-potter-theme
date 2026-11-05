// 修改自 herdr-mods/yt-music：把可測的純函式獨立出來（模組不能匯入自己資料夾以外的 JS）。
export const SEEK_SECONDS = 10;

// m:ss；沒有小時位，1 小時 5 分顯示 65:00
export const clock = (s) => {
  const whole = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

// FNV-1a 32 bit：daemon 的終端名稱帶 daemon.js 的雜湊，改檔就換名，舊的會被收掉。
export function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// 上次寫入的位置 + 經過的時間；暫停不動，不超過總長（直播 duration 為 0 則不設上限）。
export const position = (s, now) => (s.paused ? s.seconds : Math.min(s.duration || Infinity, s.seconds + (now - s.at) / 1000));

// 區塊高度：沒歌 0、授權提示 36、播放中 92；側欄收成窄條時一律 0（塞不下五顆按鈕）。
export const blockHeight = (state, narrow) => (!state || narrow ? 0 : state.error ? 36 : 92);
