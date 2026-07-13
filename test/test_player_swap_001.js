#!/usr/bin/env node
// PLAYER-SWAP-001 (#758): 名前編集3択目「別の人に差し替える（名簿から選ぶ）」の受入テスト。
//   背景: 席譲り運用（数合わせの幹事→本参加者）で「この大会のみ修正」を使うと member_id が
//   旧会員のまま残り、クラウドにキメラ行（氏名=旧会員/ふりがな=新会員）ができる（2026-07-12 実害）。
//   受入基準（Issue #758）:
//     1. 手合い付け後の参加者を名簿の既存会員に差し替えられる（member_id/name/yomi/member/grade/city を
//        受付時 addPlayerFromMaster と同一集合でコピー・yomiDirty クリア・pairings/results 無改変）。
//     2. 差し替え操作で旧会員のマスタ行は一切変化しない（純粋関数は master を書かない）。
//     3. 差し替え先が大会参加済みなら拒否（already_registered）。同名別 player も拒否（duplicate_name）。
//     4. 名簿にいない人へは未連携化（member_id 解除・yomi/city クリア＝キメラ残滓を残さない）。
//   データは完全架空のみ。
const fs = require('fs');
const targetPath = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(targetPath, 'utf8');
let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// ---- S. 静的ピン（UI 導線・二重防御・同乗文言）
assert(RAW.indexOf('id="ms-swap-person"') >= 0, 'S1 名前編集ダイアログに3択目ボタン（ms-swap-person）がある');
assert(RAW.indexOf('別の人に差し替える（名簿から選ぶ）') >= 0, 'S2 3択目のラベルは「別の人に差し替える（名簿から選ぶ）」');
assert(RAW.indexOf('openPlayerSwapPicker(p,newName)') >= 0, 'S3 3択目クリックで差し替えピッカーを開く（入力名を検索初期値に流用）');
assert(RAW.indexOf('findMasterSuggestions(q,master,getCurrentlyRegisteredMemberIds())') >= 0, 'S4 候補は既存サジェスト流用＋既登録 member_id 除外（参加済みは選べない）');
assert(RAW.indexOf('名簿にない新規の方として差し替え') >= 0, 'S5 未連携差し替えの導線がある');
assert(RAW.indexOf('delete _pendingNewYomi[p.id];') >= 0, 'S6 差し替え時に in-memory の _pendingNewYomi[p.id] をクリア（旧会員へのふりがな上書き遮断）');
assert(RAW.indexOf('さんの成績になります') >= 0, 'S8 確認文言に成績帰属の警告（これまでの対局結果が差し替え先の成績になる）');
// YOMI-SYNC-OVERWRITE の文言同乗修正: 行の主語を「名簿の◯◯さん」に固定（Issue #758 §文言の同時修正）
assert(RAW.indexOf("_lines.push('名簿の「'+_ydiffs[_li].name+'」さんのふりがな：'") >= 0, 'S9 YOMI 上書き確認の行は「名簿の◯◯さんのふりがな」形式（マスタ側であることを誤読させない）');
assert(RAW.indexOf('function applyParticipantSwapFromMaster(p,memberId,master,state){') >= 0, 'S10 差し替え本体は純粋関数（p/memberId/master/state を引数で受ける）');

// ---- 関数抽出（純粋関数のみ・DOM 不要）
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
const SRC = ['normalizePersonName', 'normalizeYomi', 'normalizeCity', 'normalizeMasterFeeFields',
  'countPlayerDecidedGames', 'applyParticipantSwapFromMaster', 'applyParticipantSwapToUnlinked']
  .map(extractFn);
assert(SRC.every(s => !!s), 'X1 対象関数がすべて抽出できる');

// ---- S 続き（関数抽出ベースの強いピン・PR #759 レビュー反映）
{
  const pick = extractFn('handlePlayerSwapPick') || '';
  const unlinked = extractFn('handlePlayerSwapUnlinked') || '';
  assert(pick.indexOf('{danger:true}') >= 0 && unlinked.indexOf('{danger:true}') >= 0,
    'S7 差し替え確認（名簿/未連携の両方）は danger 確認（Enter 誤爆防止・関数抽出内で検査）');
  // [SHOULD-1] 送信済み大会での差し替えは旧会員の行がクラウドに残る旨を両 confirm に条件付き警告
  const warn = extractFn('playerSwapSentWarning') || '';
  assert(warn.indexOf('state.cloud_sent_tid===state.tournament_id') >= 0, 'S11a 送信済み判定は cloud_sent_tid===tournament_id');
  assert(warn.indexOf('自動では消えません') >= 0, 'S11b 警告文＝旧会員の行は自動では消えない');
  assert(pick.indexOf('playerSwapSentWarning()') >= 0 && unlinked.indexOf('playerSwapSentWarning()') >= 0,
    'S11c 両方の差し替え confirm に送信済み警告が乗る');
  // [SHOULD-2/3] Esc ハンドラ: appConfirm 表示中と IME 合成中は閉じない
  const picker = extractFn('openPlayerSwapPicker') || '';
  assert(picker.indexOf("document.getElementById('app-modal')") >= 0, 'S12a appConfirm 表示中の Esc でピッカーを閉じない');
  assert(picker.indexOf('e.isComposing||e.keyCode===229') >= 0, 'S12b IME 合成中の Esc（変換キャンセル）でピッカーを閉じない');
  // [SHOULD-4] 未連携の案内は同名会員1件時の自動紐付けを明示（「新規会員として登録できます」と断言しない）
  assert(unlinked.indexOf('その方に紐付きます') >= 0, 'S13 未連携差し替えの案内に同名1件自動紐付けの注記');
}
const env = new Function(SRC.join('\n') + `;
  return {
    countPlayerDecidedGames: countPlayerDecidedGames,
    applyParticipantSwapFromMaster: applyParticipantSwapFromMaster,
    applyParticipantSwapToUnlinked: applyParticipantSwapToUnlinked
  };`)();

// ---- フィクスチャ（完全架空）
function fxMaster(){
  return { members: [
    { id: 'm-new', name: '架空太郎', yomi: 'カクウ　タロウ', city: ' 架空市 ', member: 'member', grade: 'ippan' },
    { id: 'm-other', name: '架空次郎', yomi: 'かくうじろう', city: '架空町', member: 'other', grade: 'godan' },
    { id: 'm-reg', name: '架空参加済', yomi: 'かくうさんかずみ', city: '', member: 'member', grade: 'ippan' },
    { id: 'm-dupname', name: '架空参加済', yomi: 'べつのよみ', city: '', member: 'member', grade: 'ippan' },
    { id: 'm-del', name: '架空削除済', yomi: '', city: '', deleted: true },
    { id: 'm-old', name: '架空幹事', yomi: 'かくうかんじ', city: '旧市', member: 'member', grade: 'ippan' }
  ] };
}
function fxState(){
  return {
    players: {
      A: [
        { id: 'p1', name: '架空幹事', cls: 'A', member: 'member', grade: 'ippan', city: '旧市',
          member_id: 'm-old', yomi: 'かくうかんじ', yomiDirty: true, entry_no: 1 },
        { id: 'p2', name: '架空参加済', cls: 'A', member: 'member', grade: 'ippan', city: '',
          member_id: 'm-reg', yomi: 'かくうさんかずみ', entry_no: 2 }
      ],
      B: []
    },
    results: {
      A: [
        [ { p1: 'p1', p2: 'p2', winner: 'p1' }, { p1: 'px', p2: 'py', winner: null } ],
        [ { p1: 'p2', p2: 'p1', winner: 'p2' } ]
      ]
    },
    pairings: { A: [], B: [] }
  };
}

// ---- C. countPlayerDecidedGames
{
  const st = fxState();
  assert(env.countPlayerDecidedGames('p1', 'A', st) === 2, 'C1 winner 確定局のみ数える（2局）');
  assert(env.countPlayerDecidedGames('px', 'A', st) === 0, 'C2 winner=null の局は数えない');
  assert(env.countPlayerDecidedGames('p1', 'B', st) === 0, 'C3 別クラスは数えない');
  assert(env.countPlayerDecidedGames('p1', 'A', null) === 0, 'C4 state 無しでも落ちず 0');
  // [PR #759 レビュー SHOULD-5] 進行中回戦（state.pairings・未確定）の入力済み勝敗も数える
  const st2 = fxState();
  st2.pairings.A = [ { p1: 'p1', p2: 'p2', winner: 'p2' }, { p1: 'px', p2: 'p1', winner: null } ];
  assert(env.countPlayerDecidedGames('p1', 'A', st2) === 3, 'C5 進行中回戦の入力済み勝敗を加算（未入力は数えない）');
}

// ---- P. applyParticipantSwapFromMaster（受入基準 1〜3）
{
  const st = fxState(), master = fxMaster();
  const p = st.players.A[0];
  const r = env.applyParticipantSwapFromMaster(p, 'm-new', master, st);
  assert(r && r.success === true, 'P1 名簿の既存会員へ差し替えできる');
  assert(p.member_id === 'm-new', 'P2 member_id が差し替え先になる（キメラ根絶の本丸）');
  assert(p.name === '架空太郎', 'P3 name はマスタ値（normalizePersonName 済み）');
  assert(p.yomi === 'かくうたろう', 'P4 yomi はマスタ値（normalizeYomi 済み＝カタカナ→ひらがな・空白除去）');
  assert(p.member === 'member' && p.grade === 'ippan', 'P5 会費区分は normalizeMasterFeeFields 経由');
  assert(p.city === '架空市', 'P6 city はマスタ値（normalizeCity 済み）');
  assert(!('yomiDirty' in p), 'P7 yomiDirty がクリアされる（YOMI-SYNC-OVERWRITE 経路遮断）');
  assert(p.id === 'p1' && p.cls === 'A' && p.entry_no === 1, 'P8 player 内部 id / cls / entry_no は不変（results/pairings 無改変の根拠）');
  const st2 = fxState();
  assert(JSON.stringify(st2.results) === JSON.stringify(st.results), 'P9 results は無改変');
  const mOld = master.members.filter(m => m.id === 'm-old')[0];
  assert(mOld.name === '架空幹事' && mOld.yomi === 'かくうかんじ', 'P10 旧会員のマスタ行は一切変化しない（受入基準2）');
}
{
  const st = fxState(), master = fxMaster();
  const r = env.applyParticipantSwapFromMaster(st.players.A[0], 'm-reg', master, st);
  assert(r && r.success === false && r.error === 'already_registered', 'P11 参加済み会員への差し替えは拒否（受入基準3）');
  const r2 = env.applyParticipantSwapFromMaster(st.players.A[0], 'm-dupname', master, st);
  assert(r2 && r2.success === false && r2.error === 'duplicate_name', 'P12 同名の別 player がいる場合も拒否（同名非統合ポリシー）');
  const r3 = env.applyParticipantSwapFromMaster(st.players.A[0], 'm-del', master, st);
  assert(r3 && r3.success === false && r3.error === 'deleted', 'P13 削除済み会員は拒否');
  const r4 = env.applyParticipantSwapFromMaster(st.players.A[0], 'm-nai', master, st);
  assert(r4 && r4.success === false && r4.error === 'not_found', 'P14 名簿にいない id は not_found');
  const r5 = env.applyParticipantSwapFromMaster(st.players.A[0], 'm-old', master, st);
  assert(r5 && r5.success === false && r5.error === 'same_member', 'P15 同一会員への差し替えは no-op 拒否');
  const broken = fxMaster(); broken._loaded_with_corruption = true;
  const r6 = env.applyParticipantSwapFromMaster(st.players.A[0], 'm-new', broken, st);
  assert(r6 && r6.success === false && r6.error === 'corrupted', 'P16 破損マスタでは差し替えない（既存の保全パターン）');
  assert(st.players.A[0].member_id === 'm-old' && st.players.A[0].name === '架空幹事', 'P17 拒否時は player 無改変');
}
{
  // 会費区分の正規化が受付時（addPlayerFromMaster）と同一であること
  const st = fxState(), master = fxMaster();
  const r = env.applyParticipantSwapFromMaster(st.players.A[0], 'm-other', master, st);
  assert(r && r.success === true, 'P18 支部員以外の会員へも差し替えできる');
  const p = st.players.A[0];
  assert(p.member === 'other' && p.grade === 'ippan', 'P19 member=other 保持・未知 grade は ippan（normalizeMasterFeeFields と同一）');
}

// ---- U. applyParticipantSwapToUnlinked（受入基準 4）
{
  const st = fxState();
  const p = st.players.A[0];
  const r = env.applyParticipantSwapToUnlinked(p, '　架空　三郎　', st);
  assert(r && r.success === true, 'U1 未連携差し替えできる');
  assert(p.name === '架空　三郎', 'U1a 前後空白（全角含む）は除去・名前が入る');
  assert(!('member_id' in p), 'U2 member_id が解除される（未連携ルートへ）');
  assert(p.yomi === '' && p.city === '', 'U3 旧会員の yomi / city はクリア（キメラ残滓を残さない）');
  assert(!('yomiDirty' in p), 'U4 yomiDirty がクリアされる');
  assert(p.member === 'member' && p.grade === 'ippan', 'U5 会費区分は据え置き（黙って金額を変えない）');
  const r2 = env.applyParticipantSwapToUnlinked(st.players.A[1], '   ', st);
  assert(r2 && r2.success === false && r2.error === 'invalid_name', 'U6 空名は拒否');
  // [PR #759 レビュー BLOCK-1] 同名参加者ガード（同名2人 → 名簿更新の同名1件自動紐付け →
  //   member_id 共有 → クラウド upsert で片方の成績消失、の連鎖を入口で遮断）
  const st3 = fxState();
  const r3 = env.applyParticipantSwapToUnlinked(st3.players.A[0], '架空参加済', st3);
  assert(r3 && r3.success === false && r3.error === 'duplicate_name', 'U7 既存参加者と同名への未連携差し替えは拒否');
  assert(st3.players.A[0].name === '架空幹事' && st3.players.A[0].member_id === 'm-old', 'U7a 拒否時は player 無改変');
  const r4 = env.applyParticipantSwapToUnlinked(st3.players.A[0], '　架空参加済　', st3);
  assert(r4 && r4.success === false && r4.error === 'duplicate_name', 'U7b normalize 同値（前後の全角空白差）も同名として拒否');
  const r5 = env.applyParticipantSwapToUnlinked(st3.players.A[0], '架空四郎', null);
  assert(r5 && r5.success === false && r5.error === 'invalid_state', 'U8 state 無しは適用しない（ガード必須化）');
  // 自分自身と同名（＝実質リネームなし）は他 player と衝突しない限り通る（q.id!==p.id 除外の検証）
  const st4 = fxState();
  const r6 = env.applyParticipantSwapToUnlinked(st4.players.A[0], '架空幹事', st4);
  assert(r6 && r6.success === true && !('member_id' in st4.players.A[0]), 'U9 自分自身の名前は同名判定から除外（未連携化は実行される）');
}

console.log('PLAYER-SWAP-001: PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
