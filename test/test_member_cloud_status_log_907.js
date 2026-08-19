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
const EXPECTED_CHECKS = 55;

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
  // #907 Codex P2: role="status" は aria-atomic が既定 true。3行ブロックを読み上げ領域のままにすると、
  //   1行変えるたびに3行**すべて**が読み直される。読み上げは「今変わった1行」だけの別要素に分ける。
  const visible = (html.match(/<div id="masterCloudPullStatus"[^>]*>/) || [''])[0];
  assert(visible !== '' && visible.indexOf('aria-live') < 0 && visible.indexOf('role="status"') < 0,
    'L15 ★見える3行ブロックは読み上げ領域ではない（1行の変化で3行が読み直されない）  [' + visible + ']');
  const live = (html.match(/<div id="masterCloudPullStatusLive"[^>]*>/) || [''])[0];
  assert(/role="status"/.test(live) && /aria-live="polite"/.test(live),
    'L16 読み上げ専用の要素がある（role=status / aria-live=polite）  [' + live + ']');
}

// 読み上げには「今変わった1行」だけが入る（#907 Codex P2）
{
  const app = bootLog();
  app.call('_masterCloudStatusFn', '甲')('クラウドへ反映中…');
  app.call('_masterCloudStatusFn', '乙')('クラウドへ反映中…');
  const live = app.document.getElementById('masterCloudPullStatusLive');
  assert(String(live.textContent || '') === '乙：クラウドへ反映中…',
    'L17 ★読み上げは今変わった1行だけ（履歴3行ぶんを読み直さない）  [' + live.textContent + ']');
  assert(statusText(app).split('\n').length === 2, 'L17a 前提: 見える方は2行ある');
  live.textContent = '';
  app.call('renderMasterCloudLog');
  assert(String(live.textContent || '') === '',
    'L18 ★ただの再描画では読み上げない（タブを開き直すたびに全部読み上げられない）');
}

// 3行から溢れて落ちた操作の**遅い続報**は履歴に戻らない（#907 Codex P1）
{
  const app = bootLog();
  const a = app.call('_masterCloudStatusFn', '甲');
  a('クラウドへ反映中…');
  app.call('_masterCloudStatusFn', '乙')('会員情報をクラウドにも反映しました');
  app.call('_masterCloudStatusFn', '丙')('クラウドへの反映に失敗しました');
  app.call('_masterCloudStatusFn', '丁')('会員情報をクラウドにも反映しました');
  const before = statusText(app);
  assert(before.indexOf('甲') < 0, 'L19a 前提: 4件目が入った時点で甲の行は溢れて落ちている');
  a('会員情報をクラウドにも反映しました');       // ← 落ちたあとに遅れて返ってきた続報
  assert(statusText(app) === before,
    'L19 ★落ちた操作の遅い続報は履歴に戻らない（新しい失敗行を押し出さない）  [' + statusText(app) + ']');
  assert(/cloud-status-err/.test(statusClass(app)),
    'L19b 丙の失敗が残っているのでブロックは失敗色のまま');
}

// 退役の記憶は時間が経っても消えない（#907 Codex 2巡目 P1: 上限付きの表だと忘れる）
{
  const app = bootLog();
  const a = app.call('_masterCloudStatusFn', '甲');
  a('クラウドへ反映中…');
  for (let i = 0; i < 250; i++) app.call('_masterCloudStatusFn', 'x' + i)('クラウドへ反映中…');
  app.call('_masterCloudStatusFn', '丙')('クラウドへの反映に失敗しました');
  const before = statusText(app);
  assert(before.indexOf('甲') < 0, 'L20a 前提: 甲はとうに落ちている');
  a('会員情報をクラウドにも反映しました');       // ← 250行ぶん経ってから返ってきた
  assert(statusText(app) === before,
    'L20 ★何行流れても、落ちた操作の続報は戻らない（退役の記憶を上限で捨てない）  [' + statusText(app) + ']');
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
  const cap = { rpcs: [], _held: [] };
  // hang したい RPC は「保留」にしておき、cap.release() で解放する。
  //   （待たせた保存が**あとで実際に飛ぶ**ところまで見るには、飛行中を終わらせられる必要がある）
  cap.release = function () { const h = cap._held; cap._held = []; h.forEach(function (f) { f(); }); };
  function held(payload) { return new Promise(function (res) { cap._held.push(function () { res(payload); }); }); }
  app.ctx.window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
  app.ctx.window.supabase = { createClient: function () { return {
    auth: { getSession: function () { return Promise.resolve({ data: { session: { user: {} } } }); } },
    rpc: function (name, args) {
      cap.rpcs.push({ name: String(name), args: args });
      if (name === 'claim_organizer_seat') return Promise.resolve({ data: [{ club_id: CLUB_ID, status: 'active' }] });
      if (name === 'app_upsert_member_edit') {
        const okPayload = { data: { inserted: true, member_kind: args.p_member_kind, grade: args.p_grade, city: args.p_city, deleted_at: null }, error: null };
        return opt.hang ? held(okPayload) : Promise.resolve(okPayload);
      }
      if (name === 'app_upsert_member_edits_bulk') {
        const okBulk = { data: { count: (args.p_rows || []).length, inserted: 0 }, error: null };
        return opt.hang ? held(okBulk) : Promise.resolve(okBulk);
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
  // 連打（1本目が飛行中）。#907 Codex P1: 2本目以降は**捨てない**。直列化して、待ち行列には
  //   いちばん新しいスナップショット1件だけを残す（＝最後に保存した内容が必ずクラウドへ届く）。
  const app = bootLog();
  const cap = mockCloud(app, { hang: true });
  const m = fixture().members[0];
  const st2 = [], st3 = [];
  const m2 = Object.assign({}, m, { name: '架空太郎2', city: '沼津市' });
  // ★ m3 の市町村は既定値のまま。こうしておくと G6 は「2本目が市町村を触った」という touched が
  //   合流で残ったときだけ true になる（スナップショット側の値では緑にならない＝ピンが空振りしない）。
  const m3 = Object.assign({}, m, { name: '架空太郎3' });
  const r1 = app.call('pushMemberEditToCloud', m, function () {}, { grade: true });
  const r2 = app.call('pushMemberEditToCloud', m2, function (x) { st2.push(String(x)); }, { city: true });
  const r3 = app.call('pushMemberEditToCloud', m3, function (x) { st3.push(String(x)); }, { member: true });
  await settle();
  assert(cap.named('app_upsert_member_edit').length === 1,
    'G1 ★飛行中は往復を増やさない（RPC は1本目だけ）  [' + cap.named('app_upsert_member_edit').length + ']');
  assert(cap.named('claim_organizer_seat').length === 1, 'G2 claim_organizer_seat も1回だけ');
  assert(st2.join('|').indexOf('待機中') >= 0,
    'G3 待たされる保存は「待機中…」と出る（押しても無反応に見えない）  [' + st2.join('|') + ']');
  assert(st3.length === 0, 'G3a 3本目は2本目の行に合流する（連打で行が増えない）');

  cap.release(); await settle(10);
  const sent = cap.named('app_upsert_member_edit');
  assert(sent.length === 2,
    'G4 ★待たせた分は捨てずに飛ぶ（連打しても最後の保存がクラウドに届く）  [' + sent.length + ']');
  assert(sent[1] && sent[1].args.p_name === '架空太郎3',
    'G5 ★飛ぶのはいちばん新しいスナップショット  [' + (sent[1] && sent[1].args.p_name) + ']');
  assert(sent[1] && sent[1].args.p_set_city === true,
    'G6 ★合流した分の touched は論理和（2本目が触った市町村が3本目に飲まれない＝誤徴収に戻らない）  [' + (sent[1] && sent[1].args.p_set_city) + ']');

  cap.release(); await settle(10);
  const res1 = await r1, res2 = await r2, res3 = await r3;
  assert(res1.ok === true, 'G7 1本目は成功で解決する');
  assert(res2.ok === true && res3.ok === true,
    'G7a ★待たせた呼び出しも成功で解決する（呼び出し元が「捨てられた」と誤解しない）  [' + res2.step + '/' + res3.step + ']');

  // 別の会員は止めない（会員ごとの待ち行列）
  const other = fixture().members[1];
  app.call('pushMemberEditToCloud', other, function () {}, {});
  await settle();
  const ids = cap.named('app_upsert_member_edit').map(function (r) { return r.args.p_member_id; });
  assert(ids.indexOf(MID2) >= 0, 'G8 別の会員の保存は止めない（会員ごとのガード）  [' + ids.join(',') + ']');
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
  // 削除/復元。#907 Codex 2巡目 P1: キーに向き（削除/復元）を含めると、削除が飛行中の復元が
  //   **同時に飛び**、その後の削除だけが重複として捨てられる。着順次第でクラウドが「復元」で終わり、
  //   端末の「削除」と食い違う。向きを外して直列化し、最後に要求された状態だけを送る。
  const app = bootLog();
  const cap = mockCloud(app, { hang: true });
  const master = JSON.parse(app.localStorage.getItem(app.ctx.BRANCH_MASTER_KEY));
  const p1 = app.call('pushMemberDeleteStateToCloud', [MID], master, true, function () {});
  const p2 = app.call('pushMemberDeleteStateToCloud', [MID], master, true, function () {});
  await settle();
  assert((await p2).step === 'inflight', 'G9 同じ状態の2本目は捨てる（文字どおりの重複）');
  const p3 = app.call('pushMemberDeleteStateToCloud', [MID], master, false, function () {});
  await settle();
  assert(cap.named('app_upsert_member_edits_bulk').length === 1,
    'G10 ★削除が飛行中の復元は同時に飛ばない（着順で最終状態が決まらない）  [' + cap.named('app_upsert_member_edits_bulk').length + ']');
  cap.release(); await settle(10);
  const sent = cap.named('app_upsert_member_edits_bulk');
  assert(sent.length === 2, 'G10a ★復元は捨てずに、削除が終わってから飛ぶ  [' + sent.length + ']');
  assert(sent[1] && sent[1].args.p_rows[0].deleted_at === null,
    'G10b 2本目は復元（deleted_at=null）  [' + (sent[1] && sent[1].args.p_rows[0].deleted_at) + ']');
  cap.release(); await settle(10);
  assert((await p1).ok === true && (await p3).ok === true, 'G10c 削除も復元も成功で解決する');
})();

const caseG4b = (async function () {
  // 削除 → 復元 → 削除 と押した場合、最後に残るのは削除（端末の最終状態と一致する）
  const app = bootLog();
  const cap = mockCloud(app, { hang: true });
  const master = JSON.parse(app.localStorage.getItem(app.ctx.BRANCH_MASTER_KEY));
  app.call('pushMemberDeleteStateToCloud', [MID], master, true, function () {});
  const pr = app.call('pushMemberDeleteStateToCloud', [MID], master, false, function () {});
  app.call('pushMemberDeleteStateToCloud', [MID], master, true, function () {});
  await settle();
  cap.release(); await settle(10);
  const sent = cap.named('app_upsert_member_edits_bulk');
  assert(sent.length === 1,
    'G12 ★削除→復元→削除は、飛行中の削除と同じ状態に戻るので追加の往復を出さない  [' + sent.length + ']');
  assert(sent[0].args.p_rows[0].deleted_at !== null,
    'G12a ★クラウドに残るのは削除（端末の最終状態と一致する）');
  assert((await pr).step === 'superseded',
    'G12b 追い越された復元は superseded で解決する（黙って握り潰さない）  [' + (await pr).step + ']');
})();

const caseG5 = (async function () {
  // #907 Codex P1: 会員 id は「空でない文字列」しか要求していない（外部マスタ取り込み経路）。
  //   キーを join(',') で作ると ['a,b','c'] と ['a','b,c'] が同じになり、別の削除が in-flight と
  //   誤判定されて**黙って消える**（端末では削除済みなのでズレに気付けない）。
  const app = bootLog();
  const cap = mockCloud(app, { hang: true });
  const master = { members: [
    { id: 'a,b', name: '架空甲', yomi: 'かくうこう' }, { id: 'c', name: '架空乙', yomi: 'かくうおつ' },
    { id: 'a', name: '架空丙', yomi: 'かくうへい' }, { id: 'b,c', name: '架空丁', yomi: 'かくうてい' },
  ] };
  app.call('pushMemberDeleteStateToCloud', ['a,b', 'c'], master, true, function () {});
  app.call('pushMemberDeleteStateToCloud', ['a', 'b,c'], master, true, function () {});
  await settle();
  assert(cap.named('app_upsert_member_edits_bulk').length === 2,
    'G11 ★id にカンマが入っても別々の削除として扱う（片方が黙って消えない）  [' + cap.named('app_upsert_member_edits_bulk').length + ']');
})();

const caseG6 = (async function () {
  // #907 Codex 2巡目 P2: 待ち行列で合流すると、送る中身は3本目なのに行のラベルが2本目の会員名のまま
  //   ＝せっかく付けた「どの会員か」が、いちばん紛らわしい場面（連打）で嘘になる。
  const app = bootLog();
  const cap = mockCloud(app, { hang: true });
  const m = fixture().members[0];
  app.call('pushMemberEditToCloud', m, app.call('_masterCloudStatusFn', '架空太郎'), {});
  app.call('pushMemberEditToCloud', Object.assign({}, m, { name: '改名その1' }),
    app.call('_masterCloudStatusFn', '改名その1'), {});
  app.call('pushMemberEditToCloud', Object.assign({}, m, { name: '改名その2' }),
    app.call('_masterCloudStatusFn', '改名その2'), {});
  await settle();
  const lines = statusText(app).split('\n');
  assert(lines.length === 2, 'G13a 前提: 行は2本（合流で増えない）  [' + lines.length + ']');
  assert(lines[0].indexOf('改名その2：') === 0,
    'G13 ★合流したら行のラベルも最新の会員名になる（送る中身と表示がずれない）  [' + lines[0] + ']');
  cap.release(); await settle(10);
  cap.release(); await settle(10);
  const sent = cap.named('app_upsert_member_edit');
  assert(sent.length === 2 && sent[1].args.p_name === '改名その2',
    'G13b 実際に飛ぶのも「改名その2」  [' + (sent[1] && sent[1].args.p_name) + ']');
})();

// ======================================================================== 実行
// ★ どれかがハングすると then が走らず、node は既定の exit 0 で終わる＝run_tests.sh が
//   「全PASS」と表示する（#901 で実際に踏んだ）。待ちに上限を置いて必ず結果を出す。
const all = Promise.all([caseN, caseN2, caseG, caseG2, caseG3, caseG4, caseG4b, caseG5, caseG6]);
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
