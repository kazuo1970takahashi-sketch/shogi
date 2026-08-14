#!/usr/bin/env node
// Playwright E2E: WITHDRAWN-CHANGE-PAIRING-001 (#836)
//   対戦相手変更モーダルの候補に棄権者が「選択可能」で出て、選ぶと確認も出ずに卓へ入り
//   localStorage まで保存されていた（production `e602fdb` で実測）。
//   generatePairing は withdrawn を除外しているのに、このモーダルだけが除外していなかった＝非対称。
//
// ★ 候補から「消す」のではなく blocked にした理由（実測した事故・W2 で pin する）:
//   toggleWithdrawn は state.pairings から棄権者を外さないので「棄権者が卓に入ったまま」は普通に起きる。
//   その状態で option を消すと select の現在値が先頭候補へすり替わり、
//   モーダルを開いただけで保存すると別人に差し替わる。
//
// ★ __setAppModalTestResolver は仕込まない。確認は #app-modal / .app-modal-ok を実クリック。
//
// 使い方: node test/e2e/chg_modal_withdrawn_836.e2e.js [shogi_v4.html or URL]
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  const alerts = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => { alerts.push(d.message()); d.accept().catch(() => {}); });

  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof changePairing === 'function', null, { timeout: 15000 });

  // 6名2卓・p5 は棄権（待機側）。p2 は「卓に入ったまま棄権」（W2 用に別途構築）
  const setup = (withdrawnIds) => `(function(){
    try{ closeChangePairingModal(); }catch(e){}
    var players=[];
    for(var i=1;i<=6;i++)players.push({id:'p'+i,name:'選手'+i,entry_no:i,member:'member',grade:'ippan'});
    var wd=${JSON.stringify(withdrawnIds)};
    for(var j=0;j<players.length;j++)if(wd.indexOf(players[j].id)>=0)players[j].withdrawn=true;
    state={players:{A:players,B:[]},rounds:4,results:{A:[],B:[]},
      pairings:{A:[{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'},
                   {p1:'p3',p2:'p4',winner:null,lastModifiedBy:'auto'}],B:[]},
      started:true,classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}};
    save(); showTab('tournament'); renderTournament('A');
  })()`;

  // ---------------------------------------------------------------- W0 実装の存在
  ok(await page.evaluate(() => typeof isWithdrawnPlayer === 'function'), '[W0] 棄権判定の helper がロードされている');

  // ---------------------------------------------------------------- W1 棄権者は選べない・理由が出る
  await page.evaluate(setup(['p5']));
  await page.waitForTimeout(150);
  const scan = await page.evaluate(() => {
    const out = { selects: 0, present: 0, disabled: 0, labeled: 0, inBlockedGroup: 0, reasonIds: {}, sample: null };
    for (let idx = 0; idx < state.pairings.A.length; idx++) {
      for (const role of ['p1', 'p2']) {
        changePairing('A', idx);
        const sel = document.getElementById(role === 'p1' ? 'chg-p1' : 'chg-p2');
        out.selects++;
        const o = Array.from(sel.options).find(x => x.value === 'p5');
        if (o) {
          out.present++;
          if (o.disabled) out.disabled++;
          if (/棄権/.test(o.textContent || '')) out.labeled++;
          const g = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null;
          if (g === '選択できない候補') out.inBlockedGroup++;
          const rid = o.getAttribute('data-reason-id');
          out.reasonIds[rid] = (out.reasonIds[rid] || 0) + 1;
          if (!out.sample) out.sample = { label: o.textContent, group: g, reasonId: rid };
        }
        closeChangePairingModal();
      }
    }
    return out;
  });
  ok(scan.selects === 4 && scan.present === 4, '[W1-0] 4つの select すべてに棄権者の行がある（消していない）');
  ok(scan.disabled === 4, '[W1-1] ★ 棄権者は全 select で選べない  [' + scan.disabled + '/4]');
  ok(scan.labeled === 4, '[W1-2] ★ 行に「棄権」と理由が出る  [' + (scan.sample && scan.sample.label) + ']');
  ok(scan.inBlockedGroup === 4, '[W1-3] 「選択できない候補」グループに入る');
  ok(scan.reasonIds['R-withdrawn'] === 4, '[W1-4] reasonId が R-withdrawn  [' + JSON.stringify(scan.reasonIds) + ']');

  // 対照: 棄権を外すと同じ候補が「選択可能」に戻る（＝一律 blocked にしたのではない）
  await page.evaluate(setup([]));
  await page.waitForTimeout(120);
  const control = await page.evaluate(() => {
    changePairing('A', 0);
    const sel = document.getElementById('chg-p1');
    const o = Array.from(sel.options).find(x => x.value === 'p5');
    const r = { disabled: o ? o.disabled : null, group: o && o.parentElement ? o.parentElement.label : null };
    closeChangePairingModal();
    return r;
  });
  ok(control.disabled === false && control.group === '選択可能',
     '[W1-5] ★ 対照: 棄権を外すと同じ候補が「選択可能」に戻る  [' + JSON.stringify(control) + ']');

  // ---------------------------------------------------------------- W2 卓に入ったまま棄権 → 現在値がすり替わらない
  await page.evaluate(setup(['p2']));   // p2 は1卓目の後手で、かつ棄権
  await page.waitForTimeout(150);
  const keep = await page.evaluate(() => {
    changePairing('A', 0);
    const sel2 = document.getElementById('chg-p2');
    const o = Array.from(sel2.options).find(x => x.value === 'p2');
    const r = {
      現在値: sel2.value,
      本人の行が残っている: !!o,
      本人は選べる: o ? !o.disabled : null,
      本人のグループ: o && o.parentElement ? o.parentElement.label : null,
      // 相手側 select（p1 役）から見ると p2 は「同じ選手」で従来どおり blocked
      p1側でのp2: (function () {
        const s1 = document.getElementById('chg-p1');
        const x = Array.from(s1.options).find(y => y.value === 'p2');
        return x ? { disabled: x.disabled, reason: x.getAttribute('data-reason-id') } : null;
      })()
    };
    closeChangePairingModal();
    return r;
  });
  ok(keep.現在値 === 'p2', '[W2-1] ★ 卓に入ったまま棄権した選手が現在値のとき、select の現在値が変わらない  [' + keep.現在値 + ']');
  ok(keep.本人の行が残っている && keep.本人は選べる === true && keep.本人のグループ === '選択可能',
     '[W2-2] ★ 現在値の本人は「選択可能」のまま（消すと開いた瞬間に別人へすり替わる）  [' + JSON.stringify(keep) + ']');
  ok(keep.p1側でのp2 && keep.p1側でのp2.disabled === true,
     '[W2-3] 反対側の役から見ると従来どおり blocked  [' + JSON.stringify(keep.p1側でのp2) + ']');

  // ---------------------------------------------------------------- W3 保存側でも弾く（境界）
  await page.evaluate(setup(['p5']));
  await page.waitForTimeout(150);
  const beforeSave = await page.evaluate(() => state.pairings.A.map(m => m.p1 + 'v' + m.p2));
  alerts.length = 0;
  await page.evaluate(() => {
    changePairing('A', 0);
    // UI では選べないので、境界検査として value を強制代入してから保存を押す
    document.getElementById('chg-p1').value = 'p5';
    document.getElementById('chg-save').click();
  });
  await page.waitForTimeout(400);
  const afterSave = await page.evaluate(() => {
    let s = null; try { s = JSON.parse(localStorage.getItem('shogi_v4') || 'null'); } catch (e) {}
    const sel = document.getElementById('chg-p1');
    return { pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
             saved: s && s.pairings ? (s.pairings.A || []).map(m => m.p1 + 'v' + m.p2) : null,
             selectValue: sel ? sel.value : null,
             appModal: !!document.getElementById('app-modal') };
  });
  ok(JSON.stringify(afterSave.pairs) === JSON.stringify(beforeSave),
     '[W3-1] ★ 強制代入して保存しても棄権者は卓に入らない  [' + afterSave.pairs.join(', ') + ']');
  ok(JSON.stringify(afterSave.saved) === JSON.stringify(beforeSave), '[W3-2] localStorage も変わらない');
  ok(alerts.some(a => /棄権/.test(a)), '[W3-3] 棄権だと分かる文言が出る  [' + (alerts[0] || '(なし)').replace(/\n/g, ' ').slice(0, 40) + ']');
  ok(afterSave.selectValue === 'p1', '[W3-4] 選択が元に戻る（失敗した選択が残らない）  [' + afterSave.selectValue + ']');
  ok(!afterSave.appModal, '[W3-5] 確認モーダルまで進まない（1バイトも書く前に止まる）');
  await page.evaluate(() => { try { closeChangePairingModal(); } catch (e) {} });

  // ---------------------------------------------------------------- W4 対照: 通常の入れ替えは従来どおり
  await page.evaluate(setup([]));
  await page.waitForTimeout(150);
  await page.evaluate(() => { changePairing('A', 0); document.getElementById('chg-p1').value = 'p3'; document.getElementById('chg-save').click(); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.getElementById('app-modal')), '[W4-1] 対照: 通常の入れ替えは確認モーダルが出る');
  await page.evaluate(() => { const b = document.querySelector('#app-modal .app-modal-ok'); if (b) b.click(); });
  await page.waitForTimeout(400);
  const applied = await page.evaluate(() => {
    let s = null; try { s = JSON.parse(localStorage.getItem('shogi_v4') || 'null'); } catch (e) {}
    return { pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
             saved: s && s.pairings ? (s.pairings.A || []).map(m => m.p1 + 'v' + m.p2) : null };
  });
  ok(applied.pairs[0] === 'p3vp2' && applied.saved && applied.saved[0] === 'p3vp2',
     '[W4-2] 対照: 入れ替えが反映され保存される  [' + applied.pairs.join(', ') + ']');

  // ---------------------------------------------------------------- W5 複数の並びで W1 が成り立つ（1 fixture 依存にしない）
  const many = await page.evaluate(() => {
    let seed = 20260813;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let draws = 0, checked = 0, bad = 0, withdrawnSeen = 0, asCurrent = 0, asOther = 0, badDetail = null;
    for (let d = 0; d < 10; d++) {
      const n = 6 + (d % 5);                       // 6〜10名
      const players = [];
      for (let i = 1; i <= n; i++) players.push({ id: 'q' + i, name: '選手' + i, entry_no: i, member: 'member', grade: 'ippan' });
      const wIdx = Math.floor(rnd() * n);
      players[wIdx].withdrawn = true;
      const pairs = [];
      for (let i = 0; i + 1 < n; i += 2) pairs.push({ p1: players[i].id, p2: players[i + 1].id, winner: null, lastModifiedBy: 'auto' });
      state = { players: { A: players, B: [] }, rounds: 4, results: { A: [], B: [] },
        pairings: { A: pairs, B: [] }, started: true,
        classes: [{ id: 'A', name: 'Aクラス', started: true }, { id: 'B', name: 'Bクラス', started: false }], report: {} };
      draws++;
      for (let idx = 0; idx < pairs.length; idx++) {
        for (const role of ['p1', 'p2']) {
          const wid = players[wIdx].id;
          const cur = (role === 'p1') ? pairs[idx].p1 : pairs[idx].p2;
          const other = (role === 'p1') ? pairs[idx].p2 : pairs[idx].p1;
          const c = classifyChangePairingCandidate('A', idx, wid, role);
          checked++;
          // 3ケースを明示的に検査する（skip しない＝空回りを作らない）
          let expected;
          if (wid === cur) { expected = 'ok:null'; asCurrent++; }            // 現在値の本人は ok（消さない）
          else if (wid === other) { expected = 'blocked:R-self'; asOther++; } // 同じ卓の反対側は従来どおり
          else { expected = 'blocked:R-withdrawn'; withdrawnSeen++; }        // それ以外は棄権で塞ぐ
          const actual = c.status + ':' + (c.reasonId === null ? 'null' : c.reasonId);
          if (actual !== expected) { bad++; if (!badDetail) badDetail = { expected: expected, actual: actual, wid: wid, idx: idx, role: role }; }
        }
      }
    }
    return { draws, checked, withdrawnSeen, asCurrent, asOther, bad, badDetail };
  });
  ok(many.draws === 10 && many.withdrawnSeen > 0 && many.asCurrent > 0 && many.asOther > 0,
     '[W5-0] 10 draw で3ケースすべてを実測（棄権で塞ぐ ' + many.withdrawnSeen + ' / 現在値本人 ' + many.asCurrent +
     ' / 同卓の反対側 ' + many.asOther + '）※どれかが0なら空回り＝失敗');
  ok(many.bad === 0, '[W5-1] ★ 全 ' + many.checked + ' 件が期待どおり（棄権=R-withdrawn / 現在値=ok / 反対側=R-self）  [不一致 ' +
     many.bad + '件' + (many.badDetail ? ' 例:' + JSON.stringify(many.badDetail) : '') + ']');

  // ---------------------------------------------------------------- W6 棄権者を「残したまま」相手だけ替える経路
  //   Codex P1 (r3781236918)。修正前は確認も警告も出ずに {棄権者, 現役} が保存された（実測 p1vp5）。
  await page.evaluate(setup(['p1']));      // p1 は卓1に入ったまま棄権
  await page.waitForTimeout(150);
  const beforeStay = await page.evaluate(() => state.pairings.A.map(m => m.p1 + 'v' + m.p2));
  const stayOpt = await page.evaluate(() => {
    changePairing('A', 0);
    const s2 = document.getElementById('chg-p2');
    const o = Array.from(s2.options).find(x => x.value === 'p5');   // 未割当の現役
    return o ? { disabled: o.disabled, group: o.parentElement && o.parentElement.label, reason: o.getAttribute('data-reason-id') } : null;
  });
  ok(stayOpt && stayOpt.disabled === true && stayOpt.reason === 'R-withdrawn-stays',
     '[W6-1] ★ 棄権者が残る側の変更は候補の時点で塞がれる  [' + JSON.stringify(stayOpt) + ']');
  alerts.length = 0;
  await page.evaluate(() => { document.getElementById('chg-p2').value = 'p5'; document.getElementById('chg-save').click(); });
  await page.waitForTimeout(400);
  const afterStay = await page.evaluate(() => {
    let s = null; try { s = JSON.parse(localStorage.getItem('shogi_v4') || 'null'); } catch (e) {}
    return { pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
             saved: s && s.pairings ? (s.pairings.A || []).map(m => m.p1 + 'v' + m.p2) : null,
             appModal: !!document.getElementById('app-modal') };
  });
  ok(JSON.stringify(afterStay.pairs) === JSON.stringify(beforeStay) &&
     JSON.stringify(afterStay.saved) === JSON.stringify(beforeStay),
     '[W6-2] ★ 強制代入して保存しても「棄権者 × 現役」の卓は作れない  [' + afterStay.pairs.join(', ') + ']');
  ok(alerts.some(a => /棄権した参加者が残ります/.test(a)),
     '[W6-3] 何をすればよいか分かる文言が出る  [' + (alerts[0] || '(なし)').replace(/\n/g, ' ').slice(0, 34) + ']');
  ok(!afterStay.appModal, '[W6-4] 確認モーダルまで進まない');
  // 対照: 棄権者自身の役を置き換える操作は通る（棄権者を卓から外す運用を妨げない）
  await page.evaluate(() => { try { closeChangePairingModal(); } catch (e) {} });
  await page.evaluate(() => { changePairing('A', 0); document.getElementById('chg-p1').value = 'p5'; document.getElementById('chg-save').click(); });
  await page.waitForTimeout(400);
  const replaced = await page.evaluate(() => {
    let s = null; try { s = JSON.parse(localStorage.getItem('shogi_v4') || 'null'); } catch (e) {}
    return { pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
             saved: s && s.pairings ? (s.pairings.A || []).map(m => m.p1 + 'v' + m.p2) : null };
  });
  ok(replaced.pairs[0] === 'p5vp2' && replaced.saved && replaced.saved[0] === 'p5vp2',
     '[W6-5] ★ 対照: 棄権者自身を現役と入れ替える操作は従来どおり通る  [' + replaced.pairs.join(', ') + ']');
  await page.evaluate(() => { try { closeChangePairingModal(); } catch (e) {} });

  // ---------------------------------------------------------------- W7 swap では棄権者が「別卓へ移る」だけ
  //   Codex 2巡目 P1 (r3781302898)。修正前の実測: 卓1「W×B」で W の役に別卓の X を選ぶと
  //   卓1=X×B / 卓2=W×Y になり、棄権者 W はこの回戦に残ったままだった。
  await page.evaluate(`(function(){
    try{ closeChangePairingModal(); }catch(e){}
    var players=[];
    for(var i=1;i<=6;i++)players.push({id:'p'+i,name:'選手'+i,entry_no:i,member:'member',grade:'ippan'});
    players[0].withdrawn=true;                       // W=p1 が卓1に残っている
    state={players:{A:players,B:[]},rounds:4,results:{A:[],B:[]},
      pairings:{A:[{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'},
                   {p1:'p3',p2:'p4',winner:null,lastModifiedBy:'auto'}],B:[]},
      started:true,classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}};
    save(); showTab('tournament'); renderTournament('A');
  })()`);
  await page.waitForTimeout(150);
  const beforeSwap = await page.evaluate(() => state.pairings.A.map(m => m.p1 + 'v' + m.p2));
  const swapOpt = await page.evaluate(() => {
    changePairing('A', 0);
    const s1 = document.getElementById('chg-p1');
    const o = Array.from(s1.options).find(x => x.value === 'p3');   // 別卓の現役
    return o ? { disabled: o.disabled, reason: o.getAttribute('data-reason-id') } : null;
  });
  ok(swapOpt && swapOpt.disabled === true && swapOpt.reason === 'R-withdrawn-swap',
     '[W7-1] ★ 別卓の候補（swap になる）は候補の時点で塞がれる  [' + JSON.stringify(swapOpt) + ']');
  alerts.length = 0;
  await page.evaluate(() => { document.getElementById('chg-p1').value = 'p3'; document.getElementById('chg-save').click(); });
  await page.waitForTimeout(400);
  const afterSwap = await page.evaluate(() => {
    let s = null; try { s = JSON.parse(localStorage.getItem('shogi_v4') || 'null'); } catch (e) {}
    return { pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
             saved: s && s.pairings ? (s.pairings.A || []).map(m => m.p1 + 'v' + m.p2) : null,
             appModal: !!document.getElementById('app-modal'),
             棄権者の居場所: state.pairings.A.map((m, i) => (m.p1 === 'p1' || m.p2 === 'p1') ? ('卓' + (i + 1)) : null).filter(Boolean) };
  });
  ok(JSON.stringify(afterSwap.pairs) === JSON.stringify(beforeSwap) &&
     JSON.stringify(afterSwap.saved) === JSON.stringify(beforeSwap),
     '[W7-2] ★ 強制代入して保存しても swap は起きない（棄権者が別卓へ移らない）  [' + afterSwap.pairs.join(', ') + ']');
  ok(afterSwap.棄権者の居場所.join(',') === '卓1', '[W7-3] 棄権者は元の卓のまま  [' + afterSwap.棄権者の居場所.join(',') + ']');
  ok(alerts.some(a => /別の卓に移るだけ/.test(a)), '[W7-4] 何をすればよいか分かる文言  [' + (alerts[0] || '(なし)').replace(/\n/g, ' ').slice(0, 34) + ']');
  ok(!afterSwap.appModal, '[W7-5] 入れ替え確認モーダルまで進まない');
  await page.evaluate(() => { try { closeChangePairingModal(); } catch (e) {} });

  // ---------------------------------------------------------------- W8 相手卓に棄権者がいる swap
  //   Codex 3巡目 P1 (r3781349770)。修正前: 卓1「A×B」/ 卓2「X×W(棄権)」で卓1のAをXに替えると
  //   卓1=X×B / 卓2=A×W となり、棄権者 W の対戦相手だけが黙って入れ替わっていた。
  await page.evaluate(`(function(){
    try{ closeChangePairingModal(); }catch(e){}
    var players=[];
    for(var i=1;i<=6;i++)players.push({id:'p'+i,name:'選手'+i,entry_no:i,member:'member',grade:'ippan'});
    players[3].withdrawn=true;                       // W=p4 は卓2にいる
    state={players:{A:players,B:[]},rounds:4,results:{A:[],B:[]},
      pairings:{A:[{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'},
                   {p1:'p3',p2:'p4',winner:null,lastModifiedBy:'auto'}],B:[]},
      started:true,classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}};
    save(); showTab('tournament'); renderTournament('A');
  })()`);
  await page.waitForTimeout(150);
  const beforePartner = await page.evaluate(() => state.pairings.A.map(m => m.p1 + 'v' + m.p2));
  const partnerOpt = await page.evaluate(() => {
    changePairing('A', 0);
    const s1 = document.getElementById('chg-p1');
    const o = Array.from(s1.options).find(x => x.value === 'p3');   // 相方が棄権者の現役
    return o ? { disabled: o.disabled, reason: o.getAttribute('data-reason-id') } : null;
  });
  ok(partnerOpt && partnerOpt.disabled === true && partnerOpt.reason === 'R-withdrawn-partner',
     '[W8-1] ★ 相手卓に棄権者がいる候補は塞がれる  [' + JSON.stringify(partnerOpt) + ']');
  alerts.length = 0;
  await page.evaluate(() => { document.getElementById('chg-p1').value = 'p3'; document.getElementById('chg-save').click(); });
  await page.waitForTimeout(400);
  const afterPartner = await page.evaluate(() => {
    let s = null; try { s = JSON.parse(localStorage.getItem('shogi_v4') || 'null'); } catch (e) {}
    return { pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
             saved: s && s.pairings ? (s.pairings.A || []).map(m => m.p1 + 'v' + m.p2) : null,
             appModal: !!document.getElementById('app-modal') };
  });
  ok(JSON.stringify(afterPartner.pairs) === JSON.stringify(beforePartner) &&
     JSON.stringify(afterPartner.saved) === JSON.stringify(beforePartner),
     '[W8-2] ★ 強制代入して保存しても棄権者の対戦相手は入れ替わらない  [' + afterPartner.pairs.join(', ') + ']');
  ok(!afterPartner.appModal, '[W8-3] 入れ替え確認モーダルまで進まない（途中で止まっているのではなく弾いている）');
  ok(alerts.some(a => /入れ替え先の卓に棄権した参加者/.test(a)), '[W8-4] 何をすればよいか分かる文言  [' + (alerts[0] || '(なし)').replace(/\n/g, ' ').slice(0, 30) + ']');
  await page.evaluate(() => { try { closeChangePairingModal(); } catch (e) {} });

  ok(pageErrors.length === 0, '未捕捉例外なし  ' + (pageErrors.length ? '[' + pageErrors[0] + ']' : ''));

  await browser.close();
  console.log('\nE2E-CHG-MODAL-WITHDRAWN-836: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
