// IN-APP-MODAL-001 (#606) Phase 0 + prompt 置換の静的担保。
//   - 汎用アプリ内モーダル（showAppModal / appConfirm / appPrompt / appAlert）の存在・安全設計。
//   - prompt 3件（クラス改名 / 氏名変更 / ふりがな編集）の appPrompt 置換と native prompt( 撤去。
//   ※挙動（OK/キャンセル/Enter/Esc/戻り値）は実ブラウザ(Chromium)検証で担保。
var fs = require('fs');
var file = process.argv[2] || 'shogi_v4.html';
var RAW = fs.readFileSync(file, 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

assert(RAW.indexOf('function showAppModal(') >= 0, 'M1 showAppModal 定義');
assert(RAW.indexOf('function appConfirm(') >= 0, 'M2 appConfirm 定義');
assert(RAW.indexOf('function appPrompt(') >= 0, 'M3 appPrompt 定義');
assert(RAW.indexOf('function appAlert(') >= 0, 'M4 appAlert 定義');
assert(RAW.indexOf('.app-modal-overlay{') >= 0, 'M5 モーダル CSS 定義');
assert(RAW.indexOf('msg.textContent=') >= 0, 'M6 メッセージは textContent（XSS 安全・改行保持）');
assert(RAW.indexOf('z-index:10001') >= 0, 'M7 オーバーレイは app-toast(10000) より前面');
assert(RAW.indexOf('function __setAppModalTestResolver(') >= 0, 'M8 テスト用同期解決シーム（DOM 非依存）');
assert(RAW.indexOf("opts.danger&&type==='confirm'") >= 0, 'M9 危険確認は Enter で誤爆させない');

assert(RAW.indexOf("appPrompt('新しいクラス名を入力してください'") >= 0, 'P1 クラス改名は appPrompt');
assert(RAW.indexOf("appPrompt('名前を変更してください'") >= 0, 'P2 氏名変更は appPrompt');
assert(RAW.indexOf("appPrompt(displayName+' のふりがなを入力してください") >= 0, 'P3 ふりがな編集は appPrompt');
assert(!(/[^a-zA-Z.]prompt\(/.test(RAW)), 'P4 native prompt( は撤去（appPrompt へ移行）');

console.log('IN-APP-MODAL-001: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
