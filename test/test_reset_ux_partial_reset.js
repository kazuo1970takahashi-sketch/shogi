#!/usr/bin/env node
// RESET-UX-PARTIAL-RESET-IMPL-LIGHT (PR #113 §10.1 / §11)
// 参加者一覧を残したまま、組み合わせ・勝敗など局単位の進行データだけを初期化する
// resetTournamentProgressOnly() helper と #resetProgressBtn の検証。
//
// 不変項目:
//   - resetAll() の仕様 / state.players={A:[],B:[]} 初期化 / 全リセット動線 維持
//   - removePlayer() の一次禁止 / 二次禁止 / alert 文言 維持
//   - startTournament() の state.started===true guard 条件 維持
//   - 既存 #resetBtn 文言「大会データをリセット」維持
//   - 既存 resetAll() confirm 文言「現在の大会データをリセットします（支部マスタは保持されます）」維持
//   - localStorage schema (STORAGE_KEY='shogi_v4' / LEGACY_STORAGE_KEYS / BRANCH_MASTER_KEY) 維持
//   - pairing algorithm / generatePairing / evaluatePairingQuality 維持
//   - normalizeState の started 正規化 維持
//
// 観点 (設計 doc §6.7 / §8.1 / §8.2 / §10.1 / §11 に対応):
//   構造検査:
//     1.  resetTournamentProgressOnly() helper が存在する
//     2.  #resetProgressBtn が DOM に存在する
//     3.  #resetProgressBtn の表示文言が「大会進行データをリセット」である
//     4.  bindHeaderEvents 内で #resetProgressBtn → resetTournamentProgressOnly に bind
//     5.  helper 内で state.started=false への代入が存在
//     6.  helper 内で state.pairings={A:[],B:[]} への代入が存在
//     7.  helper 内で state.results={A:[],B:[]} への代入が存在
//     8.  helper 内で confirm() を呼び、キャンセル時 return
//     9.  helper 内に「触らない」フィールド代入が存在しない:
//         state.players / state.rounds / state.tournament_id / state.report /
//         _pendingNewYomi / _yomiAutoBuffer / _yomiManuallyEdited
//     10. helper 内で BRANCH_MASTER_KEY / localStorage.removeItem 呼出なし
//     11. helper 内で save() / renderRegList() / showTab('reg') が呼ばれる
//   confirm 文言:
//     12. 「参加者一覧は残」を含む
//     13. 「組み合わせ」を含む
//     14. 「勝敗結果」を含む
//     15. 内部実装語（支部マスタ / localStorage / state / 局単位）を含まない
//   既存挙動の不変:
//     16. resetAll() の players:{A:[],B:[]} 初期化が維持されている
//     17. 既存 #resetBtn 文言が「大会データをリセット」のまま
//     18. 既存 resetAll() confirm 文言が変更されていない
//     19. startTournament() guard 条件 state.started===true が維持
//     20. startTournament() guard alert に新ボタン名「大会進行データをリセット」が含まれる
//     21. startTournament() guard alert に「参加者一覧は残したまま」が含まれる
//     22. removePlayer() 一次禁止 / 二次禁止 alert が維持
//     23. localStorage schema が維持 (STORAGE_KEY / LEGACY_STORAGE_KEYS / BRANCH_MASTER_KEY)
//     24. pairing algorithm が維持 (generatePairing / evaluatePairingQuality)
//   振る舞いテスト（軽量 mock）:
//     case1: started=true で helper 実行 → players / rounds / tournament_id /
//            report / _pendingNewYomi が不変、pairings/results が空、started=false
//     case2: confirm cancel → state 完全不変、save 呼ばれない
//     case3: helper 後に startTournament guard が発火しない (started=false)
//     case4: helper 後に pairings/results が空 → removePlayer 禁止判定が解除前提
//     case5: resetAll() の既存挙動と helper が別物 (resetAll は players も消す)
//     case6: tournament_id 維持
//     case7: state.rounds 維持
//     case8: state.report 維持
//     case9: _pendingNewYomi / _yomiAutoBuffer / _yomiManuallyEdited 維持

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_reset_ux_partial_reset.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass = 0, fail = 0;
function ok(msg){ pass++; console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(msg); else ng(msg); }

// ============================================================
// resetTournamentProgressOnly() 関数本体を抽出
// ============================================================
const rtpMatch = htmlSrc.match(/function resetTournamentProgressOnly\([\s\S]*?\n\}\n/);
assert(rtpMatch !== null, 'resetTournamentProgressOnly 関数本体を抽出できる');
const rtpBody = rtpMatch ? rtpMatch[0] : '';

// ============================================================
// 1) helper が存在する
// ============================================================
assert(/function\s+resetTournamentProgressOnly\s*\(\s*\)\s*\{/.test(htmlSrc),
  'resetTournamentProgressOnly() helper が存在する');

// ============================================================
// 2-3) #resetProgressBtn が DOM に存在、文言が「大会進行データをリセット」
// ============================================================
{
  assert(/id="resetProgressBtn"[\s\S]{0,200}大会進行データをリセット/.test(htmlSrc),
    '#resetProgressBtn が DOM に存在し、文言が「大会進行データをリセット」である');
  // .btn-danger 系スタイル（destructive、設計 doc §7.1）
  assert(/<button[^>]*class="[^"]*btn-danger[^"]*"[^>]*id="resetProgressBtn"/.test(htmlSrc),
    '#resetProgressBtn は .btn-danger スタイルを継承 (destructive)');
}

// ============================================================
// 4) bindHeaderEvents 内で #resetProgressBtn → resetTournamentProgressOnly bind
// ============================================================
{
  const bindMatch = htmlSrc.match(/function bindHeaderEvents\([\s\S]*?\n\}\n/);
  assert(bindMatch !== null, 'bindHeaderEvents 関数本体を抽出できる');
  const bindBody = bindMatch ? bindMatch[0] : '';
  assert(bindBody.indexOf("'resetProgressBtn'") >= 0 || bindBody.indexOf('"resetProgressBtn"') >= 0,
    'bindHeaderEvents 内で #resetProgressBtn を参照している');
  assert(bindBody.indexOf('resetTournamentProgressOnly') >= 0,
    'bindHeaderEvents 内で resetTournamentProgressOnly を bind している');
}

// ============================================================
// 5-7) helper 内の状態初期化代入
// ============================================================
{
  assert(/state\.started\s*=\s*false/.test(rtpBody),
    'helper 内で state.started=false への代入が存在');
  assert(/state\.pairings\s*=\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(rtpBody),
    'helper 内で state.pairings={A:[],B:[]} への代入が存在');
  assert(/state\.results\s*=\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(rtpBody),
    'helper 内で state.results={A:[],B:[]} への代入が存在');
}

// ============================================================
// 8) confirm() を呼び、キャンセル時 return
// ============================================================
{
  assert(/if\s*\(\s*!\s*confirm\(/.test(rtpBody),
    'helper 内で if(!confirm(...)) パターンによりキャンセル時 return している');
}

// ============================================================
// 9) 「触らない」フィールドへの代入が helper 内に存在しない
//    (player 配列の参照保持 / 大会単位データ維持を保証)
// ============================================================
{
  const noTouch = [
    ['state.players',            /state\.players\s*=/],
    ['state.rounds',             /state\.rounds\s*=/],
    ['state.tournament_id',      /state\.tournament_id\s*=/],
    ['state.report',             /state\.report\s*=/],
    ['_pendingNewYomi',          /_pendingNewYomi\s*=/],
    ['_yomiAutoBuffer',          /_yomiAutoBuffer\s*=/],
    ['_yomiManuallyEdited',      /_yomiManuallyEdited\s*=/],
  ];
  noTouch.forEach(function(pair){
    var name = pair[0], re = pair[1];
    assert(!re.test(rtpBody),
      'helper 内に ' + name + ' への代入が存在しない (PR #113 §8.1 維持)');
  });
}

// ============================================================
// 10) helper 内で BRANCH_MASTER_KEY / localStorage.removeItem 呼出なし
// ============================================================
{
  assert(rtpBody.indexOf('BRANCH_MASTER_KEY') < 0,
    'helper 内で BRANCH_MASTER_KEY を参照しない (支部マスタ保持)');
  assert(rtpBody.indexOf('localStorage.removeItem') < 0,
    'helper 内で localStorage.removeItem を呼ばない (localStorage キー削除しない)');
  // 関連: helper 内で STORAGE_KEY も触らない（save() 経由のみ書く）
  assert(rtpBody.indexOf('localStorage.removeItem(STORAGE_KEY)') < 0,
    'helper 内で STORAGE_KEY を削除しない (save() による上書きのみ)');
}

// ============================================================
// 11) helper 内で save() / renderRegList() / showTab('reg') が呼ばれる
// ============================================================
{
  assert(/\bsave\s*\(\s*\)/.test(rtpBody),
    'helper 内で save() が呼ばれる');
  assert(/\brenderRegList\s*\(\s*\)/.test(rtpBody),
    'helper 内で renderRegList() が呼ばれる');
  assert(rtpBody.indexOf("showTab('reg')") >= 0,
    "helper 内で showTab('reg') が呼ばれる");
}

// ============================================================
// 12-15) confirm 文言の検査
// ============================================================
{
  // helper 内の confirm 文言を抽出（最初の confirm(... 文言 ...)）
  const cMatch = rtpBody.match(/confirm\(\s*'([^']*)'\s*\)/);
  assert(cMatch !== null, 'helper 内の confirm 文言を抽出できる');
  const confirmText = cMatch ? cMatch[1] : '';
  assert(confirmText.indexOf('参加者一覧は残') >= 0,
    'confirm 文言に「参加者一覧は残」が含まれる');
  assert(confirmText.indexOf('組み合わせ') >= 0,
    'confirm 文言に「組み合わせ」が含まれる');
  assert(confirmText.indexOf('勝敗結果') >= 0,
    'confirm 文言に「勝敗結果」が含まれる');
  // 内部実装語が含まれない（運営者向け文言、設計 doc §4）
  const internalTerms = ['支部マスタ', 'localStorage', 'state.', '局単位'];
  internalTerms.forEach(function(t){
    assert(confirmText.indexOf(t) < 0,
      'confirm 文言に内部実装語「' + t + '」が含まれない');
  });
}

// ============================================================
// 16) resetAll() の players:{A:[],B:[]} 初期化が維持
// ============================================================
{
  const resetMatch = htmlSrc.match(/function resetAll\([\s\S]*?\n\}\n/);
  assert(resetMatch !== null, 'resetAll() 関数本体を抽出できる');
  const resetBody = resetMatch ? resetMatch[0] : '';
  assert(/players\s*:\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(resetBody),
    'resetAll() 内で players:{A:[],B:[]} 初期化が維持されている (全リセット温存)');
  assert(/started\s*:\s*false/.test(resetBody),
    'resetAll() 内で started:false 初期化が維持されている');
  // resetAll の confirm 文言が変更されていない
  assert(resetBody.indexOf('現在の大会データをリセットします（支部マスタは保持されます）') >= 0,
    'resetAll() の confirm 文言「現在の大会データをリセットします（支部マスタは保持されます）」が維持');
}

// ============================================================
// 17) 既存 #resetBtn 文言が「大会データをリセット」のまま
// ============================================================
{
  assert(/id="resetBtn"[\s\S]{0,80}>大会データをリセット<\/button>/.test(htmlSrc),
    '既存 #resetBtn の文言が「大会データをリセット」のまま (IMPL-LIGHT で既存に触れない)');
}

// ============================================================
// 19-21) startTournament() guard の整合
// ============================================================
{
  const stMatch = htmlSrc.match(/function startTournament\([\s\S]*?\n\}\n/);
  assert(stMatch !== null, 'startTournament() 関数本体を抽出できる');
  const stBody = stMatch ? stMatch[0] : '';
  assert(/if\s*\(\s*state\.started\s*===\s*true\s*\)/.test(stBody),
    'startTournament() guard 条件 state.started===true が維持');
  assert(stBody.indexOf('大会進行データをリセット') >= 0,
    'startTournament() guard alert に新ボタン名「大会進行データをリセット」が含まれる');
  assert(stBody.indexOf('参加者一覧は残したまま') >= 0,
    'startTournament() guard alert に「参加者一覧は残したまま」が含まれる');
}

// ============================================================
// 22) removePlayer() 一次禁止 / 二次禁止 alert が維持
// ============================================================
{
  const rmMatch = htmlSrc.match(/function removePlayer\([\s\S]*?\n\}\n/);
  assert(rmMatch !== null, 'removePlayer() 関数本体を抽出できる');
  const rmBody = rmMatch ? rmMatch[0] : '';
  assert(rmBody.indexOf('進行中の対局に登録されているため削除できません') >= 0,
    'removePlayer 一次禁止 alert が維持されている');
  assert(rmBody.indexOf('試合分の対戦履歴があるため、大会開始後は削除できません') >= 0,
    'removePlayer 二次禁止 alert が維持されている');
  assert(/state\.started\s*&&\s*pastMatches\s*>\s*0/.test(rmBody),
    'removePlayer 二次禁止条件 (state.started && pastMatches>0) が維持されている');
}

// ============================================================
// 23) localStorage schema が維持
// ============================================================
{
  assert(htmlSrc.indexOf("STORAGE_KEY='shogi_v4'") >= 0,
    "STORAGE_KEY='shogi_v4' が維持");
  assert(htmlSrc.indexOf("LEGACY_STORAGE_KEYS=['shogi_v3']") >= 0,
    "LEGACY_STORAGE_KEYS=['shogi_v3'] が維持");
  assert(htmlSrc.indexOf("BRANCH_MASTER_KEY='shogi_branch_master'") >= 0,
    "BRANCH_MASTER_KEY='shogi_branch_master' が維持");
}

// ============================================================
// 24) pairing algorithm が維持
// ============================================================
{
  assert(/function\s+generatePairing\s*\(/.test(htmlSrc),
    'generatePairing 関数が維持');
  assert(/function\s+evaluatePairingQuality\s*\(/.test(htmlSrc),
    'evaluatePairingQuality 関数が維持');
}

// ============================================================
// 振る舞いテスト（軽量 mock）
// helper 本体の操作のみを mock で再現する（render / save は副作用カウントで検証）
// ============================================================
function makeHarness(){
  var state = {
    players: {A:[{id:'pa1',name:'A1',entry_no:1},{id:'pa2',name:'A2',entry_no:2}], B:[]},
    rounds: 3,
    pairings: {A:[{p1:'pa1',p2:'pa2',winner:null,lastModifiedBy:'auto'}], B:[]},
    results: {A:[[{p1:'pa1',p2:'pa2',winner:'pa1',lastModifiedBy:'auto'}]], B:[]},
    started: true,
    report: {date:'2026-05-15', place:'労政会館', start:'10:00', end:'15:00', sei:'山田', fuku:'佐藤', note:'特になし'},
    tournament_id: 't_test_001'
  };
  var pendingNewYomi = {pa1:'えーわん'};
  var yomiAutoBuffer = 'ぶ';
  var yomiManuallyEdited = true;
  var confirmAnswer = true;
  var calls = {save:0, renderRegList:0, showTab:[], showMsg:[]};

  function _confirm(){ return confirmAnswer; }
  function _save(){ calls.save++; }
  function _renderRegList(){ calls.renderRegList++; }
  function _showTab(t){ calls.showTab.push(t); }
  function _showMsg(t,k){ calls.showMsg.push({text:t,kind:k}); }

  // helper 本体（実装と同じロジック、render 系は mock）
  function resetTournamentProgressOnly(){
    if(!_confirm('participant-stays-progress-removed'))return;
    state.started=false;
    state.pairings={A:[],B:[]};
    state.results={A:[],B:[]};
    _save();
    _renderRegList();
    _showTab('reg');
    _showMsg('大会進行データをリセットしました','ok');
  }

  return {
    state: state,
    get pendingNewYomi(){ return pendingNewYomi; },
    get yomiAutoBuffer(){ return yomiAutoBuffer; },
    get yomiManuallyEdited(){ return yomiManuallyEdited; },
    calls: calls,
    setConfirm: function(v){ confirmAnswer = v; },
    run: resetTournamentProgressOnly,
  };
}

// case1: started=true で実行 → 「触らない」項目は不変、「消す」項目は空
{
  var h = makeHarness();
  var snapPlayers       = JSON.stringify(h.state.players);
  var snapRounds        = h.state.rounds;
  var snapTournamentId  = h.state.tournament_id;
  var snapReport        = JSON.stringify(h.state.report);
  var snapPending       = h.pendingNewYomi;
  var snapYomiBuf       = h.yomiAutoBuffer;
  var snapYomiEdited    = h.yomiManuallyEdited;

  h.run();

  assert(JSON.stringify(h.state.players) === snapPlayers,
    '[case1] state.players は不変');
  assert(h.state.rounds === snapRounds,
    '[case1] state.rounds は不変');
  assert(h.state.tournament_id === snapTournamentId,
    '[case1] state.tournament_id は不変');
  assert(JSON.stringify(h.state.report) === snapReport,
    '[case1] state.report は不変');
  // _pendingNewYomi 等は helper が触らない（参照したまま）
  assert(h.pendingNewYomi === snapPending,
    '[case1] _pendingNewYomi 参照が不変');
  assert(h.yomiAutoBuffer === snapYomiBuf,
    '[case1] _yomiAutoBuffer 参照が不変');
  assert(h.yomiManuallyEdited === snapYomiEdited,
    '[case1] _yomiManuallyEdited 参照が不変');

  assert(h.state.started === false,
    '[case1] state.started=false');
  assert(h.state.pairings.A.length === 0 && h.state.pairings.B.length === 0,
    '[case1] state.pairings={A:[],B:[]}');
  assert(h.state.results.A.length === 0 && h.state.results.B.length === 0,
    '[case1] state.results={A:[],B:[]}');
  assert(h.calls.save === 1,
    '[case1] save() が 1 回呼ばれる');
  assert(h.calls.renderRegList === 1,
    '[case1] renderRegList() が 1 回呼ばれる');
  assert(h.calls.showTab.length === 1 && h.calls.showTab[0] === 'reg',
    "[case1] showTab('reg') が 1 回呼ばれる");
  assert(h.calls.showMsg.length === 1 && h.calls.showMsg[0].text === '大会進行データをリセットしました',
    '[case1] showMsg「大会進行データをリセットしました」が 1 回呼ばれる');
}

// case2: confirm cancel → state 完全不変、副作用なし
{
  var h = makeHarness();
  h.setConfirm(false);
  var snap = JSON.stringify(h.state);
  h.run();
  assert(JSON.stringify(h.state) === snap,
    '[case2] confirm cancel → state 完全不変');
  assert(h.calls.save === 0,
    '[case2] confirm cancel → save() 呼ばれない');
  assert(h.calls.renderRegList === 0,
    '[case2] confirm cancel → renderRegList() 呼ばれない');
  assert(h.calls.showTab.length === 0,
    '[case2] confirm cancel → showTab() 呼ばれない');
}

// case3: helper 後に startTournament guard が発火しない (started=false 整合)
{
  var h = makeHarness();
  h.run();
  // 設計上、guard は state.started===true でのみ発火する
  assert(h.state.started === false,
    '[case3] helper 後に state.started===false → startTournament guard をすり抜ける前提');
}

// case4: helper 後に removePlayer 禁止判定が解除される前提
//        (state.pairings=空 → 一次禁止解除 / state.results=空 → pastMatches=0)
{
  var h = makeHarness();
  h.run();
  assert(h.state.pairings.A.length === 0,
    '[case4] state.pairings.A=空 → removePlayer 一次禁止が自然解除される前提');
  assert(h.state.results.A.length === 0,
    '[case4] state.results.A=空 → removePlayer 二次禁止 pastMatches 集計が 0 になる前提');
  assert(h.state.started === false,
    '[case4] state.started=false → removePlayer 二次禁止条件 (state.started && pastMatches>0) も解除');
  // 参加者は残るため、削除対象の参加者 ID が引き続き存在
  assert(h.state.players.A.length === 2,
    '[case4] 参加者一覧が残っているため削除対象が存在する');
}

// case5: resetAll() の既存挙動と helper が別物 (mock で resetAll 相当も実行)
{
  // 設計 doc §10.2: resetAll() の仕様変更は IMPL-LIGHT スコープ外。
  // ここでは resetAll() 相当の処理を mock し、players も消えることを確認する
  // (実装側の resetAll() を呼ぶわけではないが、helper と分離されていることを示す)
  var h = makeHarness();
  // 部分リセット
  h.run();
  assert(h.state.players.A.length === 2,
    '[case5] 部分リセット後: state.players は残る');
  // 仮の全リセット（mock）
  h.state = {players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false, report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}};
  assert(h.state.players.A.length === 0,
    '[case5] 全リセット相当（resetAll 同等）後: state.players は消える');
}

// case6: tournament_id 維持
{
  var h = makeHarness();
  var before = h.state.tournament_id;
  h.run();
  assert(h.state.tournament_id === before,
    '[case6] reset 前後で tournament_id が同じ (PR #113 §6.1 / §9.4 T-1)');
}

// case7: state.rounds 維持
{
  var h = makeHarness();
  var before = h.state.rounds;
  h.run();
  assert(h.state.rounds === before,
    '[case7] reset 前後で state.rounds が同じ (PR #113 §6.3 R2)');
}

// case8: state.report 維持
{
  var h = makeHarness();
  var before = JSON.stringify(h.state.report);
  h.run();
  assert(JSON.stringify(h.state.report) === before,
    '[case8] reset 前後で state.report が同じ (PR #113 §6.4 R2)');
}

// case9: _pendingNewYomi / _yomiAutoBuffer / _yomiManuallyEdited 維持
{
  var h = makeHarness();
  var b1 = h.pendingNewYomi, b2 = h.yomiAutoBuffer, b3 = h.yomiManuallyEdited;
  h.run();
  assert(h.pendingNewYomi === b1,
    '[case9] reset 前後で _pendingNewYomi 参照が不変 (PR #113 §6.5 R2)');
  assert(h.yomiAutoBuffer === b2,
    '[case9] reset 前後で _yomiAutoBuffer 参照が不変');
  assert(h.yomiManuallyEdited === b3,
    '[case9] reset 前後で _yomiManuallyEdited 参照が不変');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  RESET-UX-PARTIAL-RESET-IMPL-LIGHT テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
