#!/usr/bin/env node
// PWA Slice2: Service Worker の構造検証（実挙動は実ブラウザ/実機オフラインで確認）。
//   sw.js: code=network-first / static=cache-first / 外部素通り / versioned cache / skipWaiting+claim。
//   shogi_v4.html・index.html に ES5 登録スニペット。
const fs=require('fs'), path=require('path'), cp=require('child_process');
const target=process.argv[2]||'shogi_v4.html';
const ROOT=path.dirname(path.resolve(target));
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
const sw=path.join(ROOT,'sw.js');

console.log('=== sw.js 存在・構文・構造 ===');
ok(fs.existsSync(sw),'sw.js が存在');
let s=fs.existsSync(sw)?fs.readFileSync(sw,'utf8'):'';
try{ cp.execSync('node --check '+JSON.stringify(sw)); ok(true,'sw.js は構文OK'); }catch(e){ ok(false,'sw.js 構文エラー'); }
ok(/var\s+CACHE\s*=\s*'shogi-tour-v\d+'/.test(s),'CACHE 名にバージョン（shogi-tour-vN）');
ok(/addEventListener\(\s*'install'/.test(s),'install ハンドラ');
ok(/addEventListener\(\s*'activate'/.test(s),'activate ハンドラ');
ok(/addEventListener\(\s*'fetch'/.test(s),'fetch ハンドラ');
ok(/self\.skipWaiting\(\)/.test(s),'skipWaiting');
ok(/clients\.claim\(\)/.test(s),'clients.claim');
ok(/caches\.delete/.test(s),'activate で旧キャッシュ削除');
ok(/url\.origin\s*!==\s*self\.location\.origin\)\s*return/.test(s),'外部オリジンは素通り（Supabase/CDN 非介入）');
ok(/\/sw\\\.js\$\/\.test\(url\.pathname\)\)\s*return/.test(s),'sw.js 自身は介入しない（完全一致）');
ok(/req\.mode\s*===\s*'navigate'/.test(s)&&/\\\.\(html\|js\)\$/.test(s),'コードは network-first 判定（navigate / .html|.js）');
ok(/fetch\(req\)\.then[\s\S]{0,200}catch[\s\S]{0,120}caches\.match/.test(s),'network-first：失敗時キャッシュへフォールバック');
ok(/ignoreSearch:\s*true/.test(s),'?v 差を無視してキャッシュ照合（ignoreSearch）');
ok(/res\.ok\s*&&\s*res\.type\s*===\s*'basic'\s*&&\s*!res\.redirected/.test(s),'キャッシュは ok/basic/非redirect のみ（captive portal/404 混入防止）');
ok(/method\s*!==\s*'GET'\)\s*return/.test(s),'GET 以外は触らない');
ok(/PRECACHE/.test(s)&&/shogi_v4\.html/.test(s),'PRECACHE に当日アプリ shell');

console.log('=== 登録スニペット（ES5・load後・shogi_v4.html / index.html）===');
['shogi_v4.html','index.html'].forEach(f=>{
  const html=fs.readFileSync(path.join(ROOT,f),'utf8');
  ok(/if\(typeof navigator!=="undefined" && "serviceWorker" in navigator\)/.test(html),f+': serviceWorker 対応分岐');
  ok(/navigator\.serviceWorker\.register\("sw\.js"\)\.catch/.test(html),f+': sw.js 登録（失敗無視）');
  ok(/window\.addEventListener\("load"/.test(html),f+': load 後に登録（起動を妨げない）');
  ok(!/=>/.test(html.match(/serviceWorker[\s\S]{0,200}register[\s\S]{0,80}/)[0]),f+': 登録スニペットはES5（アロー無し）');
});

console.log('PWA-SW: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
