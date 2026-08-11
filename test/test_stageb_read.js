#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-1 — クラウド read-only 閲覧（過去大会・結果・名簿）単体テスト。
//   観点:
//     T  大会一覧: 空状態 / 日付降順 / status ラベル / data-id / esc。
//     M  名簿: 空状態 / ふりがな昇順 / esc。
//     E  結果: shapeEntryRow 平坦化 / 空状態 / B(SOS)・C(SODOS) 列 / クラス→順位ソート / esc。
//     F  fetch ラッパ: ok 経路（selectData 返却）/ error 経路（ok:false）。
//     X  XSS: 名称/氏名の <script> 等が esc される。
//   supabase client は mock 注入。実データ不使用。当日運営(shogi_v4.html)は触らない。
const fs = require('fs');
const path = require('path');
const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');
let pass = 0, fail = 0;
function ok(m){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+m); }
function ng(m){ fail++; console.error('  ✗ '+m); }
function assert(c,m){ c?ok(m):ng(m); }
function loadAuth(){ const win={ location:{ origin:'https://app.test', pathname:'/app/' } }; new Function('window', AUTH_JS)(win); return win.ShogiAuth; }
// table 別に異なるデータを返す mock（2段取得＋JS突き合わせ検証用）。
function tableClient(byTable){
  function builder(t){const b={};b.select=function(){return this;};b.eq=function(){return this;};
    b.then=function(res,rej){return Promise.resolve({data:(byTable[t]!==undefined?byTable[t]:[]),error:null}).then(res,rej);};return b;}
  return { from(t){ return { select:()=>builder(t) }; } };
}
// ok 経路: from().select().eq().then → {data:selectData,error:null}
function okClient(selectData){
  function builder(){ const b={}; b.select=function(){return this;}; b.eq=function(){return this;};
    b.then=function(res,rej){ return Promise.resolve({ data:selectData, error:null }).then(res,rej); }; return b; }
  return { from(){ return { select:()=>builder() }; } };
}
// error 経路
function errClient(){
  function builder(){ const b={}; b.select=function(){return this;}; b.eq=function(){return this;};
    b.then=function(res,rej){ return Promise.resolve({ data:null, error:{ message:'boom' } }).then(res,rej); }; return b; }
  return { from(){ return { select:()=>builder() }; } };
}
// NTH-2（Codex #525）: .eq(col,val) 呼び出しを table 別に記録する mock（読み取りスコープの検証用）。
function recEqClient(byTable){
  const eqs={};
  function builder(t){ const b={}; eqs[t]=eqs[t]||[];
    b.select=function(){return this;};
    b.eq=function(col,val){ eqs[t].push([col,val]); return this; };
    b.then=function(res,rej){ return Promise.resolve({data:(byTable[t]!==undefined?byTable[t]:[]),error:null}).then(res,rej); };
    return b; }
  return { _eqs:eqs, from(t){ return { select:()=>builder(t) }; } };
}
const A = loadAuth();

(async function(){
  // ---- T: 大会一覧 ----
  assert(A.buildTournamentListHtml([]).indexOf('クラウドに大会がありません')>=0, 'T1 大会0件で空状態');
  var tl = A.buildTournamentListHtml([
    { id:'t1', name:'六月例会', date:'2026-06-14', season:'2026年度', status:'synced' },
    { id:'t2', name:'五月例会', date:'2026-05-10', season:'2026年度', status:'confirmed' }
  ]);
  assert(tl.indexOf('t1')< tl.indexOf('t2') || (tl.indexOf('2026-06-14') < tl.indexOf('2026-05-10')), 'T2 日付降順（新しい大会が先）');
  assert(tl.indexOf('同期済み')>=0 && tl.indexOf('確定')>=0, 'T3 status ラベル（同期済み/確定）');
  assert(tl.indexOf('data-id="t1"')>=0, 'T4 data-id を持つ（行選択用）');
  assert(A.sortTournamentsDesc([{date:'2026-01-01'},{date:'2026-12-01'}])[0].date==='2026-12-01', 'T5 sortTournamentsDesc は降順');

  // ---- M: 名簿 ----
  assert(A.buildMemberListHtml([]).indexOf('名簿が空です')>=0, 'M1 名簿0件で空状態');
  var ml = A.buildMemberListHtml([{ name:'乙', yomi:'おつ' },{ name:'甲', yomi:'こう' }]);
  assert(ml.indexOf('おつ') < ml.indexOf('こう'), 'M2 ふりがな昇順');
  assert(ml.indexOf('甲')>=0 && ml.indexOf('乙')>=0, 'M3 氏名表示');

  // ---- E: 結果（shapeEntryRow + table）----
  var shaped = A.shapeEntryRow({ final_rank:1, 'class':'A', wins:3, losses:0, sos:5, sodos:4, players:{ member_id:'m1', members:{ name:'架空太郎', yomi:'かくうたろう' } } });
  assert(shaped.name==='架空太郎' && shaped.rank===1 && shaped.sos===5 && shaped.sodos===4, 'E1 shapeEntryRow が nested players.members を平坦化');
  assert(A.buildEntryTableHtml([]).indexOf('結果がありません')>=0, 'E2 結果0件で空状態');
  var et = A.buildEntryTableHtml([
    { final_rank:2, 'class':'A', wins:2, losses:1, sos:4, sodos:2, players:{ members:{ name:'二位太郎' } } },
    { final_rank:1, 'class':'A', wins:3, losses:0, sos:5, sodos:4, players:{ members:{ name:'一位太郎' } } }
  ]);
  assert(et.indexOf('sb-table')>=0 && et.indexOf('>B<')>=0 && et.indexOf('>C<')>=0 && et.indexOf('B＝対戦相手の勝数合計')>=0, 'E3 当日順位表同型（sb-table・B/C列・凡例）＝APP-UX-004A');
  assert(et.indexOf('一位太郎') < et.indexOf('二位太郎'), 'E4 クラス内は順位昇順（1位が先）');
  assert(et.indexOf('sb-row-1')>=0 && et.indexOf('sb-row-1') < et.indexOf('一位太郎'), 'E4b 1位行に sb-row-1 ハイライト');
  var et2 = A.buildEntryTableHtml([
    { final_rank:1, 'class':'B', wins:3, losses:1, players:{ members:{ name:'乙一' } } },
    { final_rank:1, 'class':'A', wins:4, losses:0, players:{ members:{ name:'甲一', yomi:'こういち' } } }
  ]);
  assert(et2.indexOf('Aクラス')>=0 && et2.indexOf('Bクラス')>=0 && et2.indexOf('Aクラス') < et2.indexOf('Bクラス'), 'E5 クラスごとのブロック（A→B順）');
  assert(et2.indexOf('<ruby>甲一<rt>こういち</rt></ruby>')>=0, 'E6 ふりがなはルビ表示（yomi 無しはルビなし）');
  assert(et2.indexOf('最終結果')>=0, 'E7 クラス見出しに「最終結果」');
  var th = A.buildTournamentHeadHtml({ id:'t1', name:'六月例会', date:'2026-06-23', season:'2026年度', status:'confirmed' });
  // [反転] 理由(#840): #608 の置き換え（'月例' を含む→沼津支部月例将棋大会）を廃止し、
  //        入力された大会名をそのまま見出しに出す。一覧と単一ソースである点は維持。
  assert(th.indexOf('2026-06-23')>=0 && th.indexOf('2026年6月度 六月例会')>=0 && th.indexOf('2026年度')>=0 && th.indexOf('確定')>=0, 'E8 [反転] 大会見出し（日付・名称=生名・年度/状態）');
  assert(th.indexOf('沼津')<0, 'E8b 見出しに沼津の名前が生えない');
  assert(A.buildTournamentHeadHtml(null)==='', 'E9 大会不明時は見出しなし（fail-soft）');
  // APP-UX-004A2: 一覧⇄詳細のビュー切替（結果視認性の原則）
  var av = A.buildAppViewHtml({ isAdmin:false, role:'organizer' }, []);
  assert(av.indexOf('id="tntListView"')>=0 && av.indexOf('id="tntDetailView"')>=0, 'E10 一覧/詳細の2ビュー構造');
  assert(/id="tntDetailView"[^>]*display:none/.test(av), 'E11 詳細ビューは初期非表示（一覧が先）');
  assert(av.indexOf('id="tntBackBtn"')>=0 && av.indexOf('大会一覧へ')>=0, 'E12 詳細に戻るボタン');
  assert(av.indexOf('id="cloudTournaments"')>=0 && av.indexOf('id="cloudEntries"')>=0, 'E13 既存 id 温存');

  // ---- F: fetch ラッパ ----
  var rt = await A.fetchTournaments(okClient([{ id:'t1', name:'x', date:'2026-06-14', season:'2026年度', status:'synced' }]), 'club1');
  assert(rt.ok===true && rt.tournaments.length===1, 'F1 fetchTournaments ok 経路');
  var rm = await A.fetchMembers(okClient([{ member_id:'m1', name:'甲', yomi:'こう' }]), 'club1');
  assert(rm.ok===true && rm.members.length===1, 'F2 fetchMembers ok 経路');
  var re = await A.fetchEntries(tableClient({entries:[{final_rank:1,'class':'A',player_id:'p1'}],players:[{id:'p1',member_id:'m1',members:{name:'甲',yomi:'こう'}}]}), 't1', 'club1');
  assert(re.ok===true && re.entries.length===1, 'F3 fetchEntries ok 経路');
  assert(A.shapeEntryRow(re.entries[0]).name==='甲', 'F3b fetchEntries が player_id→氏名を JS 突き合わせ');
  var rerr = await A.fetchTournaments(errClient(), 'club1');
  assert(rerr.ok===false && rerr.tournaments.length===0, 'F4 fetchTournaments error 経路は ok:false');
  var rerr2 = await A.fetchEntries(errClient(), 't1', 'club1');
  assert(rerr2.ok===false, 'F5 fetchEntries error 経路は ok:false');
  // NTH-2: fetchEntries の entries クエリは tournament_id と club_id の両方でスコープする。
  var rec = recEqClient({entries:[{final_rank:1,'class':'A',player_id:'p1'}],players:[{id:'p1',member_id:'m1',members:{name:'甲'}}]});
  await A.fetchEntries(rec, 't1', 'club9');
  var entEqs = (rec._eqs.entries||[]);
  assert(entEqs.some(function(e){return e[0]==='tournament_id'&&e[1]==='t1';}), 'F6 fetchEntries は tournament_id でスコープ');
  assert(entEqs.some(function(e){return e[0]==='club_id'&&e[1]==='club9';}), 'F6b fetchEntries は club_id でもスコープ（NTH-2）');
  assert((rec._eqs.players||[]).some(function(e){return e[0]==='club_id'&&e[1]==='club9';}), 'F6c players 取得も club_id スコープ（既存）');

  // ---- X: XSS ----
  var xt = A.buildTournamentListHtml([{ id:'t<x', name:'<script>alert(1)</script>', date:'2026-06-14', season:'s', status:'synced' }]);
  assert(xt.indexOf('<script>alert(1)</script>')<0 && xt.indexOf('&lt;script&gt;')>=0, 'X1 大会名の <script> が esc される');
  var xe = A.buildEntryTableHtml([{ final_rank:1, 'class':'A', players:{ members:{ name:'<b>tag</b>' } } }]);
  assert(xe.indexOf('<b>tag</b>')<0 && xe.indexOf('&lt;b&gt;')>=0, 'X2 氏名の <b> が esc される');

  console.log('\n  Stage B-1 read-only テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  if(fail>0) process.exit(1);
})();
