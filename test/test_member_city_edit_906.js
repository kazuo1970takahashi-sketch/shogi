#!/usr/bin/env node
// MEMBER-CITY-EDIT-001 (#906): 会員の市町村を編集できる UI をアプリに用意する。
//
// なぜ要るか（#906 実測 2026-08-18）:
//   市町村の入力欄は repo 全体で **1つだけ**（旧 F7 編集モーダルの `me-city`）で、そのモーダルは #798 で
//   UI 未結線化＝退役済み。つまり `members.city` は ☁取り込みで**下りには入ってくる**のに、
//   端末で訂正も削除もできない。報告書の「お住まい（市町村のみ）」欄はこの値を使う。
//
// このスライスの形（作者裁定 2026-08-19）: 案1＝**生きている行内編集パネルに欄を1つ足す**。
//   退役モーダルには触らない（#798 の決着は別）。入力は**自由入力＋候補一覧**（datalist）。
//
// ★ #901 の R6 が「編集できる欄の集合と push の touched の集合が一対一」を pin しているので、
//   欄だけ足して配線を忘れると **#901 のテストが赤くなる**。こちらでは配線の中身を見る。
//
// fixture は完全架空・ネットワークアクセスなし。
// 使い方: node test/test_member_city_edit_906.js <html>

const path = require('path');
const { loadApp } = require(path.join(__dirname, 'lib', 'app_harness.js'));

const TARGET = process.argv[2] || 'shogi_v4.html';
const EXPECTED_CHECKS = 30;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

const MID = 'm-kakuu-1', MID2 = 'm-kakuu-2', CLUB_ID = 'club-kakuu';
function fixture() {
  return { schema_version: 1, members: [
    { id: MID,  name: '架空太郎', yomi: 'かくうたろ',     member: 'member', grade: 'ippan', city: '',        deleted: false },
    { id: MID2, name: '安藤架空', yomi: 'あんどうかくう', member: 'member', grade: 'ippan', city: '三島市',  deleted: false },
    { id: 'm-3', name: '甲斐架空', yomi: 'かいかくう',    member: 'member', grade: 'ippan', city: '沼津市',  deleted: false },
    { id: 'm-4', name: '駿河架空', yomi: 'するがかくう',  member: 'member', grade: 'ippan', city: '沼津市',  deleted: false },
    { id: 'm-5', name: '退会架空', yomi: 'たいかいかくう', member: 'member', grade: 'ippan', city: '裾野市', deleted: true },
  ] };
}
function boot() {
  const app = loadApp(TARGET);
  app.localStorage.setItem(app.ctx.BRANCH_MASTER_KEY, JSON.stringify(fixture()));
  return app;
}

console.log('\n【MEMBER-CITY-EDIT-001 #906 市町村を編集できる UI】');

// ======================================================================== C: 候補一覧（純関数）
{
  const app = boot();
  const c = app.call('masterCityCandidates', fixture());
  assert(JSON.stringify(c) === JSON.stringify(['三島市', '沼津市', '裾野市']),
    'C1 重複なし・空は除く・文字列順で安定  [' + c.join(',') + ']');
  assert(c.indexOf('裾野市') >= 0,
    'C2 ★削除済みの会員の市町村も候補に残る（最後の1名を消した瞬間に表記が候補から消えて揺れが復活しない）');

  const messy = { members: [
    { id: 'a', name: 'x', city: '  沼津市  ' },
    { id: 'b', name: 'y', city: 'あ'.repeat(25) },
    { id: 'c', name: 'z', city: null },
    { id: 'd', name: 'w' },
  ] };
  const c2 = app.call('masterCityCandidates', messy);
  assert(c2.indexOf('沼津市') >= 0, 'C3 前後の空白は normalizeCity で落ちる（"  沼津市  " が別候補にならない）');
  assert(c2.filter((x) => x.length > 20).length === 0, 'C3a 20文字を超える候補は出ない（normalizeCity の上限と一致）');
  assert(c2.length === 2, 'C3b 空/未設定は候補に出ない  [' + c2.join(',') + ']');

  assert(JSON.stringify(app.call('masterCityCandidates', null)) === '[]', 'C4 master が null でも落ちない');
  assert(JSON.stringify(app.call('masterCityCandidates', { members: 'こわれ' })) === '[]',
    'C4a members が配列でなくても落ちない');
}

// ======================================================================== P: パネルの生成 HTML
{
  const app = boot();
  const m = fixture().members[1];                    // 三島市
  const html = app.call('buildMasterEditPanelHtml', m, app.call('masterCityCandidates', fixture()));
  assert(html.indexOf('id="ms-edit-city"') >= 0, 'P1 ★市町村の入力欄が編集パネルに実在する（#906 の本体）');
  assert(/id="ms-edit-city"[^>]*data-init="三島市"/.test(html),
    'P2 data-init に現在値が入る＝「初期値から変わったか」を判定できる（氏名/ふりがなと同型）');
  assert(/id="ms-edit-city"[^>]*value="三島市"/.test(html), 'P2a 現在値が初期表示に入る');
  assert(/id="ms-edit-city"[^>]*maxlength="20"/.test(html),
    'P3 ★maxlength は normalizeCity の上限 20 と揃っている（保存時に黙って切られない）');
  assert(/id="ms-edit-city"[^>]*list="ms-edit-city-list"/.test(html) && html.indexOf('<datalist id="ms-edit-city-list">') >= 0,
    'P4 ★候補一覧が入力欄に結線されている（list= と datalist の id が対応）');
  assert(html.indexOf('<option value="沼津市"></option>') >= 0 && html.indexOf('<option value="三島市"></option>') >= 0,
    'P5 名簿に実在する市町村が候補として出る');
  assert(html.indexOf('type="text" id="ms-edit-city"') >= 0,
    'P6 select ではなく text 入力＝候補にない新しい市町村も入れられる');

  const bare = app.call('buildMasterEditPanelHtml', m);
  assert(bare.indexOf('id="ms-edit-city"') >= 0 && bare.indexOf('<option') < 0,
    'P7 候補を渡さなくても欄は出る（datalist は空・呼び出し漏れで画面が壊れない）');

  const evil = app.call('buildMasterEditPanelHtml',
    { id: 'x', name: 'y', city: '"><img src=x onerror=1>' },
    ['"><img src=x onerror=1>']);
  assert(evil.indexOf('<img src=x') < 0,
    'P8 ★市町村の値も候補もエスケープされる（名簿は取り込み由来の文字列を持ちうる）');
}

// ======================================================================== B: 触った印（bind の配線）
{
  const app = boot();
  app.call('bindMasterEditPanel');
  const el = app.document.getElementById('ms-edit-city');
  assert(el.getAttribute('data-touched') === null, 'B1 前提: 最初は触った印が無い');
  el.dispatchEvent({ type: 'input', target: el });
  assert(el.getAttribute('data-touched') === '1',
    'B2 ★市町村欄に入力したら触った印が立つ（区分/級の data-touched と同じ役目）');
}

// ======================================================================== E: 実経路（保存とクラウド送信）
function bootPanel() {
  const app = boot();
  app.stub('renderPastParticipantsPanel', function () {});
  app.stub('masterSheetFlashRow', function () {});
  app.stub('showToast', function () {});
  app.stub('renderMasterTab', function () {});
  return app;
}
function openPanel(app, m, cityInit, cityVal, touched) {
  const d = app.document;
  app.ctx._masterEditingMid = m.id;
  function input(id, init, val) { const el = d.getElementById(id); el.setAttribute('data-init', init); el.value = val; return el; }
  input('ms-edit-name', m.name, m.name);
  input('ms-edit-yomi', m.yomi, m.yomi);
  const ce = input('ms-edit-city', cityInit, cityVal);
  if (touched) ce.setAttribute('data-touched', '1'); else ce.removeAttribute('data-touched');
  function seg(id, init, sel) {
    const g = d.getElementById(id);
    g.setAttribute('data-init', init);
    g.querySelector = function () { return { getAttribute: function (k) { return k === 'data-val' ? sel : null; } }; };
  }
  seg('ms-edit-member', 'member', 'member');
  seg('ms-edit-grade', 'ippan', 'ippan');
}
function savedCity(app, mid) {
  const ms = JSON.parse(app.localStorage.getItem(app.ctx.BRANCH_MASTER_KEY)).members;
  for (const m of ms) if (m.id === mid) return m.city;
  return undefined;
}
function mockCloud(app) {
  const cap = { rpcs: [] };
  app.ctx.window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
  app.ctx.window.supabase = { createClient: function () { return {
    auth: { getSession: function () { return Promise.resolve({ data: { session: { user: {} } } }); } },
    rpc: function (name, args) {
      cap.rpcs.push({ name: String(name), args: args });
      if (name === 'claim_organizer_seat') return Promise.resolve({ data: [{ club_id: CLUB_ID, status: 'active' }] });
      return Promise.resolve({ data: { inserted: true, member_kind: args.p_member_kind, grade: args.p_grade, city: args.p_city, deleted_at: null }, error: null });
    },
  }; } };
  cap.edit = function () { return cap.rpcs.filter((r) => r.name === 'app_upsert_member_edit'); };
  return cap;
}
function tick() { return new Promise((res) => setImmediate(res)); }
async function settle(n) { for (let i = 0; i < (n || 8); i++) await tick(); }

const caseE = (async function () {
  // 入力した市町村がローカルに入り、クラウドへも「触った欄」として送られる
  const app = bootPanel();
  const cap = mockCloud(app);
  openPanel(app, fixture().members[0], '', '沼津市', true);
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(savedCity(app, MID) === '沼津市', 'E1 ★入力した市町村がローカル名簿に入る  [' + savedCity(app, MID) + ']');
  const a = cap.edit()[0] && cap.edit()[0].args;
  assert(a && a.p_city === '沼津市', 'E2 クラウドにも同じ値を送る  [' + (a && a.p_city) + ']');
  assert(a && a.p_set_city === true,
    'E3 ★触った欄として送る（set_city=true＝クラウドの市町村をこの端末の値で確定できる）  [' + (a && a.p_set_city) + ']');
})();

const caseE2 = (async function () {
  // 触っていない保存では、クラウドの市町村を潰さない（#901 の実害だったところ）。
  //   ★ ローカルが**既定値（空）**のときが要。欄が生えたせいで「空を触っていないのに送る」ようになると、
  //     クラウドの市町村が編集のたびに消える（#901 で実際に起きていた事故そのもの）。
  const app = bootPanel();
  const cap = mockCloud(app);
  openPanel(app, fixture().members[0], '', '', false);
  app.call('masterSheetCommitNameEdit');
  await settle();
  const a = cap.edit()[0] && cap.edit()[0].args;
  assert(a && a.p_set_city === false,
    'E4 ★空のまま触っていない保存では set_city=false（クラウドの市町村を編集のたびに消さない）  [' + (a && a.p_set_city) + ']');
  assert(savedCity(app, MID) === '', 'E4a ローカルも変わらない');
})();

const caseE2b = (async function () {
  // 触っていなくても、ローカルが**非既定値**なら送る（#853 案E: 既定値でないローカル値は人が入れた情報）。
  //   これは #906 以前からの規則で、欄が生えても変えていないことを固定しておく。
  const app = bootPanel();
  const cap = mockCloud(app);
  openPanel(app, fixture().members[1], '三島市', '三島市', false);
  app.call('masterSheetCommitNameEdit');
  await settle();
  const a = cap.edit()[0] && cap.edit()[0].args;
  assert(a && a.p_set_city === true && a.p_city === '三島市',
    'E4b 触っていなくても非既定値のローカル市町村は送る（#853 案E・#906 で変えていない）  [' + (a && a.p_set_city) + ']');
})();

const caseE3 = (async function () {
  // 打って戻した（値は同じ）だけでも「触った」＝ローカルが正しくクラウドだけ古いときに訂正を送れる。
  //   ★ ローカルが**空**の会員で見るのが要。非既定値の会員だと #853 案E の規則だけで set_city=true に
  //     なってしまい、「触ったか」を見ているのかどうかを区別できない（このピンは一度そこで空振りした）。
  //     実場面はこう: 端末は「市町村なし」が正しく、クラウドにだけ古い値が残っている。利用者は欄に打って
  //     消し、空のまま保存する ＝ これで消せないと出口が無い。
  const app = bootPanel();
  const cap = mockCloud(app);
  openPanel(app, fixture().members[0], '', '', true);
  app.call('masterSheetCommitNameEdit');
  await settle();
  const a = cap.edit()[0] && cap.edit()[0].args;
  assert(a && a.p_set_city === true,
    'E5 ★打って戻しただけ（差分ゼロ）でも訂正を送れる（差分だけ見ると出口が無くなる・#901 で実測した罠）  [' + (a && a.p_set_city) + ']');
  assert(a && (a.p_city === null || a.p_city === ''),
    'E5a 送る値は空（＝クラウドの古い市町村を消せる）  [' + JSON.stringify(a && a.p_city) + ']');
})();

const caseE4 = (async function () {
  // 空にする＝「市町村を消す」も送れる
  const app = bootPanel();
  const cap = mockCloud(app);
  openPanel(app, fixture().members[1], '三島市', '', true);
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(savedCity(app, MID2) === '', 'E6 ★空にするとローカルから消える（訂正だけでなく削除もできる）');
  const a = cap.edit()[0] && cap.edit()[0].args;
  assert(a && a.p_set_city === true, 'E6a 空にした場合も set_city=true でクラウドへ届く（消したのに残らない）');
})();

const caseE5 = (async function () {
  // 21文字以上は normalizeCity で 20 文字に丸められて保存される
  const app = bootPanel();
  mockCloud(app);
  openPanel(app, fixture().members[0], '', 'あ'.repeat(25), true);
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(savedCity(app, MID) === 'あ'.repeat(20),
    'E7 保存時も normalizeCity が効く（maxlength を回避して貼り付けても 20 文字）  [' + String(savedCity(app, MID)).length + '文字]');
})();

const caseE6 = (async function () {
  // パネルを開いたまま☁取得で市町村が入った場合、触っていなければ古い表示値で巻き戻さない
  const app = bootPanel();
  mockCloud(app);
  openPanel(app, fixture().members[0], '', '', false);
  const ms = JSON.parse(app.localStorage.getItem(app.ctx.BRANCH_MASTER_KEY));
  ms.members[0].city = '長泉町';                       // ← ☁取得が着地したことにする
  app.localStorage.setItem(app.ctx.BRANCH_MASTER_KEY, JSON.stringify(ms));
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(savedCity(app, MID) === '長泉町',
    'E8 ★開いたまま☁取得で入った市町村を、触っていない欄の古い表示値で巻き戻さない  [' + savedCity(app, MID) + ']');
})();

// ======================================================================== 実行
const all = Promise.all([caseE, caseE2, caseE2b, caseE3, caseE4, caseE5, caseE6]);
// ★ どれかがハングすると then が走らず node は既定の exit 0 で終わる（#901 で実際に踏んだ）。
//   この timer は unref してはいけない（unref すると先に exit 0 で抜けて番人が鳴らない）。
const guard = new Promise((res) => setTimeout(() => res('TIMEOUT'), 20000));
Promise.race([all.then(() => 'DONE'), guard]).then(function (how) {
  if (how === 'TIMEOUT') { fail++; console.error('  ✗ テストが 20 秒以内に完了しなかった（アプリ側の Promise が解決していない）'); }
  const ran = pass + fail;
  if (ran !== EXPECTED_CHECKS) {
    fail++;
    console.error('  ✗ assertion の実行本数が想定と違う（想定 ' + EXPECTED_CHECKS + ' / 実際 ' + ran + '）');
  }
  console.log(`  結果: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.error('  ✗ 例外: ' + ((e && e.stack) || e));
  process.exit(1);
});
