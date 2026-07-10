#!/usr/bin/env node
// ============================================================
// TAP-TARGET-DENSE-001 (#737 / スライス⑤a): 密集部タップ標的の44px本対応
//   検証内容:
//   S1. 対局カード「変更」: position:absolute を撤去し flow ヘッダ行へ・min-height:44px・id 不変
//   S2. 対局カードヘッダ行: 卓バッジ→変更ボタンの順で同一 flex 行・winner-row の margin-top:28px 撤去
//   S3. 「？ ヘルプ」×6: min-height:44px（btn-sm クラス維持＝test_help_002 H4 契約）
//   S4. 履歴トグル(me-history-toggle): min-height:44px
//   S5. ①既対応分の非劣化: .sel-sm 44px/16px・.winner-btn min-height:2.9em・50音タブ/QF 44px
// 使い方: node test/test_tap_target_dense_001.js shogi_v4.html
// データは完全架空のみ（静的検査のみ・実行サンドボックス不要）。
// ============================================================
'use strict';
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_tap_target_dense_001.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const RAW = fs.readFileSync(targetPath,'utf8');

// S1: 「変更」ボタン（テンプレート文字列としての出現＝1箇所を直接検査）
{
  const m = RAW.match(/\+'<button style="([^"]*)" id="chgbtn_'\+cls\+'_'\+i\+'">変更<\/button>'/);
  assert(!!m, 'S1-1 chgbtn テンプレートが存在（id/文言 不変）');
  if(m){
    assert(m[1].indexOf('position:absolute')<0, 'S1-2 absolute 配置を撤去（flow 化）');
    assert(m[1].indexOf('min-height:44px')>=0, 'S1-3 min-height:44px（タップ標的）');
    assert(m[1].indexOf('min-width:64px')>=0, 'S1-4 min-width 64px（横も確保）');
  }
}

// S2: ヘッダ行の構造と winner-row
{
  const headerRe=/\+'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">'\s*\n\s*\+'<div style="[^"]*background:#1F3864[^"]*">第 '\+\(i\+1\)\+' 卓<\/div>'\s*\n\s*\+'<button style="[^"]*" id="chgbtn_'\+cls\+'_'\+i\+'">変更<\/button>'\s*\n\s*\+'<\/div>'/;
  assert(headerRe.test(RAW), 'S2-1 卓バッジ→変更ボタンの順で flow ヘッダ行を構成');
  assert(/<div class="winner-row" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">/.test(RAW),
    'S2-2 winner-row の margin-top:28px（absolute 回避余白）を撤去');
  assert(RAW.indexOf('style="position:absolute;top:6px;right:6px;padding:4px 10px')<0,
    'S2-3 旧 absolute「変更」スタイルの残骸なし');
}

// S3: ヘルプボタン×6
{
  const helps=RAW.match(/style="font-size:12px;padding:2px 12px;font-weight:400;white-space:nowrap;min-height:44px">？ ヘルプ<\/button>/g)||[];
  assert(helps.length===6, 'S3-1 「？ ヘルプ」6箇所すべて min-height:44px（実測 '+helps.length+'箇所）');
  const ids=['helpBtnReg','helpBtnTournament','helpBtnStandings','helpBtnReport','helpBtnMaster',"helpBtnFirstRound_'+escapeHtml(cls)+'"];
  let allBtnSm=true;
  for(const id of ids){
    const re=new RegExp('id="'+id.replace(/[+'()]/g,'\\$&')+'" class="btn-sm"');
    if(!re.test(RAW))allBtnSm=false;
  }
  assert(allBtnSm, 'S3-2 6箇所とも id と btn-sm クラスは不変（test_help_002 H4 契約維持）');
}

// S4: 履歴トグル
{
  assert(/id="me-history-toggle" class="btn-sm" style="[^"]*min-height:44px[^"]*">▼ 履歴情報を開く<\/button>/.test(RAW),
    'S4 me-history-toggle に min-height:44px');
}

// S4b: 大会履歴タブのクラウド行（L2 P2-1: ？ヘルプ＋読み込む＝6px gap の密集ペア）
{
  assert(/id="history-cloud-help"[^>]*style="[^"]*min-height:44px[^"]*">？ ヘルプ<\/button>/.test(RAW),
    'S4b-1 history-cloud-help に min-height:44px');
  assert(/id="history-cloud-load"[^>]*style="[^"]*min-height:44px[^"]*">読み込む<\/button>/.test(RAW),
    'S4b-2 history-cloud-load に min-height:44px');
}

// S5: ①(#715) 既対応分の非劣化
{
  assert(/\.sel-sm\{height:44px;[^}]*font-size:16px;/.test(RAW), 'S5-1 .sel-sm 44px/16px 不変');
  assert(/\.winner-btn\{[^}]*min-height:2\.9em;/.test(RAW), 'S5-2 .winner-btn min-height 2.9em 不変');
  assert(/class="pp-yomi-tab'\+\(active\?' active':''\)\+'" data-row="[^"]*" style="min-height:44px;min-width:44px;/.test(RAW),
    'S5-3 50音タブ 44px 不変');
  assert(/class="pp-quick-filter-btn'\+\(qActive\?' active':''\)\+'" data-qfkey="[^"]*" style="min-height:44px;/.test(RAW),
    'S5-4 クイックフィルタ 44px 不変');
}

console.log('TAP-TARGET-DENSE-001: PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
