#!/usr/bin/env node
// Playwright E2E: BULK-EDIT-ALL-ERRORS-001 (#889)
//   名前一括編集の入力エラーを「最初の1件」から**全件**へ広げた。
//   器（画面内スロット・§3 N5・pre-line）は #887 で入っている。ここで測るのは中身の方。
//
// ★ この便で固定する命題:
//   1. 空欄が複数あれば **全件の行ラベル**が1回の表示で出る（16名中5名 → 5件）
//   2. 重複は **どの行どうしか**が出る。相手が他クラスなら **クラス付き**（B01）
//   3. 空欄と重複が同時なら **両方**出る（保存し直しが1回で済む）
//   4. ★ 空欄の行は重複の相手から外れる ＝「埋めれば消える重複」を報告しない
//   5. ★ **拒否する条件は不変**。正常な入力は従来どおり保存できる（#887 の A/B 系は別便で固定）
//   6. 32名全員が空欄でも、スロットが .bulk-card（max-height:80vh）の**中に収まって読める**
//
// ★ 測り方の注意（#887 から継承）:
//   - rect だけ見ると overflow-y:auto に騙される → カードの可視 rect ⊂ 判定と幅高さ>0 を併用
//   - native alert が1件でも出たら失敗（#887 の成果を退行させない）
//   - 未捕捉例外は「検査の失敗」であって kill ではない
//
// 使い方: node test/e2e/bulk_all_errors_889.e2e.js [shogi_v4.html or URL]
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

// A クラス n 名 ＋ B クラス bNames（既定なし）を仕込む
const seed = (n, bNames) => `(function(){
  var A=[];
  for(var i=1;i<=${n};i++)A.push({id:'a'+i,name:'選手'+i,entry_no:i,member:'member',grade:'ippan'});
  var B=[];
  var bn=${JSON.stringify(bNames || [])};
  for(var k=0;k<bn.length;k++){
    var rec={id:'b'+(k+1),entry_no:k+1,member:'member',grade:'ippan'};
    // ★ null を渡したときは **name を持たないレコード**にする（E9 用）。
    if(bn[k]!==null)rec.name=bn[k];
    B.push(rec);
  }
  state={players:{A:A,B:B},rounds:4,results:{A:[],B:[]},pairings:{A:[],B:[]},started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],report:{}};
  save(); showTab('register'); renderRegList();
})();`;

const probe = `(function(){
  var slot=document.getElementById('bulk-err');
  if(!slot)return {なし:true,hidden:null,文言:null,slot可視:false,モーダル:false};
  var cardEl=slot.parentNode;
  var cr=cardEl.getBoundingClientRect(), er=slot.getBoundingClientRect();
  var body=slot.querySelector('.bulk-err-body');
  var vv=window.visualViewport;
  var vTop=vv?vv.offsetTop:0, vBot=vv?(vv.offsetTop+vv.height):innerHeight;
  return {
    hidden: slot.hidden,
    文言: body?body.textContent:null,
    行数: body?body.textContent.split('\\n').length:0,
    slot可視: er.top>=cr.top-0.5 && er.bottom<=cr.bottom+0.5 && er.top>=vTop-0.5 && er.bottom<=vBot+0.5
              && er.width>0 && er.height>0,
    横はみ出し: cardEl.scrollWidth>cardEl.clientWidth+1,
    モーダル: !!document.getElementById('bulk-edit-modal')
  };
})()`;

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
async function openA(page, n, bNames) {
  await page.goto(TARGET);
  await page.waitForFunction(() => typeof save === 'function');
  await page.evaluate(seed(n, bNames));
  await page.evaluate(() => bulkEditNames('A'));
  await page.waitForTimeout(60);
}

(async () => {
  const browser = await chromium.launch();
  console.log('E2E-BULK-EDIT-ALL-ERRORS-889');
  console.log('  対象: ' + TARGET);

  const alerts = [], errs = [];
  const newPage = async () => {
    const p = await browser.newPage({ viewport: { width: 375, height: 667 } });
    p.on('dialog', async d => { alerts.push(d.message()); await d.dismiss(); });
    p.on('pageerror', e => errs.push(String(e)));
    return p;
  };

  // ---- E1. 16名中5名が空欄 → 全件が1回で出る --------------------------------
  {
    const page = await newPage();
    await openA(page, 16);
    // 1・4・7・12・16 番目（0-origin では 0,3,6,11,15）を空にする
    await setNames(page, "function(is){ [0,3,6,11,15].forEach(function(k){ is[k].value=''; }); }");
    await clickSave(page);
    const r = await page.evaluate(probe);
    const 先頭行 = (r.文言 || '').split('\n')[0];
    ok(r.hidden === false, '[E1a] スロットが出る');
    ok(先頭行 === 'A01 / A04 / A07 / A12 / A16 の名前が空です。',
       '[E1b] ★空欄5件が全部・行ラベルで・並び順どおり: ' + JSON.stringify(先頭行));
    ok((r.文言 || '').indexOf('名前を入力してから保存してください。') > 0, '[E1c] 次の行動がある');
    ok(r.モーダル === true, '[E1d] 保存は拒否されたまま（モーダルが残る）');
    await page.close();
  }

  // ---- E2. 重複が2組 → 2組とも、どの行どうしかが出る ------------------------
  {
    const page = await newPage();
    await openA(page, 6);
    // A02→'甲'（A01 と衝突）, A05→'乙'（A04 と衝突）
    await setNames(page, "function(is){ is[0].value='甲'; is[1].value='甲'; is[3].value='乙'; is[4].value='乙'; }");
    await clickSave(page);
    const r = await page.evaluate(probe);
    const t = r.文言 || '';
    ok(t.indexOf('A01 と A02 の "甲" が重複しています。') >= 0, '[E2a] 1組目が行つきで出る: ' + JSON.stringify(t));
    ok(t.indexOf('A04 と A05 の "乙" が重複しています。') >= 0, '[E2b] 2組目も出る');
    ok(t.indexOf('別の名前に直してください。') > 0, '[E2c] 次の行動がある');
    // ★ 同じ組を i/j 入れ替えで2回出さない
    ok(t.split('"甲"').length - 1 === 1, '[E2d] ★同じ組は1回だけ（入れ替えで二重に出さない）');
    await page.close();
  }

  // ---- E3. 他クラスとの重複はクラス付きで名指しする -------------------------
  {
    const page = await newPage();
    await openA(page, 3, ['丙', '丁']);
    await setNames(page, "function(is){ is[2].value='丁'; }");   // A03 が B02 と衝突
    await clickSave(page);
    const r = await page.evaluate(probe);
    ok((r.文言 || '').indexOf('A03 と B02 の "丁" が重複しています。') >= 0,
       '[E3a] ★相手が他クラスならクラス付き（B02）: ' + JSON.stringify(r.文言));
    await page.close();
  }

  // ---- E4. 空欄と重複が同時 → 両方出る --------------------------------------
  {
    const page = await newPage();
    await openA(page, 5);
    await setNames(page, "function(is){ is[4].value=''; is[0].value='戊'; is[1].value='戊'; }");
    await clickSave(page);
    const r = await page.evaluate(probe);
    const t = r.文言 || '';
    ok(t.indexOf('A05 の名前が空です。') >= 0, '[E4a] 空欄が出る');
    ok(t.indexOf('A01 と A02 の "戊" が重複しています。') >= 0, '[E4b] 重複も同時に出る');
    ok(t.indexOf('名前を入力してから保存してください。') > 0 && t.indexOf('別の名前に直してください。') > 0,
       '[E4c] 次の行動が両方ある');
    await page.close();
  }

  // ---- E5. ★空欄の行は重複の相手から外れる ----------------------------------
  //   A03 を空にし、A05 に A03 の**元の名前**を入れる。旧名で照合すると
  //   「A03 と A05 が重複」と出てしまうが、A03 を埋めれば消える重複なので出してはいけない。
  {
    const page = await newPage();
    await openA(page, 5);
    await setNames(page, "function(is){ is[2].value=''; is[4].value='選手3'; }");
    await clickSave(page);
    const r = await page.evaluate(probe);
    const t = r.文言 || '';
    ok(t.indexOf('A03 の名前が空です。') >= 0, '[E5a] 空欄は出る');
    ok(t.indexOf('重複') < 0, '[E5b] ★空欄の行を相手にした偽の重複を出さない: ' + JSON.stringify(t));
    ok(r.モーダル === true, '[E5c] 拒否は変わらない（空欄があるので保存しない）');
    await page.close();
  }

  // ---- E6. 拒否する条件は不変（正常な入力は保存できる）----------------------
  {
    const page = await newPage();
    await openA(page, 4);
    await setNames(page, "function(is){ is[0].value='新一'; is[1].value='新二'; is[2].value='新三'; is[3].value='新四'; }");
    await clickSave(page);
    const r = await page.evaluate(probe);
    ok(r.モーダル === false, '[E6a] ★問題が無ければ従来どおり保存できる（モーダルが閉じる）');
    const names = await page.evaluate(`state.players.A.map(function(p){return p.name;}).join(',')`);
    ok(names === '新一,新二,新三,新四', '[E6b] 保存内容が入っている: ' + names);
    await page.close();
  }

  // ---- E7. 32名全員が空欄でもカードの中に収まって読める（受け入れ基準6）-----
  {
    const page = await newPage();
    await openA(page, 32);
    await setNames(page, "function(is){ for(var k=0;k<is.length;k++)is[k].value=''; }");
    await clickSave(page);
    const r = await page.evaluate(probe);
    const 先頭行 = (r.文言 || '').split('\n')[0];
    ok(先頭行.indexOf('A01 / A02 /') === 0 && 先頭行.indexOf('A32 の名前が空です。') > 0,
       '[E7a] 32件を省略せず全部出す: ' + JSON.stringify(先頭行.slice(0, 40) + '…'));
    ok(r.slot可視 === true, '[E7b] ★スロットがカードの可視域に収まって読める（80vh の内側）');
    ok(r.横はみ出し === false, '[E7c] 横スクロールが生えない');
    await page.close();
  }

  // ---- E9. ★名前を持たないレコードと空欄の行を undefined 同士で一致させない ---
  //   #889 以前は「空欄があれば重複判定へ進まない」ので、この照合は起こり得なかった。
  //   全件報告にしたことで**新たに生まれた経路**なので、ここで閉じておく。
  {
    const page = await newPage();
    await openA(page, 3, [null]);              // B01 は name を持たない
    await setNames(page, "function(is){ is[2].value=''; }");   // A03 を空に
    await clickSave(page);
    const r = await page.evaluate(probe);
    const t = r.文言 || '';
    ok(t.indexOf('A03 の名前が空です。') >= 0, '[E9a] 空欄は出る');
    ok(t.indexOf('重複') < 0 && t.indexOf('undefined') < 0,
       '[E9b] ★undefined 同士の偽の重複を出さない: ' + JSON.stringify(t));
    await page.close();
  }

  // ---- E8. 退行なし ---------------------------------------------------------
  ok(alerts.length === 0, '[E8a] native alert は1件も出ない: ' + JSON.stringify(alerts));
  ok(errs.length === 0, '[E8b] 未捕捉例外なし: ' + JSON.stringify(errs));

  await browser.close();
  console.log('  結果: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('E2E ERROR: ' + e); process.exit(1); });
