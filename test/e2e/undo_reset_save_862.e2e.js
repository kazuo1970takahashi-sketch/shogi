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

  const allErr = [].concat(okc.errors, q.errors, s.errors);
  ok(allErr.length === 0, '未捕捉例外なし' + (allErr.length ? '（実際: ' + allErr[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-UNDO-SAVE-VERIFY-862: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
