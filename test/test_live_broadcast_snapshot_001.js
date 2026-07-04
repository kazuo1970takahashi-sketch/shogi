#!/usr/bin/env node
// LIVE-BROADCAST-001 Phase 1: buildPublicLiveSnapshot 純関数テスト。
//   設計 = docs/specs/20260704_live_broadcast_001_participant_realtime_design.md（受入 §8-10 / §8-16）。
//   検証:
//     - 出力に slug/version/updated_at を含めない（envelope の責務）
//     - players はホワイトリスト（id/name/yomi/entry_no のみ・member/grade を含まない）
//     - match は {p1,p2,winner}（lastModifiedBy を含まない）
//     - state.rounds と classes[].rounds を含む（非4回戦・クラス別回戦数）
//     - 純粋（src 非改変・冪等）
//     - 出力が state 形＝normalizeState→roundsForClass / buildScoreboardClassTableHtml で描ける
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},remove(){},insertBefore(){},removeChild(){}};}
function makeEnv(){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},isSecureContext:true};
  const nav={onLine:true,clipboard:{writeText:function(){return Promise.resolve();}}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {buildPublicLiveSnapshot:buildPublicLiveSnapshot,normalizeState:normalizeState,roundsForClass:roundsForClass,buildScoreboardClassTableHtml:buildScoreboardClassTableHtml,_set:function(v){state=v;},_get:function(){return state;}};');
  return fn(doc,win,ls,{randomUUID:()=>'0'},function(){},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,nav);
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
function has(o,k){return Object.prototype.hasOwnProperty.call(o,k);}

// 架空 fixture（非4回戦: 全体3回戦・A級はクラス別上書きで5回戦）。member/grade/lastModifiedBy を混入させる。
function makeSrc(){
  return {
    rounds:3,
    report:{title:'沼津支部月例将棋大会'},
    classes:[
      {id:'A',name:'A級',started:true,rounds:5},
      {id:'B',name:'B級',started:true}
    ],
    players:{
      A:[
        {id:'p1',name:'山田太郎',yomi:'やまだたろう',entry_no:1,member:'m-123',grade:'3級'},
        {id:'p2',name:'佐藤一郎',entry_no:2,member:'m-124'}
      ],
      B:[
        {id:'p3',name:'鈴木五郎',entry_no:1,member:'m-200'}
      ]
    },
    results:{
      A:[[{p1:'p1',p2:'p2',winner:'p1',lastModifiedBy:'manual'}]],
      B:[]
    },
    pairings:{
      A:[{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}],
      B:[]
    }
  };
}

const E=makeEnv();

console.log('=== buildPublicLiveSnapshot 出力形 ===');
const src=makeSrc();
const snap=E.buildPublicLiveSnapshot(src);
ok(snap&&snap.schema_version===1,'S1 schema_version=1');
ok(!has(snap,'slug'),'S2 slug を含まない（envelope の責務）');
ok(!has(snap,'version'),'S3 version を含まない');
ok(!has(snap,'updated_at'),'S4 updated_at を含まない');
ok(snap.state&&typeof snap.state==='object','S5 state 部分集合を持つ');

console.log('=== 回戦数（P1-1: 非4回戦・クラス別上書き） ===');
ok(snap.state.rounds===3,'R1 state.rounds=3（4フォールバックしない）');
const cA=snap.state.classes.filter(c=>c.id==='A')[0];
const cB=snap.state.classes.filter(c=>c.id==='B')[0];
ok(cA&&cA.rounds===5,'R2 A級 classes[].rounds=5（上書き保持）');
ok(cB&&!has(cB,'rounds'),'R3 B級は rounds 上書き無し（全体既定に従う）');

console.log('=== players ホワイトリスト（member/grade を出さない） ===');
const a0=snap.state.players.A[0];
ok(a0.id==='p1'&&a0.name==='山田太郎'&&a0.yomi==='やまだたろう'&&a0.entry_no===1,'P1 id/name/yomi/entry_no を保持');
ok(!has(a0,'member'),'P2 member を含まない');
ok(!has(a0,'grade'),'P3 grade を含まない');
const a1=snap.state.players.A[1];
ok(a1.id==='p2'&&!has(a1,'yomi'),'P4 yomi 未設定は落とす');
ok(!has(a1,'member'),'P5 member を含まない(2)');

console.log('=== match は {p1,p2,winner}（lastModifiedBy を出さない） ===');
const rm=snap.state.results.A[0][0];
ok(rm.p1==='p1'&&rm.p2==='p2'&&rm.winner==='p1','M1 results の match は p1/p2/winner');
ok(!has(rm,'lastModifiedBy'),'M2 results の match に lastModifiedBy を含まない');
const pm=snap.state.pairings.A[0];
ok(pm.p1==='p1'&&pm.p2==='p2'&&pm.winner===null,'M3 pairings の match は p1/p2/winner（winner=null）');
ok(!has(pm,'lastModifiedBy'),'M4 pairings の match に lastModifiedBy を含まない');

console.log('=== meta ===');
ok(snap.meta&&snap.meta.title==='沼津支部月例将棋大会','T1 meta.title を正規化して保持');
ok(snap.meta.status==='in_progress','T2 meta.status=in_progress（未終了）');

console.log('=== 純粋（src 非改変・冪等） ===');
ok(has(src.players.A[0],'member')&&src.players.A[0].member==='m-123','U1 src を改変しない（member 残存）');
ok(has(src.results.A[0][0],'lastModifiedBy'),'U2 src の match を改変しない');
const snap2=E.buildPublicLiveSnapshot(makeSrc());
ok(JSON.stringify(snap)===JSON.stringify(snap2),'U3 冪等（同一入力→同一出力）');

console.log('=== 出力が state 形＝レンダラが描ける ===');
let rendered='';let threw=false;
try{
  E._set(E.normalizeState(snap.state));
  ok(E.roundsForClass('A')===5,'V1 normalizeState 後 roundsForClass(A)=5');
  ok(E.roundsForClass('B')===3,'V2 normalizeState 後 roundsForClass(B)=3（全体既定）');
  rendered=E.buildScoreboardClassTableHtml('A');
}catch(e){threw=true;console.log('  (render error) '+e.message);}
ok(!threw,'V3 normalizeState→buildScoreboardClassTableHtml が例外を投げない');
ok(typeof rendered==='string'&&rendered.indexOf('山田太郎')>=0,'V4 星取表HTMLに氏名が描画される');

console.log('  PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
