#!/usr/bin/env node
// UX-P1-001 (#... U-1/U-2/U-3): 当日 UX P1 改善の検証。
//   U-1 クラウド結果 status の色分け(classifyCloudStatusKind/applyCloudStatus 純関数)＋aria-live/role＋AAコントラスト。
//   U-2 「保存確認 N件」ピルの説明/解消導線(HELP_TEXTS 'save-warning' topic＋ピルを role=button/tabindex で操作可＋bind)。
//   U-3 受付一覧の操作ボタンのタッチターゲット 44px(.player-row-buttons button{min-height:44px})。
// すべて当日アプリの「押下時のみ」挙動・GOLDEN/CHAR 非影響（render*/静的HTML/CSS/純関数のみ）。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function loadEnv(){
  const js=extractScripts(RAW);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout',
    `${js};return { classifyCloudStatusKind:classifyCloudStatusKind, applyCloudStatus:applyCloudStatus, HELP_TEXTS:HELP_TEXTS, buildHelpModalHtml:buildHelpModalHtml };`);
  const noop=function(){};
  return fn({getElementById:function(){return null;},createElement:function(){return{};},body:{},addEventListener:noop},
    {addEventListener:noop},{getItem:function(){return null;},setItem:noop,removeItem:noop},
    {randomUUID:function(){return '0';}},noop,function(){return true;},function(){return '';},
    {log:noop,warn:noop,error:noop},Promise,function(){return 0;});
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();

console.log('=== U-1 classifyCloudStatusKind（純関数・キーワード分類）===');
const C=env.classifyCloudStatusKind;
ok(C('')==='none','C1 空→none');
ok(C(null)==='none','C2 null→none');
ok(C('クラウドへ送信中…')==='pending','C3 送信中→pending');
ok(C('クラウドから取得中…')==='pending','C4 取得中→pending');
ok(C('送信しました（名簿 4 名・結果 4 件）')==='ok','C5 送信しました→ok');
ok(C('取得しました（新規 22 名・更新 0 名／クラウド 26 名）')==='ok','C6 取得しました→ok');
ok(C('送信に失敗しました：不明（運営は続行できます・再送できます）')==='err','C7 失敗しました→err(失敗優先)');
ok(C('クラウドの取得に失敗しました。通信状態を確認して、もう一度お試しください（ログインが必要な場合があります）。')==='err','C8 取得失敗→err（生エラー文言を平易化・?v=26診断片付け）');
ok(C('取得しました（…）　⚠ 同名別IDの会員が 1 件。重複の可能性があるので app/ で確認してください')==='warn','C9 ⚠付き成功→warn(⚠優先)');
ok(C('クラウド設定がありません（送信は任意です・運営は続行できます）')==='info','C10 案内→info');
ok(C('クラウド管理ページ（app/）でログインしてから送信してください')==='info','C11 ログイン案内→info');
ok(C('幹事として有効なクラブが見つかりません（管理ページを確認してください）')==='info','C12 クラブ案内→info');

console.log('=== U-1 applyCloudStatus（textContent＋色クラス・DOM安全）===');
const A=env.applyCloudStatus;
var el={textContent:'x',className:'y'};
A(el,'送信しました（名簿 1 名）');
ok(el.textContent==='送信しました（名簿 1 名）','A1 textContent 反映');
ok(el.className==='cloud-status cloud-status-ok','A2 ok クラス付与');
A(el,'送信に失敗しました：xxx');
ok(el.className==='cloud-status cloud-status-err','A3 err クラス付与');
A(el,'');
ok(el.textContent===''&&el.className==='cloud-status cloud-status-none','A4 空→none クラス');
var threw=false; try{A(null,'msg');}catch(e){threw=true;}
ok(!threw,'A5 el=null でも throw しない');

console.log('=== U-1 静的HTML/CSS（aria-live/role/コントラスト）===');
ok(/<div id="cloudSendStatus"[^>]*class="cloud-status"[^>]*role="status"[^>]*aria-live="polite"/.test(RAW),'U1a cloudSendStatus に class/role/aria-live');
ok(RAW.indexOf('id="cloudSendStatus" style="font-size:12px;color:#888')<0,'U1b cloudSendStatus から #888 を除去');
ok(/id=\\?"masterCloudPullStatus\\?"[^>]*class=\\?"cloud-status/.test(RAW)||RAW.indexOf('id="masterCloudPullStatus" class="cloud-status"')>=0,'U1c masterCloudPullStatus に cloud-status クラス');
ok(RAW.indexOf("color:#555\" aria-live")<0,'U1d masterCloudPullStatus から #555 を除去');
ok(/\.cloud-status-ok\{color:#1a5c00/.test(RAW),'U1e ok 緑(AA) CSS');
ok(/\.cloud-status-err\{color:#A32D2D/.test(RAW),'U1f err 赤(AA) CSS');
ok(/\.cloud-status-warn\{color:#7a4a00/.test(RAW),'U1g warn 橙(AA) CSS');
// wire サイトが applyCloudStatus を使う
ok(RAW.indexOf('sendTournamentToCloud(function(msg){ applyCloudStatus(st,msg); })')>=0,'U1h 送信 wire→applyCloudStatus');
ok(RAW.indexOf("applyCloudStatus(document.getElementById('masterCloudPullStatus'),msg)")>=0,'U1i 取得 wire→applyCloudStatus');
ok(RAW.indexOf("applyCloudStatus(el,'クラウドから自動取得しました")>=0,'U1j auto-pull→applyCloudStatus');

console.log('=== U-2 保存確認ピルの説明/解消導線 ===');
ok(env.HELP_TEXTS&&env.HELP_TEXTS['save-warning'],'U2a HELP_TEXTS に save-warning topic');
ok(env.HELP_TEXTS['save-warning'].lines.length>=4,'U2b 説明行が複数');
var hm=env.buildHelpModalHtml('save-warning');
ok(hm.indexOf('未保存の恐れ')>=0,'U2c モーダルに「未保存の恐れ」説明');
ok(hm.indexOf('リロード')>=0,'U2d 「リロードで 0 に戻る」=消し方を明記');
ok(/id="save-warning-indicator"[^>]*role="button"[^>]*tabindex="0"/.test(RAW),'U2e ピルが role=button/tabindex で操作可');
ok(RAW.indexOf('title="押すと対処方法を表示します"')>=0,'U2f ピルに title 補助');
ok(RAW.indexOf("openHelpModal('save-warning')")>=0,'U2g ピル bind→openHelpModal');
ok(/getElementById\('save-warning-indicator'\)[\s\S]{0,400}addEventListener\('keydown'/.test(RAW),'U2h Enter/Space keydown bind');
ok(RAW.indexOf("el.textContent='⚠ 未保存の恐れ・要バックアップ'")>=0,'U2i ラベルは行動文言（数字でない）');
ok(RAW.indexOf("'保存確認 '+n+'件'")<0,'U2i2 旧「保存確認 N件」ラベルは撤去');
ok(/el\.title='保存の確認が取れていません（'\+n\+'件）/.test(RAW),'U2i3 件数は title へ退避');
ok(/\.save-warn-pill\{cursor:pointer\}/.test(RAW),'U2j ピル cursor:pointer');

console.log('=== U-3 タッチターゲット 44px ===');
ok(/\.player-row-buttons button\{min-height:44px\}/.test(RAW),'U3a 受付行ボタン min-height:44px');
// 既存の削除ボタン(btn-danger)が player-row-buttons 配下にある＝44px が効く
ok(/buttonsDiv\.className='player-row-buttons'/.test(RAW),'U3b 削除/編集ボタンは player-row-buttons 配下');
ok(/delBtn\.className='btn-sm btn-danger'/.test(RAW),'U3c 削除は btn-danger（破壊系）');
// ヘッダの危険ボタン（全リセット等）は対象外＝min-height 拡大を受けない（rule#60）
ok(RAW.indexOf('.header button{min-height:44px}')<0,'U3d ヘッダ危険ボタンは 44px 強制の対象外');

console.log('UX-P1-001: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
