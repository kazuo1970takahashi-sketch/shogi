#!/usr/bin/env node
// APP-MEMBER-HARD-DELETE-001 — 名簿の完全削除（物理削除・第2弾）。
//   スキーマは players→members / entries→players とも ON DELETE CASCADE のため、出場記録を持つ
//   会員の物理削除は成績の連鎖消滅を意味する。よって:
//     G  hardDeleteMembers: HARD-DELETE-ATOMIC-001（Codex #525 Must-1）で RPC
//        app_hard_delete_members（単一トランザクション・FOR UPDATE・サーバ側再確認）に置換。
//        deleted/skipped の応答整形・全員 skip は ok:false・権限/エラー経路・旧2リクエスト構成の不在。
//     P  migration pin: RPC の原子化要件（FOR UPDATE / SECURITY INVOKER / app_is_admin /
//        deleted_at 限定 / anon への EXECUTE なし）。
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

// mock client: rpc('app_hard_delete_members') の呼び出しを記録し、opts で応答を制御。
//   HARD-DELETE-ATOMIC-001: from('players')/from('members') の2段 mock は撤去
//   （確認と削除はサーバ側 RPC 内へ移動＝実体検証は migration pin と pgtest）。
function makeClient(opts){
  opts = opts || {};
  const calls = { rpc: [] };
  return {
    _calls: calls,
    rpc(name, args){
      calls.rpc.push({ name: name, args: args });
      return {
        then(res, rej){
          let out;
          if (opts.rpcError) out = Promise.resolve({ data: null, error: { message: opts.rpcError } });
          else out = Promise.resolve({ data: (opts.rpcData !== undefined ? opts.rpcData : { deleted: (args && args.p_member_ids) || [], skipped: [] }), error: null });
          return out.then(res, rej);
        }
      };
    }
  };
}
const MIG = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260703150000_stagec_hard_delete_members_rpc.sql'), 'utf8');

(async function(){
  // ================================================= G. hardDeleteMembers
  await (async function(){
    var r0 = await A.hardDeleteMembers(makeClient(), CLUB, []);
    assert(r0.ok === false, 'G1 空選択は拒否');
    var r1 = await A.hardDeleteMembers(makeClient(), '', ['m_x']);
    assert(r1.ok === false, 'G2 club 空は拒否');

    var c2 = makeClient();
    var r2 = await A.hardDeleteMembers(c2, CLUB, ['m_a', 'm_b']);
    assert(r2.ok === true && r2.deleted.length === 2 && r2.skipped.length === 0, 'G3 出場記録ゼロは削除される');
    assert(c2._calls.rpc.length === 1 && c2._calls.rpc[0].name === 'app_hard_delete_members', 'G4 単一 RPC 呼び出し（2リクエスト構成の廃止＝レース窓なし）');
    assert(c2._calls.rpc[0].args.p_club === CLUB && c2._calls.rpc[0].args.p_member_ids.join(',') === 'm_a,m_b', 'G5 RPC 引数は club＋member_ids で限定');
    assert(/hardDeleteMembers[\s\S]{0,2200}rpc\('app_hard_delete_members'/.test(AUTH_JS) && !/function hardDeleteMembers[\s\S]{0,2200}from\('players'\)/.test(AUTH_JS), 'G6 旧 players select→members delete の2段構成が残っていない');

    var c3 = makeClient({ rpcData: { deleted: ['m_b'], skipped: ['m_a'] } });
    var r3 = await A.hardDeleteMembers(c3, CLUB, ['m_a', 'm_b']);
    assert(r3.ok === true && r3.deleted.join(',') === 'm_b' && r3.skipped.join(',') === 'm_a', 'G7 出場記録ありは skip・残りだけ削除（サーバ判定を反映）');
    assert(/スキップ/.test(r3.message), 'G9 skip をメッセージで通知');

    var c4 = makeClient({ rpcData: { deleted: [], skipped: ['m_a', 'm_b'] } });
    var r4 = await A.hardDeleteMembers(c4, CLUB, ['m_a', 'm_b']);
    assert(r4.ok === false && /出場記録/.test(r4.message), 'G10 全員記録ありは削除せず ok:false');

    var r5 = await A.hardDeleteMembers(makeClient({ rpcError: '完全削除には幹事（管理者）の権限が必要です。' }), CLUB, ['m_a']);
    assert(r5.ok === false && /権限/.test(r5.message), 'G11 非管理者は RPC が raise → 権限エラー通知');

    var r6 = await A.hardDeleteMembers(makeClient({ rpcError: 'boom' }), CLUB, ['m_a']);
    assert(r6.ok === false && /失敗/.test(r6.message), 'G12 RPC エラーは ok:false');
    var r7 = await A.hardDeleteMembers(makeClient({ rpcData: { deleted: [], skipped: [] } }), CLUB, ['m_a']);
    assert(r7.ok === false && /(見つからない|削除済み行)/.test(r7.message), 'G13 対象なし（未削除行のみ等）は ok:false');
  })();

  // ================================================= P. migration pin（原子化要件）
  (function(){
    assert(/create or replace function public\.app_hard_delete_members\(p_club uuid, p_member_ids text\[\]\)/.test(MIG), 'P1 RPC 定義');
    assert(/for update/.test(MIG), 'P2 members 行を FOR UPDATE ロック（FK の KEY SHARE と競合＝レース直列化）');
    assert(/security invoker/.test(MIG), 'P3 SECURITY INVOKER（RLS 有効のまま）');
    assert(/app_is_admin\(p_club\)/.test(MIG), 'P4 管理者の明示チェック');
    assert(/deleted_at is not null/.test(MIG), 'P5 論理削除済み行だけ削除（defense in depth）');
    assert(/revoke all on function public\.app_hard_delete_members[\s\S]*?from anon/.test(MIG), 'P6 anon に EXECUTE を与えない');
    assert(/grant execute on function public\.app_hard_delete_members[\s\S]*?to authenticated/.test(MIG), 'P7 authenticated のみ実行可');
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
    assert(/msHardDeleteBtn[\s\S]{0,1600}memberHardDeleteConfirmMessage/.test(AUTH_JS), 'R1 confirm を経由して実行');
    // L3 P2 (#521): 混在選択時に有効会員の氏名が破壊 confirm に出ないよう、削除済み行だけの preview を組む。
    assert(/dm\.deleted_at && memberSheetSelected\[dm\.member_id\]/.test(AUTH_JS), 'R5 confirm プレビューは削除済み行に限定');
    // L3 P3 (#521): confirm が使えない環境では実行しない（厳格側）。
    assert(/確認ダイアログが使えないため完全削除を実行しません/.test(AUTH_JS), 'R6 confirm 不在は中止');
    assert(/hardDeleteMembers\(client, lastSummary\.clubId, s\.del\)/.test(AUTH_JS), 'R2 対象は選択中の削除済み行');
    assert(/r\.deleted\.length; i\+\+\) delete memberSheetSelected\[r\.deleted\[i\]\]/.test(AUTH_JS), 'R3 実削除分だけ選択解除（skip 分は選択維持）');
    assert(/hardDeleteMembers\(client[\s\S]{0,400}reloadMembers\(\)/.test(AUTH_JS), 'R4 成功時は再読込');
  })();

  console.log('APP-MEMBER-HARD-DELETE-001: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
