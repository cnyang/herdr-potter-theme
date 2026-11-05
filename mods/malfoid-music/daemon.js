// 修改自 herdr-mods/yt-music 的 daemon：改成直接控制本機 Apple Music（Music.app）。
//
//   osascript -l JavaScript daemon.js <data dir>
//
// mod 只會以 herdr-core 終端 apm-<本檔雜湊> 啟動一份，所以不會有第二個，也不佔 Herdr 的畫面。
// 它每秒讀一次 Music 的目前曲目，只有曲目、播放／暫停、跳轉改變時才寫 <data dir>/state.json；
// mod 監看該資料夾並自己推進時鐘。mod 以 <data dir>/cmd.json { action, n } 下指令。
//
// 與 Chrome 版的差別：Music 有原生 AppleScript 字典，不必注入 JS，也沒有「允許 Apple Events 的
// JavaScript」開關；唯一的關卡是系統「自動化」授權（錯誤碼 -1743／-1744）。
ObjC.import("Foundation");

const SEEK = 10;
const SEP = "(ASCII character 31)"; // 欄位分隔：曲名不會出現這個控制字元

// 3 秒逾時：Music 收到事件卻不回應時，JXA 預設會卡 2 分鐘，後面的按鈕指令全被擋住。
// 錯誤在 AppleScript 內接住，以「\u0001 + 錯誤碼」回傳：JXA 的 executeAndReturnError(Ref()) 一走到
// 錯誤路徑就 segfault（exit 139），只能傳 null，所以拿不到錯誤字典。
const wrap = (body) => `with timeout of 3 seconds\ntry\ntell application "Music"\n${body}\nend tell\non error number n\nreturn (ASCII character 1) & n\nend try\nend timeout`;

// 位置與總長乘 10 取整數再回傳：real 轉文字會受系統地區的小數點符號影響，整數不會。
const READ = wrap([
  "if player state is stopped then return \"\"",
  "set t to current track",
  "set d to 0",
  "try",
  "set d to duration of t",
  "end try",
  "set a to \"\"",
  "try",
  "set a to artist of t",
  "end try",
  // 專輯名給 malfoid-lyrics 查歌詞用（lrclib 帶專輯比對較準）；沒有就空字串
  "set b to \"\"",
  "try",
  "set b to album of t",
  "end try",
  `return (name of t) & ${SEP} & a & ${SEP} & b & ${SEP} & (player state is paused) & ${SEP} & ((player position * 10) div 1) & ${SEP} & ((d * 10) div 1)`,
].join("\n"));

const ACTIONS = {
  previous: wrap("previous track"),
  back: wrap(`set p to (player position) - ${SEEK}\nif p < 0 then set p to 0\nset player position to p`),
  toggle: wrap("playpause"),
  forward: wrap(`set player position to (player position) + ${SEEK}`),
  next: wrap("next track"),
};

const TICK = 0.5; // s：多久看一次 cmd.json
const READ_EVERY = 2; // 每幾個 tick 讀一次 Music（1 秒）
const LOOK_EVERY = 10; // Music 沒開或停止時，每幾個 tick 再找一次（5 秒）

function run(argv) {
  const dir = argv[0];
  const STATE = `${dir}/state.json`, CMD = `${dir}/cmd.json`;
  const fm = $.NSFileManager.defaultManager;
  const readFile = (p) => {
    const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
    return s.isNil() ? null : ObjC.unwrap(s);
  };
  const writeFile = (p, text) => $(text).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null);

  const music = Application("Music");
  let active = false, last = null, written = "", tick = 0, lastCmd = null;

  const publish = (state) => {
    const text = JSON.stringify(state);
    if (text === written) return;
    written = text;
    writeFile(STATE, text);
  };

  // 每個 source 只編譯一次並保留：每秒 new 一個 NSAppleScript 會讓 Objective-C 物件一直堆積，
  // osascript 約 50 秒後 signal 11 當掉。source 絕不能夾變動值（時間戳、計數），否則快取永遠不中。
  const compiled = new Map();
  const exec = (src) => {
    let script = compiled.get(src);
    if (!script) { script = $.NSAppleScript.alloc.initWithSource(src); compiled.set(src, script); }
    const r = script.executeAndReturnError(null);
    if (r.isNil()) return { gone: true }; // 連 try 都沒接住（編譯失敗等）：下一輪再看
    const out = ObjC.unwrap(r.stringValue) ?? "";
    if (out.charCodeAt(0) !== 1) return { out };
    const n = Number(out.slice(1));
    // 逾時、曲目瞬間消失、Music 結束：下一輪再看
    return n === -1743 || n === -1744 ? { denied: true } : { gone: true };
  };

  // 對沒開的 Music 下指令會把它啟動，所以每次都先問 running()。
  const read = () => {
    if (!music.running()) { active = false; last = null; return publish(null); }
    const r = exec(READ);
    if (r.denied) { active = false; return publish({ error: "denied" }); }
    if (!r.out) { active = false; last = null; return publish(null); }
    active = true;
    const [title, artist, album, paused, pos, dur] = r.out.split("\u001f");
    const t = { title, artist, album, paused: paused === "true", seconds: Number(pos) / 10, duration: Number(dur) / 10 };
    const now = Date.now();
    // 時鐘由 mod 自己推進，只有跳轉（拖曳、換歌）才算新消息。
    const expected = last ? last.seconds + (last.paused ? 0 : (now - last.at) / 1000) : null;
    const same = last && last.title === t.title && last.artist === t.artist && last.paused === t.paused
      && Math.abs(last.duration - t.duration) < 1 && Math.abs(expected - t.seconds) < 2;
    if (same) return;
    last = { ...t, at: now };
    publish(last);
  };

  for (;;) {
    const cmdText = readFile(CMD);
    if (cmdText && cmdText !== lastCmd) {
      lastCmd = cmdText;
      fm.removeItemAtPathError(CMD, null);
      let cmd = null;
      try { cmd = JSON.parse(cmdText); } catch (_) {}
      if (cmd?.action === "quit") { publish(null); return; }
      // daemon 沒在跑時按下的指令會留在磁碟上；超過 5 秒的不重播，免得舊的暫停之後才觸發。
      if (ACTIONS[cmd?.action] && Date.now() - (cmd.n || 0) < 5000) {
        if (music.running()) exec(ACTIONS[cmd.action]);
        last = null; // 立刻重讀
        read();
      }
    }
    tick++;
    if (tick % (active ? READ_EVERY : LOOK_EVERY) === 0) {
      try { read(); } catch (_) { active = false; last = null; }
    }
    delay(TICK);
  }
}
