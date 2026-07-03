#!/usr/bin/env node
// APP-MEMBER-HARD-DELETE-001 — 名簿の完全削除（物理削除・第2弾）。
//   スキーマは players→members / entries→players とも ON DELETE CASCADE のため、出場記録を持つ
//   会員の物理削除は成績の連鎖消滅を意味する。よって:
//     G  hardDeleteMembers: players 行の有無をサーバ確認→出場記録ゼロだけ削除・記録ありは skip /
//        全員 skip は ok:false / RLS で 0 行削除（非管理者）は権限エラー / エラー経路。
//     C  confirm 文言: 完全に削除・復元できません・一括送信での復活注意・☁取得の先行案内。
//     B  builder: 完全削除ボタンは削除済み行の選択時のみ（ms-danger・件数付き）。
//     R  RAW pin: bind 結線・deleted のみ選択解除・reloadMembers。
//   実データ不使用（架空のみ）。supabase client は mock 注入。shogi_v4.html は触らない。

const fs = require('fs');
const path = require('path');
const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(m){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+m); }
function ng(m){ fail++; console.error('  ✗ '+m); }
function assert(c,m){ c?ok(m):ng(m); }

function loadAuth(){
  const win = { location:{ origin:'https://app.test', pathname:'/app/' } };
  new Function('window', AUTH_JS)(win);
  return win.ShogiAuth;
}
const A = loadAuth();
const CLUB = 'cccccccc-0000-0000-0000-000000000001';

// mock client: players.select は playersData を返す・members.delete は deleteReturn を返し呼び出しを記録。
function makeClient(opts){
  opts = opts || {};
  const calls = { select: [], del: [] };
  function builder(table, op){
    const b = { _table: table, _op: op, _filters: {}, _in: null, _cols: null };
    b.eq = function(k, v){ this._filters[k] = v; return this; };
    b.in = function(k, v){ this._in = { key: k, vals: v }; return this; };
    b.select = function(c){ this._cols = c; return this; };
    b.then = function(res, rej){
      let out;
      if (op === 'select') {
        calls.select.push({ table, filters: b._filters, inq: b._in });
        out = Promise.resolve(opts.selectError ? { data: null, error: { message: opts.selectError } } : { data: opts.playersData || [], error: null });
      } else {
        calls.del.push({ table, filters: b._filters, inq: b._in, cols: b._cols });
        out = Promise.resolve(opts.deleteError ? { data: null, error: { message: opts.deleteError } } : { data: (opts.deleteReturn !== undefined ? opts.deleteReturn : (b._in ? b._in.vals.map(function(v){ return { member_id: v }; }) : [])), error: null });
      }
      return out.then(res, rej);
    };
    return b;
  }
  return { _calls: calls, from(table){ return { select: () => builder(table, 'select'), delete: () => builder(table, 'delete') }; } };
}

(async function(){
  // ================================================= G. hardDeleteMembers
  await (async function(){
    var r0 = await A.hardDeleteMembers(makeClient(), CLUB, []);
    assert(r0.ok === false, 'G1 空選択は拒否');
    var r1 = await A.hardDeleteMembers(makeClient(), '', ['m_x']);
    assert(r1.ok === false, 'G2 club 空は拒否');

    var c2 = makeClient({ playersData: [] });
    var r2 = await A.hardDeleteMembers(c2, CLUB, ['m_a', 'm_b']);
    assert(r2.ok === true && r2.deleted.length === 2 && r2.skipped.length === 0, 'G3 出場記録ゼロは削除される');
    assert(c2._calls.select[0].table === 'players' && c2._calls.select[0].inq.vals.length === 2, 'G4 players をサーバ確認');
    assert(c2._calls.del[0].table === 'members' && c2._calls.del[0].filters.club_id === CLUB && c2._calls.del[0].inq.vals.join(',') === 'm_a,m_b', 'G5 members.delete は club_id＋in で限定');
    assert(c2._calls.del[0].cols === 'member_id', 'G6 .select で実削除行を検証（RLS 0行検知）');

    var c3 = makeClient({ playersData: [{ member_id: 'm_a' }] });
    var r3 = await A.hardDeleteMembers(c3, CLUB, ['m_a', 'm_b']);
    assert(r3.ok === true && r3.deleted.join(',') === 'm_b' && r3.skipped.join(',') === 'm_a', 'G7 出場記録ありは skip・残りだけ削除');
    assert(c3._calls.del[0].inq.vals.join(',') === 'm_b', 'G8 delete 対象に skip 分を含めない（CASCADE 連鎖消滅の防止）');
    assert(/スキップ/.test(r3.message), 'G9 skip をメッセージで通知');

    var c4 = makeClient({ playersData: [{ member_id: 'm_a' }, { member_id: 'm_b' }] });
    var r4 = await A.hardDeleteMembers(c4, CLUB, ['m_a', 'm_b']);
    assert(r4.ok === false && c4._calls.del.length === 0 && /出場記録/.test(r4.message), 'G10 全員記録ありは削除せず ok:false');

    var c5 = makeClient({ playersData: [], deleteReturn: [] });
    var r5 = await A.hardDeleteMembers(c5, CLUB, ['m_a']);
    assert(r5.ok === false && /権限/.test(r5.message), 'G11 実削除 0 行（RLS＝非管理者）は権限エラー');

    var r6 = await A.hardDeleteMembers(makeClient({ selectError: 'boom' }), CLUB, ['m_a']);
    assert(r6.ok === false && /確認に失敗/.test(r6.message), 'G12 players 確認エラーは中断');
    var r7 = await A.hardDeleteMembers(makeClient({ playersData: [], deleteError: 'boom' }), CLUB, ['m_a']);
    assert(r7.ok === false && /失敗/.test(r7.message), 'G13 delete エラーは ok:false');
  })();

  // ================================================= C. confirm 文言
  (function(){
    var msg = A.memberHardDeleteConfirmMessage(2, '架空太郎、架空次郎');
    assert(/完全に削除/.test(msg) && /復元できません/.test(msg), 'C1 破壊操作の明示（完全に削除・復元不可）');
    assert(/一括送信/.test(msg) && /クラウドから取得/.test(msg), 'C2 端末復活の注意＋☁取得の先行案内');
    assert(/2名（架空太郎、架空次郎）/.test(msg), 'C3 人数と氏名プレビュー');
    assert(/スキップ/.test(msg), 'C4 出場記録ありの自動スキップを予告');
  })();

  // ================================================= B. builder（ボタンの出し分け）
  (function(){
    var live = { member_id: 'm_l1', name: '架空太郎', yomi: 'かくうたろう', deleted_at: null };
    var del1 = { member_id: 'm_d1', name: '削除架空', yomi: 'さくじょ', deleted_at: '2026-06-15T00:00:00Z' };
    var h1 = A.buildMemberSheetHtml([live, del1], { m_d1: true }, '', true);
    assert(h1.indexOf('id="msHardDeleteBtn"') >= 0 && h1.indexOf('完全削除（1名）') >= 0, 'B1 削除済み選択時に完全削除ボタン');
    assert(/msHardDeleteBtn" class="ms-danger"/.test(h1), 'B2 危険色（ms-danger）');
    var h2 = A.buildMemberSheetHtml([live, del1], { m_l1: true }, '', true);
    assert(h2.indexOf('msHardDeleteBtn') < 0, 'B3 有効行だけの選択では出さない');
    var h3 = A.buildMemberSheetHtml([live, del1], {}, '', true);
    assert(h3.indexOf('msHardDeleteBtn') < 0, 'B4 未選択では出さない');
  })();

  // ================================================= R. RAW pin（結線）
  (function(){
    assert(/msHardDeleteBtn[\s\S]{0,600}memberHardDeleteConfirmMessage/.test(AUTH_JS), 'R1 confirm を経由して実行');
    assert(/hardDeleteMembers\(client, lastSummary\.clubId, s\.del\)/.test(AUTH_JS), 'R2 対象は選択中の削除済み行');
    assert(/r\.deleted\.length; i\+\+\) delete memberSheetSelected\[r\.deleted\[i\]\]/.test(AUTH_JS), 'R3 実削除分だけ選択解除（skip 分は選択維持）');
    assert(/hardDeleteMembers\(client[\s\S]{0,400}reloadMembers\(\)/.test(AUTH_JS), 'R4 成功時は再読込');
  })();

  console.log('APP-MEMBER-HARD-DELETE-001: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
