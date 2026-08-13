#!/usr/bin/env node
// Playwright E2E: UNDO-SAVE-VERIFY-001（Issue #862 から切り出した実害1件）
//   「↩ 元に戻す」が保存に失敗したときに、成功したふりをしないことを実ブラウザで測る。
//
//   直す前の実測（実 Chromium・setItem を quota で失敗させた場合）:
//     undoLastReset() の戻り値 : true
//     画面のメッセージ          : "リセットを元に戻しました"
//     localStorage の shogi_v4  : null（＝書けていない）
//     undo スナップショット      : 消えている
//   ＝書けていないのに「戻した」と言い、**唯一のやり直し材料まで消していた**。
//   リロードした時点でデータは戻らない。当日の運営中に踏むとその場で失われる。
//
//   ★ 故障モードは2つあり、両方見る:
//     (a) setItem が throw する（quota / プライベートブラウズ）
//     (b) setItem は通るが値が残らない（iOS プライベート等）
//        → (b) は try/catch では捕まらない。byte 照合が要る（#845 Codex P1 と同じ理由）。
//
//   ★ 対照として「正常に書けるとき」も測る。3ケースとも同じ結果になるなら、
//     この検査は何も見ていないのと同じ。
//
// 使い方（Mac・リポジトリ直下で）:
//   npm i -D playwright && npx playwright install chromium   # 初回のみ
//   node test/e2e/undo_reset_save_862.e2e.js
//
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// mode: 'ok' 正常 / 'quota' setItem が throw / 'silent' setItem は通るが残らない
async function run(browser, mode) {
  const pg = await browser.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(String(e && e.message || e)));
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });

  const r = await pg.evaluate((mode) => {
    // 参加者のいる状態を作って保存 → リセット相当（本体キーを消す）→ undo
    state.classes = [{ id: 'A', name: 'Aクラス' }];
    state.players = { A: [{ id: 'p1', name: '選手1', entry_no: 1 }, { id: 'p2', name: '選手2', entry_no: 2 }] };
    save();
    captureResetSnapshot('all');
    localStorage.removeItem('shogi_v4');

    const real = localStorage.setItem.bind(localStorage);
    if (mode === 'quota') {
      localStorage.setItem = function (k, v) {
        if (k === 'shogi_v4') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
        return real(k, v);
      };
    }
    if (mode === 'silent') {
      // ★ throw しない。値も残らない。try/catch では検出できない故障モード。
      localStorage.setItem = function (k, v) { if (k === 'shogi_v4') return; return real(k, v); };
    }

    const ret = undoLastReset();
    localStorage.setItem = real;

    const el = document.getElementById('reg-msg') || document.getElementById('msg') || {};
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ret: ret,
      msg: text,
      // メッセージの色（成功=ok / 失敗=err）を DOM から見る
      kind: (function () {
        const box = document.getElementById('reg-msg') || document.getElementById('msg');
        if (!box) return null;
        const a = box.querySelector('.alert') || box;
        return (a.className || '').indexOf('alert-err') >= 0 ? 'err'
             : (a.className || '').indexOf('alert-ok') >= 0 ? 'ok' : (a.className || '');
      })(),
      stored: localStorage.getItem('shogi_v4') !== null,
      undoLeft: localStorage.getItem('shogi_undo_snapshot') !== null,
      inMemory: (state.players.A || []).length
    };
  }, mode);

  await pg.close();
  return { r, errors };
}

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });

  // ---- 対照: 正常に書けるとき（ここが壊れていたら以降の結果は読めない）----
  const okc = await run(browser, 'ok');
  ok(okc.r.ret === true, '[対照] 正常時は true を返す  [実測 ' + okc.r.ret + ']');
  ok(okc.r.stored === true, '[対照] 正常時は端末に保存されている');
  ok(okc.r.undoLeft === false, '[対照] 正常時は undo スナップショットを消す（従来どおり）');
  ok(okc.r.msg.indexOf('リセットを元に戻しました') >= 0,
    '[対照] 正常時のメッセージは従来どおり  [実測 ' + okc.r.msg.slice(0, 40) + ']');
  ok(okc.r.inMemory === 2, '[対照] 参加者が復元されている（実測 ' + okc.r.inMemory + '人）');

  // ---- (a) setItem が throw する ----
  const q = await run(browser, 'quota');
  ok(q.r.stored === false, '(a) quota: 端末に保存されていない（前提の確認）');
  ok(q.r.ret === false, '(a) ★保存できなかったら false を返す  [実測 ' + q.r.ret + ']');
  ok(q.r.msg.indexOf('保存できませんでした') >= 0,
    '(a) ★「戻しました」と言い切らず、保存できなかったことを伝える  [実測 ' + q.r.msg.slice(0, 46) + '…]');
  ok(q.r.kind === 'err', '(a) ★成功と同じ緑で伝えない  [実測 ' + q.r.kind + ']');
  ok(q.r.undoLeft === true,
    '(a) ★undo スナップショットを消さない（消すとやり直しの手段が無くなる）  [実測 残っている=' + q.r.undoLeft + ']');
  ok(q.r.inMemory === 2, '(a) 画面上は復元されたまま（利用者がバックアップを取れる）');

  // ---- (b) setItem は通るが値が残らない（try/catch では捕まらない）----
  const s = await run(browser, 'silent');
  ok(s.r.stored === false, '(b) silent: 端末に保存されていない（前提の確認）');
  ok(s.r.ret === false, '(b) ★throw しない故障でも false を返す＝byte 照合が効いている  [実測 ' + s.r.ret + ']');
  ok(s.r.msg.indexOf('保存できませんでした') >= 0, '(b) ★同じく保存できなかったことを伝える');
  ok(s.r.undoLeft === true, '(b) ★undo スナップショットを消さない');

  // ---- 対照が (a)(b) と違う結果であること（＝この検査が何かを見ている証明）----
  ok(okc.r.ret !== q.r.ret && okc.r.undoLeft !== q.r.undoLeft,
    '★対照と故障時で結果が違う（3ケースが同じ答えなら何も検査していない）');

  // ---- Codex P1-1: 失敗を伝えたあとも「↩ 元に戻す」が残っていること ----
  //   旧版は showMsg で伝えていたため #reg-msg が置き換わり、**押したボタン自体が消えて**
  //   残した UNDO_KEY にアプリから到達できなくなっていた（undoLastReset を呼ぶ UI は
  //   #reset-undo-btn だけ）。「もう一度押せます」という文言が嘘になっていた。
  {
    const pg = await browser.newPage();
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });
    const r = await pg.evaluate(() => {
      state.classes = [{ id: 'A', name: 'Aクラス' }];
      state.players = { A: [{ id: 'p1', name: '選手1', entry_no: 1 }] };
      save(); captureResetSnapshot('all'); localStorage.removeItem('shogi_v4');
      showResetUndoBanner('大会データを全リセットしました');       // resetAll と同じ導線
      const before = !!document.getElementById('reset-undo-btn');
      const real = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) {
        if (k === 'shogi_v4') { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
        return real(k, v);
      };
      document.getElementById('reset-undo-btn').click();           // 実クリック
      // ★Codex 3巡目 P1: 失敗後の導線は「もう一度 undo」ではなく「もう一度保存する」。
      //   別 id にしてあるので、undoLastReset を呼ぶ UI が増えていないことも同時に見られる。
      const after = !!document.getElementById('reset-save-retry-btn');
      const undoBtnGone = !document.getElementById('reset-undo-btn');
      // 容量が空いた想定で、残っているボタンからやり直せるか
      localStorage.setItem = real;
      let retried = false, storedAfterRetry = false;
      const b2 = document.getElementById('reset-save-retry-btn');
      if (b2) { b2.click(); retried = true; storedAfterRetry = localStorage.getItem('shogi_v4') !== null; }
      return { before, after, undoBtnGone, retried, storedAfterRetry, undoLeft: localStorage.getItem('shogi_undo_snapshot') !== null };
    });
    await pg.close();
    ok(r.before === true, '[P1-1] 前提: リセット直後は「↩ 元に戻す」がある');
    ok(r.after === true,
      '[P1-1] ★保存に失敗したあとも再試行の導線が残っている  [実測 ' + r.after + ']');
    ok(r.undoBtnGone === true,
      '[P1-1] ★失敗バナーには undo を呼ぶボタンを置かない（古い snapshot への直通路を作らない）  [実測 消えている=' + r.undoBtnGone + ']');
    ok(r.retried && r.storedAfterRetry === true,
      '[P1-1] ★容量が空いたあと、残ったボタンから実際にやり直せて保存される  [実測 保存=' + r.storedAfterRetry + ']');
    ok(r.undoLeft === false, '[P1-1] やり直しに成功したら UNDO_KEY は消える');
  }

  // ---- Codex 3巡目 P1: 再試行は「いまの内容の保存」であって undo の再実行ではない ----
  //   失敗後に保存が回復してから加えた変更を、再試行ボタンが巻き戻してはいけない。
  //   旧版（undoLastReset を呼ぶボタンを残す）で実測: 「回復後に追加した人」が消えた。
  {
    const pg = await browser.newPage();
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });
    const r = await pg.evaluate(() => {
      state.classes = [{ id: 'A', name: 'Aクラス' }];
      state.players = { A: [{ id: 'p1', name: 'リセット前からいる人', entry_no: 1 }] };
      save(); captureResetSnapshot('all'); localStorage.removeItem('shogi_v4');
      showResetUndoBanner('大会データを全リセットしました');
      const real = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) { if (k === 'shogi_v4') return; return real(k, v); };  // silent 故障
      document.getElementById('reset-undo-btn').click();          // undo → 保存に失敗
      localStorage.setItem = real;                                 // 保存機能が回復
      // 回復後に新しい参加者を足して正常に保存できる
      state.players.A.push({ id: 'p9', name: '回復後に追加した人', entry_no: 9 });
      save();
      const savedAfterRecovery = ((JSON.parse(localStorage.getItem('shogi_v4')).players || {}).A || [])
        .some(function (p) { return p.name === '回復後に追加した人'; });
      const btn = document.getElementById('reset-save-retry-btn');
      const clickable = !!btn;
      if (btn) btn.click();                                        // 残っている導線を押す
      const stored = JSON.parse(localStorage.getItem('shogi_v4') || '{}');
      return {
        savedAfterRecovery: savedAfterRecovery,
        clickable: clickable,
        storedNames: (((stored.players || {}).A) || []).map(function (p) { return p.name; }),
        memoryNames: (state.players.A || []).map(function (p) { return p.name; }),
        undoLeft: localStorage.getItem('shogi_undo_snapshot') !== null
      };
    });
    await pg.close();
    ok(r.savedAfterRecovery === true, '[R3-P1] 前提: 保存が回復したあとの追加は正常に保存される');
    ok(r.clickable === true, '[R3-P1] 前提: そのとき再試行の導線はまだ押せる');
    ok(r.storedNames.indexOf('回復後に追加した人') >= 0,
      '[R3-P1] ★再試行を押しても、失敗後に加えた変更が巻き戻らない  [実測 ' + r.storedNames.join('/') + ']');
    ok(r.memoryNames.indexOf('回復後に追加した人') >= 0, '[R3-P1] メモリ上の state も巻き戻らない');
    ok(r.undoLeft === false, '[R3-P1] 保存できた時点で undo は完了＝陳腐化した snapshot を残さない');
  }

  // ---- Codex P1-2: スナップショットを取れなかったら undo を提示しない ----
  //   旧版は失敗を握りつぶし、**古いスナップショットを残したまま**バナーを出していた。
  //   押すと「直前」ではなく**さらに前のリセット時点**まで巻き戻り、間の変更が失われる。
  {
    const pg = await browser.newPage();
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });
    const r = await pg.evaluate(() => {
      state.classes = [{ id: 'A', name: 'Aクラス' }];
      state.players = { A: [{ id: 'p1', name: '古い時点', entry_no: 1 }] };
      save();
      captureResetSnapshot('all');                                  // ① 古いスナップショット
      const oldSnap = localStorage.getItem('shogi_undo_snapshot');
      const real = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) {
        if (k === 'shogi_undo_snapshot') { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
        return real(k, v);
      };
      const ret = captureResetSnapshot('all');                      // ② 上書きに失敗
      localStorage.setItem = real;
      return { ret, hadOld: oldSnap !== null, staleLeft: localStorage.getItem('shogi_undo_snapshot') !== null };
    });
    await pg.close();
    ok(r.hadOld === true, '[P1-2] 前提: 先に古いスナップショットがある');
    ok(r.ret === false, '[P1-2] ★captureResetSnapshot が失敗を戻り値で伝える  [実測 ' + r.ret + ']');
    ok(r.staleLeft === false,
      '[P1-2] ★上書きに失敗したら陳腐化した古いスナップショットを消す（誤った巻き戻しを提示しない）  [実測 残存=' + r.staleLeft + ']');
  }

  // ---- Codex 2巡目 P1: captureResetSnapshot も byte 照合する ----
  //   1巡目で塞いだのは「throw する故障」だけだった。throw しない故障（受理するが値が残らない）
  //   では戻り値 true のまま**前回のスナップショットが残り**、呼び出し側は undo を提示する。
  //   押すと前回のリセット時点まで巻き戻り、間に保存した参加者が消える（実測で再現）。
  {
    const pg = await browser.newPage();
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });
    const r = await pg.evaluate(() => {
      state.classes = [{ id: 'A', name: 'Aクラス' }];
      state.players = { A: [{ id: 'p1', name: '時点1のみ', entry_no: 1 }] };
      save();
      const cap1 = captureResetSnapshot('all');                     // ① 正常に取れる
      state.players.A.push({ id: 'p2', name: '時点2で追加', entry_no: 2 });
      save();                                                       // ② 間に保存した変更
      const real = localStorage.setItem.bind(localStorage);
      // ★ throw しない。値も変わらない（＝古いスナップショットが残る）。
      localStorage.setItem = function (k, v) { if (k === 'shogi_undo_snapshot') return; return real(k, v); };
      const cap2 = captureResetSnapshot('all');                     // ③ 上書きが silent に失敗
      localStorage.setItem = real;
      const raw = localStorage.getItem('shogi_undo_snapshot');
      const staleNames = raw ? JSON.parse(JSON.parse(raw).payload).players.A.map(p => p.name) : [];
      // ④ 陳腐化した値が残っていれば、それを押したとき「時点2で追加」が消える
      undoLastReset();
      return {
        cap1: cap1, cap2: cap2,
        staleLeft: raw !== null,
        staleNames: staleNames.join('/'),
        lost: (state.players.A || []).every(function (p) { return p.name !== '時点2で追加'; })
      };
    });
    await pg.close();
    ok(r.cap1 === true, '[R2-P1-A] 前提: 正常時は true（対照）');
    ok(r.cap2 === false,
      '[R2-P1-A] ★throw しない故障でも false を返す＝UNDO_KEY 側にも byte 照合がある  [実測 ' + r.cap2 + ']');
    ok(r.staleLeft === false,
      '[R2-P1-A] ★書けていないなら前回のスナップショットを残さない  [実測 残存=' + r.staleLeft + (r.staleNames ? '（' + r.staleNames + '）' : '') + ']');
    ok(r.lost === false,
      '[R2-P1-A] ★間に保存した変更が巻き戻しで消えない  [実測 消えた=' + r.lost + ']');
  }

  // ---- Codex 2巡目 P1: 保存失敗の警告が、実際に見える場所に出ること ----
  //   undo が進行中/完了済みの大会を復元すると showTab('tournament'/'result') が
  //   #pane-reg を display:none にする。バナーと「↩ 元に戻す」は #reg-msg にしか出せないため、
  //   DOM には在るのに**画面には出ない**。運営者は保存できていないことに気づけない。
  {
    const seen = {};
    for (const started of [false, true]) {
      for (const mode of ['ok', 'silent']) {
        const pg = await browser.newPage();
        pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });
        seen[started + '/' + mode] = await pg.evaluate(function (a) {
          state.classes = [{ id: 'A', name: 'Aクラス' }];
          state.players = { A: [{ id: 'p1', name: '選手1', entry_no: 1 }] };
          state.started = a.started;
          save(); captureResetSnapshot('all'); localStorage.removeItem('shogi_v4');
          const real = localStorage.setItem.bind(localStorage);
          if (a.mode === 'silent') localStorage.setItem = function (k, v) { if (k === 'shogi_v4') return; return real(k, v); };
          undoLastReset();
          localStorage.setItem = real;
          // 失敗バナーの導線は再試行ボタン（Codex 3巡目 P1 で id を分けた）
          const btn = document.getElementById('reset-save-retry-btn');
          const rect = btn ? btn.getBoundingClientRect() : null;
          return {
            pane: ['reg', 'tournament', 'result'].filter(function (t) {
              const el = document.getElementById('pane-' + t);
              return el && getComputedStyle(el).display !== 'none';
            }).join(','),
            btnInDom: !!btn,
            // ★ DOM に在るかではなく、実際に見えるかを見る
            btnVisible: !!(btn && btn.offsetParent !== null && rect && rect.width > 0 && rect.height > 0)
          };
        }, { started: started, mode: mode });
        await pg.close();
      }
    }
    ok(seen['true/silent'].btnInDom === true, '[R2-P1-B] 前提: 進行中の大会でも失敗バナーは DOM に在る');
    ok(seen['true/silent'].btnVisible === true,
      '[R2-P1-B] ★進行中の大会を復元して保存に失敗しても、警告と再試行ボタンが実際に見える  [実測 見える=' +
      seen['true/silent'].btnVisible + ' / 表示ペイン=' + seen['true/silent'].pane + ']');
    ok(seen['false/silent'].btnVisible === true, '[R2-P1-B] 受付段階でも見える（従来どおり）');
    ok(seen['true/ok'].pane === 'tournament',
      '[R2-P1-B] ★対照: 保存に成功したときの遷移は従来どおり進行タブ  [実測 ' + seen['true/ok'].pane + ']');
    ok(seen['false/ok'].pane === 'reg', '[R2-P1-B] 対照: 未開始なら受付タブ（従来どおり）');
  }

  // ---- Codex 2巡目 P2: 確かめていない原因を言わない ----
  //   captureResetSnapshot は例外を種別で分けずに boolean だけを返すので、失敗＝容量不足とは限らない。
  //   SecurityError（ブラウザの設定で保存がブロックされている端末）でも同じ false になる。
  {
    const pg = await browser.newPage();
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });
    const r = await pg.evaluate(() => {
      state.classes = [{ id: 'A', name: 'Aクラス' }];
      state.players = { A: [{ id: 'p1', name: '選手1', entry_no: 1 }] };
      save();
      const real = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) {
        if (k === 'shogi_undo_snapshot') { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; }
        return real(k, v);
      };
      const cap = captureResetSnapshot('all');
      localStorage.setItem = real;
      return { cap: cap };
    });
    await pg.close();
    ok(r.cap === false, '[R2-P2] 前提: 容量とは無関係な SecurityError でも false になる（原因を区別していない）');
  }

  // ---- 実装側の文言に「容量」の断定が残っていないこと（2箇所とも）----
  //   ★ コメントを実装と誤認しないよう、行コメントを落としてから見る。
  {
    const fs = require('fs');
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'shogi_v4.html'), 'utf8');
    const body = src.replace(/^\s*\/\/.*$/gm, '');
    ok(!/保存容量の都合で/.test(body) && !/容量を空けてから/.test(body),
      '[R2-P2] ★実装の文言から原因の断定が消えている');
    ok(/この端末に保存できなかったため「元に戻す」は使えません/.test(body),
      '[R2-P2] リセット側の代替文言が実装に入っている');
  }

  // ---- Codex 5巡目 P1: 再試行の成功でも配信面を更新する（save() の publish フックを通らない）----
  //   ライブ配信 ON のとき、undo の初回保存が失敗して再試行で復旧しても、参加者向けの
  //   配信面がリセット後のまま取り残される（次の通常保存まで）。
  {
    const pg = await browser.newPage();
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });
    const r = await pg.evaluate(() => {
      state.classes = [{ id: 'A', name: 'Aクラス' }];
      state.players = { A: [{ id: 'p1', name: '選手1', entry_no: 1 }] };
      save(); captureResetSnapshot('all'); localStorage.removeItem('shogi_v4');
      showResetUndoBanner('大会データを全リセットしました');
      // publish フックを数える（実装を差し替えず、呼ばれた回数だけ見る）
      let published = 0;
      const realPublish = window.liveSchedulePublish;
      window.liveSchedulePublish = function () { published++; };
      const real = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) { if (k === 'shogi_v4') return; return real(k, v); };
      document.getElementById('reset-undo-btn').click();          // undo → 保存に失敗
      localStorage.setItem = real;
      const beforeRetry = published;
      document.getElementById('reset-save-retry-btn').click();     // 再試行で復旧
      const afterRetry = published;
      window.liveSchedulePublish = realPublish;
      return { beforeRetry, afterRetry, stored: localStorage.getItem('shogi_v4') !== null };
    });
    await pg.close();
    ok(r.stored === true, '[R5-P1] 前提: 再試行で端末に保存できている');
    ok(r.afterRetry > r.beforeRetry,
      '[R5-P1] ★再試行の成功でも配信面の更新が走る  [実測 ' + r.beforeRetry + ' → ' + r.afterRetry + ']');
  }

  const allErr = [].concat(okc.errors, q.errors, s.errors);
  ok(allErr.length === 0, '未捕捉例外なし' + (allErr.length ? '（実際: ' + allErr[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-UNDO-SAVE-VERIFY-862: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
