#!/usr/bin/env node
// Playwright E2E: BULK-EDIT-INLINE-ERROR-001 (#887)
//   名前一括編集モーダルの入力エラー2件を native alert から画面内スロット（N5）へ移した。
//   STYLE-GUIDE §3 N5 ／ §1 danger 面色 ／ §3.1 見出し語 ／ §3.2 置き場所 ／ §10.4 キーボード共存。
//
// ★ 測り方の落とし穴（#881 の4つ ＋ 本便の2つ ＋ 訂正1つ）:
//   1. page.click() は Playwright が自動スクロールするので、画面外でも成功する
//   2. overflow-y:auto があると rect も嘘をつく → クリップ判定（rect ⊂ カードの可視 rect）まで見る
//   3. ~~elementFromPoint は inert のせいで #rotate-overlay を素通りする~~
//      → **#881（focus trap で inert を付ける）の話であって #887 には掛からない**。
//        bulk 側にトラップは無い（#888 に切り出し済み）ので elementFromPoint は覆いを正しく返す（実測 6/6）
//   4. hidden / display:none の rect は 0×0 → 「クリップ内」を自明に満たす → 幅・高さ>0 も見る
//   5. .app-toast は pointer-events:none なので elementFromPoint がトーストを素通りする
//   6. ★ クリップ判定は**重ね順を見ない**。#rotate-overlay（z=99999）はモーダル（z=9999）を覆うが
//      rect 判定は全部緑のまま → **画素で当たる**。[SELF] がその検査自体を検査する
//
// 使い方: node test/e2e/bulk_modal_inline_error_887.e2e.js [shogi_v4.html or URL]
// 終了コード 0=全PASS / 1=失敗。
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// 面色（STYLE-GUIDE §1 danger）
const FACE = { r: 253, g: 236, b: 234 };

const mk = (n, nameLen) => `(function(){
  var P=[];
  for(var i=1;i<=${n};i++){
    var nm=${nameLen ? `Array(${nameLen}+1).join('x')+i` : "'選手'+i"};
    P.push({id:'p'+i,name:nm,entry_no:i,member:'member',grade:'ippan'});
  }
  state={players:{A:P,B:[]},rounds:4,results:{A:[],B:[]},pairings:{A:[],B:[]},started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],report:{}};
  save(); showTab('register'); renderRegList();
})();`;

// ★ visualViewport を差し替えてソフトキーボードを再現する。
//   headless Chromium は Emulation では vv.height が縮まないため（実測）。
const stubVV = (h, offsetTop) => `(function(){
  var handlers={resize:[],scroll:[]};
  var vv={offsetTop:${offsetTop || 0},height:${h},scale:1,
    addEventListener:function(t,f){ (handlers[t]||(handlers[t]=[])).push(f); },
    removeEventListener:function(t,f){ var a=handlers[t]||[]; var i=a.indexOf(f); if(i>=0)a.splice(i,1); }};
  window.__vvFire=function(t){ (handlers[t]||[]).forEach(function(f){ try{f();}catch(e){} }); };
  Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
})();`;
// ★ ev を明示できる。既定は resize。
//   3巡目パネルの実測: D3 が offsetTop 変更後も resize を発火していたため、
//   **scroll リスナーを消しても 51/0 全緑**だった（scroll 結線の挙動検査がゼロ）。
//   実ブラウザで offsetTop 変化が発火するのは scroll イベント。
const setVV = (h, offsetTop, ev) => `(function(){
  var vv=window.visualViewport; if(!vv)return;
  vv.height=${h}; vv.offsetTop=${offsetTop || 0};
  if(window.__vvFire)window.__vvFire(${JSON.stringify(ev || 'resize')});
})();`;

// 可視判定: rect ⊂ カードの可視 rect ＋ 幅高>0 ＋ visualViewport 内
const probe = `(function(){
  var slot=document.getElementById('bulk-err');
  // ★ 無い場合も同じ形を返す。null 落ちでハーネスが例外死すると、
  //   変異固有の失敗と区別できなくなる（#881 の2巡目 Codex P2 と同じ轍）。
  if(!slot)return {なし:true,hidden:null,文言:null,見出し:null,headHTML:null,role:null,ariaLive:null,
    面色:null,slot:null,card:null,slot可視:false,btn可視:false,横はみ出し:false,
    inline:{alignSelf:null,marginTop:null,maxHeight:null},
    overlay:(function(){var o=document.getElementById('rotate-overlay');return o?getComputedStyle(o).display:'(なし)';})()};
  var cardEl=slot.parentNode;
  var cr=cardEl.getBoundingClientRect(), er=slot.getBoundingClientRect();
  var btn=cardEl.lastElementChild.getBoundingClientRect();
  var vv=window.visualViewport;
  var vTop=vv?vv.offsetTop:0, vBot=vv?(vv.offsetTop+vv.height):innerHeight;
  var body=slot.querySelector('.bulk-err-body');
  var head=slot.querySelector('.bulk-err-head');
  return {
    hidden: slot.hidden,
    文言: body?body.textContent:null,
    見出し: head?head.textContent:null,
    headHTML: head?head.innerHTML:null,
    role: slot.getAttribute('role'), ariaLive: slot.getAttribute('aria-live'),
    面色: getComputedStyle(slot).backgroundColor,
    slot:{t:+er.top.toFixed(1),b:+er.bottom.toFixed(1),w:+er.width.toFixed(1),h:+er.height.toFixed(1)},
    card:{t:+cr.top.toFixed(1),b:+cr.bottom.toFixed(1)},
    slot可視: er.top>=cr.top-0.5 && er.bottom<=cr.bottom+0.5 && er.top>=vTop-0.5 && er.bottom<=vBot+0.5
              && er.width>0 && er.height>0,
    btn可視: btn.top>=cr.top-0.5 && btn.bottom<=cr.bottom+0.5 && btn.top>=vTop-0.5 && btn.bottom<=vBot+0.5,
    横はみ出し: cardEl.scrollWidth>cardEl.clientWidth+1,
    inline:{alignSelf:cardEl.style.alignSelf,marginTop:cardEl.style.marginTop,maxHeight:cardEl.style.maxHeight},
    overlay: (function(){ var o=document.getElementById('rotate-overlay');
                          return o?getComputedStyle(o).display:'(なし)'; })()
  };
})();`;

// スロット内の実画素を格子状に読む（落とし穴6）
// ★ 中心1点だけだと**文字グリフに当たって偽陰性**になる（実測: 重複の2行文言で 36/78 セルが誤検出）。
//   格子で採って「面色が過半」を見る。覆われている場合は 0 になる。
async function slotFace(page) {
  const box = await page.evaluate(`(function(){
    var s=document.getElementById('bulk-err'); if(!s)return null;
    var b=s.getBoundingClientRect();
    if(b.width<=2||b.height<=2)return null;
    return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)};
  })()`);
  if (!box) return { total: 0, face: 0 };
  const buf = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
  const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
  return await page.evaluate(`(function(){
    return new Promise(function(res){
      var img=new Image();
      img.onload=function(){
        var c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
        var g=c.getContext('2d'); g.drawImage(img,0,0);
        var total=0, face=0;
        for(var i=1;i<=7;i++){
          for(var j=1;j<=5;j++){
            var x=Math.round(img.width*i/8), y=Math.round(img.height*j/6);
            var d=g.getImageData(x,y,1,1).data;
            total++;
            if(Math.abs(d[0]-${FACE.r})<=2 && Math.abs(d[1]-${FACE.g})<=2 && Math.abs(d[2]-${FACE.b})<=2)face++;
          }
        }
        res({total:total,face:face});
      };
      img.onerror=function(){ res({total:0,face:0}); };
      img.src=${JSON.stringify(dataUrl)};
    });
  })()`);
}
const faceMajority = (r) => !!r && r.total > 0 && r.face * 2 > r.total;

async function openModal(page, n, nameLen, vv) {
  await page.goto(TARGET);
  await page.waitForFunction(() => typeof save === 'function');
  await page.evaluate(mk(n, nameLen));
  if (vv) await page.evaluate(stubVV(vv.h, vv.top));
  await page.evaluate(() => bulkEditNames('A'));
  await page.waitForTimeout(60);
}
// ★ 変異でモーダルが消えている場合でも、ハーネスは例外死せず「赤いだけ」で終わること。
//   #881 の2巡目で「ハーネスの TypeError を kill と誤認していた」実例があるので、
//   操作系はすべて存在チェックしてから触る。
async function setNames(page, fn) {
  await page.evaluate(`(function(){
    var is=document.querySelectorAll('[id^="bulk-name-"]');
    if(!is.length)return false;
    (${fn})(is);
    return true;
  })()`);
}
async function clickSave(page) {
  const has = await page.evaluate(`!!document.getElementById('bulk-save')`);
  if (has) await page.click('#bulk-save');
  await page.waitForTimeout(120);
}
async function triggerEmpty(page) {
  await setNames(page, "function(is){ is[is.length-1].value=''; }");
  await clickSave(page);
}
async function triggerDup(page) {
  await setNames(page, "function(is){ is[0].value='かぶり'; is[is.length-1].value='かぶり'; }");
  await clickSave(page);
}

(async () => {
  const browser = await chromium.launch();
  console.log('E2E-BULK-EDIT-INLINE-ERROR-887');
  console.log('  対象: ' + TARGET);

  // ---- A. 基本（375×667・4名）------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    const alerts = [], errs = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.dismiss(); });
    page.on('pageerror', e => errs.push(String(e)));
    await openModal(page, 4);
    const before = await page.evaluate(probe);
    ok(before.hidden === true, '[A1] 開いた直後はスロットが hidden');
    ok(before.role === 'alert' && before.ariaLive === 'assertive', '[A2] role=alert / aria-live=assertive');
    await triggerEmpty(page);
    const r = await page.evaluate(probe);
    ok(r.hidden === false, '[A3] 保存を押すとスロットが出る');
    ok(r.文言 === 'A04 の名前が空です。\n名前を入力してから保存してください。', '[A4] B1 の文言（entry_no ＋ 次の行動）: ' + JSON.stringify(r.文言));
    ok(r.見出し === '⚠ 変更を保存しませんでした', '[A5] 見出し語がある（色だけに意味を載せない）');
    ok(r.面色 === 'rgb(253, 236, 234)', '[A6] danger 面色 #fdecea: ' + r.面色);
    ok(alerts.length === 0, '[A7] native alert は1件も出ない（実測 ' + alerts.length + '件）');
    ok(r.slot可視, '[A8] スロットがカード可視域に完全に収まる');
    ok(r.btn可視, '[A9] 操作ボタンも見える');
    ok(!r.横はみ出し, '[A10] カードに横スクロールが生えていない');
    const px = await slotFace(page);
    ok(faceMajority(px), '[A11] ★スロットの実画素が #fdecea（格子採取の過半）: ' + JSON.stringify(px));
    // 直し始めたら消える
    await setNames(page, "function(is){ is[is.length-1].value='な'; is[is.length-1].dispatchEvent(new Event('input',{bubbles:true})); }");
    await page.waitForTimeout(60);
    const r2 = await page.evaluate(probe);
    ok(r2.hidden === true, '[A12] input で消える');
    ok(r2.文言 === '', '[A13] 本文も空になる');
    ok(errs.length === 0, '[A14] 未捕捉例外なし');
    await page.close();
  }

  // ---- B. 重複（entry_no 欠番あり）------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.dismiss(); });
    await page.goto(TARGET); await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(`(function(){
      var P=[{id:'p1',name:'一郎',entry_no:1,member:'member',grade:'ippan'},
             {id:'p3',name:'三郎',entry_no:3,member:'member',grade:'ippan'},
             {id:'p5',name:'五郎',entry_no:5,member:'member',grade:'ippan'}];
      state={players:{A:P,B:[]},rounds:4,results:{A:[],B:[]},pairings:{A:[],B:[]},started:false,
        classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],report:{}};
      save(); showTab('register'); renderRegList();
    })();`);
    await page.evaluate(() => bulkEditNames('A'));
    await page.waitForTimeout(60);
    const labels = await page.evaluate(`Array.prototype.map.call(document.querySelectorAll('#bulk-edit-modal span'),function(s){return s.textContent;}).filter(function(t){return /^A\\d\\d$/.test(t);})`);
    ok(JSON.stringify(labels) === '["A01","A03","A05"]', '[B1] 欠番のある行ラベル: ' + JSON.stringify(labels));
    await setNames(page, "function(is){ is[2].value=''; }");
    await clickSave(page);
    const r = await page.evaluate(probe);
    // ★ 作者裁定（§5.1）: 画面の行ラベルと一致すること。配列 index の「3番目」ではない
    ok((r.文言||'').indexOf('A05 の名前が空です。') === 0, '[B2] ★欠番があっても画面のラベルと一致（A05）: ' + JSON.stringify((r.文言||'').split('\n')[0]));
    ok((r.文言||'').indexOf('3番目') < 0 && r.文言 !== null, '[B3] 配列 index の「3番目」は使わない');
    // 重複
    await setNames(page, "function(is){ is[2].value='一郎'; is[2].dispatchEvent(new Event('input',{bubbles:true})); }");
    await clickSave(page);
    const r2 = await page.evaluate(probe);
    ok(r2.文言 === '"一郎"が重複しています。\n別の名前に直してください。', '[B4] B2 の文言: ' + JSON.stringify(r2.文言));
    ok(alerts.length === 0, '[B5] native alert は1件も出ない');
    ok(r2.slot可視, '[B6] スロットが見える');
    await page.close();
  }

  // ---- C. 78セル（人数 × viewport × キーボード × 空欄/重複）------------------
  {
    let cells = 0, slotNG = 0, btnNG = 0, otherNG = 0, pxNG = 0;
    const btnNGCells = {};
    for (const kb of [0, 216, 300]) {
      for (const vp of [{ w: 375, h: 667 }, { w: 375, h: 440 }]) {
        for (const n of [1, 2, 4, 8, 16, 32, 64]) {
          for (const kind of ['空欄', '重複']) {
            if (kind === '重複' && n < 2) continue;
            const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
            const alerts = [], errs = [];
            page.on('dialog', async d => { alerts.push(d.message()); await d.dismiss(); });
            page.on('pageerror', e => errs.push(String(e)));
            await openModal(page, n, 0, kb ? { h: vp.h - kb, top: 0 } : null);
            if (kind === '空欄') await triggerEmpty(page); else await triggerDup(page);
            const r = await page.evaluate(probe);
            cells++;
            if (!r.slot可視) { slotNG++; console.log('    slotNG ' + JSON.stringify({ kb, vp: vp.w + 'x' + vp.h, n, kind, slot: r.slot, card: r.card })); }
            if (!r.btn可視) { btnNG++; btnNGCells['kb=' + kb + ' ' + vp.w + 'x' + vp.h] = 1; }
            if (alerts.length || errs.length || r.横はみ出し) { otherNG++; console.log('    otherNG ' + JSON.stringify({ kb, vp: vp.w + 'x' + vp.h, n, kind, alerts: alerts.length, errs: errs.length, x: r.横はみ出し })); }
            const px = await slotFace(page);
            if (!faceMajority(px)) { pxNG++; console.log('    pxNG ' + JSON.stringify({ kb, vp: vp.w + 'x' + vp.h, n, kind, px })); }
            await page.close();
          }
        }
      }
    }
    ok(cells === 78, '[C0] 78セルを測った（実測 ' + cells + '）');
    ok(slotNG === 0, '[C1] 全セルでスロットが完全に見える（NG ' + slotNG + '）');
    ok(pxNG === 0, '[C2] ★全セルでスロット中心の実画素が #fdecea（NG ' + pxNG + '）');
    ok(otherNG === 0, '[C3] alert / 未捕捉例外 / 横はみ出しがゼロ（NG ' + otherNG + '）');
    // ★ ボタン行は best-effort。可視域 140px では幾何的に不可能（スロット78.5＋間隔16＋ボタン44＋padding48＝186.5）
    ok(btnNG === 13 && Object.keys(btnNGCells).length === 1 && btnNGCells['kb=300 375x440'],
      '[C4] ボタン行が隠れるのは可視域140pxの1族のみ（実測 ' + btnNG + '件 / ' + JSON.stringify(Object.keys(btnNGCells)) + '）');
  }

  // ---- D. キーボードが「後から」出る/消える/スクロールする -------------------
  {
    for (const vp of [{ w: 375, h: 667 }, { w: 375, h: 440 }]) {
      for (const kb of [216, 300]) {
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await openModal(page, 16, 0, { h: vp.h, top: 0 });   // 先にキーボード無しで開く
        await triggerEmpty(page);
        const r0 = await page.evaluate(probe);
        ok(r0.slot可視, '[D1-' + vp.h + '-' + kb + '] キーボード前は見える');
        await page.evaluate(setVV(vp.h - kb, 0));            // ★ 後からキーボードが出る
        await page.waitForTimeout(120);
        const r1 = await page.evaluate(probe);
        ok(r1.slot可視, '[D2-' + vp.h + '-' + kb + '] ★後から出ても見える（resize 追従）: ' + JSON.stringify(r1.slot) + ' card=' + JSON.stringify(r1.card));
        await page.evaluate(setVV(vp.h - kb, 60, 'scroll')); // ★ キーボード表示中にスクロール（scroll イベントで）
        await page.waitForTimeout(120);
        const r2 = await page.evaluate(probe);
        ok(r2.slot可視, '[D3-' + vp.h + '-' + kb + '] ★スクロールしても見える（scroll 追従）');
        await page.evaluate(setVV(vp.h, 0));                 // ★ キーボードが消える
        await page.waitForTimeout(120);
        const r3 = await page.evaluate(probe);
        ok(r3.inline.alignSelf === '' && r3.inline.marginTop === '' && r3.inline.maxHeight === '',
          '[D4-' + vp.h + '-' + kb + '] ★消えたらカード幾何がベースへ復帰（固着しない）: ' + JSON.stringify(r3.inline));
        await page.close();
      }
    }
  }

  // ---- E. キーボード非活性時は1pxも変えない ---------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await openModal(page, 16);
    const beforeRect = await page.evaluate(`(function(){var m=document.getElementById('bulk-edit-modal'); if(!m)return null; var c=m.firstElementChild; if(!c)return null;
      var r=c.getBoundingClientRect();return {t:+r.top.toFixed(1),b:+r.bottom.toFixed(1)};})()`);
    await triggerEmpty(page);
    const r = await page.evaluate(probe);
    ok(r.inline.alignSelf === '' && r.inline.marginTop === '' && r.inline.maxHeight === '',
      '[E1] キーボード無しでは inline style を1つも足さない: ' + JSON.stringify(r.inline));
    ok(!!r.card && !!beforeRect && r.card.t === beforeRect.t, '[E2] カード上端がエラー前後で不変（' + JSON.stringify(beforeRect) + ' → ' + JSON.stringify(r.card) + '）');
    await page.close();
  }

  // ---- F. visualViewport 非対応（fail-soft）----------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 440 } });
    await page.goto(TARGET); await page.waitForFunction(() => typeof save === 'function');
    await page.evaluate(`Object.defineProperty(window,'visualViewport',{configurable:true,value:undefined});`);
    await page.evaluate(mk(16, 0));
    await page.evaluate(() => bulkEditNames('A')); await page.waitForTimeout(60);
    await triggerEmpty(page);
    const r = await page.evaluate(probe);
    ok(r.slot可視, '[F1] visualViewport 非対応でもスロットが見える');
    ok(r.inline.maxHeight === '', '[F2] 非対応環境では maxHeight を触らない（fail-soft）');
    await page.close();
  }

  // ---- G. 長い氏名（分割機会なし）-------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 440 } });
    await openModal(page, 4, 49);
    await triggerDup(page);
    const r = await page.evaluate(probe);
    ok(!r.横はみ出し, '[G1] ★英字49文字の氏名でもカードに横スクロールが生えない（overflow-wrap:anywhere）');
    ok(r.slot可視, '[G2] 長い氏名でもスロットが収まる');
    await page.close();
  }

  // ---- H. 器が無いときの fail-safe ------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.dismiss(); });
    await openModal(page, 4);
    await page.evaluate(`(function(){ var s=document.getElementById('bulk-err'); if(s&&s.parentNode)s.parentNode.removeChild(s); })()`);
    await triggerEmpty(page);
    ok(alerts.length === 1, '[H1] 器が無ければ alert に落とす（fail-safe）: ' + alerts.length + '件');
    await page.close();
  }

  // ---- SELF. 落とし穴6の画素検査そのものを検査する ---------------------------
  //   ★ 375×667 / 375×440 では #rotate-overlay が発火しないので、画素検査は「死に検査」になり得る。
  //     発火するセル（幅 > 高さ かつ 幅 ≤ 900）で、**覆いを画素で検出できる**ことを確かめる。
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 374 } });
    await openModal(page, 4);
    await page.evaluate(`(function(){ var s=document.getElementById('bulk-err'); if(!s)return; s.hidden=false;
      var b=s.querySelector('.bulk-err-body'); if(b)b.textContent='x'; })()`);
    await page.waitForTimeout(60);
    const r = await page.evaluate(probe);
    ok(r.overlay === 'flex', '[SELF1] 375×374 で #rotate-overlay が発火する（幅>高さ）: ' + r.overlay);
    const px = await slotFace(page);
    ok(px.face === 0, '[SELF2] ★覆われているとき面色の画素が1点も無い＝この検査は生きている: ' + JSON.stringify(px));
    await page.close();
    const page2 = await browser.newPage({ viewport: { width: 375, height: 375 } });
    await openModal(page2, 4);
    const r2 = await page2.evaluate(probe);
    ok(r2.overlay === 'none', '[SELF3] 375×375（正方形）は portrait 扱いで発火しない（「幅≥高さ」ではない）: ' + r2.overlay);
    await page2.close();
  }

  await browser.close();
  console.log('');
  console.log('E2E-BULK-EDIT-INLINE-ERROR-887: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
