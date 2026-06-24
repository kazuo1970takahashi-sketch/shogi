#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / B-4 — 過去大会 Excel 由来データの一括取り込み（移行）単体テスト。
//   正本: #343 / docs B-4。観点:
//     V validateImportPayload: 構造/必須項目の検証。
//     R resolveImportMembers: 氏名突き合わせ（新規/既存流用/同名曖昧）。既存は変更しない。
//     P buildImportPreview: 件数＋警告（同名曖昧・順位なし）。
//     I importHistoryToCloud: members(新規のみ)→players(全resolved・id解決)→tournaments→entries・
//        idMap 再マップ・unresolved・error 経路・既存非上書き。
//   実データ不使用（架空のみ）。supabase client は mock 注入。当日アプリ(shogi_v4.html)は触らない。
const fs=require('fs'), path=require('path');
const AUTH_JS=fs.readFileSync(path.join(__dirname,'..','app','auth.js'),'utf8');
let pass=0,fail=0;
const ok=m=>{pass++; if(process.env.VERBOSE)console.log('  ✓ '+m);};
const ng=m=>{fail++; console.error('  ✗ '+m);};
const assert=(c,m)=>c?ok(m):ng(m);
function loadAuth(extra){ const win=Object.assign({location:{origin:'https://app.test',pathname:'/app/'}},extra||{}); new Function('window',AUTH_JS)(win); return win.ShogiAuth; }

// upsert+select 対応 mock client。呼び出しを記録、players/tournaments は id を生成して返す。
function makeClient(opts){
  opts=opts||{};
  const calls={members:[],players:[],tournaments:[],entries:[]};
  function R(data,error){ return Promise.resolve({data:(data===undefined?null:data),error:error||null}); }
  function builder(table,op,rows){
    const b={_t:table,_op:op,_rows:rows,_sel:null};
    b.select=function(c){ this._sel=c; return this; };
    b.then=function(res,rej){
      let out;
      if((opts.errorAt||'')===table){ out=R(null,{message:'mock error'}); }
      else if(table==='members'){ calls.members.push(rows); out=R(null); }
      else if(table==='players'){ calls.players.push(rows); out=R(rows.map(r=>({id:'pid_'+r.member_id, member_id:r.member_id}))); }
      else if(table==='tournaments'){ calls.tournaments.push(rows); out=R(rows.map(r=>({id:'tid_'+r.app_tournament_id, app_tournament_id:r.app_tournament_id}))); }
      else if(table==='entries'){ calls.entries.push(rows); out=R(null); }
      else out=R(null);
      return out.then(res,rej);
    };
    return b;
  }
  return { _calls:calls, from(t){ return { upsert:(rows,o)=>builder(t,'upsert',rows), select:()=>builder(t,'select',null), insert:(r)=>builder(t,'insert',r), update:(r)=>builder(t,'update',r) }; } };
}

const A=loadAuth();
const CLUB='cccccccc-0000-0000-0000-000000000001';
function samplePayload(){
  return {
    members:[ {member_id:'m_a',name:'甲 太郎',branch:'沼津市'}, {member_id:'m_b',name:'乙次郎',branch:'三島市'} ],
    tournaments:[ {app_tournament_id:'t_20250413',date:'2025-04-13',season:'2025年度',name:'月例 2025-04'} ],
    entries:[
      {app_tournament_id:'t_20250413',member_id:'m_a','class':'A',wins:3,losses:1,sos:7,sodos:5,final_rank:1},
      {app_tournament_id:'t_20250413',member_id:'m_b','class':'B',wins:1,losses:3,sos:4,sodos:0,final_rank:null}
    ]
  };
}

(async function(){
  // V
  (function(){
    var v=A.validateImportPayload(samplePayload());
    assert(v.ok===true && v.counts.members===2 && v.counts.tournaments===1 && v.counts.entries===2,'V1 正常 payload は ok＋件数');
    assert(A.validateImportPayload(null).ok===false,'V2 null は不正');
    assert(A.validateImportPayload({members:[],tournaments:[]}).ok===false,'V3 entries 欠如で不正');
    var bad={members:[{name:'氏名のみ'}],tournaments:[],entries:[]};
    assert(A.validateImportPayload(bad).ok===false,'V4 member_id 欠如で不正');
  })();

  // R
  (function(){
    var pl=samplePayload();
    var r0=A.resolveImportMembers(pl,[]);
    assert(r0.newMembers.length===2 && r0.matched===0,'R1 既存空＝全員新規');
    assert(r0.idMap['m_a']==='m_a','R2 新規は payload id をそのまま');
    // 既存に「甲太郎」(空白なし)がいる→氏名突き合わせで流用
    var r1=A.resolveImportMembers(pl,[{member_id:'EXIST_A',name:'甲太郎',branch:'沼津市'}]);
    assert(r1.matched===1 && r1.newMembers.length===1,'R3 同名(空白無視)は既存流用＝matched1/new1');
    assert(r1.idMap['m_a']==='EXIST_A','R4 一致会員は既存 member_id に解決（流用）');
    assert(r1.idMap['m_b']==='m_b','R5 不一致は新規');
    // 同名が複数＝曖昧→新規扱い＋警告候補
    var r2=A.resolveImportMembers(pl,[{member_id:'X1',name:'甲太郎'},{member_id:'X2',name:'甲 太郎'}]);
    assert(r2.ambiguous.length===1 && r2.idMap['m_a']==='m_a','R6 同名複数は曖昧＝新規扱い');
  })();

  // P
  (function(){
    var pl=samplePayload();
    var res=A.resolveImportMembers(pl,[]);
    var pv=A.buildImportPreview(pl,res);
    assert(pv.newMembers===2 && pv.matchedMembers===0 && pv.tournaments===1 && pv.entries===2,'P1 プレビュー件数');
    assert(pv.warnings.some(w=>/順位なし/.test(w)),'P2 順位なし(final_rank=null)を警告');
    var res2=A.resolveImportMembers(pl,[{member_id:'X1',name:'甲太郎'},{member_id:'X2',name:'甲 太郎'}]);
    assert(A.buildImportPreview(pl,res2).warnings.some(w=>/同名/.test(w)),'P3 同名曖昧を警告');
  })();

  // I — orchestration
  await (async function(){
    var pl=samplePayload();
    // m_a を既存 EXIST_A に流用、m_b は新規
    var res=A.resolveImportMembers(pl,[{member_id:'EXIST_A',name:'甲太郎'}]);
    var c=makeClient();
    var r=await A.importHistoryToCloud(c,CLUB,pl,res);
    assert(r.ok===true,'I1 取り込み成功');
    // members upsert は新規(m_b)のみ＝既存(EXIST_A=甲)は触らない
    assert(c._calls.members.length===1 && c._calls.members[0].length===1 && c._calls.members[0][0].member_id==='m_b','I2 members は新規のみ upsert（既存は非上書き）');
    // players は resolved 全員（EXIST_A と m_b）
    var pmids=c._calls.players[0].map(x=>x.member_id).sort();
    assert(pmids.length===2 && pmids.indexOf('EXIST_A')>=0 && pmids.indexOf('m_b')>=0,'I3 players は全 resolved member_id');
    // tournaments: source=json_import, status=confirmed
    assert(c._calls.tournaments[0][0].source==='json_import' && c._calls.tournaments[0][0].status==='confirmed','I4 tournaments は source=json_import/status=confirmed');
    // entries: 甲 の player は pid_EXIST_A（流用 id 経由）、tid 解決
    var ea=c._calls.entries[0].find(x=>x.player_id==='pid_EXIST_A');
    assert(!!ea && ea.tournament_id==='tid_t_20250413' && ea.final_rank===1 && ea.sos===7,'I5 entries は idMap 再マップ後の player/tournament を参照');
    assert(r.counts.members_new===1 && r.counts.players===2 && r.counts.tournaments===1 && r.counts.entries===2,'I6 counts 整合');
  })();

  // I — unresolved（entry が members に無い member_id を参照）
  await (async function(){
    var pl=samplePayload();
    pl.entries.push({app_tournament_id:'t_20250413',member_id:'m_ghost','class':'A',wins:0,losses:0,final_rank:null});
    var res=A.resolveImportMembers(pl,[]);  // m_ghost は members に無い→idMap に無い
    var c=makeClient();
    var r=await A.importHistoryToCloud(c,CLUB,pl,res);
    assert(r.ok===true && r.counts.unresolved===1 && r.counts.entries===2,'I7 未解決 member の entry は unresolved にカウントして除外');
  })();

  // I — error 経路
  await (async function(){
    var pl=samplePayload(); var res=A.resolveImportMembers(pl,[]);
    var c=makeClient({errorAt:'entries'});
    var r=await A.importHistoryToCloud(c,CLUB,pl,res);
    assert(r.ok===false && r.step==='entries','I8 entries エラーは ok:false/step=entries');
    var c2=makeClient({errorAt:'tournaments'});
    var r2=await A.importHistoryToCloud(c2,CLUB,pl,res);
    assert(r2.ok===false && r2.step==='tournaments','I9 tournaments エラーは ok:false/step=tournaments');
    var r3=await A.importHistoryToCloud(null,CLUB,pl,res);
    assert(r3.ok===false && r3.step==='init','I10 client 無しは init で弾く');
  })();

  console.log('  B-4 移行取り込み テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail===0?0:1);
})();
