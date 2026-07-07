#!/usr/bin/env node
// REBUILD-SEMANTICS-001 (#609) Phase2: 「☁ クラウドの状態に完全に合わせる」完全一致導線の検証。
//   純オーケストレータ performCloudFullMatchReset（依存注入）で design-review Must Fix を確認:
//   #1 確認語は 'リセット' と別（'クラウドに合わせる'）・厳密一致／#2 大会進行中ガード（静的）／
//   #3 順序=セッション確認→OKのみreset→rebuild・未ログインは reset せず中断・fail-soft 両復元経路。実データ不使用。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null){if(!/src=/.test(m[0].slice(0,m[0].indexOf('>'))))s.push(m[1]);}return s.join('\n');}
function loadEnv(){
  const js=extractScripts(RAW);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { performCloudFullMatchReset:performCloudFullMatchReset, buildCloudFullMatchModalHtml:buildCloudFullMatchModalHtml, CLOUD_MATCH_CONFIRM_WORD:CLOUD_MATCH_CONFIRM_WORD };`);
  const noop=function(){};
  return fn({getElementById:function(){return null;},createElement:function(){return {style:{},};},head:{},body:{appendChild:noop},addEventListener:noop},
            {innerWidth:1024,addEventListener:noop},
            {getItem:function(){return null;},setItem:noop,removeItem:noop},
            {randomUUID:function(){return '0';}},noop,function(){return true;},function(){return '';},noop,noop,
            {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:noop},
            {log:noop,warn:noop,error:noop},Promise,function(f){return f&&f();},{});
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}
const E=loadEnv();

// ---- 静的アサート（ボタン/ガード/確認語） ----
ok(RAW.indexOf('id="masterCloudMatchBtn"')>=0,'S1 完全一致ボタンを描画');
ok(RAW.indexOf('☁ クラウドの状態に完全に合わせる（端末の記録を破棄）')>=0,'S2 ボタンラベル');
ok(/_cmStarted=!!\(state&&state\.started\)/.test(RAW),'S3 大会進行中なら disabled（render 時ガード）');
ok(/masterCloudMatchBtn'\)[\s\S]{0,200}state&&state\.started[\s\S]{0,80}return/.test(RAW),'S4 クリック時も state.started 早期return（Must Fix#2 二重防御）');
eq(E.CLOUD_MATCH_CONFIRM_WORD,'クラウドに合わせる','S5 確認語はリセットと別（Must Fix#1）');
ok(E.CLOUD_MATCH_CONFIRM_WORD!=='リセット','S6 確認語≠リセット');
ok(/value===CLOUD_MATCH_CONFIRM_WORD/.test(RAW),'S7 run 有効化は確認語の厳密一致');
ok(/applyMasterReset\(master\)/.test(RAW) && /rebuildMasterFromCloudUI\(setStatus\)/.test(RAW),'S8 既存 applyMasterReset/rebuildMasterFromCloudUI を再利用（新規破壊ロジック無し）');

// ---- モーダル HTML（純） ----
const mhtml=E.buildCloudFullMatchModalHtml({members:[{},{deleted:true},{}]});
ok(mhtml.indexOf('クラウドに合わせる')>=0,'S9 モーダルに確認語');
ok(mhtml.indexOf('cm-backup-checked')>=0,'S10 バックアップ確認チェック');
ok(mhtml.indexOf('id="cm-run" disabled')>=0,'S11 実行ボタンは既定 disabled');
ok(mhtml.indexOf('この操作は取り消せません')>=0 && mhtml.indexOf('未送信の記録はこの操作で失われます')>=0,'S12 破壊/温存喪失の警告');

// ---- オーケストレータ（依存注入・順序/fail-soft）----
(async function(){
  // (A) 未ログイン → reset せず中断
  let order=[]; let st='';
  let rA=await E.performCloudFullMatchReset({
    ensureSessionP:function(){order.push('sess');return Promise.resolve(false);},
    doReset:function(){order.push('reset');return {ok:true};},
    doRebuildP:function(){order.push('rebuild');return Promise.resolve({ok:true});},
    setStatus:function(m){st=m;}
  });
  ok(rA.ok===false && rA.didReset===false && rA.step==='auth','E1 未ログイン→中断（reset せず）');
  ok(order.indexOf('reset')<0,'E2 未ログイン時は doReset を呼ばない（空マスタ trap 回避）');
  ok(st.indexOf('ログイン')>=0,'E3 未ログインの status にログイン誘導');

  // (B) ログイン→reset ok→rebuild ok
  order=[]; st='';
  let rB=await E.performCloudFullMatchReset({
    ensureSessionP:function(){order.push('sess');return Promise.resolve(true);},
    doReset:function(){order.push('reset');return {ok:true};},
    doRebuildP:function(){order.push('rebuild');return Promise.resolve({ok:true});},
    setStatus:function(m){st=m;}
  });
  ok(rB.ok===true && rB.didReset===true,'E4 正常系→ok/didReset');
  eq(order.join('>'),'sess>reset>rebuild','E5 順序=セッション→reset→rebuild（Must Fix#3）');
  ok(st.indexOf('合わせました')>=0,'E6 成功 status');

  // (C) ログイン→reset ok→rebuild 失敗（fail-soft 両経路）
  st='';
  let rC=await E.performCloudFullMatchReset({
    ensureSessionP:function(){return Promise.resolve(true);},
    doReset:function(){return {ok:true};},
    doRebuildP:function(){return Promise.resolve({ok:false});},
    setStatus:function(m){st=m;}
  });
  ok(rC.ok===false && rC.didReset===true && rC.step==='rebuild','E7 rebuild 失敗→didReset=true');
  ok(st.indexOf('再計算')>=0 && st.indexOf('インポート')>=0,'E8 fail-soft に両復元経路（再計算＋インポート）');

  // (D) reset 失敗 → 名簿変更なし
  st='';
  let rD=await E.performCloudFullMatchReset({
    ensureSessionP:function(){return Promise.resolve(true);},
    doReset:function(){return {ok:false};},
    doRebuildP:function(){return Promise.resolve({ok:true});},
    setStatus:function(m){st=m;}
  });
  ok(rD.ok===false && rD.didReset===false && rD.step==='reset','E9 reset 失敗→didReset=false');
  ok(st.indexOf('変更していません')>=0,'E10 reset 失敗 status は非変更を明示');

  console.log('REBUILD-SEMANTICS-FULLMATCH-609: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail>0?1:0);
})();
