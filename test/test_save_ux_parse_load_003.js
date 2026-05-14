#!/usr/bin/env node
// SAVE-UX-STATE-RESTORE-HANDLING-IMPL-LIGHT (§25)
// PARSE-LOAD-003: load() で全キー復元失敗かつ破損起源があった場合のみ warn が出ることを検証
// - 初回起動（全キー null）では warn しない（regression 防止）
// - v4 parse 失敗 + v3 復元不可 → warn 発火（callsiteId:'PARSE-LOAD-003'）
// - v4 parse 失敗 + v3 fallback 成功（PARSE-LOAD-002A）→ 今回 warn 対象外

const fs = require('fs');

function extractScripts(path) {
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node test_save_ux_parse_load_003.js <html>');
  process.exit(1);
}

const htmlSrc = fs.readFileSync(targetPath, 'utf8');
const js = extractScripts(targetPath);

let pass = 0, fail = 0;
function ok(msg){ pass++; console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(msg); else ng(msg); }

// ============================================================
// 1) 構造アサート: PARSE-LOAD-003 callsite が load() 内に存在し、metadata / message を含む
// ============================================================
{
  const callsiteAnchor = "callsiteId:'PARSE-LOAD-003'";
  const anchorIdx = htmlSrc.indexOf(callsiteAnchor);
  assert(anchorIdx >= 0, 'PARSE-LOAD-003 callsite が shogi_v4.html に存在する');

  const sliceStart = Math.max(0, anchorIdx - 800);
  const block = htmlSrc.substring(sliceStart, anchorIdx + 400);

  assert(block.indexOf("kind:'storage-corrupted'") >= 0, 'PARSE-LOAD-003 近傍に kind:\'storage-corrupted\' が存在');
  assert(block.indexOf("aggregateKey:'storage-corrupted:state'") >= 0, 'PARSE-LOAD-003 近傍に aggregateKey:\'storage-corrupted:state\' が存在');
  assert(block.indexOf("severity:'warn'") >= 0, 'PARSE-LOAD-003 近傍に severity:\'warn\' が存在');

  const msgMatch = block.match(/message:'([^']*)'/);
  assert(msgMatch !== null, 'PARSE-LOAD-003 近傍に message:\'...\' リテラルが存在');
  const msg = msgMatch ? msgMatch[1] : '';
  // §24.6.3 主要語句（症状 / 影響）。第一候補 message を想定するが、文言微調整に過敏にしない
  const keywords = ['保存データ', '復元', '初期状態'];
  for (let i = 0; i < keywords.length; i++) {
    assert(msg.indexOf(keywords[i]) >= 0, 'PARSE-LOAD-003 message に「' + keywords[i] + '」が含まれる');
  }
}

// ============================================================
// 2) 振る舞いテスト: load() を mock した localStorage / notifySaveWarning で実行
// ============================================================
function runLoad(lsBehavior) {
  // lsBehavior: { items: { key -> value | THROW }, throwKeys?: Set<string> }
  const captured = [];
  const throwKeys = lsBehavior.throwKeys || new Set();
  const items = lsBehavior.items || {};
  const localStorageMock = {
    getItem(k) {
      if (throwKeys.has(k)) {
        var err = new Error('SecurityError mock');
        err.name = 'SecurityError';
        throw err;
      }
      return Object.prototype.hasOwnProperty.call(items, k) ? items[k] : null;
    },
    setItem(){}, removeItem(){}
  };

  // 最小限の document/window mock（load() は触らないが、helper 群の保護のため null-safe を担保）
  const docMock = {
    getElementById(){ return null; },
    createElement(){ return { style:{}, addEventListener(){}, appendChild(){}, setAttribute(){} }; },
    body: { appendChild(){}, removeChild(){} },
    addEventListener(){},
    querySelectorAll(){ return []; }
  };
  const winMock = { innerWidth: 1024 };

  const fn = new Function(
    'document', 'window', 'localStorage', 'alert', 'confirm', 'prompt',
    'FileReader', 'Blob', 'URL', 'crypto', 'console', '__captured',
    `${js}
     // notifySaveWarning を spy に置き換え（function 宣言は再代入可能）
     notifySaveWarning = function(opts){ __captured.push(opts || {}); };
     load();
     return { state: state, captured: __captured };`
  );

  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  return fn(
    docMock, winMock, localStorageMock,
    ()=>{}, ()=>true, ()=>'',
    function(){}, function(){},
    { createObjectURL:()=>'', revokeObjectURL:()=>{} },
    cryptoMock, console, captured
  );
}

// ケース 1: 初回起動（全キー null）→ warn が出ない（regression 防止）
try {
  const r = runLoad({ items: {} });
  const parseLoad003 = r.captured.filter(c => c && c.callsiteId === 'PARSE-LOAD-003');
  assert(parseLoad003.length === 0, '初回起動（全キー null）では PARSE-LOAD-003 warn が出ない');
} catch (e) {
  ng('ケース1 実行エラー: ' + (e && e.message ? e.message.substring(0, 200) : e));
}

// ケース 2: v4 parse 失敗 + v3 parse 失敗 → PARSE-LOAD-003 warn 発火
try {
  const r = runLoad({ items: { shogi_v4: '{{{ broken', shogi_v3: '~~~ also broken' } });
  const parseLoad003 = r.captured.filter(c => c && c.callsiteId === 'PARSE-LOAD-003');
  assert(parseLoad003.length === 1, '全キー破損時に PARSE-LOAD-003 warn が 1 回発火');
  if (parseLoad003.length === 1) {
    const c = parseLoad003[0];
    assert(c.kind === 'storage-corrupted', 'PARSE-LOAD-003 metadata: kind=storage-corrupted');
    assert(c.aggregateKey === 'storage-corrupted:state', 'PARSE-LOAD-003 metadata: aggregateKey=storage-corrupted:state');
    assert(c.severity === 'warn', 'PARSE-LOAD-003 metadata: severity=warn');
    assert(typeof c.message === 'string' && c.message.indexOf('保存データ') >= 0, 'PARSE-LOAD-003 message に「保存データ」が含まれる');
  }
} catch (e) {
  ng('ケース2 実行エラー: ' + (e && e.message ? e.message.substring(0, 200) : e));
}

// ケース 3: v4 parse 失敗 + v3 fallback 成功（PARSE-LOAD-002A）→ 今回 warn 対象外
try {
  const v3Data = JSON.stringify({
    players: { A: [{ id: 'v3p1', name: 'V3プレイヤー', cls: 'A', member: 'member', grade: 'ippan' }], B: [] },
    rounds: 4, pairings: { A: [], B: [] }, results: { A: [], B: [] }, started: false
  });
  const r = runLoad({ items: { shogi_v4: '{{{ broken', shogi_v3: v3Data } });
  const parseLoad003 = r.captured.filter(c => c && c.callsiteId === 'PARSE-LOAD-003');
  assert(parseLoad003.length === 0, 'v4 破損→v3 成功（PARSE-LOAD-002A）では PARSE-LOAD-003 warn が出ない');
} catch (e) {
  ng('ケース3 実行エラー: ' + (e && e.message ? e.message.substring(0, 200) : e));
}

// 結果出力
console.log('\nPARSE-LOAD-003 IMPL-LIGHT テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
