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
    ok(g.cls === 'app-toast show err' && /保存が確認できませんでした/.test(g.text),
      '[V1] ★視界外なら err トーストで同文が出る: cls=' + g.cls);
    await page.waitForTimeout(3300);
    const gone = await page.evaluate(toastState);
    ok(gone.cls === 'app-toast', '[V1b] トーストは3秒で消える（持続表示は #reg-msg 側の契約のまま）');

    // V2: #reg-msg を視界内に入れて warn（直呼び＝表示ヘルパ自体の検査）→ トーストは出ない
    await page.evaluate(() => { document.getElementById('reg-msg').scrollIntoView(); });
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
    ok(g.cls === 'app-toast show err' && /保存が確認できませんでした/.test(g.text),
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
      document.getElementById('bulk-entry-text').value = '新規甲\n新規乙';
      updateBulkEntryPreview();
      // 保存検証を全滅させる: verify が必ず false を返す形（表示だけの stub・判定ロジック非改変）
      window.verifyPlayerPersistedById = function () { return false; };
    });
    await page.evaluate(() => { confirmBulkEntry(); });
    await page.waitForTimeout(300);
    const g = await page.evaluate(toastState);
    ok(g.cls === 'app-toast show err' && /保存が確認できませんでした/.test(g.text),
      '[V4] ★一括登録の保存未確認: 成功トーストに上書きされず warn が最終表示: text=' + (g.text || '').slice(0, 30));
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
    await page.evaluate(() => { document.getElementById('reg-msg').scrollIntoView(); });
    await page.evaluate(() => notifySaveWarning({ message: 'V5の保存が確認できませんでした', consoleTag: '[E2E-V5]', callsiteId: 'e2e-v5', kind: 'save-verify', aggregateKey: 'e2e-v5', severity: 'warn' }));
    await page.waitForTimeout(250);
    const g = await page.evaluate(`(function(){
      var r=document.getElementById('reg-msg').getBoundingClientRect();
      var t=document.getElementById('app-toast');
      return {top:+r.top.toFixed(0),bottom:+r.bottom.toFixed(0),cls:t.className};
    })()`);
    ok(g.bottom <= 200 && g.cls === 'app-toast show err',
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
    ok(g.visible || (g.cls === 'app-toast show err' && g.text.length > 0),
      '[V6] 起動時 load の warn: #reg-msg 可視（top=' + g.top + '）またはトーストが出ている: cls=' + g.cls);
    await page.close();
  }

  await browser.close();
  console.log('\nE2E-SAVE-WARN-VISIBILITY-892: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
