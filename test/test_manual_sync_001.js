#!/usr/bin/env node
// MANUAL-SYNC-001 (2026-07-10): 当日マニュアル（docs/manual_sp.html / docs/manual_print.html）と
// アプリ実UI（shogi_v4.html）の同期ゲート。v107→v121 のマニュアル乖離（保存状態バー撤去・
// ヘッダ再編⑤c・登録タブ⑤b 等）を手動点検で拾っていたのを自動化する。
// DOC-SYNC-001 (2026-07-10 拡張): 対象を4面に拡大 — F=アプリ内ヘルプ（HELP_TEXTS）・
// G=運営サイト（index.html・☰「📖 案内」から届く公開面）・H=インストールガイド
// （docs/install_guide.html）・I=版数整合（index.html ?v == sw.js CACHE）。
// 方針（抽出駆動＝両側をハードコードしない）:
//   A. 抽出照合: タブ / ヘッダ常時ボタン / ☰シート項目をアプリのソースから抽出し、
//      マニュアルに載っていることを要求（UI を変えるとマニュアル未更新で FAIL）。
//   B. 逆照合: マニュアル中の <span class="btn">…</span> 表記が実UIに存在することを要求
//      （UIから消えた/改名されたボタンをマニュアルが書き続けたら FAIL）。〇/○ はプレースホルダ。
//   C. 墓標: 撤去済みUI（保存状態バー・旧「⋯ その他」ドロップダウン）がマニュアルに現れたら FAIL。
//   D. 事実ピン: バックアップのファイル名 prefix = shogi_backup_（shogi_taikai_ は別処理＝誤記検出）。
// 実データ不使用・読み取り専用。
const fs=require('fs');
const path=require('path');
const target=process.argv[2]||'shogi_v4.html';
const root=path.dirname(path.resolve(target));
const RAW=fs.readFileSync(target,'utf8');
let SP=null,PR=null,loadErr=null;
try{
  SP=fs.readFileSync(path.join(root,'docs','manual_sp.html'),'utf8');
  PR=fs.readFileSync(path.join(root,'docs','manual_print.html'),'utf8');
}catch(e){loadErr=e.message;}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
ok(!loadErr,'M0 マニュアル2種を読めること（docs/manual_sp.html / docs/manual_print.html）: '+(loadErr||''));
if(loadErr){console.log('MANUAL-SYNC-001: PASS='+pass+', FAIL='+fail);process.exit(1);}
const BOTH=[['manual_sp',SP],['manual_print',PR]];

// ---- A1. タブ名: アプリの tab-bar から抽出→両マニュアルに全タブ名があること
const tabLabels=[];
{
  const re=/<button[^>]*class="tab[^"]*"[^>]*id="tab-[^"]*"[^>]*>([^<]+)<\/button>/g;let m;
  while((m=re.exec(RAW))!==null)tabLabels.push(m[1].trim());
}
ok(tabLabels.length===5,'A1-0 タブは5本抽出できること（実際 '+tabLabels.length+'本: '+tabLabels.join('/')+'）');
BOTH.forEach(([name,doc])=>{
  const missing=tabLabels.filter(t=>doc.indexOf(t)<0);
  ok(missing.length===0,'A1 '+name+' に全タブ名（'+missing.join('・')+' が欠落）');
});

// ---- A2. ヘッダ常時ボタン: header 領域（〜☰シート手前）から可視ラベルを抽出→両マニュアルに載っていること
const headerPos=RAW.indexOf('<div class="header">');
const sheetPos=RAW.indexOf('id="header-menu-sheet"');
ok(headerPos>=0&&sheetPos>headerPos,'A2-0 ヘッダ→☰シートの構造が取れること');
const HEAD=RAW.slice(headerPos,sheetPos);
const headBtns=[];
{
  const re=/<button[^>]*>([^<]+)<\/button>/g;let m;
  while((m=re.exec(HEAD))!==null){const t=m[1].trim();if(t&&t!=='☰')headBtns.push(t);}
}
ok(headBtns.length>=2,'A2-1 ヘッダ常時ボタンを抽出できること（実際: '+headBtns.join('・')+'）');
BOTH.forEach(([name,doc])=>{
  const missing=headBtns.filter(t=>doc.indexOf(t)<0);
  ok(missing.length===0,'A2 '+name+' にヘッダ常時ボタン（'+missing.join('・')+' が欠落）');
  ok(doc.indexOf('☰')>=0,'A2 '+name+' に ☰ メニューへの言及');
});

// ---- A3. ☰シート項目: シートから可視ラベルを抽出→印刷版に載っていること（案内リンクと✕閉じるは対象外）
const sheetEnd=RAW.indexOf('id="headerMenuCloseBtn"');
ok(sheetEnd>sheetPos,'A3-0 ☰シート領域が取れること');
const SHEET=RAW.slice(sheetPos,sheetEnd);
const EXEMPT=['📖 案内（運営サイト）','✕ 閉じる'];// 案内=参加者向けサイトへの静的リンク（運営マニュアルの守備範囲外）
const sheetItems=[];
{
  const re=/<(?:button|a)[^>]*class="hm-item[^"]*"[^>]*>([^<]+)<\/(?:button|a)>/g;let m;
  while((m=re.exec(SHEET))!==null){const t=m[1].trim();if(EXEMPT.indexOf(t)<0)sheetItems.push(t);}
}
ok(sheetItems.length>=4,'A3-1 ☰シート項目を抽出できること（実際: '+sheetItems.join('・')+'）');
{
  const missing=sheetItems.filter(t=>PR.indexOf(t)<0);
  ok(missing.length===0,'A3 manual_print に ☰シート項目（'+missing.join('・')+' が欠落）');
}
ok(PR.indexOf('危険な操作')>=0,'A3-2 manual_print にリセットの置き場（危険な操作）の言及');

// ---- B. 逆照合: マニュアルの <span class="btn">…</span> が実UIに存在すること
//      〇/○ は回戦数・クラス名のプレースホルダとして許容（最長チャンクで照合）。
function btnLabels(doc){
  const out=[];const re=/<span class="btn">([^<]+)<\/span>/g;let m;
  while((m=re.exec(doc))!==null)out.push(m[1].trim());
  return out;
}
function inApp(label){
  if(RAW.indexOf(label)>=0)return true;
  // 「〇クラス…」「○回戦 …」= クラス名/回戦数のプレースホルダ（アプリ側は実名・実数を埋める）
  const chunks=label.split(/[〇○](?:クラス)?/).map(s=>s.trim()).filter(s=>s.length>=3);
  if(chunks.length===0)return false;
  const longest=chunks.sort((a,b)=>b.length-a.length)[0];
  return RAW.indexOf(longest)>=0;
}
BOTH.forEach(([name,doc])=>{
  const labels=btnLabels(doc);
  ok(labels.length>0,'B0 '+name+' に btn 表記があること');
  const stale=labels.filter(l=>!inApp(l));
  ok(stale.length===0,'B1 '+name+' の btn 表記はすべて実UIに存在（乖離: '+stale.join('・')+'）');
});

// ---- C. 墓標: 撤去済みUIへの言及が復活したら FAIL（撤去スライスの回帰も検出）
//      保存状態バー = SAVE-STATUS-BAR-REMOVE-001（#716/#719）・「⋯ その他」= HEADER-TIDY-001（#746）で撤去。
const TOMBSTONES=['保存状態','⋯ その他'];
BOTH.forEach(([name,doc])=>{
  const found=TOMBSTONES.filter(t=>doc.indexOf(t)>=0);
  ok(found.length===0,'C1 '+name+' に撤去済みUIへの言及がない（検出: '+found.join('・')+'）');
});
ok(RAW.indexOf('⋯ その他')<0,'C2 アプリ側にも旧「⋯ その他」が復活していない（test_header_tidy_001 A8 と二重防御）');

// ---- D. 事実ピン: バックアップのファイル名 prefix
ok(RAW.indexOf('shogi_backup_')>=0,'D0 アプリのバックアップ prefix は shogi_backup_（改名したらマニュアルも追随のこと）');
BOTH.forEach(([name,doc])=>{
  ok(doc.indexOf('shogi_backup_')>=0,'D1 '+name+' にバックアップのファイル名（shogi_backup_）');
  ok(doc.indexOf('shogi_taikai_')<0,'D2 '+name+' が shogi_taikai_ をバックアップ名として書いていない（別処理の prefix）');
});

// ---- E. 公開URL
BOTH.forEach(([name,doc])=>{
  ok(doc.indexOf('kazuo1970takahashi-sketch.github.io/shogi')>=0,'E1 '+name+' にアプリの公開URL');
});

// ============================================================
// DOC-SYNC-001 拡張: 残り3面＋版数整合
// ============================================================

// ---- F. アプリ内ヘルプ（HELP_TEXTS）
{
  const hm=RAW.match(/var HELP_TEXTS=\{[\s\S]*?\n\};/);
  ok(!!hm,'F0 HELP_TEXTS が抽出できること');
  if(hm){
    // コメント行（撤去記録など）は対象外＝ユーザー向け文字列だけを検査する
    const H=hm[0].split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');
    const HELP_TOMBSTONES=['保存状態','⋯ その他','一覧で「棄権」','一括追加','大会データをコピー'];
    const found=HELP_TOMBSTONES.filter(t=>H.indexOf(t)>=0);
    ok(found.length===0,'F1 ヘルプに撤去/旧UIへの言及がない（検出: '+found.join('・')+'）');
    ok(H.indexOf('⋯ 編集')>=0&&H.indexOf('棄権にする')>=0,'F2 棄権の導線はカード「⋯ 編集」経由の記述');
    ok(H.indexOf('名簿から受付')>=0,'F3 受付はタップ受付（📋 名簿から受付）の記述');
    ok(H.indexOf('☰メニューの「バックアップ」')>=0,'F4 バックアップの場所（☰メニュー）を明記');
  }
}

// ---- G. 運営サイト（index.html）
let IDX=null;
try{IDX=fs.readFileSync(path.join(root,'index.html'),'utf8');}catch(e){}
ok(!!IDX,'G0 index.html を読めること');
if(IDX){
  const SITE_TOMBSTONES=['大会データをコピー','「読み込み」ボタン','登録完了・対局開始','「マスタ」タブ','保存状態','⋯ その他','ブラウザを閉じないで'];
  const found=SITE_TOMBSTONES.filter(t=>IDX.indexOf(t)>=0);
  ok(found.length===0,'G1 運営サイトに撤去/旧UIへの言及がない（検出: '+found.join('・')+'）');
  ok(IDX.indexOf('会員名簿')>=0&&IDX.indexOf('対局管理')>=0&&IDX.indexOf('最終結果')>=0,'G2 現行タブ名（会員名簿/対局管理/最終結果）で記述');
  ok(IDX.indexOf('ライブ配信')>=0&&IDX.indexOf('スマホ星取表')>=0&&IDX.indexOf('バックアップ')>=0&&IDX.indexOf('クラウド')>=0,'G3 現行の主要機能（配信/星取表/バックアップ/クラウド）に言及');
  // 主要ラベルの逆照合（運営サイトが言及するボタンは実UIに存在すること）
  const SITE_LABELS=['📋 名簿から受付（過去参加者から選ぶ）','＋ 名簿にない新規の方（手入力）','☁ クラウドから取得','報告書を印刷 / PDF保存','⋯ 編集','☁ クラウドへ送信','📋 名簿を更新','⏹ 配信を停止','このクラスを部分開始'];
  const stale=SITE_LABELS.filter(l=>IDX.indexOf(l)>=0&&RAW.indexOf(l)<0);
  ok(stale.length===0,'G4 運営サイト記載のボタン名は実UIに存在（乖離: '+stale.join('・')+'）');
}

// ---- H. インストールガイド（docs/install_guide.html）
{
  let IG=null;
  try{IG=fs.readFileSync(path.join(root,'docs','install_guide.html'),'utf8');}catch(e){}
  ok(!!IG,'H0 install_guide.html を読めること');
  if(IG){
    ok(IG.indexOf('「マスタ」タブ')<0,'H1 旧タブ名「マスタ」への言及がない');
    ok(IG.indexOf('会員名簿')>=0,'H2 現行タブ名（会員名簿）で記述');
    ok(IG.indexOf('☁ クラウドから取得')<0||RAW.indexOf('☁ クラウドから取得')>=0,'H3 記載ボタンは実UIに存在');
  }
}

// ---- I. 版数整合（index.html ?v == sw.js CACHE・version-sync-drift の自動検出）
{
  let SW=null;
  try{SW=fs.readFileSync(path.join(root,'sw.js'),'utf8');}catch(e){}
  ok(!!SW,'I0 sw.js を読めること');
  if(SW&&IDX){
    const mv=IDX.match(/shogi_v4\.html\?v=(\d+)/);
    const ms=SW.match(/shogi-tour-v(\d+)/);
    ok(!!mv&&!!ms&&mv[1]===ms[1],'I1 index.html ?v='+(mv?mv[1]:'?')+' と sw.js v'+(ms?ms[1]:'?')+' が一致');
  }
}

// ---- J. PLAYER-SWAP-001 (#758): 別人差し替え導線の同期ピン
//      名前編集3択目「別の人に差し替える（名簿から選ぶ）」は席譲り運用の正規サポート。
//      UI から消えた/改名されたのにマニュアルが書き続けたら B1 が拾う。ここでは
//      「アプリに導線がある限り、両マニュアルとヘルプが案内している」ことをピンする。
ok(RAW.indexOf('別の人に差し替える（名簿から選ぶ）')>=0,'J1 アプリに「別の人に差し替える（名簿から選ぶ）」導線');
BOTH.forEach(([name,doc])=>{
  ok(doc.indexOf('別の人に差し替える')>=0,'J2 '+name+' に別人差し替えの記述');
});
ok(RAW.indexOf('名簿にない新規の方として差し替え')>=0,'J3 アプリに未連携差し替え（新規の方として差し替え）の導線');
{
  const hm2=RAW.match(/var HELP_TEXTS=\{[\s\S]*?\n\};/);
  ok(!!hm2&&hm2[0].indexOf('別の人に差し替える')>=0,'J4 アプリ内ヘルプに別人差し替えの案内');
}

console.log('MANUAL-SYNC-001: PASS='+pass+', FAIL='+fail);
process.exit(fail===0?0:1);
