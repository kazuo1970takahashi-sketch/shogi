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
//
//   ★ MEMBER-UPSERT-RPC-001 (#909) で機構が変わった（2026-08-19）:
//     「送信前に members を読む → 未操作の欄はクラウド値を採用して upsert」を
//     **RPC 1往復**（app_upsert_member_edit / app_upsert_member_edits_bulk）へ置き換えた。
//     列の保全は `on conflict do update set` に列を挙げるか否かで決まり、クライアントは
//     touched をそのまま p_set_* として渡すだけになった。#901 の命題（操作した欄だけ
//     ローカル優先・押し直しも届く・保全した欄は ⚠ で名指し）は**そのまま生きている**ので、
//     このテストはそれを新しい機構の上で測り直している。SQL 側の真理値表は
//     test/member_upsert_rpc_pgtest.sh（実 PG・35本）と member_upsert_bulk_pgtest.sh（36本）。
//
//   fixture は完全架空・ネットワークアクセスなし。
// 使い方: node test/test_member_edit_touched_cols_901.js <html>

const path = require('path');
const { loadApp, readHtml } = require(path.join(__dirname, 'lib', 'app_harness.js'));

const TARGET = process.argv[2] || 'shogi_v4.html';
const EXPECTED_CHECKS = 94;   // ★ 実行本数の下限。ハング等で assertion が走らないまま緑になるのを防ぐ

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

// MEMBER-UPSERT-RPC-001 (#909): composeEditPushFieldCols は退役した。
//   「操作していない欄はクラウドの実値を残す」判定は **SQL 側1箇所**（app_upsert_member_edit の
//   `on conflict do update set` に列を挙げるか否か）へ移り、クライアントは touched をそのまま
//   p_set_* として渡すだけになった。SQL 側の真理値表は test/member_upsert_rpc_pgtest.sh が
//   **実 PostgreSQL** に対して 35 本で固定している（モックの真理値表で二重化しない）。
//   クライアントに残った純関数は「⚠ に何を名指しするか」＝_editAttrKeptLabels だけ。
const kept = rApp.fn('_editAttrKeptLabels');
const LOCAL_DEFAULT_COLS = { member_kind: 'member', grade: 'ippan', city: null };

assert(JSON.stringify(kept({ inserted: true, member_kind: 'member', grade: 'ippan', city: null }, LOCAL_DEFAULT_COLS)) === '[]',
  'C1 残った値が端末の表示と同じなら何も名指ししない（毎回 ⚠ が出て本物が埋もれるのを防ぐ）');
assert(JSON.stringify(kept({ member_kind: 'other', grade: 'josei', city: '沼津市' }, LOCAL_DEFAULT_COLS)) === JSON.stringify(['支部員区分', '級', '市町村']),
  'C2 ★クラウドに残った実値が端末と違う欄をすべて名指しする（黙ると「直したのに直っていない」に気づけない）');
assert(JSON.stringify(kept({ member_kind: 'member', grade: 'josei', city: null }, LOCAL_DEFAULT_COLS)) === JSON.stringify(['級']),
  'C3 欄ごとに独立して効く（違う欄だけ名指しする）');
assert(JSON.stringify(kept({ member_kind: null, grade: null, city: null }, LOCAL_DEFAULT_COLS)) === '[]',
  'C4 ★残った値が NULL（クラウドに未設定）の欄は名指ししない（下り merge の非空ガードで読み飛ばされる＝誤った値は伝播しない）');
assert(JSON.stringify(kept({ member_kind: 'other', grade: 'josei', city: '沼津市' }, { member_kind: 'other', grade: 'josei', city: '沼津市' })) === '[]',
  'C5 端末が非既定値でも一致していれば名指ししない');
assert(JSON.stringify(kept(null, LOCAL_DEFAULT_COLS)) === '[]' && JSON.stringify(kept({}, null)) === '[]',
  'C6 戻りが無い/引数が欠けても例外にしない（成功表示を壊さない・純関数）');
assert(JSON.stringify(kept({ member_kind: 'member', grade: 'ippan', city: '沼津市' }, { member_kind: 'member', grade: 'ippan', city: '' })) === JSON.stringify(['市町村']),
  'C7 端末の市町村が空でクラウドに実値があるときは名指しする（空 vs 実値は「違う」）');

// ★ Codex P1 (r3810188007): p_set_* を「操作した欄だけ」にすると、クラウドの旧行が NULL で
//   端末に実値がある会員の属性が永久に届かず、別端末が既定値へ確定して誤徴収が復活する。
//   規則は「この端末がその欄について情報を持っているか」＝操作した OR ローカルが非既定値。
const flags = rApp.fn('_editPushSetFlags');
const DEF_COLS = { member_kind: 'member', grade: 'ippan', city: null };
const REAL_COLS = { member_kind: 'other', grade: 'josei', city: '三島市' };

let f = flags(DEF_COLS, {});
assert(f.member_kind === false && f.grade === false && f.city === false,
  'C8 ★既定値のまま未操作なら送らない（既定値で NULL を埋めると「未設定」が「既定値だと主張した」に変わる＝#853 の本題）');
f = flags(REAL_COLS, {});
assert(f.member_kind === true && f.grade === true && f.city === true,
  'C9 ★未操作でもローカルが非既定値なら送る（#853 案E・#901 と同一規則。これが無いと NULL の旧行に実値が永久に届かない）');
f = flags(DEF_COLS, { member: true, grade: true, city: true });
assert(f.member_kind === true && f.grade === true && f.city === true,
  'C10 操作した欄は既定値でも送る（「その他→支部員」「女性→一般」の訂正が届く＝#901 の本題）');
f = flags({ member_kind: 'member', grade: 'chu', city: '' }, {});
assert(f.member_kind === false && f.grade === true && f.city === false,
  'C11 欄ごとに独立して決まる（中学生以下も非既定値）');
f = flags(null, null);
assert(f.member_kind === false && f.grade === false && f.city === false,
  'C12 引数が欠けても例外にせず保全側（false）に倒れる');
// 規則が #853 の合成規則と一致していることを、真理値表の重複ではなく **等価性**で見る。
//   set が false なら「クラウド値を採る」＝composeCloudMemberFieldCols の結果と一致するはず。
const cccOf = (m, cloud) => rApp.call('composeCloudMemberFieldCols', m, cloud);
const M_REAL = { member: 'other', grade: 'josei', city: '三島市' };
const M_DEF = { member: 'member', grade: 'ippan', city: '' };
for (const [label, m] of [['非既定', M_REAL], ['既定', M_DEF]]) {
  const lc = rApp.call('_cloudMemberFieldCols', m);
  const fl = flags(lc, {});
  const merged = cccOf(m, CLOUD_ROW);
  const viaFlags = {
    member_kind: fl.member_kind ? lc.member_kind : CLOUD_ROW.member_kind,
    grade: fl.grade ? lc.grade : CLOUD_ROW.grade,
    city: fl.city ? lc.city : CLOUD_ROW.city,
  };
  assert(JSON.stringify(merged) === JSON.stringify(viaFlags),
    'C13 未操作時の p_set_* は #853 の合成規則と等価（' + label + '）＝規則を二重化していない  [' + JSON.stringify(viaFlags) + ']');
}

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

// #909 の mock は **RPC の契約をそのまま実装する**。
//   なぜ「呼ばれたことだけ」を見ないか: このスライスの命題は「クラウドの実値が潰れない」であって
//   「RPC を呼んだ」ではない。呼び出しの記録だけを見る mock は、p_set_* を取り違えても緑になる。
//   なぜ契約の再実装が二重化にならないか: SQL 側の真理値表は member_upsert_rpc_pgtest.sh /
//   member_upsert_bulk_pgtest.sh が **実 PostgreSQL 16** に対して 35+36 本で固定している。
//   ここで測るのは「クライアントが渡す引数が、その契約の下で正しい結果を生むか」。
function mockCloud(app, opt) {
  opt = opt || {};
  const cap = { rpcs: [], selects: 0, upserts: [] };
  const cloudById = {};
  if (opt.cloudRow) cloudById[opt.cloudRow.member_id] = Object.assign({}, opt.cloudRow);
  cap.cloudRow = function (mid) { return cloudById[mid || MEMBER_ID] || null; };
  // app_upsert_member_edit: insert ... on conflict do update set。
  //   set_* が false の列は set 句に現れない＝既存値をそのまま残す。新規行は全列が入る。
  function applyRow(r) {
    const mid = r.member_id;
    const inserted = !cloudById[mid];
    if (inserted) {
      cloudById[mid] = {
        member_id: mid, name: r.name, yomi: r.yomi,
        member_kind: r.member_kind == null ? null : r.member_kind,
        grade: r.grade == null ? null : r.grade,
        city: r.city == null ? null : r.city,
        deleted_at: r.touch_deleted_at ? (r.deleted_at || null) : null,
      };
    } else {
      const c = cloudById[mid];
      c.name = r.name; c.yomi = r.yomi;
      if (r.set_member_kind) c.member_kind = r.member_kind == null ? null : r.member_kind;
      if (r.set_grade) c.grade = r.grade == null ? null : r.grade;
      if (r.set_city) c.city = r.city == null ? null : r.city;
      if (r.touch_deleted_at) c.deleted_at = r.deleted_at || null;
    }
    const c2 = cloudById[mid];
    return { inserted: inserted, member_kind: c2.member_kind, grade: c2.grade, city: c2.city, deleted_at: c2.deleted_at || null };
  }
  const KNOWN_BULK_KEYS = ['member_id', 'name', 'yomi', 'member_kind', 'grade', 'city',
                           'set_member_kind', 'set_grade', 'set_city', 'deleted_at', 'touch_deleted_at'];
  app.ctx.window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
  app.ctx.window.supabase = { createClient: function () { return {
    auth: { getSession: function () { return Promise.resolve({ data: { session: opt.session === null ? null : { user: {} } } }); } },
    rpc: function (name, args) {
      cap.rpcs.push({ name: String(name), args: args });
      if (name === 'claim_organizer_seat') return Promise.resolve({ data: [{ club_id: CLUB_ID, status: 'active' }] });
      if (opt.rpcFails) return Promise.resolve({ data: null, error: { message: 'permission denied' } });
      if (name === 'app_upsert_member_edit') {
        return Promise.resolve({ data: applyRow({
          member_id: args.p_member_id, name: args.p_name, yomi: args.p_yomi,
          member_kind: args.p_member_kind, grade: args.p_grade, city: args.p_city,
          set_member_kind: args.p_set_member_kind, set_grade: args.p_set_grade, set_city: args.p_set_city,
          deleted_at: args.p_deleted_at, touch_deleted_at: args.p_touch_deleted_at,
        }), error: null });
      }
      if (name === 'app_upsert_member_edits_bulk') {
        const rows = (args && args.p_rows) || [];
        // ★ 未知キーは実 RPC が raise する。mock でも同じく失敗させる（綴り違いを緑にしない）。
        for (const r of rows) {
          const bad = Object.keys(r).filter((k) => KNOWN_BULK_KEYS.indexOf(k) < 0);
          if (bad.length) return Promise.resolve({ data: null, error: { message: '送信データに未知のキーがあります: ' + bad.join('、') } });
        }
        let ins = 0;
        rows.forEach(function (r) { if (applyRow(r).inserted) ins++; });
        return Promise.resolve({ data: { count: rows.length, inserted: ins }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: '想定外の RPC: ' + name } });
    },
    // members への直接アクセスが残っていないことを測るための番人。
    from: function (t) { return {
      select: function () { return { eq: function () { return { in: function () { cap.selects++; return Promise.resolve({ data: [], error: null }); } }; } }; },
      upsert: function (rows) { cap.upserts.push({ table: String(t), rows: rows });
        return { select: function () { return Promise.resolve({ data: rows, error: null }); } }; },
    }; },
  }; } };
  cap.named = function (n) { return cap.rpcs.filter(function (r) { return r.name === n; }); };
  cap.args = function (n) { const h = cap.named(n); return h.length ? h[h.length - 1].args : null; };
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
function storedName(app) { return storedMember(app).name; }
function storedMember(app) { return JSON.parse(app.localStorage.getItem(app.ctx.BRANCH_MASTER_KEY)).members[0]; }
function tick() { return new Promise(function (res) { setImmediate(res); }); }
async function settle(n) { for (let i = 0; i < (n || 5); i++) await tick(); }

const NO_TOUCH = { memberInit: 'member', member: 'member', gradeInit: 'ippan', grade: 'ippan' };
const EDIT_ARG_KEYS = ['p_city', 'p_club', 'p_grade', 'p_member_id', 'p_member_kind', 'p_name',
                       'p_set_city', 'p_set_grade', 'p_set_member_kind', 'p_yomi'];

// P-A: 操作していない欄はクラウドの実値が保たれる（#901 の実害そのもの）
const caseP1 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();

  assert(cap.named('app_upsert_member_edit').length === 1, 'P1 保存で会員 upsert の RPC がちょうど 1 回');
  const a = cap.args('app_upsert_member_edit') || {};
  assert(cap.selects === 0 && cap.upserts.length === 0,
    'P2 ★members を直接読み書きしない（送信前 select が消えた＝読み取り失敗・タイムアウト・競合窓が原理的に生じない）');
  assert(JSON.stringify(Object.keys(a).sort()) === JSON.stringify(EDIT_ARG_KEYS),
    'P3 RPC 引数は 10 個ちょうど（p_deleted_at / p_touch_deleted_at は渡さない＝編集 push が tombstone を復活させない）  [' + Object.keys(a).sort().join(',') + ']');
  assert(a.p_member_id === MEMBER_ID && a.p_club === CLUB_ID, 'P4 送信先 club と会員 id を渡す');
  assert(a.p_yomi === 'かくうたろう', 'P5 編集したふりがなが渡る（入力値が本当に使われている）');
  assert(a.p_name === '架空太郎', 'P6 編集していない氏名はマスタ現在値のまま渡る');
  assert(a.p_set_member_kind === false && a.p_set_grade === false && a.p_set_city === false,
    'P7 ★操作していない欄は set_* が false＝既存行のその列を1バイトも変えない');
  assert(a.p_member_kind === 'member' && a.p_grade === 'ippan' && a.p_city === null,
    'P8 set_* が false でもローカル値は渡す（クラウドに行が無い会員の INSERT を完全な行にするため・#909 の穴①）');
  assert(cap.rpcs.length === 2 && cap.rpcs[0].name === 'claim_organizer_seat',
    'P9 クラウドへの往復は「クラブ特定 → upsert」の 2 回だけ（会場の詰まった回線で往復を増やさない）  [' + cap.rpcs.map((r) => r.name).join(',') + ']');
  const after = cap.cloudRow();
  assert(after.member_kind === 'other', 'P10 ★操作していない支部員区分はクラウドの実値（other）が保たれる＝既定値で潰さない');
  assert(after.grade === 'josei', 'P11 ★操作していない級はクラウドの実値（josei）が保たれる＝参加費の誤徴収が起きない');
  assert(after.city === '沼津市', 'P12 ★操作していない市町村はクラウドの実値が保たれる（従来は city:null で消していた）');
  assert(after.yomi === 'かくうたろう', 'P12a 直したふりがなはクラウドに反映される');
  const s = statusText(app);
  assert(/反映しました/.test(s), 'P13 クラウド反映の結果は名簿タブの status 行（N4）に出る');
  assert(/⚠/.test(s) && /支部員区分/.test(s) && /級/.test(s) && /市町村/.test(s),
    'P14 ★クラウドに残った実値が端末の表示と違う欄を ⚠ で名指しする（RPC の戻り＝推測ではなく実測）');
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
  const a = cap.args('app_upsert_member_edit') || {};
  const after = cap.cloudRow();
  assert(a.p_set_member_kind === true && a.p_set_grade === true && after.member_kind === 'member' && after.grade === 'ippan',
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
  const after = cap.cloudRow();
  assert(after.member_kind === 'member', 'P20 ★「その他→支部員」の訂正はクラウドへ届く（既定値方向でも負けない）');
  assert(after.grade === 'ippan', 'P21 ★「女性→一般」の訂正もクラウドへ届く');
  assert(after.city === '沼津市', 'P22 同じ保存でも操作していない市町村はクラウドの実値が保たれる（欄ごとに独立）');
})();

// P-D: RPC が失敗したとき（黙って成功と言わない・端末側は保存済みのまま）
const caseP4 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { rpcFails: true });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空次郎', yomiInit: 'かくうたろ', yomi: 'かくうじろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  const s = statusText(app);
  assert(cap.named('app_upsert_member_edit').length === 1, 'P23 失敗ケースでも RPC は実際に発行されている（前提の確認）');
  assert(/失敗しました/.test(s) && /permission denied/.test(s), 'P24 ★RPC の失敗は理由込みで status に出す（成功表示で覆い隠さない）');
  assert(/保存済み/.test(s) && /一括送信/.test(s), 'P24a 端末には保存済みであることと復旧手段まで案内する');
  assert(storedName(app) === '架空次郎', 'P25 クラウドが失敗しても端末への保存は成功したまま（当日運営を止めない）');
  assert(app.record.alert.length === 0, 'P25a 失敗しても alert は出さない');
})();

// P-E: クラウドにまだ行が無い会員（初回 push）は **完全な行** で INSERT される（#909 の穴①）
const caseP5 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei', city: '三島市' }));
  const cap = mockCloud(app, { cloudRow: null });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空五郎', yomiInit: 'かくうたろ', yomi: 'かくうごろう' },
    { memberInit: 'other', member: 'other', gradeInit: 'josei', grade: 'josei' }));
  app.call('masterSheetCommitNameEdit');
  await settle();
  const after = cap.cloudRow();
  assert(after && after.member_kind === 'other' && after.grade === 'josei' && after.city === '三島市',
    'P26 ★クラウドに行が無い会員の初回 push は属性が入った完全な行になる（NULL の行を作らない＝別端末が既定値化して誤徴収する穴①が消える）');
  assert(after.deleted_at === null, 'P27 編集 push は deleted_at を触らない（tombstone を復活させない）');
  assert(cap.selects === 0, 'P28 それでも送信前の読み取りは 1 回も行わない（読めるかどうかに結果が依存しない）');
})();

// P-F: 新規会員は ⚠ を出さない（残った値＝送った値）
const caseP6 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { cloudRow: null });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空三郎', yomiInit: 'かくうたろ', yomi: 'かくうさぶろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(cap.named('app_upsert_member_edit').length === 1, 'P30 クラウド未登録の会員でも push する（INSERT が成立する）');
  assert(!/⚠/.test(statusText(app)), 'P31 残った値が端末と同じなら注記を出さない（新規会員で毎回 ⚠ が出ない）');
})();

// P-G: 未ログインは従来どおり fail-soft（回帰）＋成功表示を打ち消さない
const caseP7 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { session: null, cloudRow: CLOUD_ROW });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空四郎', yomiInit: 'かくうたろ', yomi: 'かくうしろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(cap.named('app_upsert_member_edit').length === 0 && cap.selects === 0, 'P32 未ログインでは会員 upsert の RPC も読み取りも呼ばない（fail-soft skip）');
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
  assert(cap.rpcs.length === 0, 'P36 オフラインではクラウドを一度も叩かない');
  assert(/オフライン/.test(statusText(app)) && /一括送信/.test(statusText(app)), 'P37 オフラインは復旧手段まで案内する');
  assert(storedName(app) === '架空六郎', 'P38 オフラインでも端末への保存は成功したまま');
})();

// P-I: 欄ごとに独立して set が立つ（片方だけ押した保存）
const caseP9 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei' }));
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  openPanel(app, { nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろ',
    memberInit: 'other', member: 'member', memberClicked: true,
    gradeInit: 'josei', grade: 'josei' });
  app.call('masterSheetCommitNameEdit');
  await settle();
  const a = cap.args('app_upsert_member_edit') || {};
  assert(a.p_set_member_kind === true && a.p_set_city === false,
    'P39 押した欄は set が立ち、ローカルが既定値で未操作の欄（市町村＝空）は立たない');
  assert(a.p_set_grade === true,
    'P39a 級は押していないが**ローカルが josei（非既定値）**なので送る（NULL の旧行に実値が届く・Codex P1）');
  const after = cap.cloudRow();
  assert(after.member_kind === 'member' && after.grade === 'josei',
    'P40 ★押した「その他→支部員」が届き、級は端末の josei のまま（欄ごとに独立）');
  assert(after.city === '沼津市', 'P40a 未操作かつローカルが空の市町村はクラウドの実値のまま');
})();

// P-M: ★Codex P1 (r3810188007) — クラウドの旧行が NULL、端末に実値。氏名だけ直しても実値が届く
const caseP13 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei', city: '三島市' }));
  // 属性列を持つ前に作られた行（member_kind / grade / city が NULL）
  const OLD_ROW = { member_id: MEMBER_ID, name: '架空太郎', yomi: 'かくうたろ', member_kind: null, grade: null, city: null };
  const cap = mockCloud(app, { cloudRow: OLD_ROW });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろう' },
    { memberInit: 'other', member: 'other', gradeInit: 'josei', grade: 'josei' }));
  app.call('masterSheetCommitNameEdit');
  await settle();
  const a = cap.args('app_upsert_member_edit') || {};
  assert(a.p_set_member_kind === true && a.p_set_grade === true && a.p_set_city === true,
    'P47 ★一欄も操作していなくても、ローカルが非既定値なら送る');
  const after = cap.cloudRow();
  assert(after.member_kind === 'other' && after.grade === 'josei' && after.city === '三島市',
    'P48 ★★NULL の旧行に端末の実値が実際に入る（ここを落とすと別端末が ippan へ確定して誤徴収が復活する）');
  assert(!/⚠/.test(statusText(app)), 'P49 届いたのだから ⚠ は出ない（残った値＝端末の値）');
})();

// P-N: 端末が既定値なら NULL の旧行を既定値で埋めない（#853 の本題を壊さない）
const caseP14 = (async function () {
  const app = boot(fixture({ member: 'member', grade: 'ippan', city: '' }));
  const OLD_ROW = { member_id: MEMBER_ID, name: '架空太郎', yomi: 'かくうたろ', member_kind: null, grade: null, city: null };
  const cap = mockCloud(app, { cloudRow: OLD_ROW });
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろう' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  const a = cap.args('app_upsert_member_edit') || {};
  assert(a.p_set_member_kind === false && a.p_set_grade === false && a.p_set_city === false,
    'P50 ★端末も既定値なら送らない（既定値で NULL を埋めると「未設定」が「既定値だと主張した」に変わり、下り merge で別端末の実値を上書きしうる）');
  const after = cap.cloudRow();
  assert(after.member_kind === null && after.grade === null && after.city === null,
    'P51 クラウドは NULL のまま（下り merge の非空ガードが読み飛ばす＝どの端末も壊れない）');
  assert(!/⚠/.test(statusText(app)), 'P52 この場合も ⚠ は出さない（端末の表示と食い違っていない）');
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
  assert(cap.named('app_upsert_member_edit').length === 1,
    'P41 ★再描画前に押し直しが commit される（差分ゼロの touched を dirty 判定が捨てると黙って消える・Codex P1）');
  const after = cap.cloudRow();
  assert(after.member_kind === 'member' && after.grade === 'ippan', 'P42 その commit で訂正がクラウドへ届く');
})();

// P-K: 押し直した直後に☁取得が着地しても、押した値が commit/push まで生き残る（Codex P1 r3802131321）
const caseP11 = (async function () {
  const app = boot(fixture());
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  openPanel(app, { nameInit: '架空太郎', name: '架空太郎', yomiInit: 'かくうたろ', yomi: 'かくうたろ',
    memberInit: 'member', member: 'member', memberClicked: true,
    gradeInit: 'ippan', grade: 'ippan', gradeClicked: true });
  // 保存前に☁取得が着地してローカルマスタがクラウド値（その他・女性）へ更新される。
  const master = app.call('loadBranchMaster');
  app.call('mergeCloudMembersIntoMaster', master, [{ member_id: MEMBER_ID, name: '架空太郎', yomi: 'かくうたろ',
    member_kind: 'other', grade: 'josei', city: '沼津市' }]);
  app.call('saveBranchMaster', master);
  assert(master.members[0].member === 'other' && master.members[0].grade === 'josei',
    'P43 前提: ☁取得でローカルがクラウド値に更新される');
  // pull の後は renderMasterTab が走り、未保存の変更を flush commit する。
  app.stubRenderRestore();
  app.call('renderMasterTab');
  await settle();
  const after = cap.cloudRow();
  assert(after.member_kind === 'member' && after.grade === 'ippan',
    'P44 ★押した値が pull 後の値に上書きされずクラウドへ届く（成功表示のまま訂正が消えるのを防ぐ）');
  assert(storedMember(app).member === 'member' && storedMember(app).grade === 'ippan',
    'P45 端末側にも押した値が残る（画面とクラウドが食い違わない）');
})();

// P-L: 操作していない欄は、開いたまま☁取得された値を古い表示値で巻き戻さない（既存性質の回帰）
const caseP12 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei' }));
  mockCloud(app, { cloudRow: CLOUD_ROW });
  // data-init は開いた当時の member/ippan。いまローカルは other/josei。区分・級は一度も押していない。
  openPanel(app, Object.assign({ nameInit: '架空太郎', name: '架空次郎', yomiInit: 'かくうたろ', yomi: 'かくうたろ' }, NO_TOUCH));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(storedMember(app).member === 'other' && storedMember(app).grade === 'josei',
    'P46 操作していない欄は☁取得後の値のまま（古い表示値で巻き戻さない・MASTER-EDIT-FORM-001 の回帰）');
})();

// ======================================================================== D: 削除/復元 push の属性の扱い

const BULK_KEYS = ['city', 'deleted_at', 'grade', 'member_id', 'member_kind', 'name',
                   'set_city', 'set_grade', 'set_member_kind', 'touch_deleted_at', 'yomi'];

// D-1: クラウドに実値がある会員を、既定値のままの端末から削除しても潰さない
const caseD1 = (async function () {
  const app = boot(fixture({ member: 'member', grade: 'ippan', city: '' }));
  const cap = mockCloud(app, { cloudRow: CLOUD_ROW });
  app.ctx._masterSelected[MEMBER_ID] = true;
  app.call('masterSheetDeleteSelected');
  await settle();
  assert(cap.named('app_upsert_member_edits_bulk').length === 1,
    'D1 削除は一括版 RPC を 1 回だけ呼ぶ（N 名でも 1 リクエスト・1 トランザクション＝部分適用が残らない）');
  const rows = (cap.args('app_upsert_member_edits_bulk') || {}).p_rows || [];
  assert(rows.length === 1 && typeof rows[0].deleted_at === 'string' && rows[0].deleted_at.length > 0 && rows[0].touch_deleted_at === true,
    'D2 削除行は deleted_at（時刻）と touch_deleted_at=true を持つ');
  assert(cap.selects === 0 && cap.upserts.length === 0,
    'D3 ★削除 push も送信前に members を読まない（読めるかどうかに結果が依存しない）');
  assert(JSON.stringify(Object.keys(rows[0]).sort()) === JSON.stringify(BULK_KEYS),
    'D3a 送るキーは RPC の既知キーだけ（未知キーは RPC が raise する＝綴り違いで黙って無反映にならない）  [' + Object.keys(rows[0]).sort().join(',') + ']');
  assert(rows[0].set_member_kind === false && rows[0].set_grade === false && rows[0].set_city === false,
    'D3b この会員はローカルが全欄既定値なので set_* は立たない（既定値でクラウドを潰さない）');
  const after = cap.cloudRow();
  assert(after.member_kind === 'other' && after.grade === 'josei' && after.city === '沼津市',
    'D4 ★削除でクラウドの区分・級・市町村を潰さない（従来はローカル既定値と NULL で上書きしていた）');
  assert(typeof after.deleted_at === 'string' && after.deleted_at.length > 0, 'D4a 削除そのものはクラウドに反映される');
  assert(/削除しました/.test(statusText(app)) && /1名/.test(statusText(app)), 'D4b 件数つきの結果を status 行に出す');
})();

// D-2: クラウドにまだ行が無い会員は、削除の INSERT でローカル属性が入る（#909 の穴①）
const caseD2 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei', city: '沼津市' }));
  const cap = mockCloud(app, { cloudRow: null });
  app.ctx._masterSelected[MEMBER_ID] = true;
  app.call('masterSheetDeleteSelected');
  await settle();
  const after = cap.cloudRow();
  assert(after && after.member_kind === 'other' && after.grade === 'josei' && after.city === '沼津市',
    'D5 ★クラウドに行が無い会員の削除は完全な行として INSERT される（属性を落とすと以後どこからも補われない）');
})();

// D-3: 復元は deleted_at を明示的に null へ戻す
const caseD3 = (async function () {
  const app = boot(fixture({ deleted: true, deleted_at: '2026-06-15' }));
  const cap = mockCloud(app, { cloudRow: Object.assign({}, CLOUD_ROW, { deleted_at: '2026-06-15T00:00:00.000Z' }) });
  app.ctx._masterShowDeleted = true;
  app.ctx._masterSelected[MEMBER_ID] = true;
  app.call('masterSheetRestoreSelected');
  await settle();
  const rows = (cap.args('app_upsert_member_edits_bulk') || {}).p_rows || [];
  assert(rows.length === 1 && rows[0].deleted_at === null && rows[0].touch_deleted_at === true,
    'D6 復元は deleted_at=null＋touch_deleted_at=true（省略すると既定 false で「触らない」＝復元が届かない）');
  const after = cap.cloudRow();
  assert(after && after.deleted_at === null, 'D7 ★クラウド側でも実際に復元される');
  assert(after.member_kind === 'other' && after.grade === 'josei' && after.city === '沼津市',
    'D8 復元でもクラウドの区分・級・市町村を潰さない');
})();

// D-4: ★Codex P1 — クラウドの旧行が NULL、端末に実値。削除でも実値が届く
const caseD4 = (async function () {
  const app = boot(fixture({ member: 'other', grade: 'josei', city: '三島市' }));
  const OLD_ROW = { member_id: MEMBER_ID, name: '架空太郎', yomi: 'かくうたろ', member_kind: null, grade: null, city: null };
  const cap = mockCloud(app, { cloudRow: OLD_ROW });
  app.ctx._masterSelected[MEMBER_ID] = true;
  app.call('masterSheetDeleteSelected');
  await settle();
  const rows = (cap.args('app_upsert_member_edits_bulk') || {}).p_rows || [];
  assert(rows.length === 1 && rows[0].set_member_kind === true && rows[0].set_grade === true && rows[0].set_city === true,
    'D9 ★削除 push もローカルが非既定値の欄は送る（削除経路に「操作した欄」は無いので、この規則だけが実値を届ける）');
  const after = cap.cloudRow();
  assert(after.member_kind === 'other' && after.grade === 'josei' && after.city === '三島市',
    'D10 ★★NULL の旧行に端末の実値が実際に入る（#901 の composeCloudMemberFieldCols と同じ結果）');
  assert(typeof after.deleted_at === 'string' && after.deleted_at.length > 0, 'D11 同じ1文で削除も反映される');
})();

// ======================================================================== 実行

const all = Promise.all([caseP1, caseP2, caseP3, caseP4, caseP5, caseP6, caseP7, caseP8, caseP9, caseP10, caseP11, caseP12, caseP13, caseP14, caseD1, caseD2, caseD3, caseD4]);
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
