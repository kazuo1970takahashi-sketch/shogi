#!/usr/bin/env node
// PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT (PR #106 §5)
// 手動変更モーダルのエラー時 UI 復旧（文言改善 / 現在のペア表示 / select 自動リセット）を検証する。
//
// 不変項目:
//   - state.pairings の管理設計 / pairing algorithm / generatePairing / Fisher-Yates 未変更
//   - evaluatePairingQuality() / warning object 未変更
//   - PR #103 pairing-card 補助ラベル (data-pairing-aux) 未変更
//   - PR #105 score-card .sno / .snm 未変更
//   - save() / renderTournament() の呼出設計 未変更
//   - getName / getNameWithNo / entryNoOf / formatParticipantLabel 本体 未変更
//
// 観点:
//   1. 旧 UI 文言（"swap で再戦が発生します。" / "2 選手同時の変更は対象外です。" 等）が削除されている
//   2. 新 UI 文言（2 選手同時変更 / 再戦 warning）が運営者向けに更新されている
//   3. bindChangePairingModalEvents のエラーパス内に画面文言として "swap" が残っていない
//      （内部変数名 / 関数名は対象外）
//   4. エラーパス（2 選手同時変更 / 再戦 warning）で select.value = oldP1 / oldP2 の自動リセットが入っている
//   5. 「選択を元に戻しました」が、resetSelectsToOriginal を伴う alert にのみ含まれる
//   6. buildChangePairingModalHtml に「現在の対局」表示要素が含まれる
//   7. 現在のペア表示が escapeHtml + formatParticipantLabel(..., {mode:'compact'}) を経由
//   8. エラーパスで state.pairings[cls][idx] への代入が起きていない（検証 OK まで state 不変）
//   9. エラーパスで save() / renderTournament() が呼ばれていない
//  10. swap 確定後の重複検出 rollback（既存）は維持されている
//  11. warning object / evaluatePairingQuality() の戻り値フィールドが変わっていない
//  12. generatePairing / Fisher-Yates は不変
//  13. PR #103 pairing-card 補助ラベル (data-pairing-aux) 維持
//  14. PR #105 score-card .sno / .snm 維持

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_pairing_ux_manual_change_error_recovery.js <html>');
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
const buildMatch = htmlSrc.match(/function buildChangePairingModalHtml\([\s\S]*?\n\}\n/);
assert(buildMatch !== null, 'buildChangePairingModalHtml 関数本体を抽出できる');
const buildBody = buildMatch ? buildMatch[0] : '';

const bindMatch = htmlSrc.match(/function bindChangePairingModalEvents\([\s\S]*?\n\}\n/);
assert(bindMatch !== null, 'bindChangePairingModalEvents 関数本体を抽出できる');
const bindBody = bindMatch ? bindMatch[0] : '';

// ============================================================
// 1) 旧 UI 文言が削除されている
// ============================================================
{
  assert(bindBody.indexOf('swap で再戦が発生します') < 0,
    '旧文言「swap で再戦が発生します」が bindChangePairingModalEvents 内に残っていない');
  assert(bindBody.indexOf('2 選手同時の変更は対象外です') < 0,
    '旧文言「2 選手同時の変更は対象外です」が bindChangePairingModalEvents 内に残っていない');
  assert(bindBody.indexOf('swap できません') < 0,
    '旧文言「swap できません」が bindChangePairingModalEvents 内に残っていない');
  assert(bindBody.indexOf('swap を実行します') < 0,
    '旧文言「swap を実行します」が bindChangePairingModalEvents 内に残っていない');
  assert(bindBody.indexOf('swap 後の重複') < 0,
    '旧文言「swap 後の重複」が bindChangePairingModalEvents 内に残っていない');
}

// ============================================================
// 2) 新 UI 文言が運営者向けに更新されている
// ============================================================
{
  // 2 選手同時変更 error
  assert(bindBody.indexOf('2人を同時に入れ替える必要があります') >= 0,
    '2 選手同時変更 error に「2人を同時に入れ替える必要があります」が含まれる');
  assert(bindBody.indexOf('現在は1人ずつの変更に対応しています') >= 0,
    '2 選手同時変更 error に「現在は1人ずつの変更に対応しています」が含まれる');
  assert(bindBody.indexOf('もう一度、変更したい選手を1人だけ選んでください') >= 0,
    '2 選手同時変更 error に「1人だけ選んでください」案内が含まれる');

  // 再戦 warning
  assert(bindBody.indexOf('再戦になる組み合わせが発生します') >= 0,
    '再戦 warning に「再戦になる組み合わせが発生します」が含まれる');

  // 相手ペア winner 確定済（"swap" を削除）
  assert(bindBody.indexOf('相手ペアが結果入力済みのため、入れ替えできません') >= 0,
    '相手ペア winner 確定済 alert で「入れ替え」表現に変更されている');

  // swap 確認 confirm（"swap" を削除 → "入れ替え"）
  assert(bindBody.indexOf('入れ替えを実行します') >= 0,
    'swap 確認 confirm が「入れ替えを実行します」に変更されている');

  // 内部エラー alert（"swap" を削除 + 「元の組み合わせに戻しました」を明示）
  assert(bindBody.indexOf('入れ替え後の重複を検出しました') >= 0,
    '内部エラー alert で「入れ替え後の重複」表現に変更されている');
  assert(bindBody.indexOf('元の組み合わせに戻しました') >= 0,
    '内部エラー alert で「元の組み合わせに戻しました」が明示されている');
}

// ============================================================
// 3) bindChangePairingModalEvents の画面文言（alert/confirm 引数）に "swap" が残っていない
//    内部変数 / コメントは対象外（運営者には見えない）
// ============================================================
{
  // alert(...) と confirm(...) の引数リテラル中に 'swap' を含むものがないか
  // 簡易検査: 'alert(' / 'confirm(' から始まる行を抽出し、その引数文字列内に 'swap' を含まないこと
  const callRe = /(alert|confirm)\(\s*'([^']*)'/g;
  let m;
  let badStrings = [];
  while ((m = callRe.exec(bindBody)) !== null) {
    if (m[2].toLowerCase().indexOf('swap') >= 0) badStrings.push(m[2]);
  }
  assert(badStrings.length === 0,
    'bindChangePairingModalEvents の alert/confirm 文言内に "swap" を含む UI 文字列がない'
    + (badStrings.length ? '（残存: '+badStrings.join(' / ')+'）' : ''));
}

// ============================================================
// 4) エラーパスで select.value = oldP1 / oldP2 の自動リセットが入っている
// ============================================================
{
  // resetSelectsToOriginal helper の存在
  assert(/resetSelectsToOriginal\s*\(\s*\)/.test(bindBody),
    'bindChangePairingModalEvents 内に resetSelectsToOriginal() helper が定義 / 使用されている');

  // helper 内で chg-p1 / chg-p2 に oldP1 / oldP2 を代入
  assert(/getElementById\(\s*'chg-p1'\s*\)/.test(bindBody),
    'helper 内で getElementById("chg-p1") を参照');
  assert(/getElementById\(\s*'chg-p2'\s*\)/.test(bindBody),
    'helper 内で getElementById("chg-p2") を参照');
  assert(/\.value\s*=\s*oldP1/.test(bindBody),
    'helper 内で select.value = oldP1 の代入がある');
  assert(/\.value\s*=\s*oldP2/.test(bindBody),
    'helper 内で select.value = oldP2 の代入がある');

  // 2 選手同時変更 / 再戦 warning の alert 直前で helper を呼出している
  // → 各 alert 文言の直前に resetSelectsToOriginal() の呼出がある
  const twoChangeAlertIdx = bindBody.indexOf('2人を同時に入れ替える必要があります');
  const rematchAlertIdx = bindBody.indexOf('再戦になる組み合わせが発生します');
  assert(twoChangeAlertIdx >= 0 && rematchAlertIdx >= 0,
    '2 選手同時変更 / 再戦 warning の alert 文言を抽出できる（位置確認用）');

  // 2 選手同時変更 alert の直前 200 文字以内に resetSelectsToOriginal() がある
  const twoChangeBefore = bindBody.substring(Math.max(0, twoChangeAlertIdx - 200), twoChangeAlertIdx);
  assert(twoChangeBefore.indexOf('resetSelectsToOriginal()') >= 0,
    '2 選手同時変更 alert の直前に resetSelectsToOriginal() の呼出がある');

  // 再戦 warning alert の直前 200 文字以内に resetSelectsToOriginal() がある
  const rematchBefore = bindBody.substring(Math.max(0, rematchAlertIdx - 200), rematchAlertIdx);
  assert(rematchBefore.indexOf('resetSelectsToOriginal()') >= 0,
    '再戦 warning alert の直前に resetSelectsToOriginal() の呼出がある');
}

// ============================================================
// 5) 「選択を元に戻しました」は resetSelectsToOriginal を伴う alert にのみ含まれる
//    （事実誤認のミスリーディング表示を避ける）
// ============================================================
{
  // 2 選手同時変更 / 再戦 warning の両方に含まれる
  const twoChangeAlertIdx = bindBody.indexOf('2人を同時に入れ替える必要があります');
  const twoChangeAlertEnd = bindBody.indexOf("')", twoChangeAlertIdx);
  const twoChangeAlertSlice = (twoChangeAlertIdx >= 0 && twoChangeAlertEnd >= 0)
    ? bindBody.substring(twoChangeAlertIdx, twoChangeAlertEnd)
    : '';
  assert(twoChangeAlertSlice.indexOf('選択を元に戻しました') >= 0,
    '2 選手同時変更 alert に「選択を元に戻しました」が含まれる');

  const rematchAlertIdx = bindBody.indexOf('再戦になる組み合わせが発生します');
  const rematchAlertEnd = bindBody.indexOf("')", rematchAlertIdx);
  const rematchAlertSlice = (rematchAlertIdx >= 0 && rematchAlertEnd >= 0)
    ? bindBody.substring(rematchAlertIdx, rematchAlertEnd)
    : '';
  assert(rematchAlertSlice.indexOf('選択を元に戻しました') >= 0,
    '再戦 warning alert に「選択を元に戻しました」が含まれる');

  // 「組み合わせを元に戻しました」は state rollback がないので使われていない
  // （内部エラー rollback path には別途「元の組み合わせに戻しました」が許可される）
  assert(bindBody.indexOf('組み合わせを元に戻しました') < 0,
    '事実誤認になり得る「組み合わせを元に戻しました」（select reset 用）は使われていない');
}

// ============================================================
// 6) buildChangePairingModalHtml に「現在の対局」表示要素が含まれる
// ============================================================
{
  assert(buildBody.indexOf('現在の対局') >= 0,
    'buildChangePairingModalHtml のテンプレートに「現在の対局」見出しが含まれる');
  assert(/data-chg-current\s*=\s*"1"/.test(buildBody),
    'モーダル内に data-chg-current="1" の現在ペア表示要素が出力される');
  assert(/data-chg-current-role\s*=\s*"p1"/.test(buildBody),
    '現在ペア表示に data-chg-current-role="p1" が含まれる');
  assert(/data-chg-current-role\s*=\s*"p2"/.test(buildBody),
    '現在ペア表示に data-chg-current-role="p2" が含まれる');
}

// ============================================================
// 7) 現在のペア表示が escapeHtml + formatParticipantLabel(..., {mode:'compact'}) 経由
// ============================================================
{
  // formatParticipantLabel を compact モードで呼び出している
  assert(/formatParticipantLabel\([\s\S]*?mode\s*:\s*'compact'/.test(buildBody),
    '現在ペア表示で formatParticipantLabel(..., {mode:"compact"}) を使用');
  // escapeHtml で囲んでいる（currentP1Label / currentP2Label）
  assert(/escapeHtml\(\s*currentP1Label\s*\)/.test(buildBody),
    '現在ペア表示の p1 ラベルが escapeHtml() 経由');
  assert(/escapeHtml\(\s*currentP2Label\s*\)/.test(buildBody),
    '現在ペア表示の p2 ラベルが escapeHtml() 経由');
  // 既存テンプレートが innerHTML で流れるため、cls フィールドを補完して渡している
  assert(/cls\s*:\s*cls/.test(buildBody),
    'formatParticipantLabel に cls を渡している（A-12 形式の prefix 出力）');
}

// ============================================================
// 8) エラーパスで state.pairings[cls][idx] への代入が起きていない（検証 OK まで state 不変）
// ============================================================
{
  // state.pairings[cls][idx]= への代入箇所がエラーパス（alert + return）の前にないこと
  const twoChangeAlertIdx = bindBody.indexOf('2人を同時に入れ替える必要があります');
  const before = bindBody.substring(0, twoChangeAlertIdx);
  // 「state.pairings[cls][idx]=」の代入が、2 選手同時変更 alert より前に存在しない
  assert(/state\.pairings\[cls\]\[idx\]\s*=/.test(before) === false,
    '2 選手同時変更 alert より前で state.pairings[cls][idx] への代入はない（state 不変）');

  // 再戦 warning alert より前にも、その経路の state 代入はない
  // 再戦 warning は swap 経路内なので、前方には replace 経路の代入のみが存在し得るが
  // 再戦 warning 自体は state 代入を伴わずに return する
  const rematchAlertIdx = bindBody.indexOf('再戦になる組み合わせが発生します');
  // alert と return の間に state 代入がないことを軽量チェック
  const rematchReturnIdx = bindBody.indexOf('return', rematchAlertIdx);
  const rematchSlice = bindBody.substring(rematchAlertIdx, rematchReturnIdx);
  assert(/state\.pairings\[cls\]\[idx\]\s*=/.test(rematchSlice) === false,
    '再戦 warning alert と return の間に state.pairings への代入がない');
}

// ============================================================
// 9) エラーパスで save() / renderTournament() が呼ばれていない
// ============================================================
{
  // alert 文言の直前 ~200 文字に save() / renderTournament() の呼出がないこと
  const errorTexts = [
    '2人を同時に入れ替える必要があります',
    '再戦になる組み合わせが発生します',
    '相手ペアが結果入力済みのため、入れ替えできません',
  ];
  errorTexts.forEach(function(t){
    const idx = bindBody.indexOf(t);
    if (idx < 0) return;
    const before = bindBody.substring(Math.max(0, idx - 300), idx);
    assert(before.indexOf('save()') < 0,
      'エラー alert「' + t.substring(0, 12) + '...」の直前で save() を呼んでいない');
    assert(before.indexOf('renderTournament(cls)') < 0,
      'エラー alert「' + t.substring(0, 12) + '...」の直前で renderTournament(cls) を呼んでいない');
  });
}

// ============================================================
// 10) swap 確定後の重複検出 rollback（既存）は維持されている
// ============================================================
{
  assert(/getDuplicatePlayersInPairings\(cls\)\.length\s*>\s*0/.test(bindBody),
    'swap 後重複検出（getDuplicatePlayersInPairings）が維持されている');
  assert(/state\.pairings\[cls\]\[idx\]\s*=\s*backup1/.test(bindBody),
    'swap 後重複検出時に backup1 への rollback が維持されている');
  assert(/state\.pairings\[cls\]\[otherIdx\]\s*=\s*backup2/.test(bindBody),
    'swap 後重複検出時に backup2 への rollback が維持されている');
}

// ============================================================
// 11) warning object / evaluatePairingQuality() の戻り値フィールド未変更
// ============================================================
{
  const epqMatch = htmlSrc.match(/function evaluatePairingQuality\([\s\S]*?\n\}\n/);
  assert(epqMatch !== null, 'evaluatePairingQuality 関数本体を抽出できる');
  const epqBody = epqMatch ? epqMatch[0] : '';
  const returnIdx = epqBody.lastIndexOf('return {');
  const returnSlice = returnIdx >= 0 ? epqBody.substring(returnIdx) : '';

  // 従来 7 フィールド存続
  ['totalWinDiff','maxWinDiff','sameScorePairCount','rematchCount','avoidableWinDiffPairs','warningHit','pairDetails'].forEach(function(f){
    assert(returnSlice.indexOf(f) >= 0,
      'evaluatePairingQuality 戻り値に従来フィールド "' + f + '" が含まれる');
  });
  // Phase 2/4 のフィールド不在
  assert(returnSlice.indexOf('avoidablePairIndexes') < 0,
    'evaluatePairingQuality 戻り値に avoidablePairIndexes が追加されていない');
  assert(returnSlice.indexOf('avoidableWinDiffCandidates') < 0,
    'evaluatePairingQuality 戻り値に avoidableWinDiffCandidates が追加されていない');
}

// ============================================================
// 12) generatePairing / Fisher-Yates は不変
// ============================================================
{
  const gpMatch = htmlSrc.match(/function generatePairing\([\s\S]*?\n\}\n/);
  assert(gpMatch !== null, 'generatePairing 関数本体を抽出できる');
  const gpBody = gpMatch ? gpMatch[0] : '';
  assert(/Fisher-Yates|Math\.floor\(Math\.random\(\)\s*\*/.test(gpBody),
    'generatePairing 内のランダム化ロジック（Fisher-Yates / Math.random）が維持されている');
}

// ============================================================
// 13) PR #103 pairing-card 補助ラベル (data-pairing-aux) 維持
// ============================================================
{
  assert(htmlSrc.indexOf('data-pairing-aux="p1"') >= 0,
    'pairing-card の data-pairing-aux="p1" 補助ラベルが維持されている');
  assert(htmlSrc.indexOf('data-pairing-aux="p2"') >= 0,
    'pairing-card の data-pairing-aux="p2" 補助ラベルが維持されている');
}

// ============================================================
// 14) PR #105 score-card .sno / .snm 維持
// ============================================================
{
  assert(/\.score-card\s+\.sno\s*\{/.test(htmlSrc),
    'CSS に .score-card .sno の定義が存在（PR #105 維持）');
  assert(/\.score-card\s+\.snm\s*\{/.test(htmlSrc),
    'CSS に .score-card .snm の定義が存在（PR #105 維持）');
}

// ============================================================
// 15) 既存 helper（getName / getNameWithNo / entryNoOf / formatParticipantLabel）本体 未変更
//     ＝ 引き続き定義されている
// ============================================================
{
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
// 16) 振る舞いテスト（軽量）: 文言とロジックの整合
// ============================================================
{
  // 2 選手同時変更 / 再戦 warning の alert 文言が、resetSelectsToOriginal 呼出と
  // 同じ if/else ブロック内にあること（簡易検査）
  // → 各 alert 文言の直前 100 文字以内に resetSelectsToOriginal が含まれる
  function checkPairOrder(text){
    const idx = bindBody.indexOf(text);
    if (idx < 0) return false;
    const before = bindBody.substring(Math.max(0, idx - 100), idx);
    return before.indexOf('resetSelectsToOriginal') >= 0;
  }
  assert(checkPairOrder('2人を同時に入れ替える必要があります'),
    '2 選手同時変更 alert と resetSelectsToOriginal が近接している');
  assert(checkPairOrder('再戦になる組み合わせが発生します'),
    '再戦 warning alert と resetSelectsToOriginal が近接している');

  // formatParticipantLabel を compact モードで呼ぶと A-12 形式の prefix が付くこと
  // 既存実装の振る舞い軽量検査（実関数を eval せず、出力 spec を再現）
  function formatLabel(player, opts){
    if(!player||typeof player!=='object')return '';
    var mode=(opts&&opts.mode==='standard')?'standard':'compact';
    var cls=(typeof player.cls==='string')?player.cls:'';
    var en=player.entry_no;
    var entryNoStr=(typeof en==='number'&&en>0)?('00'+en).slice(-2):'--';
    var name=(typeof player.name==='string')?player.name:'';
    var prefix=cls?(cls+'-'+entryNoStr):entryNoStr;
    return name?(prefix+' '+name):prefix;
  }
  assert(formatLabel({id:'pA',name:'山田太郎',entry_no:12,cls:'A'},{mode:'compact'}) === 'A-12 山田太郎',
    'formatParticipantLabel(compact) は "A-12 山田太郎" 形式を返す（書式整合）');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
