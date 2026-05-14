#!/usr/bin/env node
// PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT (PR #100 §5.1 Phase 1)
// pairing-card に勝敗数を併記し、警告バナー近くに短い理由補足を追加した実装を検証する。
// 不変項目:
//   - warning object / evaluatePairingQuality() を変更しない
//   - getName() / getNameWithNo() / entryNoOf() を改変しない
//   - formatParticipantLabel が pairing-card 経路で呼ばれる（初の UI 配線）
//   - 補足文は勝敗起因警告のみで表示（rematch 単独警告には出さない）
// 確認観点（静的検査ベース）:
//   1. buildCurrentPairingsHtml 内で formatParticipantLabel が呼ばれる
//   2. 呼出は mode:'standard' + includeRecord:true で、includeCategory は使わない
//   3. wins / totals を計算するブロックが pairing-card 描画前にある
//   4. record の losses は (totals - wins) で計算される
//   5. 警告バナー近くに「勝敗数」を含む短い補足文が条件付きで出る
//   6. 補足条件: avoidableWinDiffPairs>0 または maxWinDiff>=2（rematch 単独では出ない）
//   7. evaluatePairingQuality の return 形が従来通り（avoidablePairIndexes 等は追加しない）
//   8. evaluatePairingQuality 本体が変更されていない（戻り値 / アルゴリズムの確認）
//   9. getName() / getNameWithNo() / entryNoOf() / formatParticipantLabel が引き続き定義されている
//  10. detail / print mode の実装が追加されていない
//  11. 既存の winner-btn / 変更ボタン構造を破壊していない

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_pairing_ux_warning_decision_support.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass = 0, fail = 0;
function ok(msg){ pass++; console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(msg); else ng(msg); }

// ============================================================
// buildCurrentPairingsHtml 本体を切り出す
// ============================================================
const bcpMatch = htmlSrc.match(/function buildCurrentPairingsHtml\([\s\S]*?\n\}\n/);
assert(bcpMatch !== null, 'buildCurrentPairingsHtml 関数本体を抽出できる');
const bcpBody = bcpMatch ? bcpMatch[0] : '';

// ============================================================
// 1) formatParticipantLabel が buildCurrentPairingsHtml 内で使われる
// ============================================================
assert(bcpBody.indexOf('formatParticipantLabel') >= 0,
  'buildCurrentPairingsHtml 内で formatParticipantLabel が呼ばれている');

// ============================================================
// 2) 呼出オプション: mode:'standard' + includeRecord:true, includeCategory は使わない
//    （ネストした {wins:w, losses:l} 等を含むため、呼出箇所周辺 400 文字をスライスして検査）
// ============================================================
{
  const callIdx = bcpBody.indexOf('formatParticipantLabel(');
  assert(callIdx >= 0, 'formatParticipantLabel の呼出が見つかる');
  const callSrc = bcpBody.substring(callIdx, Math.min(bcpBody.length, callIdx + 400));
  assert(callSrc.indexOf("mode:'standard'") >= 0 || callSrc.indexOf('mode: "standard"') >= 0,
    "formatParticipantLabel 呼出近傍に mode:'standard' が含まれる");
  assert(/includeRecord\s*:\s*true/.test(callSrc),
    'formatParticipantLabel 呼出近傍に includeRecord:true が含まれる');
  // includeCategory が pairing-card 用の呼出に出ない（少なくとも次の closing brace まで）
  const optionsEnd = callSrc.search(/record\s*:\s*\{[^}]*\}\s*\}/);
  const optionsSlice = optionsEnd >= 0 ? callSrc.substring(0, optionsEnd + 50) : callSrc.substring(0, 200);
  assert(optionsSlice.indexOf('includeCategory') < 0,
    'pairing-card 用の formatParticipantLabel 呼出に includeCategory が含まれない（今回スコープ外）');
}

// ============================================================
// 3) wins / totals 計算ブロックが描画前にある
// ============================================================
{
  const winsIdx = bcpBody.indexOf('getWins(cls)');
  assert(winsIdx >= 0, 'buildCurrentPairingsHtml 内で getWins(cls) を呼んで wins を取得している');

  // 何らかの totals 集計ループが存在する（state.results を 2 重ループしている）
  const totalsLoopIdx = bcpBody.search(/state\.results\[cls\]\s*\[[^\]]*\]\s*\[[^\]]*\]/);
  assert(totalsLoopIdx >= 0, 'state.results を走査して各プレイヤーの total を集計するロジックが存在する');

  // 順序: getWins / totals 計算が pairing-card 描画ループ（for(var i=0;i<state.pairings[cls].length;i++)）より前
  const loopIdx = bcpBody.indexOf('for(var i=0;i<state.pairings[cls].length;i++)');
  assert(loopIdx > winsIdx, 'pairing-card 描画ループの前に wins 計算がある');
}

// ============================================================
// 4) losses = totals - wins の形で計算される
// ============================================================
{
  // パターン: (pcTotals[playerId]||0)-w / totals[id]-wins[id] / etc.
  // 厳密一致は避け、減算と wins/totals の併用を確認
  const hasSubtract = /(pcTotals|totals)\b[^=]*-\s*(w|wins)\b/.test(bcpBody);
  assert(hasSubtract, 'record の losses が "totals - wins" 相当で計算されている');
}

// ============================================================
// 5-6) 警告バナー近くに短い補足文が条件付きで出る
//      補足条件: avoidableWinDiffPairs>0 または maxWinDiff>=2
// ============================================================
{
  // 補足文の主要語句「勝敗数」と「確認」が同一バナーブロック内（warningHit 分岐内）に出ること
  const warnBlockMatch = bcpBody.match(/if\s*\(\s*quality\.warningHit\s*\)\s*\{[\s\S]*?\}\n/);
  assert(warnBlockMatch !== null, 'warningHit の if ブロックを抽出できる');
  const warnBlock = warnBlockMatch ? warnBlockMatch[0] : '';

  assert(warnBlock.indexOf('勝敗数') >= 0,
    '警告バナーブロック内に「勝敗数」を含む補足文が存在する');
  assert(warnBlock.indexOf('確認') >= 0,
    '警告バナーブロック内に「確認」を含む補足文が存在する');

  // 条件: avoidableWinDiffPairs>0 または maxWinDiff>=2 で補足が出る（rematch 単独では出さない）
  const hasAvoidableCond = warnBlock.indexOf('avoidableWinDiffPairs') >= 0;
  const hasMaxDiffCond = warnBlock.indexOf('maxWinDiff') >= 0;
  assert(hasAvoidableCond && hasMaxDiffCond,
    '補足表示判定で avoidableWinDiffPairs と maxWinDiff を見ている（勝敗起因警告に限定）');

  // 「禁止」「停止」「ブロック」など過剰トーンでないこと
  // （バナー本文の既存「※ 操作はブロックされません」は許容、補足側に「禁止」が無いことを確認）
  // 補足文を粗く抽出: 「勝敗数」の前後 200 文字
  const suppIdx = warnBlock.indexOf('勝敗数');
  const suppSlice = warnBlock.substring(Math.max(0, suppIdx - 100), Math.min(warnBlock.length, suppIdx + 200));
  assert(suppSlice.indexOf('禁止') < 0,
    '補足文に「禁止」トーンが含まれない（要確認のトーンを維持）');
  assert(suppSlice.indexOf('停止') < 0,
    '補足文に「停止」トーンが含まれない');
}

// ============================================================
// 7) evaluatePairingQuality の戻り値が拡張されていない（avoidablePairIndexes 等を追加していない）
// ============================================================
{
  const epqMatch = htmlSrc.match(/function evaluatePairingQuality\([\s\S]*?\n\}\n/);
  assert(epqMatch !== null, 'evaluatePairingQuality 関数本体を抽出できる');
  const epqBody = epqMatch ? epqMatch[0] : '';

  // 戻り値 return オブジェクトの近傍をチェック
  const returnIdx = epqBody.lastIndexOf('return {');
  assert(returnIdx >= 0, 'evaluatePairingQuality に return {...} がある');
  const returnSlice = epqBody.substring(returnIdx);

  assert(returnSlice.indexOf('avoidablePairIndexes') < 0,
    'evaluatePairingQuality の戻り値に avoidablePairIndexes が追加されていない（Phase 2 範囲外）');
  assert(returnSlice.indexOf('avoidableWinDiffCandidates') < 0,
    'evaluatePairingQuality の戻り値に avoidableWinDiffCandidates が追加されていない（Phase 4 範囲外）');
  assert(returnSlice.indexOf('sameWinGroupCandidates') < 0,
    'evaluatePairingQuality の戻り値に sameWinGroupCandidates が追加されていない（Phase 4 範囲外）');

  // 既存戻り値フィールドが従来通り存在する
  ['totalWinDiff','maxWinDiff','sameScorePairCount','rematchCount','avoidableWinDiffPairs','warningHit','pairDetails'].forEach(function(f){
    assert(returnSlice.indexOf(f) >= 0,
      'evaluatePairingQuality 戻り値に従来フィールド "' + f + '" が含まれる');
  });
}

// ============================================================
// 8) evaluatePairingQuality 本体: 既存アルゴリズムの主要 helper / 変数が維持されている
// ============================================================
{
  const epqBody = htmlSrc.match(/function evaluatePairingQuality\([\s\S]*?\n\}\n/)[0];
  assert(/canMatchInternally\b/.test(epqBody),
    'evaluatePairingQuality 内に canMatchInternally helper が引き続き存在');
  assert(/forcedMixed\b/.test(epqBody),
    'evaluatePairingQuality 内に forcedMixed 計算が引き続き存在');
  assert(/oddGroupCount\b/.test(epqBody),
    'evaluatePairingQuality 内に oddGroupCount 計算が引き続き存在');
}

// ============================================================
// 9) 既存 helper（getName / getNameWithNo / entryNoOf / formatParticipantLabel）が維持されている
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

  // 削除されていない（出現数 1 以上）
  const getNameCount = (htmlSrc.match(/\bgetName\s*\(/g) || []).length;
  assert(getNameCount > 0, 'getName の呼出が複数残っている（全置換されていない）');
}

// ============================================================
// 10) detail / print mode の実装が追加されていない
// ============================================================
{
  // formatParticipantLabel 定義ブロックの近傍をチェック
  const fplIdx = htmlSrc.indexOf('function formatParticipantLabel');
  const fplBlock = htmlSrc.substring(fplIdx, fplIdx + 3000);
  assert(fplBlock.indexOf("'detail'") < 0 && fplBlock.indexOf('"detail"') < 0,
    "formatParticipantLabel に 'detail' mode が追加されていない");
  assert(fplBlock.indexOf("'print'") < 0 && fplBlock.indexOf('"print"') < 0,
    "formatParticipantLabel に 'print' mode が追加されていない");
  assert(fplBlock.indexOf('privacyLevel') < 0,
    'formatParticipantLabel に privacyLevel フィールドが追加されていない');
  assert(fplBlock.indexOf('ariaLabel') < 0,
    'formatParticipantLabel に ariaLabel フィールドが追加されていない');
}

// ============================================================
// 11) pairing-card の既存 winner-btn / 変更ボタン構造を破壊していない
// ============================================================
{
  assert(bcpBody.indexOf('class="winner-btn') >= 0,
    'pairing-card 内の winner-btn 構造が維持されている');
  assert(bcpBody.indexOf('chgbtn_') >= 0,
    'pairing-card 内の「変更」ボタンが維持されている');
  assert(bcpBody.indexOf('第 ') >= 0 && bcpBody.indexOf('卓') >= 0,
    'pairing-card 内の卓番号バッジが維持されている');
}

// ============================================================
// 12) 補助ラベル要素が data-pairing-aux 属性で識別可能
// ============================================================
{
  assert(bcpBody.indexOf('data-pairing-aux="p1"') >= 0,
    'pairing-card p1 側に data-pairing-aux="p1" の補助ラベル要素が追加されている');
  assert(bcpBody.indexOf('data-pairing-aux="p2"') >= 0,
    'pairing-card p2 側に data-pairing-aux="p2" の補助ラベル要素が追加されている');
}

// ============================================================
// 13) 補助ラベルは escapeHtml 経由で出力されている（XSS 防止）
// ============================================================
{
  // data-pairing-aux 要素の前後 200 文字を見て、escapeHtml(...) が含まれること
  const auxIdx1 = bcpBody.indexOf('data-pairing-aux="p1"');
  const auxSlice1 = bcpBody.substring(auxIdx1, Math.min(bcpBody.length, auxIdx1 + 250));
  assert(auxSlice1.indexOf('escapeHtml(') >= 0,
    'p1 補助ラベルが escapeHtml() 経由で出力されている');

  const auxIdx2 = bcpBody.indexOf('data-pairing-aux="p2"');
  const auxSlice2 = bcpBody.substring(auxIdx2, Math.min(bcpBody.length, auxIdx2 + 250));
  assert(auxSlice2.indexOf('escapeHtml(') >= 0,
    'p2 補助ラベルが escapeHtml() 経由で出力されている');
}

// ============================================================
// 14) player.branch / state.branches など存在しない支部名フィールドを参照していない
// ============================================================
{
  assert(bcpBody.indexOf('player.branch') < 0,
    'buildCurrentPairingsHtml が player.branch を参照していない（単一支部前提）');
  assert(bcpBody.indexOf('.branches') < 0 || bcpBody.indexOf('state.branches') < 0,
    'buildCurrentPairingsHtml が state.branches を参照していない');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
