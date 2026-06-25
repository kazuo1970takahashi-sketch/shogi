#!/usr/bin/env node
// 通年集計（シーズン別成績・#343/B-4活用）単体テスト。
//   S shape / L listSeasons / G aggregate（集約・優勝・ソート・勝率・年度フィルタ）/ B build / F fetch / C 配線。
//   read-only・mock client・架空データのみ・shogi_v4.html 非接触。
const fs=require('fs'), path=require('path');
const AUTH_JS=fs.readFileSync(path.join(__dirname,'..','app','auth.js'),'utf8');
let pass=0,fail=0;
const ok=m=>{pass++; if(process.env.VERBOSE)console.log('  ✓ '+m);};
const ng=m=>{fail++; console.error('  ✗ '+m);};
const assert=(c,m)=>c?ok(m):ng(m);
function makeNode(){ return {nodeType:1,id:'',innerHTML:'',value:'',textContent:'',_attrs:{},_listeners:{},
  setAttribute(k,v){this._attrs[k]=String(v);},getAttribute(k){return (k in this._attrs)?this._attrs[k]:null;},
  addEventListener(ev,cb){(this._listeners[ev]=this._listeners[ev]||[]).push(cb);},removeEventListener(){},querySelectorAll(){return[];}};}
function makeDoc(){const els={};return{_els:els,getElementById(id){if(!els[id]){const n=makeNode();n.id=id;els[id]=n;}return els[id];},querySelectorAll(){return[];},addEventListener(){},removeEventListener(){}};}
function loadAuth(extra){const win=Object.assign({location:{origin:'https://app.test',pathname:'/app/'}},extra||{});new Function('window',AUTH_JS)(win);return win.ShogiAuth;}
function makeClient(opts){opts=opts||{};const calls={select:[]};
  function R(d,e){return Promise.resolve({data:d===undefined?null:d,error:e||null});}
  function b(t,cols){const o={_sel:cols};if(cols!==undefined)calls.select.push({table:t,cols:cols});o.select=function(c){this._sel=c;if(c!==undefined)calls.select.push({table:t,cols:c});return this;};o.eq=function(){return this;};
    o.then=function(res,rej){let out=opts.error?R(null,{message:'err'}):R(opts.rows!==undefined?opts.rows:[]);return out.then(res,rej);};return o;}
  return {_calls:calls, from(t){return {select:(c)=>b(t,c),upsert:()=>b(t),insert:()=>b(t),update:()=>b(t)};}};}

const A=loadAuth();
function row(season,mid,name,w,l,rank){return {wins:w,losses:l,final_rank:rank,class:'A',players:{member_id:mid,members:{name:name}},tournaments:{season:season,date:season+'-x'}};}

(async function(){
  // S
  (function(){
    var s=A.shapeStandingRow(row('2025年度','m1','甲',3,1,2));
    assert(s.season==='2025年度'&&s.member_id==='m1'&&s.name==='甲'&&s.wins===3&&s.losses===1&&s.rank===2,'S1 平坦化');
    var s2=A.shapeStandingRow({wins:null,losses:null,final_rank:null,players:null,tournaments:null});
    assert(s2.wins===0&&s2.losses===0&&s2.rank===null&&s2.name==='','S2 欠損は 0/空/null');
  })();
  // L
  (function(){
    var rows=[{season:'2024年度'},{season:'2025年度'},{season:'2024年度'},{season:''}];
    var ls=A.listSeasons(rows);
    assert(ls.length===2&&ls[0]==='2025年度'&&ls[1]==='2024年度','L1 重複除去＋降順（空は除外）');
  })();
  // G
  (function(){
    var rows=[
      A.shapeStandingRow(row('2025年度','m1','甲',4,0,1)),
      A.shapeStandingRow(row('2025年度','m1','甲',2,2,3)),
      A.shapeStandingRow(row('2025年度','m2','乙',3,1,1)),
      A.shapeStandingRow(row('2024年度','m1','甲',1,3,5)) // 別年度＝除外
    ];
    var g=A.aggregateStandings(rows,'2025年度');
    assert(g.length===2,'G1 年度フィルタ＋member集約（2名）');
    var ko=g.find(x=>x.member_id==='m1');
    assert(ko.games===2&&ko.wins===6&&ko.losses===2&&ko.championships===1,'G2 甲: 出場2/勝6/負2/優勝1');
    assert(ko.winRate===75,'G3 勝率=6/8=75%');
    // ソート: 甲(勝6) が 乙(勝3) より上
    assert(g[0].member_id==='m1','G4 勝数降順ソート');
    // 優勝回数のタイブレーク
    var rows2=[A.shapeStandingRow(row('2025年度','a','A',3,1,1)),A.shapeStandingRow(row('2025年度','b','B',3,1,2))];
    var g2=A.aggregateStandings(rows2,'2025年度');
    assert(g2[0].member_id==='a','G5 勝数同なら優勝回数で上位');
  })();
  // B
  (function(){
    var sel=A.buildSeasonSelectorHtml(['2025年度','2024年度'],'2024年度');
    assert(sel.indexOf('id="seasonSelect"')>=0 && sel.indexOf('value="2024年度" selected')>=0,'B1 セレクタ＋selected');
    assert(A.buildSeasonSelectorHtml([],null)==='','B2 年度0件は空');
    var st=A.buildSeasonStandingsHtml('2025年度',[{name:'<b>甲</b>',games:2,wins:6,losses:2,championships:1,winRate:75}]);
    assert(st.indexOf('<b>甲</b>')<0 && st.indexOf('&lt;b&gt;')>=0,'B3 氏名 esc（XSS安全）');
    assert(st.indexOf('優勝')>=0 && st.indexOf('勝率')>=0,'B4 見出しに優勝/勝率');
    assert(A.buildSeasonStandingsHtml('x',[]).indexOf('成績がありません')>=0,'B5 空の案内');
  })();
  // F
  await (async function(){
    var c=makeClient({rows:[row('2025年度','m1','甲',3,1,1)]});
    var r=await A.fetchSeasonEntries(c,'club1');
    assert(r.ok===true && r.rows.length===1,'F1 ok 経路');
    assert(c._calls.select[0].cols.indexOf('season')>=0 && c._calls.select[0].cols.indexOf('members(name)')>=0,'F2 select に season と members(name) を含む');
    var c2=makeClient({error:true});
    var r2=await A.fetchSeasonEntries(c2,'club1');
    assert(r2.ok===false && r2.rows.length===0,'F3 error 経路');
  })();
  // C 配線
  await (async function(){
    const doc=makeDoc();
    const client=makeClient({rows:[row('2025年度','m1','甲',4,0,1),row('2024年度','m1','甲',2,2,2)]});
    const ctrl=A.makeController({client,document:doc});
    ctrl.showApp({isRegistered:true,isActive:true,isAdmin:false,role:'organizer',clubId:'club1',clubName:'沼津',displayName:'幹事'},[]);
    await new Promise(r=>setTimeout(r,0));
    assert(A.buildAppViewHtml({isAdmin:false,role:'organizer'},[]).indexOf('id="cloudStandingsView"')>=0,'C1 app ビューに通年集計カード');
    var el=doc.getElementById('cloudStandings');
    assert(el.innerHTML.indexOf('甲')>=0,'C2 取得→集計→描画（最新年度 2025年度 が既定表示・甲が出る）');
    var sel=doc.getElementById('seasonSelect');
    assert(sel && (sel._listeners.change||[]).length===1,'C3 年度セレクタに change ハンドラ結線');
  })();
  console.log('  通年集計 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail===0?0:1);
})();
