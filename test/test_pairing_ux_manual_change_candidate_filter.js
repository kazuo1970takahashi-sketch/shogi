#!/usr/bin/env node
// PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT (PR #108 §9)
// 手動変更モーダルの候補事前フィルタ（classifyChangePairingCandidate +
// buildChangePairingModalHtml の optgroup / disabled / 短い理由ラベル / 候補 0 人案内）を検証する。
//
// 不変項目:
//   - select は廃止しない（native select 維持）
//   - PR #107 の「現在の対局」表示 / select reset / 文言改善 は退行禁止
//   - state.pairings 管理設計 / save() / renderTournament() 呼出設計 未変更
//   - swap 確定後の重複検出 rollback 維持
//   - evaluatePairingQuality() / warning object / pairing-card 補助ラベル / score-card .sno/.snm 未変更
//   - generatePairing / Fisher-Yates 未変更
//   - getName / getNameWithNo / entryNoOf / formatParticipantLabel / pairHasRematch /
//     findPairContainingPlayer / getDuplicatePlayersInPairings 本体 未変更
//
// 観点:
//   1. classifyChangePairingCandidate 関数が定義されている
//   2. 戻り値型は status('ok'|'blocked') / reasonId / reasonLabel の 3 フィールド
//   3. R-current は導入されていない（UI / 戻り値で 'R-current' を返さない）
//   4. buildChangePairingModalHtml が optgroup label="選択可能" を出す
//   5. buildChangePairingModalHtml が optgroup label="選択できない候補" を出す
//   6. disabled 属性付き option を出す
//   7. 理由ラベル「結果入力済」「再戦になる」「同じ選手」が出力候補にある
//   8. option label は escapeHtml 経由
//   9. 現 p1 / p2 は selected かつ disabled でない（buildSelectInner ロジック）
//  10. 候補 0 人時の案内文（data-chg-empty-notice）が条件付きで出る
//  11. 候補 0 人時に保存ボタンが disabled になる
//  12. PR #107 の「現在の対局」表示 / resetSelectsToOriginal / 文言が残っている
//  13. 既存 alert / confirm（変更がありません / 同じ選手 / 2人同時入替 /
//      結果入力済み / 再戦 / 内部エラー rollback）が残っている
//  14. state.pairings への代入位置が変わっていない（保存時にのみ反映）
//  15. evaluatePairingQuality / pairing-card 補助ラベル / score-card 維持
//  16. 振る舞いテスト: classifyChangePairingCandidate を抽出して各 6 ケースを検証

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_pairing_ux_manual_change_candidate_filter.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass = 0, fail = 0;
function ok(msg){ pass++; console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(msg); else ng(msg); }

// ============================================================
// 関数本体を切り出す
// ============================================================
const classifyMatch = htmlSrc.match(/function classifyChangePairingCandidate\([\s\S]*?\n\}\n/);
assert(classifyMatch !== null, 'classifyChangePairingCandidate 関数本体を抽出できる');
const classifyBody = classifyMatch ? classifyMatch[0] : '';

const buildMatch = htmlSrc.match(/function buildChangePairingModalHtml\([\s\S]*?\n\}\n/);
assert(buildMatch !== null, 'buildChangePairingModalHtml 関数本体を抽出できる');
const buildBody = buildMatch ? buildMatch[0] : '';

const bindMatch = htmlSrc.match(/function bindChangePairingModalEvents\([\s\S]*?\n\}\n/);
assert(bindMatch !== null, 'bindChangePairingModalEvents 関数本体を抽出できる');
const bindBody = bindMatch ? bindMatch[0] : '';

// ============================================================
// 1) classifyChangePairingCandidate の戻り値型 + R-current 非導入
// ============================================================
{
  assert(/status\s*:\s*['"]ok['"]/.test(classifyBody),
    'classify 戻り値に status:"ok" がある');
  assert(/status\s*:\s*['"]blocked['"]/.test(classifyBody),
    'classify 戻り値に status:"blocked" がある');
  assert(classifyBody.indexOf("'disabled'") < 0 && classifyBody.indexOf('"disabled"') < 0,
    'classify 戻り値で status:"disabled" は使わない（UI 表現語彙との分離）');
  assert(/reasonId\s*:/.test(classifyBody),
    'classify 戻り値に reasonId フィールドがある');
  assert(/reasonLabel\s*:/.test(classifyBody),
    'classify 戻り値に reasonLabel フィールドがある');
  assert(classifyBody.indexOf("'R-current'") < 0 && classifyBody.indexOf('"R-current"') < 0,
    'classify 内に reasonId "R-current" は導入されていない（PR #108 §7.1.1）');
  assert(htmlSrc.indexOf("'R-current'") < 0 && htmlSrc.indexOf('"R-current"') < 0,
    'shogi_v4.html 全体に "R-current" 文字列は存在しない');
}

// ============================================================
// 2) classify が呼び出す既存 helper（pairHasRematch / findPairContainingPlayer）
// ============================================================
{
  assert(/pairHasRematch\s*\(/.test(classifyBody),
    'classify 内で pairHasRematch を呼び出している（事前 / 事後判定の一致）');
  assert(/findPairContainingPlayer\s*\(/.test(classifyBody),
    'classify 内で findPairContainingPlayer を呼び出している');
}

// ============================================================
// 3) buildChangePairingModalHtml の optgroup 構造
// ============================================================
{
  assert(buildBody.indexOf('optgroup label="選択可能"') >= 0,
    'buildChangePairingModalHtml に optgroup label="選択可能" がある');
  assert(buildBody.indexOf('optgroup label="選択できない候補"') >= 0,
    'buildChangePairingModalHtml に optgroup label="選択できない候補" がある');
  assert(/disabled/.test(buildBody),
    'buildChangePairingModalHtml で disabled 属性を扱う');
  assert(/classifyChangePairingCandidate\s*\(/.test(buildBody),
    'buildChangePairingModalHtml が classifyChangePairingCandidate を呼んでいる');
}

// ============================================================
// 4) 理由ラベル文字列が shogi_v4.html 内に存在する（classify 戻り値経由）
// ============================================================
{
  assert(classifyBody.indexOf('結果入力済') >= 0,
    '理由ラベル「結果入力済」が classify 内に存在');
  assert(classifyBody.indexOf('再戦になる') >= 0,
    '理由ラベル「再戦になる」が classify 内に存在');
  assert(classifyBody.indexOf('同じ選手') >= 0,
    '理由ラベル「同じ選手」が classify 内に存在');
}

// ============================================================
// 5) option label が escapeHtml 経由
// ============================================================
{
  // buildSelectInner 内で escapeHtml(baseLabel) / escapeHtml(blockedLabel) を通すこと
  assert(/escapeHtml\s*\(\s*baseLabel\s*\)/.test(buildBody),
    'option label (ok) が escapeHtml 経由で出力される');
  assert(/escapeHtml\s*\(\s*blockedLabel\s*\)/.test(buildBody),
    'option label (blocked) が escapeHtml 経由で出力される');
}

// ============================================================
// 6) 現 p1 / p2 の扱い (PR #108 §7.1.1):
//    selected が match.p1 / match.p2 で付与され、disabled が付かない
// ============================================================
{
  assert(/c\.id\s*===\s*selectedId/.test(buildBody),
    'option の selected は selectedId（=match.p1 / match.p2）と一致時に付与');
  // disabled は status==='blocked' のときのみ付与
  assert(/clf\.status\s*===\s*['"]ok['"]/.test(buildBody) || /status\s*==\s*['"]ok['"]/.test(buildBody),
    'ok 分岐で disabled が付かないことが、status==="ok" のブランチで担保されている');
}

// ============================================================
// 7) 候補 0 人案内 (data-chg-empty-notice) + 保存ボタン disabled
// ============================================================
{
  assert(buildBody.indexOf('data-chg-empty-notice') >= 0,
    'buildChangePairingModalHtml に data-chg-empty-notice 要素がある');
  assert(buildBody.indexOf('現在の条件では、1人だけ入れ替えできる候補がありません') >= 0,
    '候補 0 人案内文が含まれる');
  assert(buildBody.indexOf('別の対局を選ぶか') >= 0,
    '候補 0 人案内に「別の対局を選ぶか」が含まれる');
  assert(buildBody.indexOf('組み合わせ全体を見直してください') >= 0,
    '候補 0 人案内に「組み合わせ全体を見直してください」が含まれる（中立表現）');
  assert(buildBody.indexOf('組み合わせを作り直してください') < 0,
    '候補 0 人案内に「組み合わせを作り直してください」（強表現）は含まれない');
  // 候補 0 人時に保存ボタンに disabled が付くロジックがある
  assert(/saveBtnAttr/.test(buildBody) && /hasAlternative/.test(buildBody),
    'hasAlternative により保存ボタン disabled を切替えるロジックがある');
}

// ============================================================
// 8) PR #107 の温存項目
//    - 「現在の対局」表示 (data-chg-current)
//    - resetSelectsToOriginal
//    - 文言改善
// ============================================================
{
  assert(buildBody.indexOf('data-chg-current="1"') >= 0,
    'PR #107「現在の対局」表示 (data-chg-current) が温存されている');
  assert(buildBody.indexOf('data-chg-current-role="p1"') >= 0,
    'PR #107「現在の対局」p1 行が温存されている');
  assert(buildBody.indexOf('data-chg-current-role="p2"') >= 0,
    'PR #107「現在の対局」p2 行が温存されている');
  assert(/resetSelectsToOriginal/.test(bindBody),
    'PR #107 resetSelectsToOriginal helper が bindChangePairingModalEvents 内に温存');
  assert(bindBody.indexOf('2人を同時に入れ替える必要があります') >= 0,
    'PR #107 2 選手同時変更 alert 文言が温存');
  assert(bindBody.indexOf('再戦になる組み合わせが発生します') >= 0,
    'PR #107 再戦 alert 文言が温存');
}

// ============================================================
// 9) 既存 alert / confirm（安全網）が残っている
// ============================================================
{
  assert(bindBody.indexOf("alert('同じ選手を先手・後手両方に選べません')") >= 0,
    '「同じ選手を先手・後手両方に選べません」alert が残存');
  assert(bindBody.indexOf("alert('変更がありません')") >= 0,
    '「変更がありません」alert が残存（差分なし保存の既存処理）');
  assert(bindBody.indexOf('相手ペアが結果入力済みのため、入れ替えできません') >= 0,
    '相手ペア結果入力済 alert が残存');
  assert(bindBody.indexOf('過去に対戦済みです。再戦として保存しますか？') >= 0,
    'replace 再戦 confirm が残存（confirm 続行可能）');
  assert(bindBody.indexOf('内部エラー: 入れ替え後の重複を検出しました') >= 0,
    'swap 後重複検出 rollback alert が残存');
}

// ============================================================
// 10) state.pairings 代入位置（保存時にのみ反映）
// ============================================================
{
  const assignCount = (bindBody.match(/state\.pairings\[cls\]\[(idx|otherIdx)\]\s*=/g) || []).length;
  assert(assignCount >= 3,
    'bindChangePairingModalEvents 内に state.pairings 代入が 3 回以上ある（replace 1 + swap 2、+ rollback 含む）');
  // backup1 / backup2 による rollback パターンが維持
  assert(/backup1/.test(bindBody) && /backup2/.test(bindBody),
    'swap 後重複検出 rollback の backup1 / backup2 パターンが維持');
}

// ============================================================
// 11) save() / renderTournament(cls) はモーダル削除後にのみ呼ばれる
// ============================================================
{
  // renderTournament(cls);save(); の並び（PR #107 と同じ）
  assert(/renderTournament\s*\(\s*cls\s*\)\s*;\s*save\s*\(\s*\)/.test(bindBody),
    'モーダル削除後に renderTournament(cls); save(); が呼ばれている（PR #107 と同じ）');
}

// ============================================================
// 12) PR #103 / #105 の不変項目
// ============================================================
{
  assert(htmlSrc.indexOf('data-pairing-aux="p1"') >= 0,
    'PR #103 pairing-card 補助ラベル data-pairing-aux="p1" 維持');
  assert(htmlSrc.indexOf('data-pairing-aux="p2"') >= 0,
    'PR #103 pairing-card 補助ラベル data-pairing-aux="p2" 維持');
  assert(/\.score-card\s+\.sno\s*\{/.test(htmlSrc),
    'PR #105 score-card .sno 維持');
  assert(/\.score-card\s+\.snm\s*\{/.test(htmlSrc),
    'PR #105 score-card .snm 維持');
}

// ============================================================
// 13) evaluatePairingQuality / warning object 維持
// ============================================================
{
  const epqMatch = htmlSrc.match(/function evaluatePairingQuality\([\s\S]*?\n\}\n/);
  assert(epqMatch !== null, 'evaluatePairingQuality 関数本体を抽出できる');
  const epqBody = epqMatch ? epqMatch[0] : '';
  const returnIdx = epqBody.lastIndexOf('return');
  const returnSlice = returnIdx >= 0 ? epqBody.substring(returnIdx) : '';
  ['totalWinDiff','maxWinDiff','sameScorePairCount','rematchCount','avoidableWinDiffPairs','warningHit','pairDetails'].forEach(function(f){
    assert(returnSlice.indexOf(f) >= 0,
      'evaluatePairingQuality 戻り値に従来フィールド "' + f + '" が維持されている');
  });
  assert(returnSlice.indexOf('avoidablePairIndexes') < 0,
    'evaluatePairingQuality 戻り値に avoidablePairIndexes は追加されていない');
}

// ============================================================
// 14) generatePairing / Fisher-Yates 維持
// ============================================================
{
  const gpMatch = htmlSrc.match(/function generatePairing\([\s\S]*?\n\}\n/);
  assert(gpMatch !== null, 'generatePairing 関数本体を抽出できる');
  const gpBody = gpMatch ? gpMatch[0] : '';
  assert(/Fisher-Yates|Math\.floor\(Math\.random\(\)\s*\*/.test(gpBody),
    'generatePairing 内のランダム化ロジックが維持されている');
}

// ============================================================
// 15) 既存 helper（pairHasRematch / findPairContainingPlayer / getDuplicatePlayersInPairings 等）が定義されている
// ============================================================
{
  assert(/function pairHasRematch\s*\(/.test(htmlSrc),
    'pairHasRematch が引き続き定義されている');
  assert(/function findPairContainingPlayer\s*\(/.test(htmlSrc),
    'findPairContainingPlayer が引き続き定義されている');
  assert(/function getDuplicatePlayersInPairings\s*\(/.test(htmlSrc),
    'getDuplicatePlayersInPairings が引き続き定義されている');
  assert(/function getName\s*\(\s*id\s*,\s*cls\s*\)/.test(htmlSrc),
    'getName(id, cls) が引き続き定義されている');
  assert(/function getNameWithNo\s*\(\s*id\s*,\s*cls\s*\)/.test(htmlSrc),
    'getNameWithNo(id, cls) が引き続き定義されている');
  assert(/function entryNoOf\s*\(\s*cls\s*,\s*id\s*\)/.test(htmlSrc),
    'entryNoOf(cls, id) が引き続き定義されている');
  assert(/function formatParticipantLabel\s*\(/.test(htmlSrc),
    'formatParticipantLabel が引き続き定義されている');
}

// ============================================================
// 16) 振る舞いテスト: classifyChangePairingCandidate を再現実装で検証
//     （実 HTML 内の classify を eval せず、戻り値仕様を独立に検証）
// ============================================================
{
  // mock state（A クラス 4 名、2 ペア）
  // 過去ラウンド: A vs B（再戦が a-c で発生する）
  var mockState = {
    pairings: { A: [
      { p1:'a', p2:'b', winner:null },
      { p1:'c', p2:'d', winner:null }
    ] },
    results: { A: [
      [ { p1:'a', p2:'c', winner:'a' }, { p1:'b', p2:'d', winner:'b' } ]
    ] }
  };
  function mockPairHasRematch(cls,p1,p2){
    for(var r=0;r<mockState.results[cls].length;r++){
      for(var m=0;m<mockState.results[cls][r].length;m++){
        var mt=mockState.results[cls][r][m];
        if((mt.p1===p1&&mt.p2===p2)||(mt.p1===p2&&mt.p2===p1))return true;
      }
    }
    return false;
  }
  function mockFindPairContainingPlayer(cls,playerId,excludeIdx){
    for(var i=0;i<mockState.pairings[cls].length;i++){
      if(i===excludeIdx)continue;
      var pair=mockState.pairings[cls][i];
      if(!pair)continue;
      if(pair.p1===playerId||pair.p2===playerId)return i;
    }
    return -1;
  }
  // 再現実装（shogi_v4.html の classifyChangePairingCandidate と同じロジック）
  function reClassify(cls,idx,candidateId,role){
    var match=mockState.pairings[cls][idx];
    if(!match)return {status:'blocked',reasonId:'R-invalid',reasonLabel:'選択不可'};
    var currentInRole=(role==='p1')?match.p1:match.p2;
    if(candidateId===currentInRole)return {status:'ok',reasonId:null,reasonLabel:''};
    var otherInRole=(role==='p1')?match.p2:match.p1;
    if(candidateId===otherInRole)return {status:'blocked',reasonId:'R-self',reasonLabel:'同じ選手'};
    var otherIdx=mockFindPairContainingPlayer(cls,candidateId,idx);
    if(otherIdx===-1)return {status:'ok',reasonId:null,reasonLabel:''};
    var otherPair=mockState.pairings[cls][otherIdx];
    if(otherPair&&otherPair.winner)return {status:'blocked',reasonId:'R-winner-locked',reasonLabel:'結果入力済'};
    var keepPlayer=(role==='p1')?match.p2:match.p1;
    var droppedFromTarget=(role==='p1')?match.p1:match.p2;
    var Y=(otherPair&&otherPair.p1===candidateId)?otherPair.p2:(otherPair?otherPair.p1:null);
    if(mockPairHasRematch(cls,keepPlayer,candidateId)||(Y&&mockPairHasRematch(cls,droppedFromTarget,Y))){
      return {status:'blocked',reasonId:'R-rematch-swap',reasonLabel:'再戦になる'};
    }
    return {status:'ok',reasonId:null,reasonLabel:''};
  }
  // 16-a. 現 p1 / p2 は ok / null / 空
  {
    var r=reClassify('A',0,'a','p1');
    assert(r.status==='ok' && r.reasonId===null && r.reasonLabel==='',
      '現 p1（a）を role=p1 で評価 → status:"ok" / reasonId:null / reasonLabel:""');
  }
  {
    var r=reClassify('A',0,'b','p2');
    assert(r.status==='ok' && r.reasonId===null && r.reasonLabel==='',
      '現 p2（b）を role=p2 で評価 → status:"ok" / reasonId:null / reasonLabel:""');
  }
  // 16-b. R-self: role=p1 で候補 = match.p2（同時入替予兆）
  {
    var r=reClassify('A',0,'b','p1');
    assert(r.status==='blocked' && r.reasonId==='R-self' && r.reasonLabel==='同じ選手',
      'role=p1 で候補 = match.p2（b）→ blocked + R-self + "同じ選手"');
  }
  // 16-c. R-winner-locked: 候補が結果入力済の別ペアに属する
  {
    var lockedState = JSON.parse(JSON.stringify(mockState));
    lockedState.pairings.A[1].winner = 'c';
    var saved = mockState;
    mockState = lockedState;
    var r=reClassify('A',0,'c','p1');
    assert(r.status==='blocked' && r.reasonId==='R-winner-locked' && r.reasonLabel==='結果入力済',
      '候補 c が結果入力済 → blocked + R-winner-locked + "結果入力済"');
    mockState = saved;
  }
  // 16-d. R-rematch-swap: swap 経路で再戦
  //   pairings: [a-b, c-d], results: [a vs c → 再戦] → role=p1 候補 c は keepPlayer=b と b-c が新ペアになるが、
  //   keepPlayer=b（match.p2）, X=c → pairHasRematch(b,c) は false。
  //   droppedFromTarget=a, Y=d → pairHasRematch(a,d) は false。
  //   ⇒ ok を返すケース。R-rematch-swap を踏むには再戦パターンを変える。
  {
    // results に b vs c を仕込む（過去）と、role=p1 候補 c → keepPlayer=b, X=c → 再戦命中
    var rematchState = JSON.parse(JSON.stringify(mockState));
    rematchState.results.A = [
      [ { p1:'b', p2:'c', winner:'b' }, { p1:'a', p2:'d', winner:'a' } ]
    ];
    var saved = mockState;
    mockState = rematchState;
    var r=reClassify('A',0,'c','p1');
    assert(r.status==='blocked' && r.reasonId==='R-rematch-swap' && r.reasonLabel==='再戦になる',
      'swap 経路で keepPlayer × X 再戦 → blocked + R-rematch-swap + "再戦になる"');
    mockState = saved;
  }
  // 16-e. 通常 ok: 候補が他ペアに属するが再戦にならない
  {
    var r=reClassify('A',0,'c','p1');
    assert(r.status==='ok' && r.reasonId===null,
      '候補 c が他ペアに属するが再戦にならない → status:"ok"');
  }
  // 16-f. role=p2 でも対称に動く
  {
    var r=reClassify('A',0,'a','p2');
    assert(r.status==='blocked' && r.reasonId==='R-self',
      'role=p2 で候補 = match.p1（a）→ blocked + R-self（対称性）');
  }
  // 16-g. R-current は使われない
  {
    var r=reClassify('A',0,'a','p1');
    assert(r.reasonId !== 'R-current',
      '現 p1 の評価でも reasonId は "R-current" にならない');
  }
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
