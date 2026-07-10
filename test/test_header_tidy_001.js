#!/usr/bin/env node
// HEADER-TIDY-001 (#746 / スマホ入力UI スライス⑤c・案B 作者承認 2026-07-10): ヘッダ再編。
//   常時表示は「📱 スマホ星取表」「📋 名簿を更新」(44px)＋「☰」のみ。
//   案内/ライブ配信/バックアップ/リセット2種は ☰ボトムシート（#header-menu-sheet）へ格納。
//   id・bind 経路・confirm 導線は不変（見た目と置き場所のみ）。RAW pin＋結線 regex 方式。実データ不使用。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
const JS=scripts();
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

// ---- 常時表示領域（<div class="header"> 〜 シート開始まで）
var headerPos=RAW.indexOf('<div class="header">');
var sheetPos=RAW.indexOf('id="header-menu-sheet"');
ok(headerPos>=0&&sheetPos>headerPos,'A1 ヘッダとシートの並び（ヘッダ→直後にシート）');
var HEAD=RAW.slice(headerPos,sheetPos);
ok(HEAD.indexOf('id="openScoreboardBtn"')>=0&&HEAD.indexOf('id="saveBtn"')>=0&&HEAD.indexOf('id="headerMenuBtn"')>=0,'A2 常時＝星取表・名簿更新・☰ の3つ');
ok(HEAD.indexOf('id="openGuideLink"')<0&&HEAD.indexOf('id="liveNavBtn"')<0&&HEAD.indexOf('id="backupBtn"')<0&&HEAD.indexOf('id="resetBtn"')<0&&HEAD.indexOf('id="resetProgressBtn"')<0,'A3 案内/配信/バックアップ/リセットは常時領域に無い');
ok(HEAD.indexOf('id="loadFile"')>=0,'A4 loadFile input は温存（⑨-a import_routing 資産）');
function tagOf(idStr,openTag){var p=RAW.indexOf(idStr);if(p<0)return '';return RAW.slice(RAW.lastIndexOf(openTag,p),RAW.indexOf('>',p)+1);}
ok(tagOf('id="openScoreboardBtn"','<button').indexOf('min-height:44px')>=0,'A5 星取表ボタン 44px 化');
ok(tagOf('id="saveBtn"','<button').indexOf('min-height:44px')>=0,'A6 名簿更新ボタン 44px 化');
ok(/\.header-menu-btn\{[^}]*min-height:44px[^}]*min-width:44px/.test(RAW),'A7 ☰ は 44px タップ標的');
ok(RAW.indexOf('⋯ その他')<0,'A8 旧「⋯ その他」ドロップダウンボタンが残っていない');

// ---- ☰ シート（構成・グループ順・a11y）
var SHEET=RAW.slice(sheetPos,RAW.indexOf('</div>',RAW.indexOf('id="headerMenuCloseBtn"')));
var order=['参加者向け','id="openGuideLink"','id="liveNavBtn"','運営データ','id="backupBtn"','危険な操作（元に戻すで1回分復旧できます）','id="resetProgressBtn"','id="resetBtn"','id="headerMenuCloseBtn"'];
var prev=-1,orderOk=true;
for(var i=0;i<order.length;i++){var q=SHEET.indexOf(order[i]);if(q<0||q<prev){orderOk=false;break;}prev=q;}
ok(orderOk,'B1 シート構成順（参加者向け→案内→配信→運営データ→バックアップ→危険→進行リセット→全リセット→閉じる）');
var sheetTag=RAW.slice(RAW.lastIndexOf('<div',sheetPos),RAW.indexOf('>',sheetPos)+1);
ok(sheetTag.indexOf('role="dialog"')>=0&&sheetTag.indexOf('aria-modal="true"')>=0,'B2 シートの a11y（dialog/aria-modal）');
ok(sheetTag.indexOf('style="display:none"')>=0,'B3 シートは既定で非表示');
ok(sheetTag.indexOf('no-print')>=0,'B4 シートは印刷に出さない（no-print）');
ok(/\.hm-item\{[^}]*min-height:44px/.test(RAW),'B5 シート項目は 44px 全幅（.hm-item）');
var guideTag=tagOf('id="openGuideLink"','<a');
ok(guideTag.indexOf('href="index.html"')>=0&&guideTag.indexOf('target="_blank"')>=0&&guideTag.indexOf('rel="noopener"')>=0,'B6 案内リンクの属性不変（新規タブ・noopener）');
ok(SHEET.indexOf('📡 ライブ配信')>=0&&SHEET.indexOf('バックアップ')>=0&&SHEET.indexOf('大会進行データをリセット')>=0&&SHEET.indexOf('大会データを全リセット')>=0,'B7 ボタン文言不変');
ok(tagOf('id="resetProgressBtn"','<button').indexOf('btn-danger')>=0&&tagOf('id="resetBtn"','<button').indexOf('btn-danger')>=0,'B8 リセット2種は danger 意匠（§1 意味色）');

// ---- 結線（bind 経路の不変・開閉ロジック）
ok(/getElementById\('liveNavBtn'\)[\s\S]{0,220}goToLiveBroadcastSection/.test(JS),'C1 配信ボタン→goToLiveBroadcastSection（誘導のみ・開始しない）不変');
ok(/getElementById\('backupBtn'\)[\s\S]{0,220}openBackupModal/.test(JS),'C2 バックアップ→openBackupModal 不変');
ok(/getElementById\('saveBtn'\)\.addEventListener\('click',saveData\)/.test(JS),'C3 名簿更新→saveData 不変');
ok(/getElementById\('resetBtn'\)\.addEventListener\('click',resetAll\)/.test(JS),'C4 全リセット→resetAll 不変');
ok(/getElementById\('resetProgressBtn'\)[\s\S]{0,220}resetTournamentProgressOnly/.test(JS),'C5 進行リセット→resetTournamentProgressOnly 不変');
ok(/function toggleHeaderMenu\(forceClose\)/.test(JS)&&/function bindHeaderMenuEvents\(\)/.test(JS),'C6 開閉/結線関数（toggleHeaderMenu/bindHeaderMenuEvents）');
ok(/function bindHeaderEvents\(\)\{[\s\S]*?bindHeaderMenuEvents\(\)/.test(JS),'C7 bindHeaderEvents から結線');
var bindBody=(JS.match(/function bindHeaderMenuEvents\(\)\{[\s\S]*?\n\}/)||[''])[0];
ok(bindBody.indexOf("'openGuideLink'")>=0&&bindBody.indexOf("'liveNavBtn'")>=0&&bindBody.indexOf("'backupBtn'")>=0&&bindBody.indexOf("'resetProgressBtn'")>=0&&bindBody.indexOf("'resetBtn'")>=0,'C8 項目タップでシートを閉じる（5項目とも）');
ok(bindBody.indexOf('headerMenuCloseBtn')>=0&&/e\.target===sheet/.test(bindBody),'C9 ✕/背景タップで閉じる');
ok(/keydown/.test(bindBody)&&/Escape/.test(bindBody),'C10 Esc で閉じる（fail-soft）');
ok(!/function toggleDangerMenu\(|function bindDangerMenuEvents\(|bindDangerMenuEvents\(\)|toggleDangerMenu\(/.test(JS),'C11 旧⋯メニューのロジック残骸なし（定義・呼び出しゼロ／コメント言及は許容）');

// ---- スマホ配置（承認モック: タイトル行右端に ☰・ボタン1行）
ok(/@media\(max-width:600px\)\{[\s\S]*?\.header \.header-menu-btn\{position:absolute/.test(RAW),'D1 スマホ幅で ☰ をタイトル行右端に absolute 配置');
ok(/@media\(max-width:600px\)\{[\s\S]*?\.header>div:first-child\{padding-right/.test(RAW),'D2 タイトルと ☰ の重なり回避余白');

console.log('HEADER-TIDY-001: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
