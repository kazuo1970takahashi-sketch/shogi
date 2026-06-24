#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-3a — クラウド members（正本）→ ローカル支部マスタ pull マージ検証。
//   mergeCloudMembersIntoMaster（純関数・throw しない・mock 配列）。ネットワーク・UI 無し（B-3b/c 分離）。
//   方針（#343 設計確定 2026-06-24・クラウド正本／ローカルはオフラインキャッシュ）:
//     member_id をキーに既存の name/yomi をクラウド値で上書き（空クラウド値は上書きしない）／
//     ローカル運用専用フィールド温存／tombstone 反映（復元はしない）／新規追加／同名は誤統合しない。
//   入力は完全架空。当日運営テストへ非干渉（純追加関数）。
const fs=require('fs');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function makeNode(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_attrs:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};
  var doc={getElementById:function(id){if(!el[id]){var n=makeNode('div');n.id=id;el[id]=n;}return el[id];},createElement:function(t){return makeNode(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:makeNode('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
const target=process.argv[2]; if(!target){console.error('usage: node test_stageb_pull_merge.js <html>');process.exit(1);}
function loadEnv(){
  const ctx=makeContext(); const js=extractScripts(target);
  const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { mergeCloudMembersIntoMaster:mergeCloudMembersIntoMaster, normalizeBranchMaster:normalizeBranchMaster, loadBranchMaster:loadBranchMaster, saveBranchMaster:saveBranchMaster };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();

function mkMaster(){
  return { schema_version:1, updated_at:'2026-06-01T00:00:00.000Z', members:[
    { id:'m1', name:'山田太郎', yomi:'やまだ', last_class:'A', last_attended:'2026-05-10', first_attended:'2025-01-01', tournament_ids:['t-x','t-y'], member:'member', grade:'chu', city:'沼津', note:'メモ', deleted:false, deleted_at:null },
    { id:'m2', name:'鈴木花子', yomi:'', last_class:null, last_attended:'2026-04-01', first_attended:'2026-04-01', tournament_ids:['t-y'], member:'other', grade:'josei', deleted:false }
  ]};
}
function byId(master,id){ for(var i=0;i<master.members.length;i++)if(master.members[i].id===id)return master.members[i]; return null; }

console.log('=== A: 新規追加（クラウドに在ってローカルに無い）===');
var mA=mkMaster();
var rA=env.mergeCloudMembersIntoMaster(mA,[{member_id:'m3',name:'佐藤次郎',yomi:'さとう'}]);
ok(rA.added===1&&rA.updated===0&&rA.skipped===0,'A1 added=1/updated=0/skipped=0');
var nA=byId(mA,'m3');
ok(nA&&nA.name==='佐藤次郎'&&nA.yomi==='さとう','A2 新規 member の name/yomi');
ok(nA&&Array.isArray(nA.tournament_ids)&&nA.tournament_ids.length===0,'A3 新規 tournament_ids=[]');

console.log('=== B: 既存の name/yomi をクラウド値で上書き（正本）===');
var mB=mkMaster();
var rB=env.mergeCloudMembersIntoMaster(mB,[{member_id:'m1',name:'山田太郎',yomi:'やまだたろう'},{member_id:'m2',name:'鈴木はなこ',yomi:'すずきはなこ'}]);
ok(rB.updated===2&&rB.added===0,'B1 updated=2/added=0');
ok(byId(mB,'m1').yomi==='やまだたろう','B2 m1 yomi がクラウド値に更新');
ok(byId(mB,'m2').name==='鈴木はなこ'&&byId(mB,'m2').yomi==='すずきはなこ','B3 m2 name/yomi 更新');

console.log('=== C: クラウド値が空なら上書きしない（空上書き禁止）===');
var mC=mkMaster();
var rC=env.mergeCloudMembersIntoMaster(mC,[{member_id:'m1',name:'',yomi:''}]);
ok(byId(mC,'m1').name==='山田太郎'&&byId(mC,'m1').yomi==='やまだ','C1 空クラウド値で既存非空を消さない');
ok(rC.updated===0,'C2 変更なし＝updated=0');

console.log('=== D: ローカル運用専用フィールドは温存 ===');
var mD=mkMaster();
env.mergeCloudMembersIntoMaster(mD,[{member_id:'m1',name:'山田太郎',yomi:'やまだ二郎'}]);
var d1=byId(mD,'m1');
ok(d1.last_class==='A'&&d1.last_attended==='2026-05-10'&&d1.first_attended==='2025-01-01','D1 last_class/出席日 温存');
ok(d1.tournament_ids.length===2&&d1.member==='member'&&d1.grade==='chu'&&d1.city==='沼津'&&d1.note==='メモ','D2 tournament_ids/member/grade/city/note 温存');

console.log('=== E: tombstone（deleted=true 反映・false で復元しない）===');
var mE=mkMaster();
var rE=env.mergeCloudMembersIntoMaster(mE,[{member_id:'m1',name:'山田太郎',yomi:'やまだ',deleted:true,deleted_at:'2026-06-20T00:00:00.000Z'}]);
ok(byId(mE,'m1').deleted===true&&byId(mE,'m1').deleted_at==='2026-06-20T00:00:00.000Z','E1 cloud deleted=true をローカルへ反映');
// 既に deleted=true のものを cloud deleted=false で復元しない
var mE2={schema_version:1,updated_at:'2026-06-01T00:00:00.000Z',members:[{id:'mz',name:'削除済',yomi:'',deleted:true,deleted_at:'2026-05-01T00:00:00.000Z',tournament_ids:[]}]};
env.mergeCloudMembersIntoMaster(mE2,[{member_id:'mz',name:'削除済',yomi:'',deleted:false}]);
ok(byId(mE2,'mz').deleted===true,'E2 cloud deleted=false でローカル deleted=true を復元しない');

// B-3b-tombstone: 実クラウド members は deleted boolean を持たず deleted_at のみ（app/ B-5 が書く）。
//   deleted_at 非 null だけで tombstone を反映できること（deleted フィールドは存在しない）。
var mE3=mkMaster();
env.mergeCloudMembersIntoMaster(mE3,[{member_id:'m1',name:'山田太郎',yomi:'やまだ',branch:'沼津',deleted_at:'2026-06-24T00:00:00.000Z'}]);
ok(byId(mE3,'m1').deleted===true&&byId(mE3,'m1').deleted_at==='2026-06-24T00:00:00.000Z','E3 deleted_at のみ（deleted 欠落）で既存会員を tombstone 反映');
// deleted_at が null（クラウドで有効）ならローカルを削除しない・既存 deleted も復元しない
var mE4=mkMaster();
env.mergeCloudMembersIntoMaster(mE4,[{member_id:'m1',name:'山田太郎',yomi:'やまだ',deleted_at:null}]);
ok(byId(mE4,'m1').deleted!==true,'E4 deleted_at=null（クラウドで有効）はローカルを tombstone しない');
var mE5={schema_version:1,updated_at:'2026-06-01T00:00:00.000Z',members:[{id:'mz',name:'削除済',yomi:'',deleted:true,deleted_at:'2026-05-01T00:00:00.000Z',tournament_ids:[]}]};
env.mergeCloudMembersIntoMaster(mE5,[{member_id:'mz',name:'削除済',yomi:'',deleted_at:null}]);
ok(byId(mE5,'mz').deleted===true,'E5 deleted_at=null でローカル deleted=true を復元しない（非復元・実クラウド形）');
// 新規会員が deleted_at 付きで来たら deleted=true で追加
var mE6=mkMaster();
env.mergeCloudMembersIntoMaster(mE6,[{member_id:'mNew',name:'新削除',yomi:'しん',deleted_at:'2026-06-24T00:00:00.000Z'}]);
ok(byId(mE6,'mNew')&&byId(mE6,'mNew').deleted===true&&byId(mE6,'mNew').deleted_at==='2026-06-24T00:00:00.000Z','E6 deleted_at 付き新規は deleted=true で追加');

console.log('=== F: skipped（member_id 無し／新規で氏名無し）===');
var mF=mkMaster();
var rF=env.mergeCloudMembersIntoMaster(mF,[{name:'IDなし',yomi:'x'},{member_id:'',name:'空ID'},{member_id:'m9',name:''},null,'str']);
ok(rF.skipped===5&&rF.added===0&&rF.updated===0,'F1 不正行は全 skipped（5件）');
ok(byId(mF,'m9')===null,'F2 氏名無しの新規は追加されない');

console.log('=== G: 空配列は no-op ===');
var mG=mkMaster();
var rG=env.mergeCloudMembersIntoMaster(mG,[]);
ok(rG.added===0&&rG.updated===0&&rG.skipped===0&&mG.members.length===2,'G1 空配列で無変化');

console.log('=== H: 不正入力でも throw しない ===');
var threw=false;
try{
  var rH1=env.mergeCloudMembersIntoMaster(null,[{member_id:'m1',name:'x'}]);
  var rH2=env.mergeCloudMembersIntoMaster({members:'bad'},[{member_id:'m1',name:'x'}]);
  var rH3=env.mergeCloudMembersIntoMaster(mkMaster(),null);
  ok(rH1.added===0&&rH2.added===0&&rH3.added===0,'H1 不正 master/cloud は no-op を返す');
}catch(e){threw=true;}
ok(!threw,'H2 throw しない');

console.log('=== I: 冪等（2回目は無変化）===');
var mI=mkMaster();
var cloudI=[{member_id:'m1',name:'山田太郎',yomi:'やまだ改'},{member_id:'m3',name:'新人',yomi:'しんじん'}];
var rI1=env.mergeCloudMembersIntoMaster(mI,cloudI);
var rI2=env.mergeCloudMembersIntoMaster(mI,cloudI);
ok(rI1.added===1&&rI1.updated===1,'I1 1回目 added=1/updated=1');
ok(rI2.added===0&&rI2.updated===0,'I2 2回目は added=0/updated=0（冪等）');

console.log('=== J: member_id キー（同名でも誤統合しない）===');
var mJ=mkMaster();
// クラウド member_id=m9（ローカルに無い）だが氏名はローカル m1 と同名
var rJ=env.mergeCloudMembersIntoMaster(mJ,[{member_id:'m9',name:'山田太郎',yomi:'べつじん'}]);
ok(rJ.added===1,'J1 同名でも別 member_id は新規追加（既存 m1 に統合しない）');
ok(byId(mJ,'m1').yomi==='やまだ'&&byId(mJ,'m9').yomi==='べつじん','J2 m1 は不変・m9 は別レコード');

console.log('=== K: 追加→保存→正規化ラウンドトリップで生存 ===');
var mK=mkMaster();
env.mergeCloudMembersIntoMaster(mK,[{member_id:'m3',name:'保存太郎',yomi:'ほぞん',deleted:false}]);
env.saveBranchMaster(mK);
var reloaded=env.loadBranchMaster();
var k3=byId(reloaded,'m3');
ok(k3&&k3.name==='保存太郎'&&k3.yomi==='ほぞん','K1 新規 member が normalize 後も name/yomi 生存');
ok(k3&&Array.isArray(k3.tournament_ids)&&typeof k3.member==='string','K2 normalize で運用フィールド補完');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
