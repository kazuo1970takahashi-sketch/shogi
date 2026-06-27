#!/usr/bin/env node
// 通年集計 拡張（クラス別フィルタ／記録・殿堂／月別チャンピオン／市町村対抗）単体テスト。
//   read-only・mock・架空データ。shogi_v4.html 非接触。
const fs=require('fs'), path=require('path');
const AUTH_JS=fs.readFileSync(path.join(__dirname,'..','app','auth.js'),'utf8');
let pass=0,fail=0;
const ok=m=>{pass++; if(process.env.VERBOSE)console.log('  ✓ '+m);};
const ng=m=>{fail++; console.error('  ✗ '+m);};
const assert=(c,m)=>c?ok(m):ng(m);
function makeNode(){return {nodeType:1,id:'',innerHTML:'',value:'',textContent:'',_attrs:{},_listeners:{},setAttribute(k,v){this._attrs[k]=String(v);},getAttribute(k){return (k in this._attrs)?this._attrs[k]:null;},addEventListener(ev,cb){(this._listeners[ev]=this._listeners[ev]||[]).push(cb);},removeEventListener(){},querySelectorAll(){return[];}};}
function makeDoc(){const els={};return{_els:els,getElementById(id){if(!els[id]){const n=makeNode();n.id=id;els[id]=n;}return els[id];},querySelectorAll(){return[];},addEventListener(){},removeEventListener(){}};}
function loadAuth(){const win={location:{origin:'x',pathname:'/'}};new Function('window',AUTH_JS)(win);return win.ShogiAuth;}
function makeClient(opts){opts=opts||{};const calls={select:[]};
  function R(d,e){return Promise.resolve({data:d===undefined?null:d,error:e||null});}
  function b(t,cols){const o={_sel:cols};if(cols!==undefined)calls.select.push({table:t,cols:cols});o.select=function(c){if(c!==undefined)calls.select.push({table:t,cols:c});return this;};o.eq=function(){return this;};
    o.then=function(res,rej){let data=(opts.byTable&&opts.byTable[t]!==undefined)?opts.byTable[t]:(opts.rows!==undefined?opts.rows:[]);let out=opts.error?R(null,{message:'e'}):R(data);return out.then(res,rej);};return o;}
  return {_calls:calls,from(t){return{select:(c)=>b(t,c),upsert:()=>b(t),insert:()=>b(t),update:()=>b(t)};}};}

const A=loadAuth();
// raw entry (embedding) helper
function e(season,date,cls,mid,name,branch,w,l,rank){return {wins:w,losses:l,final_rank:rank,'class':cls,players:{member_id:mid,members:{name:name,branch:branch}},tournaments:{season:season,date:date}};}
function seasonClient(objs){
  var ents=[],pmap={},tmap={};
  objs.forEach(function(r){
    var mid=r.players.member_id,nm=r.players.members.name,br=(r.players.members.branch||'');
    var season=r.tournaments.season,date=r.tournaments.date;
    var pid='P_'+mid,tid='T_'+season+'|'+date;
    ents.push({wins:r.wins,losses:r.losses,final_rank:r.final_rank,'class':r['class'],player_id:pid,tournament_id:tid});
    pmap[pid]={id:pid,member_id:mid,members:{name:nm,branch:br}};
    tmap[tid]={id:tid,season:season,date:date};
  });
  return makeClient({byTable:{entries:ents,players:Object.keys(pmap).map(function(k){return pmap[k];}),tournaments:Object.keys(tmap).map(function(k){return tmap[k];})}});
}
function shaped(){return [
  e('2025年度','2025-04-13','A','m1','甲','沼津市',4,0,1),
  e('2025年度','2025-04-13','B','m2','乙','三島市',1,3,null),
  e('2025年度','2025-05-11','A','m1','甲','沼津市',3,1,2),
  e('2025年度','2025-05-11','A','m3','丙','沼津市',4,0,1),
  e('2025年度','2025-06-08','B','m2','乙','三島市',4,0,1),
  e('2024年度','2025-01-12','A','m1','甲','沼津市',2,2,3)
].map(A.shapeStandingRow);}

(async function(){
  // shape 拡張
  (function(){
    var r=A.shapeStandingRow(e('2025年度','2025-04-13','A','m1','甲','沼津市',4,0,1));
    assert(r.cls==='A'&&r.branch==='沼津市'&&r.date==='2025-04-13','X1 shape に class/branch/date');
  })();
  // listClasses
  (function(){
    var cs=A.listClasses(shaped(),'2025年度');
    assert(cs.length===2&&cs[0]==='A'&&cs[1]==='B','X2 年度内クラス一覧（A,B）');
    assert(A.listClasses(shaped(),'2024年度').join(',')==='A','X3 2024年度は A のみ');
  })();
  // aggregateStandings class フィルタ
  (function(){
    var all=A.aggregateStandings(shaped(),'2025年度','');
    var aOnly=A.aggregateStandings(shaped(),'2025年度','A');
    var bOnly=A.aggregateStandings(shaped(),'2025年度','B');
    assert(all.length===3,'X4 全クラスで3名');
    assert(aOnly.length===2 && aOnly.every(x=>x.member_id!=='m2'),'X5 Aクラスのみ（乙=B 除外）');
    assert(bOnly.length===1 && bOnly[0].member_id==='m2','X6 Bクラスのみ（乙）');
  })();
  // aggregateRecords（通算・全勝・連続出場）
  (function(){
    var rec=A.aggregateRecords(shaped());
    var ko=rec.find(x=>x.member_id==='m1');
    assert(ko.games===3 && ko.wins===9 && ko.championships===1 && ko.perfect===1,'X7 甲: 出場3/勝9/優勝1/全勝1');
    // 甲は 2025-01-12,2025-04-13,2025-05-11 に出場（distinct date 6件中 index 0,1,2 連続）→ maxStreak=3
    assert(ko.maxStreak===3,'X8 甲: 最長連続出場3');
    var otsu=rec.find(x=>x.member_id==='m2');
    assert(otsu.perfect===1 && otsu.championships===1,'X9 乙: 全勝1(4-0)/優勝1');
  })();
  // monthly champions
  (function(){
    var mc=A.aggregateMonthlyChampions(shaped());
    // 優勝(rank=1): 2025-04-13 A 甲, 2025-05-11 A 丙, 2025-06-08 B 乙, 2024 2025-01-12 は rank3 で無し
    assert(mc.length===3,'X10 優勝レコード3件');
    assert(mc[0].date==='2025-06-08'&&mc[0].name==='乙','X11 日付降順（最新が先頭）');
  })();
  // by city
  (function(){
    var cy=A.aggregateByCity(shaped());
    var numa=cy.find(x=>x.branch==='沼津市');
    assert(numa.members===2 && numa.games===4,'X12 沼津市: 2名・延べ4');
    var mishima=cy.find(x=>x.branch==='三島市');
    assert(mishima.members===1 && mishima.wins===5,'X13 三島市: 1名・通算5勝(乙1+4)');
  })();
  // build
  (function(){
    assert(A.buildClassSelectorHtml(['A','B'],'A').indexOf('value="A" selected')>=0,'X14 クラスセレクタ selected');
    assert(A.buildClassSelectorHtml(['A','B'],'').indexOf('全クラス')>=0,'X15 全クラス option');
    var rh=A.buildRecordsHtml([{name:'<b>甲</b>',games:3,wins:9,losses:1,championships:1,perfect:1,maxStreak:3}]);
    assert(rh.indexOf('&lt;b&gt;')>=0 && rh.indexOf('<b>甲</b>')<0,'X16 殿堂は esc');
    assert(rh.indexOf('通算勝数')>=0 && rh.indexOf('最長連続出場')>=0,'X17 殿堂に各ランキング見出し');
    var mh=A.buildMonthlyChampionsHtml([{date:'2025-06-08',cls:'B',name:'乙'}]);
    assert(mh.indexOf('2025-06-08')>=0 && mh.indexOf('優勝')>=0,'X18 月別年表');
    var ch=A.buildCityStandingsHtml([{branch:'沼津市',members:2,games:4,wins:7}]);
    assert(ch.indexOf('沼津市')>=0 && ch.indexOf('市町村')>=0,'X19 市町村対抗');
  })();
  // controller
  await (async function(){
    const doc=makeDoc(); const client=seasonClient([
      e('2025年度','2025-04-13','A','m1','甲','沼津市',4,0,1),
      e('2025年度','2025-04-13','B','m2','乙','三島市',1,3,null)
    ]);
    const ctrl=A.makeController({client,document:doc});
    ctrl.showApp({isRegistered:true,isActive:true,isAdmin:false,role:'organizer',clubId:'c1',clubName:'沼津',displayName:'幹'},[]);
    await new Promise(r=>setTimeout(r,0));
    assert(A.buildAppViewHtml({isAdmin:false,role:'organizer'},[]).indexOf('id="cloudRecordsView"')>=0,'X20 app に記録殿堂カード');
    assert(A.buildAppViewHtml({isAdmin:false,role:'organizer'},[]).indexOf('id="cloudMonthlyView"')>=0 && A.buildAppViewHtml({isAdmin:false},[]).indexOf('id="cloudCityView"')>=0,'X21 月別/市町村カード');
    var cs=doc.getElementById('classSelect');
    assert(cs && (cs._listeners.change||[]).length===1,'X22 クラスセレクタ結線');
    assert(doc.getElementById('cloudRecords').innerHTML.indexOf('通算勝数')>=0,'X23 殿堂が描画される');
    assert(doc.getElementById('cloudMonthly').innerHTML.indexOf('優勝')>=0,'X24 月別が描画される');
    assert(doc.getElementById('cloudCity').innerHTML.indexOf('市町村')>=0,'X25 市町村が描画される');
  })();
  console.log('  通年集計拡張 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail===0?0:1);
})();
