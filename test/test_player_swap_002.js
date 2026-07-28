#!/usr/bin/env node
// PLAYER-SWAP-002 (#763): 差し替え導線の到達性改善（名前入力を経由しない独立ボタン）の受入テスト。
//   背景: editPlayer は入力名が現名と normalize 同値だと 3択ダイアログを開かず早期 return するため、
//   「表示名がすでに差し替え先と同じ参加者」は差し替え導線に UI から到達できなかった（#763・案B採用）。
//   受入基準（Issue #763）:
//     1. 編集シートに独立ボタン「🔁 別の人に差し替える」があり、名前入力プロンプトを経由せず
//        openPlayerSwapPicker(p,'') を直接開く（＝表示名が同じでも一時改名なしで差し替え可能）。
//     2. 既存の名前編集→3択ダイアログ経由の導線（ms-swap-person → openPlayerSwapPicker(p,newName)）は温存。
//     3. ガード（参加済み拒否・同名拒否・danger 確認・送信済み警告）は新導線でも同一に効く
//        （新導線はピッカーを開くだけで、適用系関数・確認系は共通経路のため無改変であることをピンする）。
//   同乗2件:
//     ① 候補ゼロ時メッセージ: 「検索語を短く」を先に案内し、「名簿にない新規の方として…」は
//        名簿にいない新規の方に限る誘導へ（誤誘導＝未連携化による既存会員二重登録の防止）。
//     ② withdrawn（棄権中）の差し替えで棄権状態が引き継がれる旨を confirm 文言に明記（PR #759 NIT-3）。
//   データは完全架空のみ・読み取り専用（静的ピン＋純関数抽出）。
const fs = require('fs');
const targetPath = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(targetPath, 'utf8');
let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// ---- 関数抽出（brace 追跡・player_swap_001 と同方式）
function extractFn(name){
  const idx = RAW.indexOf('function ' + name + '(');
  if (idx < 0) return null;
  let depth = 0, i = RAW.indexOf('{', idx);
  const start = idx;
  for (; i < RAW.length; i++) {
    if (RAW[i] === '{') depth++;
    else if (RAW[i] === '}') { depth--; if (depth === 0) return RAW.slice(start, i + 1); }
  }
  return null;
}

// ---- A. 受入基準1: 独立ボタン（名前入力を経由しない到達）
const sheetSrc = extractFn('openPlayerEditSheet');
assert(!!sheetSrc, 'A0 openPlayerEditSheet を抽出できる');
assert(!!sheetSrc && sheetSrc.indexOf('id="pes-swap"') >= 0, 'A1 編集シートに独立ボタン（pes-swap）がある');
assert(!!sheetSrc && sheetSrc.indexOf('🔁 別の人に差し替える') >= 0, 'A2 ラベルは「🔁 別の人に差し替える」');
// L2-SWEEP-02 ② (#788 レビュー Nice-1): シート開時捕捉の p 直渡しをやめ、クリック時に playerId+cls で
//   再解決して渡す（pes-name と同型・検索初期値は空のまま）。A3 は新しい形をピンする。
assert(!!sheetSrc && sheetSrc.indexOf("openPlayerSwapPicker(cur,'')") >= 0, 'A3 クリックで openPlayerSwapPicker(再解決した参加者,\'\') を直接呼ぶ（検索初期値は空）');
assert(!!sheetSrc && sheetSrc.indexOf('curPs[pi2].id===playerId') >= 0, 'A3b クリック時に playerId で state.players[cls] から再解決する（開時捕捉 p の stale 参照を使わない）');
assert(!!sheetSrc && sheetSrc.indexOf('appPrompt') < 0, 'A4 編集シートの差し替え導線は名前入力プロンプトを経由しない');
// ボタンは pes-yomi（ふりがな）より後・クラス変更より前（編集系→差し替え→棄権/削除の順序）
if (sheetSrc) {
  const yi = sheetSrc.indexOf('id="pes-yomi"');
  const si = sheetSrc.indexOf('id="pes-swap"');
  const ri = sheetSrc.indexOf('id="pes-remove"');
  assert(yi >= 0 && si > yi && ri > si, 'A5 ボタン順序: ふりがな編集 → 🔁差し替え → …→ 受付取り消し');
}

// ---- B. 受入基準2: 既存導線（名前編集→3択）温存
assert(RAW.indexOf('id="ms-swap-person"') >= 0, 'B1 3択目ボタン（ms-swap-person）は温存');
assert(RAW.indexOf('openPlayerSwapPicker(p,newName)') >= 0, 'B2 3択経由は入力名を検索初期値に流用（従来どおり）');
const editSrc = extractFn('editPlayer');
assert(!!editSrc && editSrc.indexOf('normalizePersonName(p.name)===normalizePersonName(newName)') >= 0,
  'B3 editPlayer の同名 early-return（MASTER-001）は無改変＝案A（常時3択）ではなく案B');
assert(!!editSrc && editSrc.indexOf('openMemberMasterSyncDialog(p,newName)') >= 0, 'B4 名前変更時の3択ダイアログ呼び出しは従来どおり');

// ---- C. 受入基準3: ガードが新導線でも同一に効く（共通経路の無改変ピン）
//   新導線はピッカーを開くだけ。参加済み拒否/同名拒否は候補抽出＋適用関数、danger/送信済み警告は
//   handlePlayerSwapPick / handlePlayerSwapUnlinked にあり、これらは 001 から無改変であることを固定する。
assert(RAW.indexOf('findMasterSuggestions(q,master,getCurrentlyRegisteredMemberIds())') >= 0, 'C1 候補は既登録 member_id 除外（参加済みは選べない）');
const applySrc = extractFn('applyParticipantSwapFromMaster');
assert(!!applySrc && applySrc.indexOf('already_registered') >= 0, 'C2 適用側 already_registered ガード健在');
assert(!!applySrc && applySrc.indexOf('duplicate_name') >= 0, 'C3 適用側 duplicate_name ガード健在');
const pickSrc = extractFn('handlePlayerSwapPick');
const unlinkedSrc = extractFn('handlePlayerSwapUnlinked');
assert(!!pickSrc && pickSrc.indexOf('{danger:true}') >= 0, 'C4 名簿差し替え confirm は danger 属性');
assert(!!unlinkedSrc && unlinkedSrc.indexOf('{danger:true}') >= 0, 'C5 未連携差し替え confirm も danger 属性');
assert(!!pickSrc && pickSrc.indexOf('playerSwapSentWarning()') >= 0, 'C6 名簿差し替え confirm に☁送信済み警告');
assert(!!unlinkedSrc && unlinkedSrc.indexOf('playerSwapSentWarning()') >= 0, 'C7 未連携差し替え confirm にも☁送信済み警告');

// ---- D. 同乗①: 候補ゼロ時メッセージ（誤誘導の是正）
const candSrc = extractFn('renderPlayerSwapCandidates');
assert(!!candSrc, 'D0 renderPlayerSwapCandidates を抽出できる');
if (candSrc) {
  assert(candSrc.indexOf('検索語を短くしてみてください') >= 0, 'D1 候補ゼロ時に「検索語を短く」を案内');
  const shortIdx = candSrc.indexOf('検索語を短くしてみてください');
  const unlinkedIdx = candSrc.indexOf('名簿にいない新規の方のときだけ');
  assert(shortIdx >= 0 && unlinkedIdx > shortIdx, 'D2 「検索語を短く」が先・未連携誘導は「名簿にいない新規の方のときだけ」に限定');
  // L2-SWEEP-02 ① (#788 レビュー Should-1): 旧 D3 は「A < 0 || unlinkedIdx >= 0」で D2 が通る限り恒真
  //   （判別力ゼロ）。旧文言（無条件誘導＝「。」直後に「下の…を使ってください」）が候補ゼロ文言の
  //   先頭側に復活していないことを、単独の否定 assert でピンし直す（現行文言は「のときだけ、下の…」）。
  assert(candSrc.indexOf('。下の「名簿にない新規の方として差し替え」を使ってください') < 0,
    'D3 旧文言（無条件の未連携誘導「。下の…を使ってください」）が復活していない');
}

// ---- E. 同乗②: withdrawn 引き継ぎの confirm 明記（PR #759 NIT-3）
const noteSrc = extractFn('playerSwapWithdrawnNote');
assert(!!noteSrc, 'E0 playerSwapWithdrawnNote がある');
assert(!!noteSrc && noteSrc.indexOf('p.withdrawn') >= 0 && noteSrc.indexOf("return ''") >= 0,
  'E1 withdrawn のときだけ注記を返す（非棄権は空文字）');
assert(!!noteSrc && noteSrc.indexOf('棄権中のまま引き継がれます') >= 0, 'E2 注記は「棄権状態が引き継がれる」ことを明記');
assert(!!pickSrc && pickSrc.indexOf('playerSwapWithdrawnNote(p)') >= 0, 'E3 名簿差し替え confirm に注記を合成');
assert(!!unlinkedSrc && unlinkedSrc.indexOf('playerSwapWithdrawnNote(p)') >= 0, 'E4 未連携差し替え confirm にも注記を合成');
// 実挙動: withdrawn を触らない（swap 適用関数が withdrawn へ代入・delete しない）
assert(!!applySrc && applySrc.indexOf('withdrawn') < 0, 'E5 applyParticipantSwapFromMaster は withdrawn に触れない（＝引き継ぎ）');
const applyUnlinkedSrc = extractFn('applyParticipantSwapToUnlinked');
assert(!!applyUnlinkedSrc && applyUnlinkedSrc.indexOf('withdrawn') < 0, 'E6 applyParticipantSwapToUnlinked も withdrawn に触れない');

// ---- F. 純関数の実挙動（架空データ）: 注記の出し分け
{
  // playerSwapWithdrawnNote は他関数に依存しないため eval で単体実行する
  let fn = null;
  try { fn = new Function('return (' + noteSrc + ')')(); } catch (e) { fn = null; }
  assert(!!fn, 'F0 playerSwapWithdrawnNote を単体実行できる');
  if (fn) {
    assert(fn({ withdrawn: true }).indexOf('棄権中') >= 0, 'F1 棄権中の参加者では注記が付く');
    assert(fn({}) === '', 'F2 非棄権の参加者では空文字（従来文言と同一）');
    assert(fn(null) === '', 'F3 null 安全');
  }
}

console.log('PLAYER-SWAP-002: PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
