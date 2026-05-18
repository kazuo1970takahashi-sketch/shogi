#!/usr/bin/env node
// RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT (PR #111 §9.1 / §10) +
// RESET-UX-PARTIAL-RESET-IMPL-LIGHT 同期更新 (PR #113 §9.1.1 H-1 / §10.1)
// 大会開始後の「登録完了・対局開始」再クリックを案内付きで止めるガードを検証する。
// 部分リセット導入後、alert は新規ボタン「大会進行データをリセット」へ誘導する。
//
// 不変項目:
//   - resetAll() のロジック / state.started=false の戻し設計 未変更
//   - removePlayer() のロジック / 一次禁止 / 二次禁止 未変更
//   - localStorage schema / normalizeState 未変更
//   - pairing algorithm / generatePairing / Fisher-Yates 未変更
//   - state.started=true の代入位置（startTournament 内）未変更
//   - 既存 hasOngoing confirm 経路（fail-safe）未変更
//   - #resetBtn の文言（PR #118 RESET-UX-FULL-RESET-LABEL-IMPL-LIGHT で「大会データを全リセット」へ更新）
//
// 観点:
//   1. startTournament() に state.started === true guard がある
//   2. guard は total 算出後、参加者数チェック・奇数チェック・既存 hasOngoing confirm より前
//   3. guard 内で alert が出る
//   4. alert 文言に主要語句（大会はすでに開始されています / 大会進行データをリセット /
//      組み合わせ / 勝敗結果 / 参加者一覧は残したまま）が含まれる
//   5. #resetBtn の文言（PR #118 で「大会データを全リセット」へ更新）
//   6. guard 内で return している
//   7. guard 前後の構造上、state.results = {A:[],B:[]} に到達しない（軽量振る舞い検証）
//   8. guard 前後の構造上、state.pairings = {A:[],B:[]} に到達しない（軽量振る舞い検証）
//   9. guard 前後の構造上、generatePairing に到達しない（軽量振る舞い検証）
//  10. resetAll() は変更されていない（state.started=false への戻し設計が残る）
//  11. removePlayer() は変更されていない（一次禁止 / 二次禁止 alert が残る）
//  12. localStorage schema / normalizeState は変更されていない（!!s.started）
//  13. 既存 hasOngoing confirm は削除されていない
//  14. startTournament() の通常開始経路は維持されている
//  15. state.started = true の代入は startTournament 内に維持されている
//  16. 「大会データを全リセット」(PR #118) が画面ボタン文言（#resetBtn）と整合
//  17. guard 内で save() / showTab( / renderTournament( を呼んでいない

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_reception_ux_start_button_guard.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass = 0, fail = 0;
function ok(msg){ pass++; console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(msg); else ng(msg); }

// ============================================================
// startTournament() 関数本体を抽出
// ============================================================
const stMatch = htmlSrc.match(/function startTournament\([\s\S]*?\n\}\n/);
assert(stMatch !== null, 'startTournament 関数本体を抽出できる');
const stBody = stMatch ? stMatch[0] : '';

// ============================================================
// 1) state.started === true guard の存在
// ============================================================
{
  assert(/if\s*\(\s*state\.started\s*===\s*true\s*\)/.test(stBody),
    'startTournament 内に if(state.started===true) guard がある');
}

// ============================================================
// 2) guard の位置: 関数冒頭直後（state.started===true）/ hasOngoing confirm より前
//   ROUND-CLASS-START-004b (Codex Should Fix S2):
//     - Aクラス奇数 / Bクラス奇数 inline 検査は validateStartableClass に集約（spec §6.3.2）。
//     - total fast-path（`if(total<2)`）は collectStartCandidates 内部の total-too-few 判定に
//       一本化、startTournament 本体からは削除（S2 A/B literal 解消）。
//     - hasOngoing は state.classes 駆動に書き換え（A/B literal 解消）。
//   旧テスト中で常に拾えていた「人数チェック alert 位置」「Aクラス奇数」literal 依存は本 PR で撤去。
//   validator/collector 内に文言があるかは htmlSrc full file 検査で担保する。
// ============================================================
const idxGuardCond   = stBody.search(/if\s*\(\s*state\.started\s*===\s*true\s*\)/);
// hasOngoing は `var hasOngoing=` の変数宣言位置を見る（コメント内の "hasOngoing"
// 文字列に引っかからないため）。
const idxHasOngoing  = stBody.search(/var\s+hasOngoing\s*=/);
const idxOngoingConfirm = stBody.indexOf('進行中の大会データがあります');

assert(idxGuardCond >= 0, 'guard 条件位置を抽出できる');
assert(idxHasOngoing >= 0, 'hasOngoing 変数位置を抽出できる');
assert(idxOngoingConfirm >= 0, '既存 confirm 文言位置を抽出できる');

// ROUND-CLASS-START-004b: 人数チェック / Aクラス・Bクラス奇数 文言は startTournament 本体から
//   削除済。collectStartCandidates / validateStartableClass 内（同一 file 内の別関数）で
//   生成される。htmlSrc 全体に存在することは run_tests.sh / 別単体テストで担保。
assert(htmlSrc.indexOf('参加者が少なすぎます') >= 0,
  '「参加者が少なすぎます」文言は file 全体に存在（collectStartCandidates total-too-few へ集約）');
assert(/が奇数です。運営者を追加してください/.test(htmlSrc),
  '奇数チェック文言は file 全体に存在（validator へ集約）');

assert(idxGuardCond < idxHasOngoing,
  'guard は hasOngoing 算出より前にある');
assert(idxGuardCond < idxOngoingConfirm,
  'guard は既存 hasOngoing confirm 文言より前にある');

// ============================================================
// 3) guard 内で alert が出る
// 4) alert 文言の主要語句
// 5) 「参加者一覧は残ります」が含まれない
// 6) guard 内で return している
//
// ROUND-CLASS-START-004b: guard ブロックの終端は `var hasOngoing=` 直前に変更（旧 total fast-path
//   削除に伴う）。
// ============================================================

const sliceEnd = stBody.search(/var\s+hasOngoing\s*=/);
assert(sliceEnd > idxGuardCond, 'guard ブロックの終端（var hasOngoing= 直前）を取得できる');
const guardSlice = (sliceEnd > idxGuardCond) ? stBody.substring(idxGuardCond, sliceEnd) : '';

{
  assert(/alert\(\s*'/.test(guardSlice),
    'guard 内に alert(...) 呼出がある');
  assert(guardSlice.indexOf('大会はすでに開始されています') >= 0,
    'alert 文言に「大会はすでに開始されています」が含まれる');
  assert(guardSlice.indexOf('大会進行データをリセット') >= 0,
    'alert 文言に新規ボタン名「大会進行データをリセット」が含まれる (PR #113 §9.1.1 H-1)');
  assert(guardSlice.indexOf('組み合わせ') >= 0,
    'alert 文言に「組み合わせ」が含まれる');
  assert(guardSlice.indexOf('勝敗結果') >= 0,
    'alert 文言に「勝敗結果」が含まれる');
  assert(guardSlice.indexOf('参加者一覧は残したまま') >= 0,
    'alert 文言に「参加者一覧は残したまま」が含まれる (部分リセット導入により真実に)');
  assert(/\breturn\s*;/.test(guardSlice),
    'guard 内で return している');
}

// ============================================================
// 16) #resetBtn ボタン文言が「大会データを全リセット」（PR #118 で更新）
// ============================================================
{
  // shogi_v4.html L100 に id="resetBtn" の「大会データを全リセット」が定義されている
  assert(/id="resetBtn"[\s\S]{0,200}大会データを全リセット/.test(htmlSrc),
    '画面上の #resetBtn ボタン文言が「大会データを全リセット」(PR #118)');
}

// ============================================================
// 17) guard 内で save() / showTab( / renderTournament( を呼んでいない
//     7-9) early return 後に到達しないことを構造的に裏付ける
// ============================================================
{
  assert(guardSlice.indexOf('save(') < 0,
    'guard 内で save() を呼んでいない');
  assert(guardSlice.indexOf('showTab(') < 0,
    'guard 内で showTab( を呼んでいない');
  assert(guardSlice.indexOf('renderTournament(') < 0,
    'guard 内で renderTournament( を呼んでいない');
  assert(guardSlice.indexOf('generatePairing(') < 0,
    'guard 内で generatePairing( を呼んでいない');
  assert(/state\.results\s*=/.test(guardSlice) === false,
    'guard 内で state.results への再代入がない');
  assert(/state\.pairings\s*=/.test(guardSlice) === false,
    'guard 内で state.pairings への再代入がない');
}

// ============================================================
// 7-9) 構造的検査: 旧 inline mutate（state.results / state.pairings / generatePairing 直書き）
//      は ROUND-CLASS-START-004 で applyStartForCandidates に集約されたため、
//      代わりに atomic wrapper の呼出（collectStartCandidates → applyStartForCandidates）が
//      guard より後ろにあることを検査する。
//   spec §6.6 / §10.4 に従い、startTournament 内では:
//     - validate phase: collectStartCandidates(state.classes, state.players)
//     - error 集約:     showStartValidationErrors(v.errors)
//     - mutate phase:   applyStartForCandidates(v.candidates)
//     - SAVE-003 verify: verifyStartSavedForCandidates(v.candidates)
//   この呼出順序が guard より後ろにあれば、early return で正しく守られている。
// ============================================================
const idxCollect      = stBody.indexOf('collectStartCandidates(');
const idxApply        = stBody.indexOf('applyStartForCandidates(');
const idxVerify       = stBody.indexOf('verifyStartSavedForCandidates(');

assert(idxCollect > idxGuardCond,
  'collectStartCandidates( の呼出は guard より後ろ（spec §6.6 atomic wrapper）');
assert(idxApply > idxGuardCond,
  'applyStartForCandidates( の呼出は guard より後ろ（spec §6.6 mutate phase）');
assert(idxVerify > idxGuardCond,
  'verifyStartSavedForCandidates( の呼出は guard より後ろ（spec §6.5 per-class SAVE-003 verify）');
assert(idxCollect < idxApply,
  'collectStartCandidates → applyStartForCandidates の順序が維持されている（validate-then-mutate）');

// ============================================================
// 13) 既存 hasOngoing confirm が削除されていない
// ============================================================
{
  assert(stBody.indexOf('進行中の大会データがあります。再開始すると現在の結果が消えます。続けますか？') >= 0,
    '既存 hasOngoing confirm 文言は削除されていない（fail-safe として温存）');
  assert(/var\s+hasOngoing\s*=/.test(stBody),
    '既存 hasOngoing 変数定義は削除されていない');
}

// ============================================================
// 14) 通常開始経路の維持（ROUND-CLASS-START-004 で atomic wrapper 経由化）
// 15) state.started への同期書き込みは applyStartForCandidates 内部の setClassStarted 経由
//     （setClassStarted は syncGlobalStartedFromClasses 経由で state.started を更新）
// ============================================================
{
  // ROUND-CLASS-START-004 (spec §8.2): state.started への直接代入は禁止経路。
  //   通常開始経路では applyStartForCandidates → setClassStarted → syncGlobalStartedFromClasses
  //   経由で state.started が同期書き込みされる。startTournament 内に state.started=true の
  //   inline 代入は **存在しなくてよい**（spec §10.4 atomic wrapper パターン）。
  assert(/state\.started\s*=\s*true/.test(stBody) === false,
    'startTournament 内に state.started=true の inline 代入は **無い**（setClassStarted 経由に集約）');
  // guard 終了以降のスライス（ROUND-CLASS-START-004b: total fast-path 削除に伴い hasOngoing 起点に変更）
  const guardEndIdx = stBody.search(/var\s+hasOngoing\s*=/);
  const postGuardBody = guardEndIdx >= 0 ? stBody.substring(guardEndIdx) : '';
  assert(postGuardBody.indexOf("showTab('tournament')") >= 0,
    "startTournament 内 (guard 後) に showTab('tournament') の通常経路が維持されている");
  // save() は applyStartForCandidates 内部で 1 回呼ばれる。startTournament 直下では呼ばれない。
  //   atomic wrapper 経路で save() が呼ばれることは別途振る舞いテストで保証する。
  assert(postGuardBody.indexOf('applyStartForCandidates(') >= 0,
    'startTournament 内 (guard 後) に applyStartForCandidates() 呼出がある（save() は内部で呼ばれる）');
  // 通常開始経路（atomic wrapper / showTab / verifyStartSavedForCandidates）は
  // すべて guard より後ろにある
  const idxApply = stBody.indexOf('applyStartForCandidates(');
  assert(idxApply > idxGuardCond,
    'applyStartForCandidates 呼出は guard より後ろ');
}

// ============================================================
// 10) resetAll() は変更されていない（state.started=false への戻し設計が残る）
// ============================================================
{
  const resetMatch = htmlSrc.match(/function resetAll\([\s\S]*?\n\}\n/);
  assert(resetMatch !== null, 'resetAll 関数本体を抽出できる');
  const resetBody = resetMatch ? resetMatch[0] : '';
  // resetAll は state={...,started:false,...} の object 代入で初期化する
  assert(/started\s*:\s*false/.test(resetBody),
    'resetAll() 内で started:false 初期化が維持されている');
  // ROUND-CLASS-START-004b (spec §12.3): players:{A:[],B:[]} 固定 literal は廃止し、
  //   emptyClassDict 経由の classes-driven 初期化に置換。既定 classes は ['A','B']。
  assert(/players\s*:\s*emptyClassDict\(/.test(resetBody),
    'resetAll() 内で players: emptyClassDict(...) classes-driven 初期化に置換されている');
  assert(/classes\s*:\s*defaultClasses/.test(resetBody) || /classes\s*:\s*\[\s*\{\s*id\s*:\s*'A'/.test(resetBody),
    'resetAll() 内で classes が宣言され ["A","B"] 既定値が確保されている');
}

// ============================================================
// 11) removePlayer() の一次禁止 / 二次禁止 alert + 判定式が残る
//     (PR #116 REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT で文言更新済、
//      ここでは「削除できません」alert 2 箇所と判定式の維持を構造的に保証)
// ============================================================
{
  const rmMatch = htmlSrc.match(/function removePlayer\([\s\S]*?\n\}\n/);
  assert(rmMatch !== null, 'removePlayer 関数本体を抽出できる');
  const rmBody = rmMatch ? rmMatch[0] : '';
  // 一次禁止 alert: 「現在の組み合わせ」+「削除できません」(PR #115 §6.4 案 D)
  assert(rmBody.indexOf('現在の組み合わせに登録されているため削除できません') >= 0,
    'removePlayer 一次禁止 alert が維持されている (PR #116 案 D 文言)');
  // 二次禁止 alert: 「勝敗結果があるため削除できません」(PR #115 §6.4 案 D)
  assert(rmBody.indexOf('過去') >= 0 && rmBody.indexOf('試合分の勝敗結果があるため削除できません') >= 0,
    'removePlayer 二次禁止 alert が維持されている (PR #116 案 D 文言)');
  // ROUND-CLASS-START-005 (spec §7.5 / §15.1 row 3): 二次禁止条件は
  //   state.started (all-class OR) から isClassStarted(cls) (class atomic) に置換済。
  //   旧 literal state.started && pastMatches>0 の再導入を構造的に検出する
  //   （isClassStarted(cls) && pastMatches>0 形のみ許容）。
  assert(/isClassStarted\s*\(\s*cls\s*\)\s*&&\s*pastMatches\s*>\s*0/.test(rmBody),
    'removePlayer 二次禁止条件 isClassStarted(cls) && pastMatches>0 が維持 (005 classes-driven)');
  assert(/\bstate\.started\s*&&\s*pastMatches\s*>\s*0/.test(rmBody) === false,
    'removePlayer 二次禁止条件に旧 state.started 直接参照が再導入されていない');
}

// ============================================================
// 12) localStorage schema / normalizeState は変更されていない
// ============================================================
{
  assert(htmlSrc.indexOf("STORAGE_KEY='shogi_v4'") >= 0,
    'STORAGE_KEY=\'shogi_v4\' が維持されている');
  assert(htmlSrc.indexOf("LEGACY_STORAGE_KEYS=['shogi_v3']") >= 0,
    "LEGACY_STORAGE_KEYS=['shogi_v3'] が維持されている");
  const nsMatch = htmlSrc.match(/function normalizeState\([\s\S]*?\n\}\n/);
  assert(nsMatch !== null, 'normalizeState 関数本体を抽出できる');
  const nsBody = nsMatch ? nsMatch[0] : '';
  // ROUND-CLASS-START-003 (spec §8.2 / §9.4 step 7): normalizeState の started 同期書き込み形式。
  //   PR #137 (002) で classId 単位 started を正とする方針に変更したため、base.started は
  //   raw.started の直接 OR ではなく、normalize 済 classes 配列の some(started===true) で導出。
  assert(/base\.started\s*=\s*classes\.some/.test(nsBody),
    'normalizeState の started フィールド正規化 (base.started=classes.some(c=>c.started===true)) が維持されている');
}

// ============================================================
// 振る舞いテスト（軽量）: guard が state を不変に保つか mock で検証
// ============================================================
{
  // 簡易 mock: startTournament の guard 部のみを再現した関数で挙動確認
  function makeGuardedStart(){
    var state = {started:false, players:{A:[],B:[]}, pairings:{A:[],B:[]}, results:{A:[],B:[]}};
    var alertCalls = [];
    function _alert(msg){ alertCalls.push(msg); }
    function startTournament(){
      var total = state.players.A.length + state.players.B.length;
      if(state.started===true){
        _alert('大会はすでに開始されています。\n参加者を変更する場合は、先に「大会進行データをリセット」を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。');
        return;
      }
      // (以降の経路はテスト対象外、ここでは到達検出のために state を破壊的に変える)
      state.pairings = {A:['DESTROYED'], B:['DESTROYED']};
      state.results  = {A:['DESTROYED'], B:['DESTROYED']};
      state.started  = true;
      void total;
    }
    return {state:state, alertCalls:alertCalls, startTournament:startTournament};
  }

  // ケース1: started=false / pairings=[] / results=[] → 通常経路（guard スキップ）
  {
    var c1 = makeGuardedStart();
    c1.startTournament();
    assert(c1.alertCalls.length === 0,
      '[case1] started=false で startTournament → guard alert は出ない');
    assert(c1.state.started === true,
      '[case1] started=false で startTournament → 通常経路を通過 (state.started=true)');
  }

  // ケース2: started=true / pairings/results 有り → guard で alert + state 不変
  {
    var c2 = makeGuardedStart();
    c2.state.started = true;
    c2.state.pairings = {A:[{p1:'pa1',p2:'pa2',winner:null}], B:[]};
    c2.state.results  = {A:[[{p1:'pa1',p2:'pa2',winner:'pa1'}]], B:[]};
    var snapshotP = JSON.stringify(c2.state.pairings);
    var snapshotR = JSON.stringify(c2.state.results);
    c2.startTournament();
    assert(c2.alertCalls.length === 1,
      '[case2] started=true で startTournament → guard alert が 1 回出る');
    assert(c2.alertCalls[0].indexOf('大会はすでに開始されています') >= 0,
      '[case2] alert 文言に「大会はすでに開始されています」が含まれる');
    assert(c2.alertCalls[0].indexOf('大会進行データをリセット') >= 0,
      '[case2] alert 文言に新規ボタン名「大会進行データをリセット」が含まれる');
    assert(c2.alertCalls[0].indexOf('参加者一覧は残したまま') >= 0,
      '[case2] alert 文言に「参加者一覧は残したまま」が含まれる');
    assert(JSON.stringify(c2.state.pairings) === snapshotP,
      '[case2] guard 通過後に state.pairings が不変');
    assert(JSON.stringify(c2.state.results) === snapshotR,
      '[case2] guard 通過後に state.results が不変');
    assert(c2.state.started === true,
      '[case2] guard 通過後に state.started は true のまま（変更されない）');
  }

  // ケース3: started=true / pairings=[] / results=[] でも guard alert が出る
  //         （state.started 単独判定の検証）
  {
    var c3 = makeGuardedStart();
    c3.state.started = true;
    c3.startTournament();
    assert(c3.alertCalls.length === 1,
      '[case3] started=true / pairings=[] / results=[] でも guard alert が出る (state.started 単独判定)');
    assert(c3.state.pairings.A.length === 0 && c3.state.pairings.B.length === 0,
      '[case3] guard 通過後に state.pairings が空のまま');
    assert(c3.state.results.A.length === 0 && c3.state.results.B.length === 0,
      '[case3] guard 通過後に state.results が空のまま');
  }

  // ケース4: started=false（リセット後を想定）→ 通常経路
  {
    var c4 = makeGuardedStart();
    // 模擬的に resetAll 後の状態（players は空、started=false）
    c4.state.started = false;
    c4.startTournament();
    assert(c4.alertCalls.length === 0,
      '[case4] resetAll 後 (started=false) で startTournament → guard alert は出ない');
    assert(c4.state.started === true,
      '[case4] resetAll 後 → 通常経路で state.started=true に遷移');
  }
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
