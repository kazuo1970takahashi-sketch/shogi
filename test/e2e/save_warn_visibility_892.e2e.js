#!/usr/bin/env node
// Playwright E2E: SAVE-WARN-VISIBILITY-001（#892）
//   notifySaveWarning の warn は #reg-msg（受付ペイン先頭）に出るが、一括編集後の深いスクロール・
//   別タブ表示中・全画面オーバーレイの下では読めない（実測 top=-112 / 0×0 / 遮蔽）。
//   「見えない時だけ err トーストでも同文を出す」フォールバックを実ブラウザで測る。
//   セルは反証パネル1巡（2026-08-16）の実測から採った。no-op 検証: [V1] は修正を消すと
//   toast className='app-toast'・textContent='' になり赤くなることをパネルが両側で実測済み。
//
// 使い方: node test/e2e/save_warn_visibility_892.e2e.js [html-or-url]
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

const EXEC = process.env.PW_CHROME || undefined;

// 32名の受付 state を作る（bulk ボタンまでスクロールすると #reg-msg が視界外になる規模）
const seed = (n) => `(function(){
  var P=[];
  for(var i=1;i<=${n};i++){P.push({id:'p'+i,name:'参加者'+i,entry_no:i,member:'member',grade:'ippan'});}
  state={players:{A:P,B:[]},rounds:4,results:{A:[],B:[]},pairings:{A:[],B:[]},started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],report:{}};
  save(); showTab('reg'); renderRegList();
})();`;

// localStorage の保存を1回だけ失敗させる＝実路（save→verify）経由で warn を発火させる
const armSaveFail = `(function(){
  var orig=localStorage.setItem.bind(localStorage);
  var failed=false;
  localStorage.setItem=function(k,v){ if(!failed&&k==='shogi_v4'){failed=true;throw new Error('quota-sim');} return orig(k,v); };
})();`;

const toastState = `(function(){
  var t=document.getElementById('app-toast');
  return {cls:t?t.className:null,text:t?t.textContent:null};
})();`;

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

  // ---- V1/V2: 深いスクロール（視界外）で出る・可視なら出ない ----------------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(32));
    await page.evaluate(() => { document.getElementById('bulkEditA').scrollIntoView(); });
    await page.evaluate(() => bulkEditNames('A'));
    await page.waitForTimeout(80);
    await page.evaluate(armSaveFail);
    await page.evaluate(() => {
      document.getElementById('bulk-name-p1').value = '改名壱';
      var b = [].slice.call(document.querySelectorAll('#bulk-edit-modal button')).find(function (x) { return /保存/.test(x.textContent); });
      b.click();
    });
    await page.waitForTimeout(300);
    const g = await page.evaluate(`(function(){
      var r=document.getElementById('reg-msg').getBoundingClientRect();
      var t=document.getElementById('app-toast');
      return {msgTop:+r.top.toFixed(0),cls:t.className,text:t.textContent};
    })()`);
    ok(g.msgTop < 0, '[V0] 前提: warn の表示先 #reg-msg が視界外（top=' + g.msgTop + '）');
    ok(g.cls === 'app-toast show warn' && /保存が確認できませんでした/.test(g.text),
      '[V1] ★視界外なら err トーストで同文が出る: cls=' + g.cls);
    await page.waitForTimeout(3300);
    const gone = await page.evaluate(toastState);
    ok(gone.cls === 'app-toast', '[V1b] トーストは3秒で消える（持続表示は #reg-msg 側の契約のまま）');

    // V2: #reg-msg を「sticky バーより下の」視界内に入れて warn（直呼び）→ トーストは出ない
    //   ★ scrollIntoView() 素の形は要素がバー（下端44px）の裏に入り「遮蔽＝不可視」扱いになる（V9 が担当）
    await page.evaluate(() => { document.getElementById('reg-msg').scrollIntoView({ block: 'center' }); });
    await page.evaluate(() => notifySaveWarning({ message: 'V2の保存が確認できませんでした', consoleTag: '[E2E-V2]', callsiteId: 'e2e-v2', kind: 'save-verify', aggregateKey: 'e2e-v2', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g2 = await page.evaluate(`(function(){
      var r=document.getElementById('reg-msg').getBoundingClientRect();
      var t=document.getElementById('app-toast');
      return {top:+r.top.toFixed(0),h:+r.height.toFixed(0),bottom:+r.bottom.toFixed(0),cls:t.className};
    })()`);
    ok(g2.h > 0 && g2.bottom > 24 && g2.top < 667 && g2.cls === 'app-toast',
      '[V2] #reg-msg が可視なら二重に出さない: top=' + g2.top + ' h=' + g2.h + ' cls=' + g2.cls);
    await page.close();
  }

  // ---- V3: 別タブ表示中（0×0・#869 型）でも出る ----------------------------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(4));
    await page.evaluate(() => showTab('tournament'));
    await page.evaluate(() => notifySaveWarning({ message: 'V3の保存が確認できませんでした', consoleTag: '[E2E-V3]', callsiteId: 'e2e-v3', kind: 'save-verify', aggregateKey: 'e2e-v3', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g = await page.evaluate(toastState);
    ok(g.cls === 'app-toast show warn' && /保存が確認できませんでした/.test(g.text),
      '[V3] 別タブ（#reg-msg 0×0）でもトーストが出る: cls=' + g.cls);
    await page.close();
  }

  // ---- V4: 一括登録オーバーレイ＝遮蔽扱い＋成功トーストが warn を上書きしない ----
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(2));
    await page.evaluate(() => { openBulkEntryFullscreen(); });
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      // ★ Codex P2 (r3791854245): skipped=0 だと正規表現の継ぎ足しを消しても緑＝重複1行を混ぜる
      document.getElementById('bulk-entry-text').value = '新規甲\n新規甲\n新規乙';
      updateBulkEntryPreview();
      // 保存検証を全滅させる: verify が必ず false を返す形（表示だけの stub・判定ロジック非改変）
      window.verifyPlayerPersistedById = function () { return false; };
    });
    await page.evaluate(() => { confirmBulkEntry(); });
    await page.waitForTimeout(300);
    const g = await page.evaluate(toastState);
    ok(g.cls === 'app-toast show warn' && /保存が確認できませんでした/.test(g.text) && /（スキップ/.test(g.text),
      '[V4] ★一括登録の保存未確認: warn が最終表示＋スキップ内訳を含む: text=' + (g.text || '').slice(0, 48));
    await page.close();
  }

  // ---- V5: キーボード表示中（vv offsetTop）でも「実際に見えない」判定で出る ----
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(32));
    // vv をスタブ: 高さ400・offsetTop 200（可視域 [200,600]）。#reg-msg(top≈0) は可視域の上＝不可視
    await page.evaluate(`(function(){
      var fake={height:400,offsetTop:200,scale:1,addEventListener:function(){},removeEventListener:function(){}};
      Object.defineProperty(window,'visualViewport',{get:function(){return fake;},configurable:true});
    })();`);
    await page.evaluate(() => { document.getElementById('reg-msg').scrollIntoView({ block: 'start' }); });
    await page.evaluate(() => notifySaveWarning({ message: 'V5の保存が確認できませんでした', consoleTag: '[E2E-V5]', callsiteId: 'e2e-v5', kind: 'save-verify', aggregateKey: 'e2e-v5', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g = await page.evaluate(`(function(){
      var r=document.getElementById('reg-msg').getBoundingClientRect();
      var t=document.getElementById('app-toast');
      return {top:+r.top.toFixed(0),bottom:+r.bottom.toFixed(0),cls:t.className};
    })()`);
    ok(g.bottom <= 200 && g.cls === 'app-toast show warn',
      '[V5] layout 上は画面内でも vv 可視域[200,600]の外（bottom=' + g.bottom + '）ならトーストが出る: cls=' + g.cls);
    await page.close();
  }

  // ---- V6: 起動時 load 経路（破損 JSON）＝レイアウト確定後の判定で出る --------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(() => { localStorage.setItem('shogi_v4', '{broken-json'); });
    await page.reload();
    await page.waitForFunction(() => typeof save === 'function');
    await page.waitForTimeout(400);
    const g = await page.evaluate(`(function(){
      var r=document.getElementById('reg-msg').getBoundingClientRect();
      var t=document.getElementById('app-toast');
      var vh=window.innerHeight;
      var visible=r.height>0&&r.bottom>0&&r.top<vh;
      return {visible:visible,top:+r.top.toFixed(0),cls:t?t.className:null,text:t?t.textContent:''};
    })()`);
    ok(g.visible || (g.cls === 'app-toast show warn' && g.text.length > 0),
      '[V6] 起動時 load の warn: #reg-msg 可視（top=' + g.top + '）またはトーストが出ている: cls=' + g.cls);
    await page.close();
  }

  // ---- V7/V8: オーバーレイ2種を「開いたまま」遮蔽判定を通す（Codex P2 r3791745684） ----
  //   どちらかの述語を covered から消すと該当セルが赤くなる（削除耐性）。
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(2));
    await page.evaluate(() => { document.getElementById('reg-msg').scrollIntoView({ block: 'center' }); });
    await page.evaluate(() => { openBulkEntryFullscreen(); });
    await page.evaluate(() => notifySaveWarning({ message: 'V7の保存が確認できませんでした', consoleTag: '[E2E-V7]', callsiteId: 'e2e-v7', kind: 'save-verify', aggregateKey: 'e2e-v7', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g7 = await page.evaluate(toastState);
    ok(g7.cls === 'app-toast show warn' && /V7/.test(g7.text),
      '[V7] 一括登録オーバーレイを開いたまま＝幾何的に可視でも遮蔽＝トーストが出る: cls=' + g7.cls);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(2));
    await page.evaluate(() => { document.getElementById('reg-msg').scrollIntoView({ block: 'center' }); });
    await page.evaluate(() => { if (typeof openPpFullscreen === 'function') { openPpFullscreen(); } else { document.getElementById('pp-fullscreen').style.display = 'block'; } });
    await page.waitForTimeout(80);
    const pre8 = await page.evaluate(() => ({ open: typeof isPpFullscreenOpen === 'function' && isPpFullscreenOpen() }));
    await page.evaluate(() => notifySaveWarning({ message: 'V8の保存が確認できませんでした', consoleTag: '[E2E-V8]', callsiteId: 'e2e-v8', kind: 'save-verify', aggregateKey: 'e2e-v8', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g8 = await page.evaluate(toastState);
    ok(pre8.open && g8.cls === 'app-toast show warn' && /V8/.test(g8.text),
      '[V8] 過去参加者オーバーレイを開いたまま＝遮蔽＝トーストが出る: open=' + pre8.open + ' cls=' + g8.cls);
    await page.close();
  }

  // ---- V9: sticky .tab-bar の裏（top=0）＝遮蔽扱いでトーストが出る（Codex P1 r3791745683） ----
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(2));
    // ★ 素の scrollIntoView は要素が画面外（top<0）に行き「ただの視界外」になって遮蔽コードを
    //   消しても緑のまま＝空回り（初版で実測 -46..-6）。バーの裏（top≈20・rect全体がバー下端より上）に正確に置く。
    await page.evaluate(() => {
      var el = document.getElementById('reg-msg');
      var r = el.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top - 20);
    });
    await page.evaluate(() => notifySaveWarning({ message: 'V9の保存が確認できませんでした', consoleTag: '[E2E-V9]', callsiteId: 'e2e-v9', kind: 'save-verify', aggregateKey: 'e2e-v9', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g9 = await page.evaluate(`(function(){
      var r=document.getElementById('reg-msg').getBoundingClientRect();
      var b=document.querySelector('.tab-bar').getBoundingClientRect();
      var t=document.getElementById('app-toast');
      return {top:+r.top.toFixed(0),bottom:+r.bottom.toFixed(0),barBottom:+b.bottom.toFixed(0),cls:t.className};
    })()`);
    ok(g9.top >= 0 && g9.bottom <= g9.barBottom && g9.cls === 'app-toast show warn',
      '[V9] ★sticky バーの裏（rect ' + g9.top + '..' + g9.bottom + ' vs バー下端' + g9.barBottom + '）は不可視＝トーストが出る: cls=' + g9.cls);
    await page.close();
  }

  // ---- V10: 名簿反映の破損スキップ経路＝成功系トーストに上書きされない（Codex P1 r3791745680） ----
  //   初版 #892 は _done が引数を捨てていて印が届かず、この経路の抑止が一度も効いていなかった。
  //   実路（saveData→syncBranchMasterOnSave→corruption skip）を通しで測る。
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(2));
    await page.evaluate(() => { localStorage.setItem('shogi_branch_master', '{broken-master'); });
    await page.evaluate(() => showTab('tournament'));
    await page.evaluate(() => { saveData(); });
    await page.waitForTimeout(300);
    const g10 = await page.evaluate(toastState);
    ok(g10.cls === 'app-toast show warn' && /名簿への自動反映をスキップ/.test(g10.text),
      '[V10] ★破損スキップの warn が成功系トーストに上書きされず最終表示: text=' + (g10.text || '').slice(0, 28));
    await page.close();
  }

  // ---- V11: 部分可視 1〜23px は「読めない」＝トーストが出る（Codex P2 r3791854240） ----
  //   閾値 24px を 1px に緩める変異でこのセルが赤くなる。
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(32));
    // ★ 位置決めの罠2つ（実測）: #reg-msg は中身が入るまで高さ0／初回の notifySaveWarning は
    //   インジケータをスロットの上に挿入して +68px 押し下げる。→ ウォームアップ発火で
    //   両方を先に確定させ、トーストが消えるのを待ってから位置決めする。
    await page.evaluate(() => notifySaveWarning({ message: 'ウォームアップ', consoleTag: '[E2E-V11w]', callsiteId: 'e2e-v11w', kind: 'save-verify', aggregateKey: 'e2e-v11w', severity: 'warn' }));
    await page.waitForTimeout(3400);
    await page.evaluate(() => {
      // 位置決めは**固定の下部バー #regActionBar**（top 一定）で: スロット上端をバー上端の
      //   10px 上に＝見えるのは上の 10px だけ（1〜23px の部分可視・残りはバーの裏）。
      var el = document.getElementById('reg-msg');
      var barTop = document.getElementById('regActionBar').getBoundingClientRect().top;
      var r = el.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + (r.top - (barTop - 10)));
    });
    await page.evaluate(() => notifySaveWarning({ message: 'V11の保存が確認できませんでした', consoleTag: '[E2E-V11]', callsiteId: 'e2e-v11', kind: 'save-verify', aggregateKey: 'e2e-v11', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g11 = await page.evaluate(`(function(){
      var r=document.getElementById('reg-msg').getBoundingClientRect();
      var barTop=document.getElementById('regActionBar').getBoundingClientRect().top;
      var t=document.getElementById('app-toast');
      return {vis:+(barTop-r.top).toFixed(0),cls:t.className};
    })()`);
    const g11t = await page.evaluate(`document.getElementById('app-toast').textContent`);
    ok(g11.vis > 0 && g11.vis < 24 && g11.cls === 'app-toast show warn' && /V11/.test(g11t),
      '[V11] ★部分可視 ' + g11.vis + 'px（1〜23px）は読めない扱い＝トーストが出る: cls=' + g11.cls);
    await page.close();
  }

  // ---- V12: 下部固定バー #regActionBar の裏＝トーストが出る（Codex P1 r3791854242） ----
  //   バーのクランプを消すと幾何的には24px以上「見える」計算になり、このセルが赤くなる。
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.goto(TARGET);
    await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(seed(2));
    await page.evaluate(() => {
      var el = document.getElementById('reg-msg');
      var bar = document.getElementById('regActionBar').getBoundingClientRect();
      var r = el.getBoundingClientRect();
      // スロット上端をバー上端の10px上に＝バー無視なら40px中30px「見える」計算・実際はバーの裏
      window.scrollTo(0, window.scrollY + (r.top - (bar.top - 10)));
    });
    await page.evaluate(() => notifySaveWarning({ message: 'V12の保存が確認できませんでした', consoleTag: '[E2E-V12]', callsiteId: 'e2e-v12', kind: 'save-verify', aggregateKey: 'e2e-v12', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g12 = await page.evaluate(`(function(){
      var r=document.getElementById('reg-msg').getBoundingClientRect();
      var b=document.getElementById('regActionBar').getBoundingClientRect();
      var t=document.getElementById('app-toast');
      return {top:+r.top.toFixed(0),bottom:+r.bottom.toFixed(0),barTop:+b.top.toFixed(0),cls:t.className};
    })()`);
    ok(g12.bottom > g12.barTop && (g12.barTop - Math.max(g12.top, 0)) < 24 && g12.cls === 'app-toast show warn',
      '[V12] ★下部バーの裏（rect ' + g12.top + '..' + g12.bottom + ' vs バー上端' + g12.barTop + '）は不可視＝トーストが出る: cls=' + g12.cls);
    await page.close();
  }

  await browser.close();
  console.log('\nE2E-SAVE-WARN-VISIBILITY-892: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
