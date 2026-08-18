#!/usr/bin/env node
// MEMBER-EDIT-TOUCHED-COLS-001 (#901): 名簿編集 push を「操作した欄だけローカル優先」にする。
//
//   なぜ要るか（実測 2026-08-18・base e3c8e3f）:
//     編集 push（pushMemberEditToCloud）は _cloudMemberFieldCols＝**ローカル値の無条件上書き**だった。
//     そのため☁取り込み前の端末で**ふりがなの誤字だけ**直して保存すると、送信行に
//       member_kind:'member' / grade:'ippan' / city:null
//     が乗り、クラウドの「その他・女性・沼津市」が潰れる。#853 で☁送信経路だけ塞いだ誤徴収が、
//     編集 push という別経路にそのまま残っていた（参加費 実測 500円/人）。
//     かといって全欄を composeCloudMemberFieldCols に寄せると、編集パネルで**明示的に**
//     「女性→一般」「その他→支部員」と直した訂正までクラウド値に負ける（#901 の本題）。
//     → 「その保存で利用者が実際に**操作した**欄か」で分ける（composeEditPushFieldCols）。
//
//   ★「操作した」は data-init との差分ではなく**セグメントを押したか**（data-touched）で見る。
//     差分だけだと「ローカルは既に一般・クラウドだけ女性のまま」の会員で「一般」を押し直しても
//     差分ゼロ＝永久に訂正を送れない出口なしの状態になる（反証パネル実測）。
//
//   ★ 本テストが背負う自戒（反証パネル 2026-08-18）:
//     直前の試行では、UI から到達できない旧 F7 編集モーダル（openMasterEditModal・#798 で退役、
//     結線先 .master-edit-btn が生成されない）に修正を書いてしまった。app_harness の
//     document.getElementById は**未知の id でもノードを自動生成する**ため、そのテストは全緑になり
//     誤りを一つも検出しなかった。R セクションは「生きている UI の DOM 契約と到達可能性」を
//     生成 HTML から固定する網で、この失敗の再発防止そのものである。
//
//   fixture は完全架空・ネットワークアクセスなし。
// 使い方: node test/test_member_edit_touched_cols_901.js <html>

const path = require('path');
const { loadApp, readHtml } = require(path.join(__dirname, 'lib', 'app_harness.js'));

const TARGET = process.argv[2] || 'shogi_v4.html';
const EXPECTED_CHECKS = 67;   // ★ 実行本数の下限。ハング等で assertion が走らないまま緑になるのを防ぐ

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

const MEMBER_ID = 'm-kakuu-1';
const CLUB_ID = 'club-kakuu';
function fixture(over) {
  return { schema_version: 1, members: [Object.assign({
    id: MEMBER_ID, name: '架空太郎', yomi: 'かくうたろ',
    member: 'member', grade: 'ippan', city: '',
    last_class: 'A', last_attended: '2026-06-01', deleted: false,
  }, over || {}) ] };
}
const CLOUD_ROW = { member_id: MEMBER_ID, name: '架空太郎', yomi: 'かくうたろ', member_kind: 'other', grade: 'josei', city: '沼津市' };

// トップレベル関数 name の本文を、次のトップレベル関数定義の直前まで切り出す。
// 固定オフセット窓は本文が伸びると assertion が黙って窓の外へ出るため使わない。
function funcBody(raw, name) {
  const start = raw.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const next = raw.indexOf('\nfunction ', start + 1);
  return raw.slice(start, next < 0 ? raw.length : next);
}

console.log('\n【MEMBER-EDIT-TOUCHED-COLS-001 #901 名簿編集 push は操作した欄だけローカル優先】');

// ======================================================================== R: 生きている UI の DOM 契約と到達可能性

const RAW = readHtml(TARGET);
const rApp = loadApp(TARGET);
rApp.localStorage.setItem(rApp.ctx.BRANCH_MASTER_KEY, JSON.stringify(fixture()));
const tabHtml = rApp.call('buildMasterTabHtml', JSON.parse(JSON.stringify(fixture())));
const panelHtml = rApp.call('buildMasterEditPanelHtml', fixture().members[0]);
const bindTabSrc = funcBody(RAW, 'bindMasterTabEvents');
const bindPanelSrc = funcBody(RAW, 'bindMasterEditPanel');
const commitSrc = funcBody(RAW, 'masterSheetCommitNameEdit');

assert(tabHtml.indexOf('master-cell-name') >= 0,
  'R1 名簿タブの生成 HTML に編集セルの結線先 class（master-cell-name）が実在する＝編集パネルは画面から開ける');
assert(bindTabSrc.length > 1000 && bindTabSrc.indexOf('master-cell-name') >= 0,
  'R2 その class を結線しているのは bindMasterTabEvents の**本文**（死んだ関数やコメントに逃げていない）  [本文 ' + bindTabSrc.length + ' 字]');

// bindMasterEditPanel / masterSheetCommitNameEdit が引く ms-edit-* の id は、
// 編集パネルの生成 HTML に**すべて**実在しなければならない（幽霊ノードを掴んで緑にならないための網）。
const wantedIds = [];
for (const src of [bindPanelSrc, commitSrc]) {
  const re = /getElementById\('([^']+)'\)|_msSegState\('([^']+)'\)|_msInputState\('([^']+)'\)/g;
  let m; while ((m = re.exec(src)) !== null) {
    const id = m[1] || m[2] || m[3];
    if (/^ms-edit-/.test(id) && wantedIds.indexOf(id) < 0) wantedIds.push(id);
  }
}
// ★ Codex P2 (r3801845101): 「6 個ちょうど」で pin すると、#906 で市町村欄を正しく足したときに赤くなる
//   change detector になる。既知 6 個は**必須**、それ以外の追加は「生成 HTML に実在するなら」許容する。
const EXPECTED_PANEL_IDS = ['ms-edit-yomi', 'ms-edit-name', 'ms-edit-save', 'ms-edit-cancel', 'ms-edit-member', 'ms-edit-grade'];
const missingKnown = EXPECTED_PANEL_IDS.filter((id) => wantedIds.indexOf(id) < 0);
const extraIds = wantedIds.filter((id) => EXPECTED_PANEL_IDS.indexOf(id) < 0);
assert(missingKnown.length === 0,
  'R3 ハンドラが引く既知 6 個の id が 1 つも欠けていない（1 個だけ改名して黙って抜けられない）  [欠け: ' + (missingKnown.join(',') || 'なし') + ']');
const missing = wantedIds.filter((id) => panelHtml.indexOf('id="' + id + '"') < 0);
assert(missing.length === 0, 'R4 ハンドラが引く id はすべて編集パネルの生成 HTML に実在する（欠け: ' + (missing.join(',') || 'なし') + '）  [追加 id: ' + (extraIds.join(',') || 'なし') + ']');
assert(tabHtml.indexOf('id="masterCloudPullStatus"') >= 0,
  'R5 クラウド結果を出す status 行（N4）が名簿タブに実在する＝結果表示が幽霊ノード行きになっていない');

// ★ 編集できる欄の集合と、push へ渡す touched の集合が一致していること。
//   「市町村の欄が無い」ことを直接 pin すると、正しく市町村欄を足したときにも赤くなる change detector に
//   なるため、**対応関係**を pin する（欄を足して touched も配線すれば緑のまま）。
const touchedSrc = commitSrc.slice(commitSrc.indexOf('var _pushTouched='), commitSrc.indexOf('var _pushTouched=') + 400);
let pairOk = true, pairDetail = [];
for (const [key, id] of [['member', 'ms-edit-member'], ['grade', 'ms-edit-grade'], ['city', 'ms-edit-city']]) {
  const inPanel = panelHtml.indexOf('id="' + id + '"') >= 0;
  const hardFalse = new RegExp(key + ':\\s*false').test(touchedSrc);
  if (inPanel === hardFalse) { pairOk = false; }
  pairDetail.push(key + (inPanel ? '=欄あり' : '=欄なし') + (hardFalse ? '/常にfalse' : '/操作を見る'));
}
assert(pairOk, 'R6 編集パネルが持つ属性欄と push の touched が一対一（欄があるなら操作を見る・無いなら常に false）  [' + pairDetail.join(' ') + ']');
assert(panelHtml.indexOf('data-init=') >= 0 && /data-init="(member|other)"/.test(panelHtml) && /data-init="(ippan|chu|josei)"/.test(panelHtml),
  'R7 区分・級のセグメントは data-init（初期値）を持つ＝差分方向の判定ができる');
assert(bindPanelSrc.indexOf("setAttribute('data-touched','1')") >= 0,
  'R8 セグメントを押したら data-touched が立つ＝「初期値と同じ値を押し直した」も操作として拾える');

// 退役済みの旧 F7 編集モーダルへ**到達できない**ことを固定する（前回の取り違えの再発防止）。
const MODAL_MARKERS = ['master-edit-btn', 'openMasterEditModal', 'master-edit-modal', 'me-save', 'me-city'];
const leaked = MODAL_MARKERS.filter((k) => tabHtml.indexOf(k) >= 0);
assert(leaked.length === 0,
  'R9 名簿タブの生成 HTML から退役モーダルへ到達する導線が一つも無い（漏れ: ' + (leaked.join(',') || 'なし') + '）＝#901 の修正対象ではない');
console.log(panelHtml.indexOf('id="ms-edit-city"') >= 0
  ? '  ・（記録）編集パネルに市町村欄がある（#906 対応済み）。'
  : '  ・（記録）市町村を編集できる UI はアプリに存在しない（唯一の入力 me-city は #798 で退役した旧 F7 モーダル内）。別 issue 候補 #906。');

// ======================================================================== C: 純関数の真理値表

const cef = rApp.fn('composeEditPushFieldCols');
const LOCAL_DEFAULT = { member: 'member', grade: 'ippan', city: '' };
const LOCAL_REAL = { member: 'other', grade: 'josei', city: '三島市' };

let r = cef(LOCAL_DEFAULT, CLOUD_ROW, {});
assert(r.member_kind === 'other' && r.grade === 'josei' && r.city === '沼津市',
  'C1 操作していない欄はクラウドの実値を保つ（ローカルが既定値でも潰さない）');
r = cef(LOCAL_DEFAULT, CLOUD_ROW, { member: true, grade: true, city: true });
assert(r.member_kind === 'member' && r.grade === 'ippan' && r.city === null,
  'C2 操作した欄はローカルが無条件に勝つ（既定値方向の訂正もそのまま届く＝#901 の要求）');
r = cef(LOCAL_DEFAULT, CLOUD_ROW, { grade: true });
assert(r.member_kind === 'other' && r.grade === 'ippan' && r.city === '沼津市',
  'C3 欄ごとに独立して効く（級だけ操作したら級だけローカル・区分と市町村はクラウドを保つ）');
r = cef(LOCAL_REAL, CLOUD_ROW, {});
assert(r.member_kind === 'other' && r.grade === 'josei' && r.city === '三島市',
  'C4 操作していなくてもローカルが非既定なら勝つ（＝#853 composeCloudMemberFieldCols と同一規則）');
r = cef(LOCAL_DEFAULT, null, {});
assert(r.member_kind === 'member' && r.grade === 'ippan' && r.city === null,
  'C5 クラウド行が無い（新規会員・読めなかった）ときはローカル値に落ちる＝送信が止まらない');
r = cef(LOCAL_DEFAULT, CLOUD_ROW, undefined);
assert(r.member_kind === 'other' && r.grade === 'josei' && r.city === '沼津市',
  'C6 touched 省略時は保全側に倒れる（呼び出し側が渡し忘れてもクラウドを壊さない）');
assert(JSON.stringify(cef(LOCAL_DEFAULT, CLOUD_ROW, {})) === JSON.stringify(rApp.call('composeCloudMemberFieldCols', LOCAL_DEFAULT, CLOUD_ROW)),
  'C7 全欄が未操作のときは #853 の合成規則と一致する（規則を二重化していない・規則自体の正しさは C1〜C6 が見る）');

// ======================================================================== P: 実コーディネータ経由の push

function boot(fix) {
  const app = loadApp(TARGET);
  app.localStorage.setItem(app.ctx.BRANCH_MASTER_KEY, JSON.stringify(fix));
  const restoreRender = app.stub('renderMasterTab', function () {});
  ['renderPastParticipantsPanel', 'masterSheetFlashRow'].forEach((n) => app.stub(n, function () {}));
  if (app.has('__setAppModalTestResolver')) app.call('__setAppModalTestResolver', function () { return true; });
  app.stub('appConfirm', function (msg, cb) { cb(true); });
  // 実 renderMasterTab を通したいケース用（DOM mock で描画自体は空振りするが、
  // 先頭の「未保存なら commit してから畳む」判定は本物を通す）。
  app.stubRenderRestore = function () { restoreRender(); };
  const toasts = [];
  app.stub('showToast', function (m) { toasts.push(String(m)); });
  app._toasts = toasts;
  return app;
}

function mockCloud(app, opt) {
  opt = opt || {};
  const cap = { upserts: [], onConflict: [], selects: 0, eqArgs: [], inArgs: [] };
  app.ctx.window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
  app.ctx.window.supabase = { createClient: function () { return {
    auth: { getSession: function () { return Promise.resolve({ data: { session: opt.session === null ? null : { user: {} } } }); } },
    rpc: function () { return Promise.resolve({ data: [{ club_id: CLUB_ID, status: 'active' }] }); },
    from: function (t) { return {
      select: function () { return { eq: function (col, val) { cap.eqArgs.push([col, val]); return { in: function (col2, vals) {
        cap.selects++; cap.inArgs.push([col2, vals]);
        if (opt.readHangs) return new Promise(function () {});
        if (opt.readFails) return Promise.resolve({ data: null, error: { message: 'permission denied' } });
        return Promise.resolve({ data: opt.cloudRow ? [opt.cloudRow] : [], error: null });
      } }; } }; },
      upsert: function (rows, o) {
        cap.upserts.push({ table: String(t), rows: rows });
        cap.onConflict.push(o && o.onConflict);
        return { select: function () { return Promise.resolve({ data: rows, error: null }); } };
      },
    }; },
  }; } };
  return cap;
}

// 編集パネルの実 DOM 状態を作る。seg は data-init / .mep-seg-on / data-touched を実際に読ませる
// （_msSegState の実ロジックを通す＝判定をスタブで素通ししない）。
function openPanel(app, form) {
  const d = app.document;
  app.ctx._masterEditingMid = MEMBER_ID;
  function input(id, init, val) { const el = d.getElementById(id); el.setAttribute('data-init', init); el.value = val; }
  input('ms-edit-name', form.nameInit, form.name);
  input('ms-edit-yomi', form.yomiInit, form.yomi);
  function seg(id, init, sel, clicked) {
    const g = d.getElementById(id);
    g.setAttribute('data-init', init);
    if (clicked) g.setAttribute('data-touched', '1');
    g.querySelector = function () { return { getAttribute: function (k) { return k === 'data-val' ? sel : null; } }; };
  }
  seg('ms-edit-member', form.memberInit, form.member, form.memberClicked);
  seg('ms-edit-grade', form.gradeInit, form.grade, form.gradeClicked);
}
function statusText(app) { return String(app.document.getElementById('masterCloudPullStatus').textContent || ''); }
function storedName(app) { return JSON.parse(app.localStorage.getItem(app.ctx.BRANCH_MASTER_KEY)).members[0].name; }
function tick() { return new Promise(function (res) { setImmediate(res); }); }
async function settle(n) { for (let i = 0; i < (n || 5); i++) await tick(); }

const NO_TOUCH = { memberInit: 'member', member: 'member', gradeInit: 'ippan', grade: 'ippan' };

// P-A: 操作していない欄はクラウドの実値が保たれる（#901 の実害そのもの）
const caseP1 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();

  assert(cap.upserts.length === 1, 'P1 保存で members への upsert がちょうど 1 回');
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(cap.onConflict[0] === 'club_id,member_id', 'P2 onConflict は club_id,member_id（既存 sync と同一・冪等）');
  assert(JSON.stringify(Object.keys(row).sort()) === JSON.stringify(['city', 'club_id', 'grade', 'member_id', 'member_kind', 'name', 'yomi']),
    'P3 送信行の列は 7 列ちょうど（branch も deleted_at も送らない＝クラウド側の値と tombstone を保全）  [' + Object.keys(row).sort().join(',') + ']');
  assert(row.member_id === MEMBER_ID && row.club_id === CLUB_ID, 'P4 行は member_id と送信先 club_id を持つ');
  assert(row.yomi === 'かくうたろう', 'P5 編集したふりがなが行に載る（入力値が本当に使われている）');
  assert(row.name === '架空太郎', 'P6 編集していない氏名はマスタ現在値のまま載る');
  assert(cap.selects === 1, 'P7 送信前にクラウドの現在値を 1 回だけ読む（読み取り専用・ローカル名簿には触れない）');
  assert(cap.eqArgs.some(function (a) { return a[0] === 'club_id' && a[1] === CLUB_ID; }),
    'P8 読み取りは送信先クラブに限定する（他クラブの行を読んで合成しない）  [' + JSON.stringify(cap.eqArgs) + ']');
  assert(cap.inArgs.some(function (a) { return a[0] === 'member_id' && Array.isArray(a[1]) && a[1].length === 1 && a[1][0] === MEMBER_ID; }),
    'P9 読み取りは編集した会員 1 件に限定する  [' + JSON.stringify(cap.inArgs) + ']');
  assert(row.member_kind === 'other', 'P10 ★操作していない支部員区分はクラウドの実値（other）が保たれる＝既定値で潰さない');
  assert(row.grade === 'josei', 'P11 ★操作していない級はクラウドの実値（josei）が保たれる＝参加費の誤徴収が起きない');
  assert(row.city === '沼津市', 'P12 ★操作していない市町村はクラウドの実値が保たれる（従来は city:null で消していた）');
  const s = statusText(app);
  assert(/反映しました/.test(s), 'P13 クラウド反映の結果は名簿タブの status 行（N4）に出る');
  assert(/⚠/.test(s) && /支部員区分/.test(s) && /級/.test(s) && /市町村/.test(s),
    'P14 ★端末の表示と違う値をクラウドに残した欄を ⚠ で名指しする（黙ると「直したのに直っていない」ことに気づけない）');
  assert(/一括送信/.test(s), 'P15 端末の値で上書きしたいときの出口（名簿タブの一括送信）まで案内する');
  assert(app._toasts.some(function (t) { return t.indexOf('更新しました') >= 0; }), 'P16 端末側の成功トーストは不変');
  assert(app.record.alert.length === 0, 'P17 alert は出さない（当日運営を止めない）');
})();

// P-B: 差分ゼロでも「押し直した」なら訂正が届く（出口なしにしない）
const caseP2 = (async function () {
  const app = boot(fixture({ member: 'member', grade: 'ippan' }));
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  // ローカルは既に「支部員・一般」。クラウドだけ古い（その他・女性）。利用者は同じ値を押し直す。
  openPanel(app, { nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろ',
    memberInit: 'member', member: 'member', memberClicked: true,
    gradeInit: 'ippan', grade: 'ippan', gradeClicked: true });
  app.call('masterSheetCommitNameEdit');
  await settle();
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(cap.upserts.length === 1 && row.member_kind === 'member' && row.grade === 'ippan',
    'P18 ★初期値と同じ値を押し直した場合も「操作した」として届く（差分だけで判定すると永久に訂正を送れない）');
  assert(/⚠/.test(statusText(app)) && /市町村/.test(statusText(app)) && !/支部員区分/.test(statusText(app)) && !/級 は/.test(statusText(app)),
    'P19 押した2欄は届き、欄の無い市町村だけが保全対象として ⚠ に名指しされる  [' + statusText(app).slice(0, 70) + ']');
})();

// P-C: 明示的に値を変えた既定値方向の訂正（#901 の本来の要求）
const caseP3 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei' }));
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  openPanel(app, { nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろ',
    memberInit: 'other', member: 'member', memberClicked: true,
    gradeInit: 'josei', grade: 'ippan', gradeClicked: true });
  app.call('masterSheetCommitNameEdit');
  await settle();
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(cap.upserts.length === 1 && row.member_kind === 'member', 'P20 ★「その他→支部員」の訂正はクラウドへ届く（既定値方向でも負けない）');
  assert(row.grade === 'ippan', 'P21 ★「女性→一般」の訂正もクラウドへ届く');
  assert(row.city === '沼津市', 'P22 同じ保存でも操作していない市町村はクラウドの実値が保たれる（欄ごとに独立）');
})();

// P-D: クラウドを読めなかったとき（黙ってバグ挙動に戻さない）
const caseP4 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { readFails: true });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空次郎', yomiInit: 'かくうたろ', yomi: 'かくうじろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(cap.upserts.length === 1, 'P23 クラウドを読めなくても送信は止めない（fail-soft・当日運営を止めない）');
  const s = statusText(app);
  assert(/⚠/.test(s) && /読めなかった/.test(s), 'P24 ★読めなかったときは注記を出す（操作していない欄も端末値で送った可能性を黙らせない）');
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(row.name === '架空次郎' && row.yomi === 'かくうじろう', 'P25 読めなくても編集内容そのものは正しく届く');
  // ★ Codex P1 (r3801845108): 読めないときにローカル値で埋めると、まさにこの修正が防ぐ潰しが再発する。
  assert(!('member_kind' in row) && !('grade' in row) && !('city' in row),
    'P25a ★読めなかったときは未操作の属性列を送らない（UPDATE 対象外＝クラウドの実値を潰さない）  [' + Object.keys(row).sort().join(',') + ']');
})();

// P-E: 読み取りが返ってこない（詰まった回線）—— 上限で打ち切って必ず送る
const caseP5 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { readHangs: true });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空五郎', yomiInit: 'かくうたろ', yomi: 'かくうごろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(cap.upserts.length === 0 && /反映中/.test(statusText(app)), 'P26 読み取り待ちの間は送信していない（前提の確認）');
  const fired = app.flushTimers();
  await settle();
  assert(fired > 0, 'P27 読み取りに待ち上限（タイマー）が仕掛けられている');
  assert(cap.upserts.length === 1, 'P28 ★読み取りが返らなくても待ち上限で打ち切って upsert を発行する（送信が永久に出ない事故を防ぐ）');
  assert(/⚠/.test(statusText(app)) && /読めなかった/.test(statusText(app)), 'P29 打ち切ったときも「読めなかった」注記を出す');
})();

// P-F: クラウドにまだ行が無い会員（初回 push）は注記を出さない
const caseP6 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { cloudRow: null });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空三郎', yomiInit: 'かくうたろ', yomi: 'かくうさぶろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(cap.upserts.length === 1, 'P30 クラウド未登録の会員でも push する（INSERT が成立する）');
  assert(!/⚠/.test(statusText(app)), 'P31 「取得0件（新規会員）」と「取得失敗」を区別し、前者では注記を出さない');
})();

// P-G: 未ログインは従来どおり fail-soft（回帰）＋成功表示を打ち消さない
const caseP7 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { session: null, cloudRow: CLOUD_ROW });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空四郎', yomiInit: 'かくうたろ', yomi: 'かくうしろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(cap.upserts.length === 0 && cap.selects === 0, 'P32 未ログインでは読み取りも upsert も呼ばない（fail-soft skip）');
  assert(storedName(app) === '架空四郎', 'P33 未ログインでも端末への保存は成功したまま');
  const s = statusText(app);
  assert(/未反映/.test(s) && /保存済み/.test(s), 'P34 クラウド未反映は status 行に出る');
  assert(app._toasts.length === 1 && app._toasts[0].indexOf('更新しました') >= 0,
    'P35 ★端末保存の成功トーストを、クラウド未反映の通知が打ち消さない（トーストは 1 本だけ）  [' + JSON.stringify(app._toasts) + ']');
})();

// P-H: オフライン（回帰）
const caseP8 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  app.ctx.navigator.onLine = false;
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空六郎', yomiInit: 'かくうたろ', yomi: 'かくうろくろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(cap.upserts.length === 0 && cap.selects === 0, 'P36 オフラインでは読み取りも upsert も呼ばない');
  assert(/オフライン/.test(statusText(app)) && /一括送信/.test(statusText(app)), 'P37 オフラインは復旧手段まで案内する');
  assert(storedName(app) === '架空六郎', 'P38 オフラインでも端末への保存は成功したまま');
})();

// P-I: 読めなくても「操作した欄」は載る（訂正が握り潰されない）
const caseP9 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei' }));
  const cap = mockCloud(app, { readFails: true });
  openPanel(app, { nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろ',
    memberInit: 'other', member: 'member', memberClicked: true,
    gradeInit: 'josei', grade: 'ippan', gradeClicked: true });
  app.call('masterSheetCommitNameEdit');
  await settle();
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(row.member_kind === 'member' && row.grade === 'ippan',
    'P39 読めなくても利用者が操作した欄は載る（訂正まで握り潰さない）');
  assert(!('city' in row), 'P40 同じ行で未操作の市町村は列ごと送らない（欄ごとに独立）');
})();

// P-J: パネルを開いたまま外部再描画が入っても「押し直し」が消えない
const caseP10 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  openPanel(app, { nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろ',
    memberInit: 'member', member: 'member', memberClicked: true,
    gradeInit: 'ippan', grade: 'ippan', gradeClicked: true });
  // 並び替え・行チェック・☁取得などの外部経路はすべて renderMasterTab を呼ぶ。
  app.stubRenderRestore();
  app.call('renderMasterTab');
  await settle();
  assert(cap.upserts.length === 1,
    'P41 ★再描画前に押し直しが commit される（差分ゼロの touched を dirty 判定が捨てると黙って消える・Codex P1）');
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(row.member_kind === 'member' && row.grade === 'ippan', 'P42 その commit で訂正がクラウドへ届く');
})();

// ======================================================================== D: 削除/復元 push の属性の扱い

// D-1: クラウドに実値がある会員を、既定値のままの端末から削除しても潰さない
const caseD1 = (async function () {
  const app = boot(fixture({ member: 'member', grade: 'ippan', city: '' }));
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  app.ctx._masterSelected[MEMBER_ID] = true;
  app.call('masterSheetDeleteSelected');
  await settle();
  assert(cap.upserts.length === 1, 'D1 削除はクラウドへ 1 回 upsert する（従来どおり）');
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(typeof row.deleted_at === 'string' && row.deleted_at.length > 0, 'D2 削除行は deleted_at を持つ');
  assert(cap.selects === 1, 'D3 削除 push も送信前にクラウドの現在値を読む');
  assert(row.member_kind === 'other' && row.grade === 'josei' && row.city === '沼津市',
    'D4 ★削除でクラウドの区分・級・市町村を潰さない（従来はローカル既定値と NULL で上書きしていた）');
})();

// D-2: クラウドにまだ行が無い会員は、削除の INSERT でローカル属性が入る（Codex P1）
const caseD2 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei', city: '沼津市' }));
  const cap = mockCloud(app, { cloudRow: null });
  app.ctx._masterSelected[MEMBER_ID] = true;
  app.call('masterSheetDeleteSelected');
  await settle();
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(row.member_kind === 'other' && row.grade === 'josei' && row.city === '沼津市',
    'D5 ★クラウドに行が無い会員の削除は完全な行として INSERT される（属性を落とすと以後どこからも補われない・Codex P1）');
})();

// D-3: 読めなかったときは属性列を送らず、黙らない
const caseD3 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei', city: '沼津市' }));
  const cap = mockCloud(app, { readFails: true });
  app.ctx._masterSelected[MEMBER_ID] = true;
  app.call('masterSheetDeleteSelected');
  await settle();
  const row = ((cap.upserts[0] || {}).rows || [{}])[0];
  assert(cap.upserts.length === 1 && typeof row.deleted_at === 'string',
    'D6 読めなくても削除そのものは反映する（fail-soft）');
  assert(!('member_kind' in row) && !('grade' in row) && !('city' in row),
    'D7 読めなかったときは属性列を送らない（既存行を潰さない側に倒す）');
  assert(/⚠/.test(statusText(app)) && /読めなかった/.test(statusText(app)), 'D8 その旨を status 行で明示する');
})();

// ======================================================================== 実行

const all = Promise.all([caseP1, caseP2, caseP3, caseP4, caseP5, caseP6, caseP7, caseP8, caseP9, caseP10, caseD1, caseD2, caseD3]);
// ★ どれかがハングすると then が走らず、Node は既定の exit 0 で終了する＝run_tests.sh が「全PASS」と表示する。
//   実測でそれが起きたため、待ちに上限を置いて必ず結果を出す。
const guard = new Promise(function (res) { setTimeout(function () { res('TIMEOUT'); }, 20000).unref && setTimeout(function () {}, 0); });
Promise.race([all.then(function () { return 'DONE'; }), guard]).then(function (how) {
  if (how === 'TIMEOUT') { fail++; console.error('  ✗ テストが 20 秒以内に完了しなかった（アプリ側の Promise が解決していない）'); }
  const ran = pass + fail;
  if (ran !== EXPECTED_CHECKS) {
    fail++;
    console.error('  ✗ assertion の実行本数が想定と違う（想定 ' + EXPECTED_CHECKS + ' / 実際 ' + ran + '）＝どこかで assertion が走らずに終わっている');
  }
  console.log(`  結果: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.error('  ✗ 例外: ' + ((e && e.stack) || e));
  process.exit(1);
});
