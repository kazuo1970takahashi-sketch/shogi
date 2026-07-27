#!/usr/bin/env node
// NOTIFY-N2-SAVE-001 (STYLE-GUIDE §3 N2 / 監査 Step4 第1スライス): 保存・読込・バックアップ系の
//   「成功通知」5箇所を blocking alert → showToast へ移行（作者承認済 2026-07-02）。
//   対象: ①saveData（📋 参加者を名簿に反映）②loadData ファイル読込成功 ③loadFromPaste 貼り付け読込成功
//         ④exportTournamentBackup 保存成功 ⑤importTournamentBackupFromText 復元成功
//   失敗・警告系 alert と復元前 confirm は全維持（STYLE-GUIDE §3 の例外＝必ず認知すべき事象）。
//   検証:
//     S: ソース＝5箇所の成功 alert が存在しない・対応する showToast が存在する・失敗系 alert は維持。
//     F: 機能＝exportTournamentBackup / importTournamentBackupFromText（serialize round-trip）/ saveData を
//        mock 環境で実行し、toast 内容・戻り値・保存状態バー記録（SAVE_STATUS_KEY）・alert 不使用を確認。
//   fixture は完全架空のみ。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,href:'',download:'',style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},click(){},remove(){},insertBefore(){},removeChild(){}};}
function makeEnv(){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},isSecureContext:true};
  const alerts=[];
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator','Blob','URL','FileReader',
    scripts()+';return {saveData:saveData,exportTournamentBackup:exportTournamentBackup,importTournamentBackupFromText:importTournamentBackupFromText,serializeTournamentBackup:serializeTournamentBackup,loadSaveStatus:loadSaveStatus,SAVE_STATUS_KEY:SAVE_STATUS_KEY,__setAppModalTestResolver:__setAppModalTestResolver,_get:function(){return state;}};');
  const env=fn(doc,win,ls,{randomUUID:()=>'00000000-0000-0000-0000-000000000000'},function(m){alerts.push(String(m));},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,
    {onLine:true},function(){},{createObjectURL:()=>'blob:mock',revokeObjectURL(){}},function(){return null;});
  // IN-APP-MODAL-001 Phase 1b: 復元 confirm はアプリ内モーダル化済。同期解決シームで OK 固定（callback を同期実行）。
  if(typeof env.__setAppModalTestResolver==='function')env.__setAppModalTestResolver(function(){return true;});
  return {env,store,els,alerts};
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== NOTIFY-N2-SAVE-001（保存系成功通知の toast 化） ===');

console.log('=== S: ソース検証（成功 alert 撤去・toast 存在・失敗系維持） ===');
ok(RAW.indexOf("alert('名簿を更新しました")<0&&RAW.indexOf("alert('📋 名簿に反映しました")<0,'S1 saveData の成功 alert が無い');
// MASTER-SYNC-CLARITY-001 (#757): 固定文言 → formatMasterSyncResultToast(counts) の結果報告へ（toast 経路は不変）。
ok(RAW.indexOf("showToast(formatMasterSyncResultToast(counts))")>=0,'S2 saveData は toast で通知（結果報告文言）');
ok(RAW.indexOf("alert('データを読み込みました')")<0,'S3 読込成功 alert が無い（ファイル/貼り付けとも）');
ok((RAW.match(/showToast\('データを読み込みました'\)/g)||[]).length===2,'S4 読込成功 toast が2箇所（ファイル＋貼り付け）');
ok(!/alert\([^)]*にバックアップを保存しました/.test(RAW),'S5 バックアップ保存成功 alert が無い');
ok(RAW.indexOf("showToast('バックアップを保存しました（ダウンロードフォルダ）')")>=0,'S6 バックアップ保存は toast');
ok(RAW.indexOf("alert('バックアップを復元しました')")<0,'S7 復元成功 alert が無い');
ok(RAW.indexOf("showToast('バックアップを復元しました')")>=0,'S8 復元成功は toast');
ok(RAW.indexOf("alert('バックアップの保存に失敗しました')")>=0,'S9 失敗系 alert（バックアップ保存失敗）は維持');
ok(RAW.indexOf("alert('復元に失敗しました。正しいバックアップファイルか確認してください')")>=0,'S10 失敗系 alert（復元失敗）は維持');
ok(RAW.indexOf('これは支部マスタ（名簿）ファイルです')>=0,'S11 誤ファイル案内 alert は維持');
ok(RAW.indexOf('現在の大会データを上書きしてバックアップを復元しますか')>=0,'S12 復元前 confirm は維持（N1）');

console.log('=== F: 機能検証（mock 実行） ===');
var Eb=makeEnv();
var r1=Eb.env.exportTournamentBackup();
ok(r1===true,'F1 exportTournamentBackup が true を返す（挙動不変）');
ok(String(Eb.els['app-toast'].textContent).indexOf('バックアップを保存しました')>=0,'F2 保存成功が toast に出る');
ok(Eb.alerts.length===0,'F3 成功経路で alert が出ない');
var stB=Eb.env.loadSaveStatus();
ok(typeof stB.backup==='number'&&stB.backup>0,'F4 保存状態バーの backup 時刻も記録される（SAVE-STATUS 非劣化）');
var Er=makeEnv();
var json=Er.env.serializeTournamentBackup(Er.env._get(),new Date().toISOString());
var r2=Er.env.importTournamentBackupFromText(json);
ok(!!Er.store['shogi_v4'],'F5 復元で state が localStorage(shogi_v4) に保存される（applyLoadedJson→save）');
ok(String(Er.els['app-toast'].textContent).indexOf('バックアップを復元しました')>=0,'F6 復元成功が toast に出る');
ok(Er.alerts.length===0,'F7 復元成功経路で alert が出ない');
var Em=makeEnv();
Em.env.saveData();
ok(String(Em.els['app-toast'].textContent).indexOf('📋 名簿')>=0,'F8 名簿反映の結果が toast に出る');
ok(Em.alerts.length===0,'F9 名簿更新で alert が出ない');
var stM=Em.env.loadSaveStatus();
ok(typeof stM.meibo==='number'&&stM.meibo>0,'F10 保存状態バーの meibo 時刻も記録される（非劣化）');

console.log('\n  NOTIFY-N2-SAVE テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0)process.exit(1);
