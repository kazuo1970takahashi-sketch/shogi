#!/usr/bin/env node
// BULK-ENTRY-001 (#761): 参加者の一括登録（エクセル/CSV コピペ）の受入テスト。
//   背景: 参加者の大半がマスタ未登録・約30名の別大会では1人ずつの受付が当日ボトルネックになる。
//   事前リストを貼り付け1回で大会に直接一括登録（マスタ非経由）し、当日は来場チェックだけにする。
//   受入基準（Issue #761 / ブリーフ §3）:
//     1. 30名リスト（氏名・ふりがな・クラス）貼り付け→プレビュー→確定で正しいクラス・ふりがな・entry_no で登録。
//     2. 一括登録の前後で支部マスタ（localStorage の名簿）が byte 単位で不変（マスタを読みも書きもしない）。
//     3. エラー行（同名・空名・未知クラス）はプレビューで理由つきで見え、確定後トーストにスキップ数が出る。
//     4. 「区分の既定＝一般」で登録した参加者の会費が報告書で一般（支部員以外＝getFee 1000円）として集計される。
//     5. 通常大会で一括登録した参加者は未連携（member_id なし）となり、「📋 参加者を名簿に反映」で名簿に新規追加される。
//     6. 大会開始後はボタンが無効で、注記が理由を説明する。
//   データは完全架空のみ・読み取り専用。
const fs = require('fs');
const path = require('path');
const target = process.argv[2] || 'shogi_v4.html';
const root = path.dirname(path.resolve(target));
const RAW = fs.readFileSync(target, 'utf8');
let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// ---- 関数抽出（brace バランス・test_master_sync_clarity_001 と同型）
function extractFn(name) {
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

const BTN_LABEL = '📥 まとめて登録（エクセルから貼り付け）';

// ============================================================
// A. UI 静的構造と結線（build/bind 分離）
// ============================================================
assert(RAW.indexOf('id="bulkEntryBtn"') >= 0 && RAW.indexOf('>' + BTN_LABEL + '</button>') >= 0,
  'A1 受付タブに「' + BTN_LABEL + '」ボタン（#bulkEntryBtn）がある');
{
  // 「📋 名簿から受付」の下に配置（Issue UI イメージ）
  const pp = RAW.indexOf('id="past-participants-section"');
  const be = RAW.indexOf('id="bulk-entry-section"');
  const manual = RAW.indexOf('id="reg-manual-details"');
  assert(pp >= 0 && be > pp && manual > be, 'A2 配置＝📋 名簿から受付の下・手入力 details の上');
}
assert(RAW.indexOf('id="bulk-entry-fullscreen"') >= 0 && RAW.indexOf('id="bulkEntryCloseBtn"') >= 0,
  'A3 全画面ビュー（#bulk-entry-fullscreen・PP-FULLSCREEN-001 と同型）と ✕ 閉じるがある');
['bulk-entry-text', 'bulk-entry-class', 'bulk-entry-member', 'bulk-entry-preview', 'bulk-entry-summary', 'bulkEntryConfirmBtn']
  .forEach(id => assert(RAW.indexOf('id="' + id + '"') >= 0, 'A4 モーダル要素 #' + id + ' がある'));
{
  const bind = extractFn('bindBulkEntryEvents') || '';
  assert(bind.indexOf("addEventListener('click',openBulkEntryFullscreen)") >= 0, 'A5 開くボタンの結線（bulkEntryBtn→openBulkEntryFullscreen）');
  assert(bind.indexOf("addEventListener('click',closeBulkEntryFullscreen)") >= 0, 'A6 閉じるボタンの結線');
  assert(bind.indexOf("addEventListener('click',confirmBulkEntry)") >= 0, 'A7 確定ボタンの結線');
  assert(bind.indexOf("addEventListener('input',updateBulkEntryPreview)") >= 0, 'A8 貼り付け欄の input でプレビュー更新（別押しのプレビューボタン不要）');
  const reg = extractFn('bindRegistrationEvents') || '';
  assert(reg.indexOf('bindBulkEntryEvents();') >= 0, 'A9 bindRegistrationEvents から1回だけ結線（build/bind 分離）');
  const rr = extractFn('renderRegList') || '';
  assert(rr.indexOf('renderBulkEntryButton();') >= 0, 'A10 renderRegList が導線の disabled/注記を毎描画同期');
}
{
  // 区分の既定 select（支部員/一般・全行適用＝作者決定 2026-07-13）
  const memPos = RAW.indexOf('id="bulk-entry-member"');
  const seg = RAW.slice(memPos, memPos + 300);
  assert(memPos >= 0 && seg.indexOf('value="member"') >= 0 && seg.indexOf('value="other"') >= 0,
    'A11 区分の既定 select は member/other の2値');
  assert(seg.indexOf('支部員') >= 0 && seg.indexOf('一般') >= 0, 'A12 選択肢の表示は 支部員／一般（支部員以外）');
}

// ============================================================
// B. parseBulkEntryText（純関数・タブ/カンマ・空行・列省略）
// ============================================================
const PURE_NAMES = ['isValidEntryNo', 'reconcileEntryNos', 'nextEntryNoForClass', 'normalizePersonName', 'normalizeYomi',
  'isSafeClassId', 'parseBulkEntryText', 'resolveBulkEntryClassId', 'validateBulkEntryRows', 'bulkAddPlayers',
  'formatBulkEntryResultToast'];
const pureSrcs = PURE_NAMES.map(extractFn);
assert(pureSrcs.every(s => !!s), 'B0 検証に必要な純関数一式を抽出できる（' + PURE_NAMES.filter((n, i) => !pureSrcs[i]).join('・') + ' が欠落）');
const env = new Function(pureSrcs.join('\n') + `
  return {parse:parseBulkEntryText,resolve:resolveBulkEntryClassId,validate:validateBulkEntryRows,
          add:bulkAddPlayers,toast:formatBulkEntryResultToast,nextNo:nextEntryNoForClass};
`)();
{
  const rows = env.parse('架空太郎\tかくうたろう\tA\n架空次郎,かくうじろう,B\n\n架空三郎\n');
  assert(rows.length === 3, 'B1 タブ区切り/カンマ区切り混在＋空行スキップで3行');
  assert(rows[0].name === '架空太郎' && rows[0].yomi === 'かくうたろう' && rows[0].clsRaw === 'A', 'B2 タブ区切りの3列を分解');
  assert(rows[1].name === '架空次郎' && rows[1].clsRaw === 'B', 'B3 カンマ区切り（CSV）も受け付ける');
  assert(rows[2].name === '架空三郎' && rows[2].yomi === '' && rows[2].clsRaw === '', 'B4 ふりがな・クラス列は省略可');
  assert(rows[2].lineNo === 4, 'B5 lineNo は貼り付けテキスト内の行番号（空行を数える＝元リストを特定できる）');
  const rows2 = env.parse('架空四郎\tよみ\tA\t余り列\t余り2');
  assert(rows2.length === 1 && rows2[0].clsRaw === 'A', 'B6 4列目以降（Excel の余り列）は無視');
  assert(env.parse('　\n \t \n').length === 0 && env.parse(null).length === 0, 'B7 空白のみの行・非文字列は安全にスキップ');
}

// ============================================================
// C. クラス解決（未知クラスは自動作成しない）
// ============================================================
{
  const classes = [{ id: 'A', name: 'Aクラス' }, { id: 'B', name: 'Bクラス' }, { id: 'C', name: '初心者' }];
  assert(env.resolve('A', classes) === 'A' && env.resolve('Aクラス', classes) === 'A', 'C1 classId・クラス名のどちらでも解決');
  assert(env.resolve('初心者', classes) === 'C', 'C2 カスタム名クラスも名前で解決');
  assert(env.resolve('D', classes) === null && env.resolve('Ａ', classes) === null, 'C3 未知の表記は null（自動作成しない＝謎クラス事故防止）');
}

// ============================================================
// D. 行単位バリデーション（受入基準3の前段・マスタ非経由）
// ============================================================
function fxState() {
  return {
    classes: [{ id: 'A', name: 'Aクラス' }, { id: 'B', name: 'Bクラス' }],
    players: { A: [{ id: 'p0', name: '既登録一郎', cls: 'A', entry_no: 1 }], B: [] }
  };
}
{
  const parsed = env.parse('架空太郎\tかくうたろう\tA\n\t\tA\n既登録一郎\t\t\n架空太郎\t\t\n新規花子\t\tX\n新規次郎');
  const rows = env.validate(parsed, 'B', 'other', fxState());
  assert(rows.length === 6, 'D0 6行が検証対象');
  assert(rows[0].error === null && rows[0].clsId === 'A' && rows[0].yomi === 'かくうたろう', 'D1 正常行は error=null');
  assert(rows[1].error === 'empty-name', 'D2 空氏名は empty-name');
  assert(rows[2].error === 'dup-registered', 'D3 既登録者との同名は dup-registered（normalizePersonName 比較）');
  assert(rows[3].error === 'dup-paste', 'D4 貼り付け内の同名重複（後発側）は dup-paste');
  assert(rows[4].error === 'unknown-class', 'D5 未知クラス名は unknown-class');
  assert(rows[5].error === null && rows[5].clsId === 'B', 'D6 クラス列省略は既定クラスで補完');
  assert(rows.every(r => r.member === 'other'), 'D7 区分の既定は全行に適用（作者決定）');
  const st2 = fxState();
  const before = JSON.stringify(st2);
  env.validate(parsed, 'B', 'other', st2);
  assert(JSON.stringify(st2) === before, 'D8 validate は state を変更しない（プレビューは無副作用）');
  // normalizePersonName 規則＝前後空白除去・全角空白→半角空白・連続空白圧縮（空白の除去はしない）。
  // L2-SWEEP-01 ⑤ (#784 レビュー Nice-1): 旧記述「＝addPlayer と同一」は不正確だったため修正。
  //   addPlayer の同名拒否は trim 後の生文字列一致であり、正規化まで行う bulk 側の方が厳しい（安全側に非対称・挙動不変）。
  const stSp = fxState();
  stSp.players.A.push({ id: 'pSp', name: '既登録 二郎', cls: 'A', entry_no: 2 });
  const rowsZ = env.validate(env.parse('既登録　二郎,よみ\n  既登録一郎  ,よみ'), 'A', 'member', stSp);
  assert(rowsZ[0].error === 'dup-registered' && rowsZ[1].error === 'dup-registered',
    'D9 normalizePersonName 同名規則で検知（addPlayer の生文字列一致より厳しい正規化比較＝安全側）');
}

// ============================================================
// E. bulkAddPlayers（受入基準1・4・5＝addPlayer と完全同一形状・マスタ非経由）
// ============================================================
{
  // 30名リスト（受入基準1）: A 15名 / B 15名・ふりがな・クラス付き
  let text = '';
  for (let i = 1; i <= 30; i++) text += '架空選手' + i + '\tかくうせんしゅ\t' + (i <= 15 ? 'A' : 'B') + '\n';
  const st = fxState();
  const rows = env.validate(env.parse(text), 'A', 'other', st);
  const result = env.add(rows, st);
  assert(result.added === 30 && result.skipped === 0, 'E1 30名が全員登録される（added=30）');
  assert(st.players.A.length === 16 && st.players.B.length === 15, 'E2 指定クラスへ配属（A 既存1+15 / B 15）');
  const enA = st.players.A.slice(1).map(p => p.entry_no);
  assert(enA.join(',') === Array.from({ length: 15 }, (_, i) => i + 2).join(','), 'E3 entry_no は max+1 から連番（A: 2..16）');
  const enB = st.players.B.map(p => p.entry_no);
  assert(enB.join(',') === Array.from({ length: 15 }, (_, i) => i + 1).join(','), 'E4 B クラスは 1..15');
  const p = st.players.A[1];
  assert(Object.keys(p).sort().join(',') === 'city,cls,entry_no,grade,id,member,name,yomi',
    'E5 player の形状は addPlayer の手入力と完全同一（id/name/cls/member/grade/city/yomi/entry_no）');
  assert(!Object.prototype.hasOwnProperty.call(p, 'member_id'), 'E6 member_id を持たない＝未連携（受入基準5の前提）');
  assert(p.member === 'other' && p.grade === 'ippan' && p.city === '', 'E7 区分の既定＝一般（member:other・grade:ippan・city 空）');
  assert(p.yomi === 'かくうせんしゅ', 'E8 ふりがなは normalizeYomi 済みで player.yomi へ（星取表の検索・ソート互換）');
  // 受入基準4: 会費が一般（支部員以外）として集計される＝getFee(member,grade)
  const getFee = new Function(extractFn('getFee') + '; return getFee;')();
  assert(getFee(p.member, p.grade) === 1000, 'E9 区分の既定＝一般の会費は 1000円（支部員以外の一般）＝報告書の会費合計に反映');
  const getFeeMember = getFee('member', 'ippan');
  assert(getFeeMember === 500, 'E10 区分の既定＝支部員なら 500円（既存 getFee 無改変の確認）');
  // エラー行の除外（受入基準3）: スキップは登録されない
  const st3 = fxState();
  const rows3 = env.validate(env.parse('架空太郎\t\tA\n既登録一郎\t\tA\n\t\tA'), 'A', 'member', st3);
  const r3 = env.add(rows3, st3);
  assert(r3.added === 1 && r3.skipped === 2 && st3.players.A.length === 2, 'E11 エラー行は登録から除外（added=1/skipped=2）');
  assert(r3.skippedByReason['dup-registered'] === 1 && r3.skippedByReason['empty-name'] === 1, 'E12 スキップ理由の内訳を保持');
}

// ============================================================
// F. マスタ非経由（受入基準2＝支部マスタ byte 不変）
// ============================================================
{
  // 純関数群のソースがマスタ系 API・localStorage・サジェスト経路へ一切触れない（静的ピン）
  const MASTER_APIS = ['loadBranchMaster', 'saveBranchMaster', 'updateBranchMasterFromTournament', 'BRANCH_MASTER',
    'localStorage', 'findMasterSuggestions', 'attachMemberIdToPlayer', 'findMemberCandidates'];
  ['parseBulkEntryText', 'resolveBulkEntryClassId', 'validateBulkEntryRows', 'bulkAddPlayers', 'formatBulkEntryResultToast',
    'confirmBulkEntry', 'updateBulkEntryPreview', 'openBulkEntryFullscreen', 'collectBulkEntryRows'].forEach(fn => {
      const src = extractFn(fn) || '';
      const hit = MASTER_APIS.filter(a => src.indexOf(a) >= 0);
      assert(src && hit.length === 0, 'F1 ' + fn + ' がマスタ/サジェスト/localStorage に触れない（検出: ' + hit.join('・') + '）');
    });
  // 実行検証: マスタ読み出しが呼ばれたら throw する環境でも一括登録が完走する
  const harness = new Function(pureSrcs.join('\n') + `
    function loadBranchMaster(){ throw new Error('master-must-not-be-read'); }
    function saveBranchMaster(){ throw new Error('master-must-not-be-written'); }
    var st = {classes:[{id:'A',name:'Aクラス'}],players:{A:[]}};
    var rows = validateBulkEntryRows(parseBulkEntryText('架空太郎\\tかくうたろう\\tA'), 'A', 'member', st);
    return bulkAddPlayers(rows, st);
  `);
  let ok = null;
  try { ok = harness(); } catch (e) { ok = null; }
  assert(!!ok && ok.added === 1, 'F2 マスタ読み書きが禁止された環境でも一括登録が完走（byte 不変の実行証明）');
}

// ============================================================
// G. 受入基準5: 未連携＝「📋 参加者を名簿に反映」で名簿へ新規追加される
// ============================================================
{
  const names = ['isValidYmd', 'todayYmd', 'findMemberCandidates', 'attachMemberIdToPlayer', 'addTournamentIdOnce',
    'recalcMemberAttendance', 'generateMemberId', 'createMemberFromParticipant', 'listClassIdsForMasterSync',
    'attachMasterSyncCounts', 'readMasterSyncCounts', 'updateBranchMasterFromTournament'];
  const srcs = names.map(extractFn);
  assert(srcs.every(s => !!s), 'G0 マスタ同期の純関数一式を抽出できる');
  const menv = new Function(pureSrcs.join('\n') + `
    var _phaseA2State={cryptoNotificationShown:false};
    function showMsg(){}
    var crypto={randomUUID:function(){ return 'uuid-'+(crypto._n=(crypto._n||0)+1); }};
    ${srcs.join('\n')}
    var st = {classes:[{id:'A',name:'Aクラス'}],players:{A:[]}};
    var rows = validateBulkEntryRows(parseBulkEntryText('架空太郎\\tかくうたろう\\tA\\n架空次郎\\t\\tA'), 'A', 'other', st);
    bulkAddPlayers(rows, st);
    var master = {members:[]};
    var ret = updateBranchMasterFromTournament(st, master, {tournament_id:'t-0001', tournament_date:'2026-07-27'});
    return {counts: readMasterSyncCounts(ret), members: master.members.length};
  `)();
  assert(!!menv.counts && menv.counts.added === 2 && menv.members === 2,
    'G1 一括登録した2名が「📋 参加者を名簿に反映」で名簿へ新規追加される（通常大会の従来動作）');
}

// ============================================================
// H. 確定トースト（受入基準3・#757 の結果報告型）
// ============================================================
{
  const f = env.toast;
  assert(f({ added: 28, skipped: 2, skippedByReason: { 'dup-registered': 2 } }) === '📥 28人を登録しました（スキップ 2行: 同名）',
    'H1 ブリーフ確定文言: 📥 28人を登録しました（スキップ 2行: 同名）');
  assert(f({ added: 30, skipped: 0, skippedByReason: {} }) === '📥 30人を登録しました', 'H2 スキップなしは人数のみ');
  assert(f({ added: 27, skipped: 3, skippedByReason: { 'dup-registered': 1, 'dup-paste': 1, 'unknown-class': 1 } })
    === '📥 27人を登録しました（スキップ 3行: 同名 2・クラス名不明 1）',
    'H3 複数理由は内訳つき（dup-registered/dup-paste は利用者語彙の「同名」に集約）');
  assert(f({ added: 1, skipped: 1, skippedByReason: { 'empty-name': 1 } }) === '📥 1人を登録しました（スキップ 1行: 空の氏名）',
    'H4 空氏名の理由表記');
  const confirmSrc = extractFn('confirmBulkEntry') || '';
  assert(confirmSrc.indexOf('showToast(formatBulkEntryResultToast(result))') >= 0,
    'H5 確定は純関数でメッセージ組み立て→showToast（#757 と同型・textContent）');
  const toastSrc = extractFn('showToast') || '';
  assert(toastSrc.indexOf('el.textContent=') >= 0, 'H6 showToast は textContent（XSS 安全・無改変）');
}

// ============================================================
// I. 開始前限定（受入基準6）
// ============================================================
{
  const rb = extractFn('renderBulkEntryButton') || '';
  assert(rb.indexOf('state&&state.started') >= 0 && rb.indexOf('btn.disabled=started') >= 0,
    'I1 renderBulkEntryButton が state.started でボタンを無効化');
  assert(rb.indexOf("note.style.display=started?'block':'none'") >= 0, 'I2 開始後は注記を表示');
  assert(RAW.indexOf('id="bulk-entry-note"') >= 0 && RAW.indexOf('大会開始後はまとめて登録できません') >= 0,
    'I3 注記が理由（開始後は不可・手入力で1人ずつ）を説明');
  const op = extractFn('openBulkEntryFullscreen') || '';
  assert(op.indexOf('state&&state.started') >= 0, 'I4 open 側にも started ガード（disabled と二重防御）');
  const cf = extractFn('confirmBulkEntry') || '';
  assert(cf.indexOf('state&&state.started') >= 0, 'I5 確定側にも started ガード（モーダル表示中の開始に備える）');
}

// ============================================================
// J. プレビュー（受入基準3の前段・XSS 安全）
// ============================================================
{
  const up = extractFn('updateBulkEntryPreview') || '';
  assert(up.indexOf('textContent') >= 0 && up.indexOf('createElement') >= 0,
    'J1 プレビュー表は DOM API（createElement/textContent）で描画＝貼り付け値の innerHTML 流入なし');
  assert(up.indexOf('✅ 登録できます') >= 0 && up.indexOf('bulkEntryErrorLabel') >= 0, 'J2 状態列は ✅/⚠＋理由');
  assert(up.indexOf('登録できる ') >= 0 && up.indexOf('エラー ') >= 0, 'J3 サマリ「登録できる N人・エラー M行」');
  const el = extractFn('bulkEntryErrorLabel') || '';
  ['氏名が空です', '同名', 'クラスが見つかりません'].forEach(s =>
    assert(el.indexOf(s) >= 0, 'J4 エラー理由文言（' + s + '）'));
  const cf = extractFn('confirmBulkEntry') || '';
  assert(cf.indexOf('collectBulkEntryRows()') >= 0 && (extractFn('updateBulkEntryPreview') || '').indexOf('collectBulkEntryRows()') >= 0,
    'J5 プレビューと確定は同じ検証窓口（collectBulkEntryRows）を通る');
  assert(cf.indexOf('renderRegList();save();') >= 0, 'J6 確定後は再描画→保存（finalizeAddPastParticipants と同分担）');
  assert(cf.indexOf('verifyPlayerPersistedById') >= 0 && cf.indexOf('SAVE-003b') >= 0,
    'J7 SAVE-003b 保存確認（バッチ追加の既存規範に追随）');
}

// ============================================================
// K. 既存経路の無改変（ブリーフ §4）
// ============================================================
{
  const ap = extractFn('addPlayer') || '';
  const fz = extractFn('finalizeAddPastParticipants') || '';
  assert(ap.indexOf('bulkAddPlayers') < 0 && ap.indexOf('bulk-entry') < 0, 'K1 単発受付 addPlayer は無改変（bulk へ非依存）');
  assert(fz.indexOf('bulkAddPlayers') < 0, 'K2 名簿からの一括受付 finalizeAddPastParticipants は無改変');
  assert(RAW.indexOf("document.getElementById('addBtn').addEventListener('click',addPlayer)") >= 0,
    'K3 単発追加の結線は不変');
}

// ============================================================
// L. 4面ドキュメント（DOC-SYNC-001 の型: いつ使う／何が起きる／間違えても／ゲスト大会では）
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
    assert(!!doc, 'L0 ' + name + ' を読める');
    if (!doc) return;
    assert(doc.indexOf(BTN_LABEL) >= 0, 'L1 ' + name + ' が正式呼称「' + BTN_LABEL + '」で案内');
    assert(doc.indexOf('大会開始前') >= 0, 'L2 ' + name + ' に【いつ使う】大会開始前（事前リストのある大会）');
    assert(doc.indexOf('プレビュー') >= 0 && doc.indexOf('確定') >= 0, 'L3 ' + name + ' に【何が起きる】貼り付け→プレビュー→確定');
    assert(doc.indexOf('自動で除外') >= 0, 'L4 ' + name + ' に【間違えても】エラー行は自動で除外・理由が見える');
    assert(doc.indexOf('ゲスト大会') >= 0, 'L5 ' + name + ' に【ゲスト大会では】の言及（マスタ非経由＝同一動作）');
  });
  // 名簿に載らないこと（マスタ非経由）の明記＝「押すと名簿が変わるのでは」という誤解を作らない
  SURFACES.forEach(function (pair) {
    if (!pair[1]) return;
    assert(/名簿[^。]{0,30}(載りません|載らない|登録されません)/.test(pair[1]),
      'L6 ' + pair[0] + ' が「名簿には載らない（マスタ非経由）」を明記');
  });
  const SG = readDoc('docs/STYLE-GUIDE.md');
  assert(!!SG && SG.indexOf('| ' + BTN_LABEL + ' |') >= 0, 'L7 STYLE-GUIDE §4.1 用語辞書に正式呼称を登録');
}

console.log('BULK-ENTRY-001: PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
