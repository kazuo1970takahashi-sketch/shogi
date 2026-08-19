#!/usr/bin/env node
// MEMBER-CLOUD-STATUS-LOG-001 (#907): 名簿タブのクラウド結果を最大3行の履歴にし、
//   連打に in-flight ガードを入れ、⚠ に会員名を入れる。
//
// なぜ要るか（#901 反証パネルの実測・#907 に起票）:
//   1. 共有の status 行1本を **編集 push・削除/復元 push・☁取得・一括送信・再構築** が奪い合い、
//      **遅い成功が後から着地して直近の失敗を塗り潰す**（成功 60ms vs 失敗 5ms で実測）。
//      利用者は「未反映」を「反映済み」と誤認する。
//   2. 保存連打で upsert/claim/getSession/トーストが各3回（冪等なのでデータは壊れないが無駄な往復）。
//   3. ⚠ が「どの会員の話か」を書いておらず、次の保存で消えて履歴もログも残らない。
//
// ★ #907 の 1.（select→upsert の巻き戻し窓）と 5.（unread 判定）は **#909 で消えた**
//   （編集 push が members を読まなくなったため）。本スライスは残る 2.〜4. を扱う。
//
// ★ この検査の要は「**再描画をまたいで履歴が残る**」こと。`renderMasterTab` は status 要素を
//   HTML 文字列ごと作り直すので、履歴を DOM だけに持つと消える。保存の実際の順序は
//   `renderMasterTab()` → その後に push が着地、なので**ここを外すと本番でだけ消える**。
//
// fixture は完全架空・ネットワークアクセスなし。
// 使い方: node test/test_member_cloud_status_log_907.js <html>

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
    { id: MID, name: '架空太郎', yomi: 'かくうたろ', member: 'member', grade: 'ippan', city: '', deleted: false },
    { id: MID2, name: '安藤架空', yomi: 'あんどうかくう', member: 'member', grade: 'ippan', city: '', deleted: false },
  ] };
}

console.log('\n【MEMBER-CLOUD-STATUS-LOG-001 #907 クラウド結果を3行の履歴にする】');

// ======================================================================== L: 履歴そのもの（実 DOM 経由）
function bootLog() {
  const app = loadApp(TARGET);
  app.localStorage.setItem(app.ctx.BRANCH_MASTER_KEY, JSON.stringify(fixture()));
  return app;
}
function statusText(app) { return String(app.document.getElementById('masterCloudPullStatus').textContent || ''); }
function statusClass(app) { return String(app.document.getElementById('masterCloudPullStatus').className || ''); }

{
  const app = bootLog();
  const a = app.call('_masterCloudStatusFn', '架空太郎');
  a('クラウドへ反映中…');
  assert(statusText(app) === '架空太郎：クラウドへ反映中…', 'L1 会員名が行の先頭に付く  [' + statusText(app) + ']');
  assert(/cloud-status-pending/.test(statusClass(app)), 'L2 色クラスが付く（textContent 直書きで色を失わない）');
  a('会員情報をクラウドにも反映しました');
  assert(statusText(app).split('\n').length === 1, 'L3 ★同じ操作の続報は行を置き換える（「反映中…」で3行が埋まらない）');
  assert(statusText(app) === '架空太郎：会員情報をクラウドにも反映しました', 'L4 置き換え後の中身');

  // 別の操作は新しい行を先頭に積む。
  const b = app.call('_masterCloudStatusFn', '安藤架空');
  b('クラウドへの反映に失敗しました：permission denied');
  const lines = statusText(app).split('\n');
  assert(lines.length === 2 && lines[0].indexOf('安藤架空') === 0, 'L5 別の操作は新しい行を先頭に積む');
  assert(lines[1].indexOf('架空太郎') === 0, 'L6 ★前の行が残る（失敗が成功に塗り潰されない・逆も同じ）');
  assert(/cloud-status-err/.test(statusClass(app)), 'L7 ★いちばん重い行の色をブロック全体に使う（失敗が1行でもあれば失敗の色）');

  // ★ 遅い成功が後から着地しても、先に出た失敗を消さない（#907-3 の実測シナリオ）
  a('会員情報をクラウドにも反映しました（遅れて着地）');
  const l2 = statusText(app).split('\n');
  assert(l2.length === 2 && l2[0].indexOf('安藤架空') === 0 && /失敗/.test(l2[0]),
    'L8 ★★遅い成功が後から着地しても、直近の失敗は先頭に残る（未反映を反映済みと誤認しない）');
  assert(/cloud-status-err/.test(statusClass(app)), 'L9 その状態でも色は失敗のまま');

  // 上限3行
  app.call('_masterCloudStatusFn', 'C')('3件目');
  app.call('_masterCloudStatusFn', 'D')('4件目');
  const l3 = statusText(app).split('\n');
  assert(l3.length === 3, 'L10 履歴は最大3行  [' + l3.length + ']');
  assert(l3[0].indexOf('D：') === 0 && l3[2].indexOf('安藤架空') === 0, 'L11 溢れたのは最も古い行');

  // 空メッセージは行を作らない（no-op の行で履歴を潰さない）
  const before = statusText(app);
  app.call('_masterCloudStatusFn', 'E')('');
  assert(statusText(app) === before, 'L12 空メッセージは行を作らない');
}

// ★ 再描画をまたいで残る（この検査がこのスライスの本体）
//   ★ app_harness の innerHTML は**要素を作り直さない**ので「再描画したら消えた」を再現できない。
//     本番と同じ「status 要素が空になった状態」を**自分で作ってから** renderMasterTab を呼び、
//     **書き戻されること**で判定する（存在チェックではなく効果で見る）。
{
  const app = bootLog();
  app.call('_masterCloudStatusFn', '架空太郎')('会員情報をクラウドにも反映しました');
  const before = statusText(app);
  assert(before !== '', 'L13a 前提: 履歴が1行入っている');
  const el = app.document.getElementById('masterCloudPullStatus');
  el.textContent = '';                       // ← 本番の innerHTML 再生成に相当
  el.className = 'cloud-status';
  app.call('renderMasterTab');
  assert(statusText(app) === before,
    'L13 ★★renderMasterTab が履歴を描き直す（保存は再描画→push の順で着地するので、これが無いと本番でだけ消える）  [' + statusText(app) + ']');
  assert(/cloud-status-ok/.test(statusClass(app)), 'L13b 色クラスも描き直される');
}

// 生成 HTML 側の受け皿（複数行を見せられるか）
{
  const app = bootLog();
  const html = app.call('buildMasterTabHtml', fixture());
  assert(/id="masterCloudPullStatus"[^>]*white-space:pre-line/.test(html),
    'L14 status 要素が改行を表示できる（white-space:pre-line）＝3行が1行に潰れない');
  assert(/id="masterCloudPullStatus"[^>]*aria-live="polite"/.test(html), 'L15 aria-live は従来どおり');
}

// ======================================================================== N: 会員名が実経路で付くか
//   ★ L 群は `_masterCloudStatusFn` を直接呼んでいるので、**呼び出し元の配線**は見ていない。
//     実際の保存（masterSheetCommitNameEdit）を通して、行の先頭に会員名が付くことを見る。
function bootPanel() {
  const app = bootLog();
  app.stub('renderPastParticipantsPanel', function () {});
  app.stub('masterSheetFlashRow', function () {});
  app.stub('showToast', function () {});
  if (app.has('__setAppModalTestResolver')) app.call('__setAppModalTestResolver', function () { return true; });
  app.stub('appConfirm', function (msg, cb) { cb(true); });
  return app;
}
function openPanel(app, mid) {
  const d = app.document;
  app.ctx._masterEditingMid = mid;
  function input(id, init, val) { const el = d.getElementById(id); el.setAttribute('data-init', init); el.value = val; }
  input('ms-edit-name', '架空太郎', '架空太郎');
  input('ms-edit-yomi', 'かくうたろ', 'かくうたろう');
  function seg(id, init, sel) {
    const g = d.getElementById(id);
    g.setAttribute('data-init', init);
    g.querySelector = function () { return { getAttribute: function (k) { return k === 'data-val' ? sel : null; } }; };
  }
  seg('ms-edit-member', 'member', 'member');
  seg('ms-edit-grade', 'ippan', 'ippan');
}

const caseN = (async function () {
  const app = bootPanel();
  mockCloud(app, {});
  openPanel(app, MID);
  app.call('masterSheetCommitNameEdit');
  await settle();
  assert(statusText(app).indexOf('架空太郎：') === 0,
    'N1 ★保存の結果行の先頭に会員名が付く（どの会員の話か分かる）  [' + statusText(app).slice(0, 40) + ']');
})();

const caseN2 = (async function () {
  // 削除 push も同じ（複数名は _masterSheetNamesFor の形）
  const app = bootPanel();
  mockCloud(app, {});
  app.ctx._masterSelected[MID] = true;
  app.ctx._masterSelected[MID2] = true;
  app.call('masterSheetDeleteSelected');
  await settle();
  const t = statusText(app);
  assert(t.indexOf('架空太郎') >= 0 && t.indexOf('安藤架空') >= 0 && t.indexOf('：') > 0,
    'N2 ★削除の結果行にも対象の会員名が付く  [' + t.slice(0, 60) + ']');
})();

// ======================================================================== G: in-flight ガード
function mockCloud(app, opt) {
  opt = opt || {};
  const cap = { rpcs: [] };
  app.ctx.window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
  app.ctx.window.supabase = { createClient: function () { return {
    auth: { getSession: function () { return Promise.resolve({ data: { session: { user: {} } } }); } },
    rpc: function (name, args) {
      cap.rpcs.push({ name: String(name), args: args });
      if (name === 'claim_organizer_seat') return Promise.resolve({ data: [{ club_id: CLUB_ID, status: 'active' }] });
      if (name === 'app_upsert_member_edit') {
        if (opt.hang) return new Promise(function () {});
        return Promise.resolve({ data: { inserted: true, member_kind: args.p_member_kind, grade: args.p_grade, city: args.p_city, deleted_at: null }, error: null });
      }
      if (name === 'app_upsert_member_edits_bulk') {
        if (opt.hang) return new Promise(function () {});
        return Promise.resolve({ data: { count: (args.p_rows || []).length, inserted: 0 }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: '想定外の RPC: ' + name } });
    },
    from: function () { return { select: function () { return { eq: function () { return { in: function () { return Promise.resolve({ data: [], error: null }); } }; } }; },
      upsert: function (rows) { return { select: function () { return Promise.resolve({ data: rows, error: null }); } }; } }; },
  }; } };
  cap.named = function (n) { return cap.rpcs.filter(function (r) { return r.name === n; }); };
  return cap;
}
function tick() { return new Promise(function (res) { setImmediate(res); }); }
async function settle(n) { for (let i = 0; i < (n || 6); i++) await tick(); }

const caseG = (async function () {
  // 連打（1本目が飛行中）
  const app = bootLog();
  const cap = mockCloud(app, { hang: true });
  const m = fixture().members[0];
  const r1 = app.call('pushMemberEditToCloud', m, function () {}, {});
  const r2 = app.call('pushMemberEditToCloud', m, function () {}, {});
  const r3 = app.call('pushMemberEditToCloud', m, function () {}, {});
  await settle();
  assert((await r2).step === 'inflight' && (await r3).step === 'inflight',
    'G1 ★同じ会員への2本目以降は in-flight で弾かれる（連打しても往復が増えない）');
  assert(cap.named('claim_organizer_seat').length === 1, 'G2 claim_organizer_seat も1回だけ  [' + cap.named('claim_organizer_seat').length + ']');

  // 別の会員は止めない。★ hang する push を await してはいけない（Promise.all が永久に settle せず、
  //   node が既定の exit 0 で終わる＝**黙って緑になる**）。RPC が実際に出たかで見る。
  const other = fixture().members[1];
  app.call('pushMemberEditToCloud', other, function () {}, {});
  await settle();
  const ids = cap.named('app_upsert_member_edit').map(function (r) { return r.args.p_member_id; });
  assert(ids.indexOf(MID2) >= 0, 'G3 別の会員の保存は止めない（会員ごとのガード）  [' + ids.join(',') + ']');
  assert(ids.filter(function (x) { return x === MID; }).length === 1, 'G3a 連打した会員の RPC は1回だけ');
  void r1;
})();

const caseG2 = (async function () {
  // 完了したら次が通る（ガードが外れる）
  const app = bootLog();
  const cap = mockCloud(app, {});
  const m = fixture().members[0];
  const a = await app.call('pushMemberEditToCloud', m, function () {}, {});
  assert(a.ok === true, 'G4 前提: 1本目は成功する');
  const b = await app.call('pushMemberEditToCloud', m, function () {}, {});
  assert(b.step !== 'inflight' && b.ok === true, 'G5 ★完了後は次の保存が通る（ガードが外れる＝押しても反応しない状態にならない）');
  assert(cap.named('app_upsert_member_edit').length === 2, 'G6 2回とも RPC が出ている');
})();

const caseG3 = (async function () {
  // 失敗しても外れる
  const app = bootLog();
  app.ctx.window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
  app.ctx.window.supabase = { createClient: function () { throw new Error('boom'); } };
  const m = fixture().members[0];
  const a = await app.call('pushMemberEditToCloud', m, function () {}, {});
  assert(a.step === 'exception', 'G7 前提: 例外経路を通る');
  const b = await app.call('pushMemberEditToCloud', m, function () {}, {});
  assert(b.step !== 'inflight', 'G8 ★例外で終わってもガードは外れる（一度失敗すると二度と押せない、を防ぐ）');
})();

const caseG4 = (async function () {
  // 削除/復元も同じ
  const app = bootLog();
  const cap = mockCloud(app, { hang: true });
  const master = JSON.parse(app.localStorage.getItem(app.ctx.BRANCH_MASTER_KEY));
  const p1 = app.call('pushMemberDeleteStateToCloud', [MID], master, true, function () {});
  const p2 = app.call('pushMemberDeleteStateToCloud', [MID], master, true, function () {});
  await settle();
  assert((await p2).step === 'inflight', 'G9 削除 push も2本目は in-flight で弾かれる');
  app.call('pushMemberDeleteStateToCloud', [MID], master, false, function () {});
  await settle();
  assert(cap.named('app_upsert_member_edits_bulk').length === 2,
    'G10 同じ会員でも「削除」と「復元」は別の操作として通る  [' + cap.named('app_upsert_member_edits_bulk').length + ']');
  void p1;
})();

// ======================================================================== 実行
// ★ どれかがハングすると then が走らず、node は既定の exit 0 で終わる＝run_tests.sh が
//   「全PASS」と表示する（#901 で実際に踏んだ）。待ちに上限を置いて必ず結果を出す。
const all = Promise.all([caseN, caseN2, caseG, caseG2, caseG3, caseG4]);
// ★ この timer は **unref してはいけない**。unref すると、アプリ側の Promise がハングしたとき
//   node がイベントループ空と判断して**先に exit 0 で終わり、番人が鳴らない**（実測でこれを踏んだ）。
const guard = new Promise(function (res) { setTimeout(function () { res('TIMEOUT'); }, 20000); });
Promise.race([all.then(function () { return 'DONE'; }), guard]).then(function (how) {
  if (how === 'TIMEOUT') { fail++; console.error('  ✗ テストが 20 秒以内に完了しなかった（アプリ側の Promise が解決していない）'); }
  const ran = pass + fail;
  if (ran !== EXPECTED_CHECKS) {
    fail++;
    console.error('  ✗ assertion の実行本数が想定と違う（想定 ' + EXPECTED_CHECKS + ' / 実際 ' + ran + '）');
  }
  console.log(`  結果: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);   // ← ここで必ず抜けるので、番人の timer が残っていても終了は遅れない
}).catch(function (e) {
  console.error('  ✗ 例外: ' + ((e && e.stack) || e));
  process.exit(1);
});
