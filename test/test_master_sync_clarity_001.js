#!/usr/bin/env node
// MASTER-SYNC-CLARITY-001 (#757): 「📋 名簿を更新」の意味明確化（改名＋結果報告トースト＋4面文言）の受入テスト。
//   背景: ボタン名から「何が起きるか」が伝わらず、作者自身も誤解していた（2026-07-12）。10名受付直後でも
//   会員名簿タブは「名簿 0名」で、参加者がどこへ行ったのか画面から読み取れない（2026-07-27 UX評価・本番 v130）。
//   問題は挙動ではなく意味の伝達＝**マージ内容・confirm 分岐・ゲストガードは一切変えない**。
//   受入基準（Issue #757 / ブリーフ §3）:
//     1. 新名称「📋 参加者を名簿に反映」が全面（ヘッダ・ヘルプ・運営サイト・マニュアル2種）で一貫し、
//        旧名称「名簿を更新」の残存参照がない（☁送信ガード自身のダイアログ文言と意図的な履歴記述を除く）。
//     2. 反映後のトーストが実際に起きたことを数字で報告する（反映あり／差分ゼロ／内訳不明の3型）。
//     3. マージ挙動は無改変（counts は数え上げのみ・保存形＝JSON に現れない）。
//     4. ゲスト大会ガード・☁送信の未連携ガード経路は不変。
//   データは完全架空のみ・読み取り専用。
const fs = require('fs');
const path = require('path');
// PHASE1-ISOLATE-001: 自前の extractFn（brace バランス）と new Function 隔離を共通ヘルパへ寄せた。
const { loadIsolated, extractFn, readHtml } = require('./lib/app_isolated');
const target = process.argv[2] || 'shogi_v4.html';
const root = path.dirname(path.resolve(target));
const RAW = readHtml(target);
let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

const NEW_NAME = '📋 参加者を名簿に反映';

// ============================================================
// A. 改名（文言のみ・id/bind 不変）
// ============================================================
assert(RAW.indexOf('id="saveBtn"') >= 0 && RAW.indexOf('>' + NEW_NAME + '</button>') >= 0,
  'A1 ヘッダ #saveBtn のラベルが新名称「' + NEW_NAME + '」');
assert(/getElementById\('saveBtn'\)\.addEventListener\('click',saveData\)/.test(RAW),
  'A2 id / click 結線は不変（saveBtn → saveData）');
{
  // 旧名称の残存参照ゼロ。例外は改名の履歴を明示した注釈（「#757 改名前は…」「旧「📋 名簿を更新しました」」）のみ。
  //   旧例外①（☁送信の未連携ガード CLOUD-SEND-UNLINKED-GUARD-001 固有のダイアログ文言）は
  //   L2-SWEEP-01 ④ (#782 レビュー Nice-2) で新語彙「名簿に反映」へ追随したため例外リストから撤去。
  const lines = RAW.split('\n');
  const stale = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('名簿を更新') < 0) continue;
    if (lines[i].indexOf('改名前は') >= 0 || lines[i].indexOf('旧「📋 名簿を更新しました」') >= 0) continue;
    stale.push((i + 1) + ': ' + lines[i].trim().slice(0, 60));
  }
  assert(stale.length === 0, 'A3 アプリ内に旧名称「名簿を更新」の残存参照がない（検出: ' + stale.join(' / ') + '）');
}
assert(RAW.indexOf('🎪 ゲスト大会のため名簿には反映しません') >= 0,
  'A4 ゲスト時の title / toast 文言は新名称と矛盾しない（「反映しません」＝改名後の語彙）');

// ============================================================
// B. 純関数 updateBranchMasterFromTournament の counts 拡張（後方互換）
// ============================================================
function makeMasterEnv() {
  const names = ['normalizePersonName', 'normalizeYomi', 'isValidYmd', 'todayYmd', 'isSafeClassId',
    'findMemberCandidates', 'attachMemberIdToPlayer', 'addTournamentIdOnce', 'recalcMemberAttendance',
    'generateMemberId', 'createMemberFromParticipant', 'listClassIdsForMasterSync', 'attachMasterSyncCounts',
    'readMasterSyncCounts', 'updateBranchMasterFromTournament'];
  const srcs = names.map(n => extractFn(RAW, n));
  assert(srcs.every(s => !!s), 'B0 counts 検証に必要な純関数一式を抽出できる');
  // PHASE1-ISOLATE-001: 評価文字列に埋め込んでいた stub 定義を prelude へ出した（供与する名前は同じ3つ）。
  const showMsgCalls = [];
  const cryptoStub = { _n: 0 };
  cryptoStub.randomUUID = function () { return 'uuid-' + (cryptoStub._n = (cryptoStub._n || 0) + 1); };
  const iso = loadIsolated(names, { prelude: {
    _phaseA2State: { cryptoNotificationShown: false },
    showMsg(m, k) { showMsgCalls.push({ m: m, k: k }); },
    crypto: cryptoStub,
  } });
  return { update: iso.fn('updateBranchMasterFromTournament'), read: iso.fn('readMasterSyncCounts'), msgs: showMsgCalls };
}
function fxState() {
  // 完全架空データ（A クラス3名・B クラス1名）
  return {
    classes: [{ id: 'A', name: 'Aクラス' }, { id: 'B', name: 'Bクラス' }],
    players: {
      A: [{ id: 'p1', name: '架空太郎', cls: 'A', yomi: '' }, { id: 'p2', name: '架空次郎', cls: 'A', yomi: 'かくうじろう' }],
      B: [{ id: 'p3', name: '架空三郎', cls: 'B', yomi: '' }]
    }
  };
}
const META = { tournament_id: 't-0001', tournament_date: '2026-07-27' };

{
  const env = makeMasterEnv();
  // B1: 初回＝全員が新規追加＋参加記録
  const st = fxState();
  const master = { members: [] };
  const ret = env.update(st, master, META);
  assert(ret === master, 'B1 戻り値は従来どおり master 本体（既存呼び出しは master として受け取れる＝後方互換）');
  const c1 = env.read(ret);
  assert(!!c1 && c1.added === 3 && c1.marked === 3 && c1.skipped === 0,
    'B2 初回: added=3 / marked=3 / skipped=0（marked は新規追加分を含む＝今日の参加が記録された人数）');
  assert(JSON.stringify(master).indexOf('_syncCounts') < 0,
    'B3 counts は非列挙＝JSON.stringify に現れない（localStorage/クラウドの保存形は不変）');
  assert(Object.keys(master).indexOf('_syncCounts') < 0, 'B3b Object.keys にも現れない（for-in 走査の既存コードに影響しない）');

  // B4: 2回目＝冪等（差分ゼロ）
  const c2 = env.read(env.update(st, master, META));
  assert(!!c2 && c2.added === 0 && c2.marked === 0 && c2.yomiFilled === 0,
    'B4 2回目: すべて 0（冪等＝何度押しても同じ結果が数字に出る）');
  assert(master.members.length === 3, 'B5 2回目でも会員は増えない（マージ挙動不変）');

  // B6: 既存会員の空ふりがな補完だけが起きるケース
  st.players.A[0].yomi = 'かくうたろう';
  const c3 = env.read(env.update(st, master, META));
  assert(!!c3 && c3.added === 0 && c3.marked === 0 && c3.yomiFilled === 1,
    'B6 空ふりがなの補完のみ: yomiFilled=1（added/marked は 0）');
  const filled = master.members.filter(m => m.name === '架空太郎')[0];
  assert(!!filled && filled.yomi === 'かくうたろう', 'B7 ふりがなが実際に補完されている（既存の #333 挙動不変）');
}
{
  // B8: 同名候補が複数＝skipped（既存の保留挙動不変）
  const env = makeMasterEnv();
  const st = { classes: [{ id: 'A', name: 'Aクラス' }], players: { A: [{ id: 'p9', name: '架空太郎', cls: 'A', yomi: '' }] } };
  const master = { members: [
    { id: 'm-1', name: '架空太郎', yomi: '', tournament_ids: [], deleted: false },
    { id: 'm-2', name: '架空太郎', yomi: '', tournament_ids: [], deleted: false }
  ] };
  const c = env.read(env.update(st, master, META));
  assert(!!c && c.skipped === 1 && c.added === 0 && c.marked === 0, 'B8 同名2件は skipped=1（新規追加も紐付けもしない＝既存仕様）');
  assert(master.members.length === 2, 'B9 同名複数時に会員は増えない');
  assert(env.msgs.some(x => x.k === 'warn' && x.m.indexOf('保留') >= 0), 'B10 保留の警告（showMsg warn）は従来どおり出る');
}
{
  // B11: 異常系＝落ちない・master をそのまま返す
  const env = makeMasterEnv();
  const master = { members: [] };
  assert(env.update(null, master, META) === master, 'B11 state が無くても master をそのまま返す');
  assert(env.read(env.update(fxState(), master, { tournament_id: '' })) !== null, 'B12 tournament_id 不正でも counts（全0）は読める');
  assert(env.read({}) === null && env.read(null) === null, 'B13 counts が無い戻り値は null（内訳不明）として読む');
}

// ============================================================
// C. トースト文言（純関数・3型）
// ============================================================
{
  const src = extractFn(RAW, 'formatMasterSyncResultToast');
  assert(!!src, 'C0 formatMasterSyncResultToast を抽出できる');
  const f = loadIsolated(['formatMasterSyncResultToast']).fn('formatMasterSyncResultToast');
  assert(f({ added: 2, marked: 14, yomiFilled: 0, skipped: 0 }) === '📋 名簿に反映しました: 新規追加 2人・参加記録 14人',
    'C1 ①反映あり: 新規追加/参加記録を数字で報告');
  assert(f({ added: 0, marked: 0, yomiFilled: 0, skipped: 0 }) === '📋 名簿は反映済みです（変更なし）',
    'C2 ②差分ゼロ: 「反映済みです（変更なし）」');
  // L2-SWEEP-01 ③ (#782 レビュー Nice-1): 内訳不明の中立文言を非断定へ（「反映しました」と読める断定を避ける）。
  assert(f(null) === '📋 名簿への反映を確認できませんでした（保存状態をご確認ください）',
    'C3 ③内訳不明（破損スキップ/保存失敗/例外）: 数字を出さず「反映した」と断定しない中立文言');
  assert(f({ added: 0, marked: 0, yomiFilled: 2, skipped: 0 }) === '📋 名簿に反映しました: ふりがな補完 2人',
    'C4 ふりがな補完だけのときは「変更なし」と言わない（起きたことを報告する）');
  assert(f({ added: 1, marked: 3, yomiFilled: 1, skipped: 0 }).indexOf('ふりがな補完 1人') > 0,
    'C5 ふりがな補完は末尾に追記');
  assert(f({ added: 0, marked: 0, yomiFilled: 0, skipped: 3 }) === '📋 名簿は反映済みです（変更なし）',
    'C6 skipped はトーストに出さない（同名保留は showMsg warn が氏名つきで別途通知＝二重通知にしない）');
}

// ============================================================
// D. 配線: syncBranchMasterOnSave(onDone(counts)) と saveData
// ============================================================
{
  const sync = extractFn(RAW, 'syncBranchMasterOnSave') || '';
  // SAVE-WARN-VISIBILITY-001 (#892): _done(r) 形（印つき呼びを通す・裸呼びは _counts）に追随。
  assert(/function _done\(r\)\{ if\(typeof onDone==='function'\)onDone\(arguments\.length>0\?r:_counts\); \}/.test(sync),
    'D1 完了通知は onDone(counts)（引数追加のみ＝呼び出し回数・経路は不変・#892 で印つき対応）');
  assert(sync.indexOf('_counts=readMasterSyncCounts(updateBranchMasterFromTournament(') >= 0,
    'D2 counts は純関数の戻り値から読む（マージ呼び出しの引数は不変）');
  assert(sync.indexOf('if(masterSaved===false)_counts=null;') >= 0,
    'D3 マスタ保存に失敗したら数字を報告しない（名簿に残っていない数字を出さない）');
  assert(/isGuestTournament\([^)]*\)\)\{_done\(\);return;\}/.test(sync),
    'D4 ゲスト大会の冒頭 no-op ガードは不変（GUEST-TOURNAMENT-MODE-001 二重防御）');
  const sd = extractFn(RAW, 'saveData') || '';
  assert(sd.indexOf('syncBranchMasterOnSave(function(counts){') >= 0 && sd.indexOf('showToast(formatMasterSyncResultToast(counts))') >= 0,
    'D5 saveData は onDone で counts を受けて結果報告 toast（成功に alert を使わない＝N2 不変）');
  assert(sd.indexOf('🎪 ゲスト大会のため名簿には反映しません') >= 0 && sd.indexOf('isGuestTournament') >= 0,
    'D6 ゲスト大会中は反映せず理由を toast（#760 の挙動不変）');
}
{
  // 実行検証: 通常経路で counts が toast まで届く（マスタ保存成功時）
  // PHASE1-ISOLATE-001: 評価文字列に埋め込んでいた stub 定義とシナリオを通常コードへ出した
  //   （切り出すのは3本のまま・供与する名前は同じ 12 個）。
  const ISO_NAMES = ['formatMasterSyncResultToast', 'syncBranchMasterOnSave', 'saveData'];
  function harness(fixtures){
    const state = fixtures.state;
    const toasts = [], saved = [];
    const iso = loadIsolated(ISO_NAMES, { prelude: {
      state: state,
      _pendingNewYomi: {},
      isGuestTournament(){ return false; },
      loadBranchMaster(){ return fixtures.master; },
      saveBranchMaster(m){ saved.push(m); return fixtures.saveOk; },
      getTournamentDateFromReport(){ return '2026-07-27'; },
      ensureTournamentId(){ state.tournament_id = 't-0001'; },
      updateBranchMasterFromTournament(){ return fixtures.updateReturn; },
      readMasterSyncCounts(r){ return (r && r._counts) || null; },
      markSaveStatus(){},
      save(){},
      normalizeYomi(v){ return typeof v === 'string' ? v : ''; },
      appConfirm(){ throw new Error('confirm-must-not-be-called'); },
      showToast(m){ toasts.push(m); },
    } });
    iso.fn('saveData')();
    return { toasts: toasts, saved: saved.length };
  }
  const master = { members: [] };
  const okRun = harness({
    state: { players: {} }, master: master, saveOk: true,
    updateReturn: { _counts: { added: 2, marked: 5, yomiFilled: 0, skipped: 0 } }
  });
  assert(okRun.toasts.length === 1 && okRun.toasts[0] === '📋 名簿に反映しました: 新規追加 2人・参加記録 5人',
    'D7 通常経路: counts が toast まで届く（1回だけ通知）');
  const ngRun = harness({
    state: { players: {} }, master: master, saveOk: false,
    updateReturn: { _counts: { added: 2, marked: 5, yomiFilled: 0, skipped: 0 } }
  });
  assert(ngRun.toasts.length === 1 && ngRun.toasts[0] === '📋 名簿への反映を確認できませんでした（保存状態をご確認ください）',
    'D8 マスタ保存失敗時: 数字を出さず「反映した」と断定しない中立文言（保存失敗自体は notifySaveWarning が別途通知）');
}
{
  // ☁送信の未連携ガード経路（CLOUD-SEND-UNLINKED-GUARD-001）は onDone の引数を見ない＝表示は現行のまま
  assert(RAW.indexOf('syncBranchMasterOnSave(function(){ _send(); })') >= 0,
    'D9 ☁送信の未連携ガードは引数なしの onDone のまま（counts 追加の影響を受けない）');
}

// ============================================================
// E. 4面ドキュメント（DOC-SYNC-001 の型: いつ押す／何が起きる／間違えても／ゲスト大会では）
// ============================================================
function readDoc(rel) { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return null; } }
{
  const HELP = (RAW.match(/var HELP_TEXTS=\{[\s\S]*?\n\};/) || [''])[0].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const SURFACES = [
    ['アプリ内ヘルプ', HELP],
    ['運営サイト(index.html)', readDoc('index.html')],
    ['manual_sp', readDoc('docs/manual_sp.html')],
    ['manual_print', readDoc('docs/manual_print.html')]
  ];
  SURFACES.forEach(function (pair) {
    const name = pair[0], doc = pair[1];
    assert(!!doc, 'E0 ' + name + ' を読める');
    if (!doc) return;
    assert(doc.indexOf(NEW_NAME) >= 0, 'E1 ' + name + ' が新名称「' + NEW_NAME + '」を使う');
    assert(doc.indexOf('名簿を更新') < 0, 'E2 ' + name + ' に旧名称「名簿を更新」が残っていない');
    assert(doc.indexOf('受付が落ち着いたら1回') >= 0, 'E3 ' + name + ' に【いつ押す】受付が落ち着いたら1回');
    assert(doc.indexOf('参加記録') >= 0 && doc.indexOf('消えるもの') >= 0, 'E4 ' + name + ' に【何が起きる】参加記録が付く・消えるものは無い');
    assert(doc.indexOf('何度押しても') >= 0 && doc.indexOf('ふりがな') >= 0, 'E5 ' + name + ' に【間違えても】何度押しても安全・ふりがな衝突だけ確認');
    assert(doc.indexOf('自動で止まり') >= 0 && doc.indexOf('ゲスト大会') >= 0, 'E6 ' + name + ' に【ゲスト大会では】自動で止まる（理由が表示される）');
  });
  // #760 の思想: 「押してはいけない」ではなく「ガードが自動で止める」型で書く（人間の注意力に依存しない）
  SURFACES.forEach(function (pair) {
    const name = pair[0], doc = pair[1];
    if (!doc) return;
    assert(doc.indexOf('押してはいけない') < 0, 'E7 ' + name + ' が「押してはいけない」型で書いていない（ガードが守る＝#760 の思想）');
  });
}
{
  // STYLE-GUIDE §4.1 用語辞書（UI 規約正本）も新名称へ追随していること
  const SG = readDoc('docs/STYLE-GUIDE.md');
  assert(!!SG && SG.indexOf('| 📋 参加者を名簿に反映 |') >= 0,
    'E8 STYLE-GUIDE §4.1 用語辞書の正式呼称が新名称（旧称は「使ってはいけない揺れ」側へ）');
}

console.log('MASTER-SYNC-CLARITY-001: PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
