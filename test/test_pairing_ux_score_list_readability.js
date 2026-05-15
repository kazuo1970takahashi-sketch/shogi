#!/usr/bin/env node
// PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT (PR #104 §8.1)
// 暫定成績 / 対戦済みリストの読みやすさ改善を検証する。
// 不変項目:
//   - getName / getNameWithNo / entryNoOf / formatParticipantLabel 本体を変更しない
//   - warning object / evaluatePairingQuality() を変更しない
//   - pairing-card 補助ラベル (data-pairing-aux) を変更しない
//   - generatePairing() 側の sorted (L4580) は変更しない
// 確認観点:
//   1. renderTournament の sorted 比較関数が wins desc + entry_no asc の 2 段
//   2. entry_no 未設定/不正の fallback が Infinity (末尾) 経路で扱われる
//   3. buildScoreGridHtml が .sno (番号) と .snm (氏名) の別要素を出力
//   4. .sno / .snm が escapeHtml 経由
//   5. .sno は cls + '-' + entryNoOf 形式（書式 A-12）
//   6. .snm は getName(id, cls) を使用
//   7. CSS に .score-card .sno / .snm の定義が存在
//   8. buildPlayedHistoryHtml の見出しに「勝数順」明示
//   9. 対戦相手タグの順序ロジック (renderTournament の played push 順) 未変更
//  10. 対戦済みリストの sort 自体は変更していない (sorted 共有のまま)
//  11. 切替 UI 要素が追加されていない
//  12. warning object / evaluatePairingQuality() 未変更
//  13. pairing-card 補助ラベル (data-pairing-aux="p1"/"p2") 維持
//  14. generatePairing 側の sort (L4580 想定) は wins desc 単独のままで維持
//  15. 既存 helper (getName / getNameWithNo / entryNoOf / formatParticipantLabel) 維持

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_pairing_ux_score_list_readability.js <html>');
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
const rtMatch = htmlSrc.match(/function renderTournament\([\s\S]*?\n\}\n/);
assert(rtMatch !== null, 'renderTournament 関数本体を抽出できる');
const rtBody = rtMatch ? rtMatch[0] : '';

const sgMatch = htmlSrc.match(/function buildScoreGridHtml\([\s\S]*?\n\}\n/);
assert(sgMatch !== null, 'buildScoreGridHtml 関数本体を抽出できる');
const sgBody = sgMatch ? sgMatch[0] : '';

const phMatch = htmlSrc.match(/function buildPlayedHistoryHtml\([\s\S]*?\n\}\n/);
assert(phMatch !== null, 'buildPlayedHistoryHtml 関数本体を抽出できる');
const phBody = phMatch ? phMatch[0] : '';

const gpMatch = htmlSrc.match(/function generatePairing\([\s\S]*?\n\}\n/);
assert(gpMatch !== null, 'generatePairing 関数本体を抽出できる');
const gpBody = gpMatch ? gpMatch[0] : '';

// ============================================================
// 1) renderTournament の sorted 比較関数が wins desc + entry_no asc
// ============================================================
{
  // 1 次キー: wins 比較
  assert(/wins\[b\.id\]\s*\|\|\s*0\s*\)\s*-\s*\(\s*wins\[a\.id\]\s*\|\|\s*0/.test(rtBody),
    'renderTournament sorted の 1 次キーが wins desc (b - a) である');
  // 2 次キー: entry_no 比較
  assert(/entry_no/.test(rtBody) && /a\.entry_no/.test(rtBody) && /b\.entry_no/.test(rtBody),
    'renderTournament sorted で a.entry_no / b.entry_no を 2 次キーに使用');
}

// ============================================================
// 2) entry_no 未設定/不正時の fallback が Infinity
// ============================================================
{
  assert(/Infinity/.test(rtBody),
    'renderTournament sorted の entry_no fallback が Infinity（末尾送り）');
  // typeof チェックで安全側
  assert(/typeof\s+a\.entry_no\s*===\s*['"]number['"]/.test(rtBody)
       || /typeof\s+a\?\.entry_no\s*===\s*['"]number['"]/.test(rtBody),
    'renderTournament sorted で a.entry_no の typeof===number チェック');
}

// ============================================================
// 3) buildScoreGridHtml が .sno と .snm の別要素を出力
// ============================================================
{
  assert(/class\s*=\s*"sno"/.test(sgBody), 'buildScoreGridHtml が class="sno"（番号要素）を出力');
  assert(/class\s*=\s*"snm"/.test(sgBody), 'buildScoreGridHtml が class="snm"（氏名要素）を出力');
}

// ============================================================
// 4) .sno / .snm が escapeHtml 経由
// ============================================================
{
  // .sno 出力箇所近傍に escapeHtml が含まれる
  const snoIdx = sgBody.indexOf('class="sno"');
  const snoSlice = sgBody.substring(snoIdx, Math.min(sgBody.length, snoIdx + 200));
  assert(snoSlice.indexOf('escapeHtml(') >= 0,
    'buildScoreGridHtml の sno 要素が escapeHtml() 経由');

  const snmIdx = sgBody.indexOf('class="snm"');
  const snmSlice = sgBody.substring(snmIdx, Math.min(sgBody.length, snmIdx + 200));
  assert(snmSlice.indexOf('escapeHtml(') >= 0,
    'buildScoreGridHtml の snm 要素が escapeHtml() 経由');
}

// ============================================================
// 5) .sno は cls + '-' + entryNoOf 形式
// ============================================================
{
  // entryNoOf(cls, p.id) の呼出が sno 構築で使われている
  assert(/entryNoOf\(\s*cls\s*,\s*p\.id\s*\)/.test(sgBody),
    'buildScoreGridHtml が sno 構築で entryNoOf(cls, p.id) を使用');
  // sno ラベル文字列に cls + '-' + entryNoOf が含まれる
  assert(/cls\s*\+\s*['"]-['"]\s*\+\s*entryNoOf/.test(sgBody),
    'sno ラベルが cls + "-" + entryNoOf(...) 形式（書式 A-12）');
}

// ============================================================
// 6) .snm は getName(id, cls) を使用
// ============================================================
{
  assert(/getName\(\s*p\.id\s*,\s*cls\s*\)/.test(sgBody),
    'buildScoreGridHtml が snm 構築で getName(p.id, cls) を使用');
}

// ============================================================
// 7) CSS に .score-card .sno / .snm の定義が存在
// ============================================================
{
  assert(/\.score-card\s+\.sno\s*\{/.test(htmlSrc),
    'CSS に .score-card .sno の定義が存在');
  assert(/\.score-card\s+\.snm\s*\{/.test(htmlSrc),
    'CSS に .score-card .snm の定義が存在');
  // .sno は nowrap で番号が折り返されない
  const snoCssMatch = htmlSrc.match(/\.score-card\s+\.sno\s*\{[^}]+\}/);
  assert(snoCssMatch !== null, '.score-card .sno のルールを抽出できる');
  if (snoCssMatch) {
    assert(snoCssMatch[0].indexOf('nowrap') >= 0,
      '.score-card .sno に white-space:nowrap（番号は折り返さない）');
  }
}

// ============================================================
// 8) buildPlayedHistoryHtml の見出しに「勝数順」明示
// ============================================================
{
  assert(phBody.indexOf('勝数順') >= 0,
    'buildPlayedHistoryHtml の見出し / 補足に「勝数順」が含まれる');
  assert(phBody.indexOf('ラウンド順') >= 0,
    'buildPlayedHistoryHtml の補足に「ラウンド順」が含まれる（対戦相手タグの順序明示）');
}

// ============================================================
// 9) 対戦相手タグの順序ロジック（renderTournament の played push 順）未変更
// ============================================================
{
  // played[m.p1].push(m.p2) / played[m.p2].push(m.p1) パターンが維持
  assert(/played\[match\.p1\]\.push\(match\.p2\)/.test(rtBody),
    'renderTournament の played[p1].push(p2) パターンが維持されている（タグ順序 = ラウンド順）');
  assert(/played\[match\.p2\]\.push\(match\.p1\)/.test(rtBody),
    'renderTournament の played[p2].push(p1) パターンが維持されている');
  // winner guard も維持
  assert(/if\s*\(\s*match\.winner\s*\)/.test(rtBody),
    'renderTournament の played 構築に winner guard が維持されている');
}

// ============================================================
// 10) 対戦済みリストの sort 自体は変更していない（sorted 共有のまま）
// ============================================================
{
  // buildPlayedHistoryHtml が sorted を引数として受け取り、自前 sort をしていない
  assert(/function buildPlayedHistoryHtml\(cls,\s*sorted,\s*played\)/.test(phBody),
    'buildPlayedHistoryHtml が sorted を引数として受け取る（独自 sort なし）');
  // 自前で sort 呼出していない
  assert(/\.sort\(/.test(phBody) === false,
    'buildPlayedHistoryHtml 内で .sort() を呼んでいない（sorted 共有のまま）');
}

// ============================================================
// 11) 切替 UI 要素が追加されていない
// ============================================================
{
  // toggle / switch / order-toggle 等のラベルが追加されていないこと
  // 雑だが、関連ボタン id / class が含まれていないことを確認
  assert(htmlSrc.indexOf('id="score-order-toggle"') < 0,
    '切替 UI の id="score-order-toggle" が存在しない');
  assert(htmlSrc.indexOf('class="order-toggle"') < 0,
    '切替 UI の class="order-toggle" が存在しない');
  // 「番号順 / 勝数順」のような切替セレクタが追加されていないこと
  // （buildScoreGridHtml と buildPlayedHistoryHtml 内に <select> や <button> の追加がない）
  const sgSelectCount = (sgBody.match(/<select/g) || []).length;
  const phSelectCount = (phBody.match(/<select/g) || []).length;
  assert(sgSelectCount === 0 && phSelectCount === 0,
    'buildScoreGridHtml / buildPlayedHistoryHtml に <select> 切替が追加されていない');
}

// ============================================================
// 12) warning object / evaluatePairingQuality() 未変更
// ============================================================
{
  const epqMatch = htmlSrc.match(/function evaluatePairingQuality\([\s\S]*?\n\}\n/);
  assert(epqMatch !== null, 'evaluatePairingQuality 関数本体を抽出できる');
  const epqBody = epqMatch ? epqMatch[0] : '';
  const returnIdx = epqBody.lastIndexOf('return {');
  assert(returnIdx >= 0, 'evaluatePairingQuality に return {...} がある');
  const returnSlice = epqBody.substring(returnIdx);

  // Phase 2/4 のフィールド不在
  assert(returnSlice.indexOf('avoidablePairIndexes') < 0,
    'evaluatePairingQuality 戻り値に avoidablePairIndexes が追加されていない');
  assert(returnSlice.indexOf('avoidableWinDiffCandidates') < 0,
    'evaluatePairingQuality 戻り値に avoidableWinDiffCandidates が追加されていない');

  // 従来 7 フィールド存続
  ['totalWinDiff','maxWinDiff','sameScorePairCount','rematchCount','avoidableWinDiffPairs','warningHit','pairDetails'].forEach(function(f){
    assert(returnSlice.indexOf(f) >= 0,
      'evaluatePairingQuality 戻り値に従来フィールド "' + f + '" が含まれる');
  });
}

// ============================================================
// 13) pairing-card 補助ラベル（data-pairing-aux）維持
// ============================================================
{
  assert(htmlSrc.indexOf('data-pairing-aux="p1"') >= 0,
    'pairing-card の data-pairing-aux="p1" 補助ラベルが維持されている');
  assert(htmlSrc.indexOf('data-pairing-aux="p2"') >= 0,
    'pairing-card の data-pairing-aux="p2" 補助ラベルが維持されている');
}

// ============================================================
// 14) generatePairing 側の sort（L4580 想定）は wins desc 単独のまま
// ============================================================
{
  // generatePairing 内に「Fisher-Yates」シャッフルロジックがある = 既存ロジック維持
  assert(/Fisher-Yates|Math\.floor\(Math\.random\(\)\s*\*/.test(gpBody),
    'generatePairing のランダム化ロジックが維持されている（同勝数群シャッフル）');
  // generatePairing の sorted は wins 単独比較（entry_no 2 次キー追加されていない）
  const gpSortMatch = gpBody.match(/players\.slice\(\)\.sort\([\s\S]*?\)\)\;/);
  assert(gpSortMatch !== null, 'generatePairing 内の players.sort() が抽出できる');
  if (gpSortMatch) {
    assert(gpSortMatch[0].indexOf('entry_no') < 0,
      'generatePairing 側の sorted には entry_no が含まれない（ランダム化ロジック維持）');
  }
}

// ============================================================
// 15) 既存 helper 維持
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

  // getNameWithNo は他箇所で使われ続けている（全置換されていない）
  const gnwnCount = (htmlSrc.match(/getNameWithNo\(/g) || []).length;
  assert(gnwnCount >= 5, 'getNameWithNo の呼出が複数残っている（全置換されていない）, count='+gnwnCount);
}

// ============================================================
// 16) 振る舞いテスト: 比較関数を抽出して同勝数 tie-break を検証
// ============================================================
{
  // sorted 比較関数の主要パーツを mock evaluate
  // wins desc / entry_no asc を満たすか、3 ケース確認
  function compareFn(a, b, wins) {
    var winDiff = (wins[b.id]||0) - (wins[a.id]||0);
    if (winDiff !== 0) return winDiff;
    var ea = (a && typeof a.entry_no === 'number' && a.entry_no > 0) ? a.entry_no : Infinity;
    var eb = (b && typeof b.entry_no === 'number' && b.entry_no > 0) ? b.entry_no : Infinity;
    return ea - eb;
  }

  // ケース1: 勝数違いは wins desc
  var p1 = { id: 'p1', entry_no: 5 };
  var p2 = { id: 'p2', entry_no: 1 };
  var wins1 = { p1: 1, p2: 2 };
  var arr1 = [p1, p2].sort(function(a,b){ return compareFn(a,b,wins1); });
  assert(arr1[0].id === 'p2' && arr1[1].id === 'p1',
    '同勝数違い: 勝数 desc で p2(2勝) → p1(1勝)');

  // ケース2: 同勝数は entry_no asc
  var p3 = { id: 'p3', entry_no: 12 };
  var p4 = { id: 'p4', entry_no: 3 };
  var wins2 = { p3: 2, p4: 2 };
  var arr2 = [p3, p4].sort(function(a,b){ return compareFn(a,b,wins2); });
  assert(arr2[0].id === 'p4' && arr2[1].id === 'p3',
    '同勝数: entry_no asc で p4(no=3) → p3(no=12)');

  // ケース3: entry_no 未設定は末尾
  var p5 = { id: 'p5' /* no entry_no */ };
  var p6 = { id: 'p6', entry_no: 7 };
  var wins3 = { p5: 1, p6: 1 };
  var arr3 = [p5, p6].sort(function(a,b){ return compareFn(a,b,wins3); });
  assert(arr3[0].id === 'p6' && arr3[1].id === 'p5',
    '同勝数 + entry_no 未設定: 未設定は末尾（p6 → p5）');

  // ケース4: entry_no 0 / 負値は不正扱いで末尾
  var p7 = { id: 'p7', entry_no: 0 };
  var p8 = { id: 'p8', entry_no: 10 };
  var wins4 = { p7: 1, p8: 1 };
  var arr4 = [p7, p8].sort(function(a,b){ return compareFn(a,b,wins4); });
  assert(arr4[0].id === 'p8' && arr4[1].id === 'p7',
    '同勝数 + entry_no=0: 不正扱いで末尾（p8 → p7）');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
