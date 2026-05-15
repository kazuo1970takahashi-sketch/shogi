#!/usr/bin/env node
// REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT (PR #115 §6.4 / §7 / §8)
// removePlayer() の 2 つの削除不可 alert を PR #114「大会進行データをリセット」
// 導線へ整合させた文言更新を検証する。
//
// 不変項目:
//   - removePlayer() の判定ロジック (state.pairings[cls] メンバーシップ /
//     state.started && pastMatches>0 / pastMatches の state.results 走査) 維持
//   - removePlayer() の early return 順序 (一次禁止 → 二次禁止) 維持
//   - removePlayer() の削除成功経路 (filter / _pendingNewYomi 破棄 /
//     renderRegList() / save() / verifyPlayerAbsent + notifySaveWarning) 維持
//   - resetTournamentProgressOnly() / resetAll() / startTournament guard 条件 維持
//   - 既存 #resetBtn / #resetProgressBtn 文言 / 既存 resetAll confirm 文言 維持
//   - localStorage schema / pairing algorithm 維持
//
// 観点 (PR #115 §6.4 / §8 に対応):
//   一次禁止 alert 文言:
//     1. 「現在の組み合わせ」を含む
//     2. 「削除できません」を含む
//     3. 「対戦相手変更」を含む (soft recovery 第一案)
//     4. 「大会進行データをリセット」を含む (PR #114 部分リセット誘導)
//     5. 「参加者一覧は残したまま」を含む
//     6. 「組み合わせ・勝敗結果」を含む
//     7. alert 内に「大会データを全リセット」(PR #118 #resetBtn 文言) / 旧「大会データをリセット」のいずれも含まない (誤誘導抑止)
//     8. alert 内に「リセット」単独表現を含まない (具体化済)
//   二次禁止 alert 文言:
//     9. 「勝敗結果」を含む
//     10. 「削除できません」を含む
//     11. 「大会進行データをリセット」を含む
//     12. 「参加者一覧は残したまま」を含む
//     13. 「組み合わせ・勝敗結果」を含む
//     14. 「<N>試合」動的文字列 (pastMatches+'試合') が維持されている
//     15. alert 内に「大会データを全リセット」(PR #118) / 旧「大会データをリセット」のいずれも含まない
//     16. alert 内に「リセット」単独 (= 「大会進行データをリセット」以外) を含まない
//   判定ロジック不変:
//     17. 一次禁止判定 (`if(inPairings)`) が維持
//     18. 二次禁止判定 (`if(state.started && pastMatches>0)`) が維持
//     19. pastMatches が state.results 走査で算出されている
//     20. 一次禁止 alert が二次禁止 alert より前にある
//     21. 一次禁止 / 二次禁止 とも early return している
//   削除成功経路不変:
//     22. state.players[cls] への filter 代入が維持
//     23. _pendingNewYomi[id] 破棄処理が維持
//     24. renderRegList() 呼出が維持
//     25. save() 呼出が維持
//     26. verifyPlayerAbsent + notifySaveWarning が維持
//   関連機能不変:
//     27. resetTournamentProgressOnly() / resetAll() / startTournament guard 不変
//     28. #resetProgressBtn 文言「大会進行データをリセット」維持
//     29. #resetBtn 文言（PR #118 で「大会データを全リセット」へ更新）
//     30. resetAll confirm 文言（PR #118 で新文言へ更新、主要語句で assert）
//     31. localStorage schema 維持
//     32. pairing algorithm 維持
//
// 両方該当ケース (pairings + results 両方に id 存在):
//   33. early return 順序により一次禁止 alert が先に出る前提を構造的に検証

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_remove_player_guard_message.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass = 0, fail = 0;
function ok(msg){ pass++; console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(msg); else ng(msg); }

// ============================================================
// removePlayer() 関数本体を抽出
// ============================================================
const rmMatch = htmlSrc.match(/function removePlayer\([\s\S]*?\n\}\n/);
assert(rmMatch !== null, 'removePlayer 関数本体を抽出できる');
const rmBody = rmMatch ? rmMatch[0] : '';

// ============================================================
// 一次禁止 / 二次禁止 alert スライスを抽出
// ============================================================
const idxFirstGuard  = rmBody.search(/if\s*\(\s*inPairings\s*\)/);
const idxSecondGuard = rmBody.search(/if\s*\(\s*state\.started\s*&&\s*pastMatches\s*>\s*0\s*\)/);
const idxFilter      = rmBody.search(/state\.players\[cls\]\s*=\s*arr\.filter/);
assert(idxFirstGuard >= 0, '一次禁止判定 if(inPairings) を抽出できる');
assert(idxSecondGuard >= 0, '二次禁止判定 if(state.started && pastMatches>0) を抽出できる');
assert(idxFilter >= 0, '削除成功経路 state.players[cls]=arr.filter(...) を抽出できる');
assert(idxFirstGuard < idxSecondGuard,
  '一次禁止判定が二次禁止判定より前にある (early return 順序維持)');
assert(idxSecondGuard < idxFilter,
  '二次禁止判定が削除成功経路より前にある (early return で守られる)');

// 一次禁止スライス: idxFirstGuard ～ idxSecondGuard の手前 (var pastMatches=0; を含まない)
const idxPastMatchesVar = rmBody.indexOf('var pastMatches=0', idxFirstGuard);
const firstSlice = (idxPastMatchesVar > idxFirstGuard)
  ? rmBody.substring(idxFirstGuard, idxPastMatchesVar) : '';
assert(firstSlice.length > 0, '一次禁止ブロックをスライスできる');

// 二次禁止スライス: idxSecondGuard ～ var msg=
const idxMsgVar = rmBody.search(/var\s+msg\s*=/);
const secondSlice = (idxMsgVar > idxSecondGuard)
  ? rmBody.substring(idxSecondGuard, idxMsgVar) : '';
assert(secondSlice.length > 0, '二次禁止ブロックをスライスできる');

// ============================================================
// 1-8) 一次禁止 alert 文言検査
// ============================================================
{
  // alert があるか
  assert(/alert\(/.test(firstSlice), '一次禁止スライス内に alert がある');
  // early return
  assert(/\breturn\s*;/.test(firstSlice), '一次禁止スライス内で return している');

  // 含むべき語句
  assert(firstSlice.indexOf('現在の組み合わせ') >= 0,
    '[一次禁止] alert に「現在の組み合わせ」が含まれる');
  assert(firstSlice.indexOf('削除できません') >= 0,
    '[一次禁止] alert に「削除できません」が含まれる');
  assert(firstSlice.indexOf('対戦相手変更') >= 0,
    '[一次禁止] alert に「対戦相手変更」が含まれる (soft recovery 第一案)');
  assert(firstSlice.indexOf('大会進行データをリセット') >= 0,
    '[一次禁止] alert に「大会進行データをリセット」が含まれる (PR #114 部分リセット誘導)');
  assert(firstSlice.indexOf('参加者一覧は残したまま') >= 0,
    '[一次禁止] alert に「参加者一覧は残したまま」が含まれる');
  assert(firstSlice.indexOf('組み合わせ・勝敗結果') >= 0,
    '[一次禁止] alert に「組み合わせ・勝敗結果」が含まれる');

  // 誤誘導抑止
  // 現行 #resetBtn 文言「大会データを全リセット」(PR #118) / 旧文言「大会データをリセット」のいずれも
  // 一次禁止 alert には含まれないこと。
  // ただし「大会進行データをリセット」を含むので、これを除いて検査:
  const firstAlertMatch = firstSlice.match(/alert\(([\s\S]*?)\);/);
  const firstAlertText = firstAlertMatch ? firstAlertMatch[1] : '';
  const firstWithoutNew = firstAlertText.split('大会進行データをリセット').join('');
  assert(firstWithoutNew.indexOf('大会データを全リセット') < 0,
    '[一次禁止] alert に「大会データを全リセット」(現行 #resetBtn 文言) が含まれない (誤誘導抑止 / PR #118)');
  assert(firstWithoutNew.indexOf('大会データをリセット') < 0,
    '[一次禁止] alert に「大会データをリセット」(旧 #resetBtn 文言) が含まれない (誤誘導抑止 retention)');

  // 「リセット」単独表現抑止 (「大会進行データをリセット」以外で「リセット」が出ないこと)
  const firstWithoutNewAndReset = firstWithoutNew;
  assert(firstWithoutNewAndReset.indexOf('リセット') < 0,
    '[一次禁止] alert に「リセット」単独表現が含まれない (「大会進行データをリセット」のみ)');
}

// ============================================================
// 9-16) 二次禁止 alert 文言検査
// ============================================================
{
  assert(/alert\(/.test(secondSlice), '二次禁止スライス内に alert がある');
  assert(/\breturn\s*;/.test(secondSlice), '二次禁止スライス内で return している');

  assert(secondSlice.indexOf('勝敗結果') >= 0,
    '[二次禁止] alert に「勝敗結果」が含まれる');
  assert(secondSlice.indexOf('削除できません') >= 0,
    '[二次禁止] alert に「削除できません」が含まれる');
  assert(secondSlice.indexOf('大会進行データをリセット') >= 0,
    '[二次禁止] alert に「大会進行データをリセット」が含まれる');
  assert(secondSlice.indexOf('参加者一覧は残したまま') >= 0,
    '[二次禁止] alert に「参加者一覧は残したまま」が含まれる');
  assert(secondSlice.indexOf('組み合わせ・勝敗結果') >= 0,
    '[二次禁止] alert に「組み合わせ・勝敗結果」が含まれる');

  // 動的文字列 pastMatches+'試合' の維持
  assert(/pastMatches\s*\+\s*'試合/.test(secondSlice),
    '[二次禁止] alert に pastMatches+\'試合\' 動的文字列が維持されている');

  // 誤誘導抑止
  const secondAlertMatch = secondSlice.match(/alert\(([\s\S]*?)\);/);
  const secondAlertText = secondAlertMatch ? secondAlertMatch[1] : '';
  const secondWithoutNew = secondAlertText.split('大会進行データをリセット').join('');
  assert(secondWithoutNew.indexOf('大会データを全リセット') < 0,
    '[二次禁止] alert に「大会データを全リセット」(現行 #resetBtn 文言) が含まれない (誤誘導抑止 / PR #118)');
  assert(secondWithoutNew.indexOf('大会データをリセット') < 0,
    '[二次禁止] alert に「大会データをリセット」(旧 #resetBtn 文言) が含まれない (誤誘導抑止 retention)');
  assert(secondWithoutNew.indexOf('リセット') < 0,
    '[二次禁止] alert に「リセット」単独表現が含まれない (「大会進行データをリセット」のみ)');
}

// ============================================================
// 17-21) 判定ロジック不変
// ============================================================
{
  // 一次禁止判定の条件式
  assert(/var\s+inPairings\s*=\s*false/.test(rmBody),
    'inPairings 変数初期化が維持');
  assert(/state\.pairings\[cls\]\.length/.test(rmBody),
    '一次禁止判定が state.pairings[cls] を走査している');
  assert(/pm\.p1\s*===\s*id\s*\|\|\s*pm\.p2\s*===\s*id/.test(rmBody),
    '一次禁止判定が pm.p1===id || pm.p2===id である');
  assert(/if\s*\(\s*inPairings\s*\)/.test(rmBody),
    '一次禁止 if(inPairings) が維持');

  // 二次禁止判定
  assert(/if\s*\(\s*state\.started\s*&&\s*pastMatches\s*>\s*0\s*\)/.test(rmBody),
    '二次禁止判定 if(state.started && pastMatches>0) が維持');

  // pastMatches の算出
  assert(/var\s+pastMatches\s*=\s*0/.test(rmBody),
    'pastMatches 変数初期化が維持');
  assert(/state\.results\[cls\]\.length/.test(rmBody),
    'pastMatches 算出が state.results[cls] を走査している');
  assert(/rm\.p1\s*===\s*id\s*\|\|\s*rm\.p2\s*===\s*id/.test(rmBody),
    'pastMatches 算出が rm.p1===id || rm.p2===id である');
  assert(/pastMatches\+\+/.test(rmBody),
    'pastMatches++ インクリメントが維持');
}

// ============================================================
// 22-26) 削除成功経路不変
// ============================================================
{
  assert(/var\s+msg\s*=\s*name\s*\+\s*'を削除しますか/.test(rmBody),
    '削除 confirm 文言「を削除しますか？」が維持');
  assert(/if\s*\(\s*!\s*confirm\(msg\)\s*\)\s*return/.test(rmBody),
    '削除 confirm キャンセル時 return が維持');
  assert(/state\.players\[cls\]\s*=\s*arr\.filter\(/.test(rmBody),
    'state.players[cls]=arr.filter(...) が維持');
  assert(/p\.id\s*!==\s*id/.test(rmBody),
    'filter 内の p.id!==id 判定が維持');
  assert(/_pendingNewYomi/.test(rmBody),
    '_pendingNewYomi 参照が維持 (破棄処理)');
  assert(/delete\s+_pendingNewYomi\[id\]/.test(rmBody),
    'delete _pendingNewYomi[id] 破棄処理が維持');
  assert(/renderRegList\(\s*\)/.test(rmBody),
    'renderRegList() 呼出が維持');
  assert(/save\(\s*\)/.test(rmBody),
    'save() 呼出が維持');
  assert(/verifyPlayerAbsent\(id\s*,\s*cls\)/.test(rmBody),
    'verifyPlayerAbsent(id, cls) 呼出が維持');
  assert(/notifySaveWarning\(/.test(rmBody),
    'notifySaveWarning(...) 呼出が維持');
  assert(/callsiteId\s*:\s*'SAVE-001-removePlayer'/.test(rmBody),
    'SAVE-001-removePlayer callsiteId が維持');
}

// ============================================================
// 27-32) 関連機能不変
// ============================================================
{
  // resetTournamentProgressOnly() 不変
  const rtpMatch = htmlSrc.match(/function resetTournamentProgressOnly\([\s\S]*?\n\}\n/);
  assert(rtpMatch !== null, 'resetTournamentProgressOnly() 関数本体を抽出できる');
  const rtpBody = rtpMatch ? rtpMatch[0] : '';
  assert(/state\.started\s*=\s*false/.test(rtpBody),
    'resetTournamentProgressOnly() 内の state.started=false が維持');
  assert(/state\.pairings\s*=\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(rtpBody),
    'resetTournamentProgressOnly() 内の state.pairings={A:[],B:[]} が維持');
  assert(/state\.results\s*=\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(rtpBody),
    'resetTournamentProgressOnly() 内の state.results={A:[],B:[]} が維持');
  assert(rtpBody.indexOf('参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します') >= 0,
    'resetTournamentProgressOnly() confirm 文言が維持');

  // resetAll() 不変
  const resetMatch = htmlSrc.match(/function resetAll\([\s\S]*?\n\}\n/);
  assert(resetMatch !== null, 'resetAll() 関数本体を抽出できる');
  const resetBody = resetMatch ? resetMatch[0] : '';
  assert(/players\s*:\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(resetBody),
    'resetAll() 内の players:{A:[],B:[]} 初期化が維持 (全リセット温存)');
  // PR #118 で resetAll() confirm 文言を「参加者一覧・組み合わせ・勝敗結果を含む大会データを
  // すべてリセットします。\n支部マスタは保持されます。」へ更新済。主要語句を assert。
  assert(resetBody.indexOf('参加者一覧') >= 0,
    'resetAll() confirm に「参加者一覧」が含まれる (PR #118)');
  assert(resetBody.indexOf('組み合わせ') >= 0,
    'resetAll() confirm に「組み合わせ」が含まれる (PR #118)');
  assert(resetBody.indexOf('勝敗結果') >= 0,
    'resetAll() confirm に「勝敗結果」が含まれる (PR #118)');
  assert(resetBody.indexOf('すべてリセット') >= 0,
    'resetAll() confirm に「すべてリセット」が含まれる (PR #118)');
  assert(resetBody.indexOf('支部マスタは保持') >= 0,
    'resetAll() confirm に「支部マスタは保持」が含まれる (PR #118)');

  // startTournament guard 条件不変
  const stMatch = htmlSrc.match(/function startTournament\([\s\S]*?\n\}\n/);
  assert(stMatch !== null, 'startTournament() 関数本体を抽出できる');
  const stBody = stMatch ? stMatch[0] : '';
  assert(/if\s*\(\s*state\.started\s*===\s*true\s*\)/.test(stBody),
    'startTournament() guard 条件 state.started===true が維持');
  // PR #114 同期更新済 alert 文言維持
  assert(stBody.indexOf('大会進行データをリセット') >= 0,
    'startTournament() guard alert に「大会進行データをリセット」が維持 (PR #114 同期)');
  assert(stBody.indexOf('参加者一覧は残したまま') >= 0,
    'startTournament() guard alert に「参加者一覧は残したまま」が維持');

  // ボタン文言
  assert(/id="resetProgressBtn"[\s\S]{0,80}>大会進行データをリセット<\/button>/.test(htmlSrc),
    '#resetProgressBtn 文言「大会進行データをリセット」が維持');
  assert(/id="resetBtn"[\s\S]{0,80}>大会データを全リセット<\/button>/.test(htmlSrc),
    '#resetBtn 文言「大会データを全リセット」(PR #118)');

  // localStorage schema
  assert(htmlSrc.indexOf("STORAGE_KEY='shogi_v4'") >= 0,
    "STORAGE_KEY='shogi_v4' が維持");
  assert(htmlSrc.indexOf("LEGACY_STORAGE_KEYS=['shogi_v3']") >= 0,
    "LEGACY_STORAGE_KEYS=['shogi_v3'] が維持");
  assert(htmlSrc.indexOf("BRANCH_MASTER_KEY='shogi_branch_master'") >= 0,
    "BRANCH_MASTER_KEY='shogi_branch_master' が維持");

  // pairing algorithm
  assert(/function\s+generatePairing\s*\(/.test(htmlSrc),
    'generatePairing 関数が維持');
  assert(/function\s+evaluatePairingQuality\s*\(/.test(htmlSrc),
    'evaluatePairingQuality 関数が維持');
}

// ============================================================
// 33) 両方該当ケース: early return 順序による一次禁止優先
// ============================================================
{
  // 構造的検証: 一次禁止 alert 内に「現在の組み合わせ」、二次禁止 alert 内に
  // 「勝敗結果」(動的文字列) があり、両者は順序通り (一次禁止が前) に存在する。
  // pairings + results 両方に id がある参加者は inPairings=true となり、
  // 一次禁止 alert + return で抜けるため、二次禁止 alert には到達しない。
  const idxFirstAlertText = firstSlice.indexOf('現在の組み合わせ');
  const idxSecondAlertText = secondSlice.indexOf('勝敗結果');
  assert(idxFirstAlertText >= 0 && idxSecondAlertText >= 0,
    '[両方該当] 一次禁止 alert と二次禁止 alert の文言が双方存在し区別可能');
  // 一次禁止スライス内で return が alert より後ろ (= alert 後に必ず return)
  const firstAlertEnd = firstSlice.indexOf("');", firstSlice.indexOf('alert('));
  const firstReturnPos = firstSlice.search(/\breturn\s*;/);
  assert(firstAlertEnd >= 0 && firstReturnPos > firstAlertEnd,
    '[両方該当] 一次禁止 alert の後に return; が存在 (二次禁止に到達しない)');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
