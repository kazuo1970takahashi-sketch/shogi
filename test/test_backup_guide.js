#!/usr/bin/env node
// BACKUP-GUIDE: バックアップ画面に「保存先」「復元手順」の案内を追記（presentational）。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
  scripts()+';return {buildBackupModalHtml:buildBackupModalHtml};');
const api=fn({getElementById:()=>null,createElement:()=>({style:{}}),addEventListener(){},body:{},head:{appendChild(){}}},{addEventListener(){}},{getItem:()=>null,setItem(){},removeItem(){}},{randomUUID:()=>'0'},()=>{},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,()=>0,{onLine:true});
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
var h=api.buildBackupModalHtml();
ok(h.indexOf('保存先')>=0&&h.indexOf('ダウンロード')>=0,'G1 保存先の案内');
ok(h.indexOf('iPhone')>=0&&h.indexOf('Android')>=0,'G2 iPhone/Android 両方に言及');
ok(h.indexOf('shogi_backup_')>=0,'G3 ファイル名の手掛かり');
ok(h.indexOf('復元')>=0&&h.indexOf('フォルダの指定は不要')>=0,'G4 復元手順（フォルダ指定不要）');
ok(h.indexOf('backup-export')>=0&&h.indexOf('backup-import-pick')>=0&&h.indexOf('backup-import-file')>=0,'G5 既存ボタン/入力の id は不変');
console.log('BACKUP-GUIDE: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
