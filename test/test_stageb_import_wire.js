#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / B-4-wire — 取り込み UI（app/）単体テスト。
//   観点: build パネル / プレビュー HTML(esc) / prepareImportFromText(JSON→検証→突き合わせ→preview) /
//   コントローラ結線(admin に取り込みパネル・preview/run ボタン bind)。client/FileReader は mock。
const fs=require('fs'), path=require('path');
const AUTH_JS=fs.readFileSync(path.join(__dirname,'..','app','auth.js'),'utf8');
let pass=0,fail=0;
const ok=m=>{pass++; if(process.env.VERBOSE)console.log('  ✓ '+m);};
const ng=m=>{fail++; console.error('  ✗ '+m);};
const assert=(c,m)=>c?ok(m):ng(m);
function makeNode(){ return { nodeType:1,id:'',innerHTML:'',value:'',textContent:'',disabled:false,files:null,_attrs:{},_listeners:{},
  setAttribute(k,v){this._attrs[k]=String(v);}, getAttribute(k){return (k in this._attrs)?this._attrs[k]:null;},
  addEventListener(ev,cb){(this._listeners[ev]=this._listeners[ev]||[]).push(cb);}, removeEventListener(){}, querySelectorAll(){return[];} }; }
function makeDoc(){ const els={}; return { _els:els, getElementById(id){ if(!els[id]){const n=makeNode();n.id=id;els[id]=n;} return els[id]; }, querySelectorAll(){return[];}, addEventListener(){}, removeEventListener(){} }; }
function loadAuth(extra){ const win=Object.assign({location:{origin:'https://app.test',pathname:'/app/'}},extra||{}); new Function('window',AUTH_JS)(win); return win.ShogiAuth; }
function makeClient(opts){ opts=opts||{}; function R(d,e){return Promise.resolve({data:d===undefined?null:d,error:e||null});}
  function b(t,op){ const o={_sel:null}; o.select=function(c){this._sel=c;return this;}; o.eq=function(){return this;};
    o.then=function(res,rej){ let out; if(t==='members'&&op==='select') out=R(opts.existing!==undefined?opts.existing:[]); else out=R(null); return out.then(res,rej);}; return o; }
  return { from(t){ return { select:(c)=>b(t,'select'), upsert:()=>b(t,'upsert'), insert:()=>b(t,'insert'), update:()=>b(t,'update') }; } }; }

const A=loadAuth();
const payloadText=JSON.stringify({
  members:[{member_id:'m_a',name:'甲太郎',branch:'沼津市'}],
  tournaments:[{app_tournament_id:'t_20250413',date:'2025-04-13',season:'2025年度',name:'月例 2025-04'}],
  entries:[{app_tournament_id:'t_20250413',member_id:'m_a','class':'A',wins:3,losses:1,sos:7,sodos:5,final_rank:1}]
});

(async function(){
  // build
  (function(){
    var h=A.buildImportPanelHtml();
    assert(h.indexOf('id="importFile"')>=0 && h.indexOf('type="file"')>=0,'W1 ファイル入力がある');
    assert(h.indexOf('id="importPreviewBtn"')>=0 && h.indexOf('id="importRunBtn"')>=0,'W2 プレビュー/取り込みボタンがある');
    assert(/id="importRunBtn"[^>]*disabled/.test(h),'W3 取り込みボタンは初期 disabled');
    assert(h.indexOf('既存会員は上書きしません')>=0,'W4 既存非上書きの注記');
  })();
  // preview HTML
  (function(){
    var html=A.buildImportPreviewHtml({newMembers:96,matchedMembers:0,tournaments:22,entries:359,warnings:['<b>x</b>注意']});
    assert(html.indexOf('新規会員 96 名')>=0 && html.indexOf('大会 22 件')>=0 && html.indexOf('成績 359 件')>=0,'W5 件数を表示');
    assert(html.indexOf('<b>x</b>')<0 && html.indexOf('&lt;b&gt;')>=0,'W6 警告は esc（XSS安全）');
  })();
  // prepareImportFromText
  (function(){
    var r=A.prepareImportFromText(payloadText,[]);
    assert(r.ok===true && r.preview.newMembers===1 && r.preview.entries===1,'W7 正常テキスト→ok＋preview');
    assert(A.prepareImportFromText('{壊れたJSON',[]).ok===false,'W8 不正JSONはok:false');
    assert(A.prepareImportFromText(JSON.stringify({members:[]}),[]).ok===false,'W9 不正payloadはok:false');
    // 既存に甲太郎→流用
    var r2=A.prepareImportFromText(payloadText,[{member_id:'EXIST',name:'甲太郎'}]);
    assert(r2.preview.matchedMembers===1 && r2.preview.newMembers===0,'W10 既存一致で matched=1');
  })();
  // controller: admin に取り込みパネル＋結線
  await (async function(){
    const doc=makeDoc(); const client=makeClient({existing:[]});
    const ctrl=A.makeController({client,document:doc});
    ctrl.showApp({isRegistered:true,isActive:true,isAdmin:true,role:'owner',clubId:'club1',clubName:'沼津',displayName:'管理'},[]);
    await new Promise(r=>setTimeout(r,0));
    const pv=doc.getElementById('importPreviewBtn'); const run=doc.getElementById('importRunBtn');
    assert(pv && (pv._listeners.click||[]).length===1,'W11 プレビューボタンが結線される（admin）');
    assert(run && (run._listeners.click||[]).length===1,'W12 取り込みボタンが結線される');
    // admin ビューに importPanel が出る
    assert(A.buildAppViewHtml({isAdmin:true,role:'owner'},[]).indexOf('id="importPanel"')>=0,'W13 admin ビューに取り込みパネル');
    assert(A.buildAppViewHtml({isAdmin:false,role:'organizer'},[]).indexOf('id="importPanel"')<0,'W14 非admin には出さない');
  })();
  console.log('  B-4-wire 取り込みUI テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail===0?0:1);
})();
