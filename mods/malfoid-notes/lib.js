// 筆記存檔邏輯：只在內容與磁碟不同時才寫，並把「上次讀到／寫入的內容」當 expected 交給 writeTextFile（原子寫入）。
// s = { text, disk }：text 是畫面上的內容，disk 是磁碟上最後確認的內容（檔案不存在為 null）。
// io = { read(), write(text, expected) }。回傳這次有沒有真的寫。
export async function save(s, io) {
  const text = s.text;
  if (text === (s.disk ?? "")) return false;
  try {
    await io.write(text, s.disk);
    s.disk = text;
    return true;
  } catch (e) {
    // 過期快照（檔案被別的程式改過或刪掉）：重讀當新基準，下一輪以本機內容覆蓋。
    // ponytail: 後寫者勝，不做合併；真的要防外部編輯衝突再加。
    s.disk = await io.read();
    throw e;
  }
}
