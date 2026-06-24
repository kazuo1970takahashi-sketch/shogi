#!/usr/bin/env node
// SEC-S1 (#343 / SYSTEM-REVIEW S-1): supabase-js の CDN ロードに SRI（integrity）＋バージョン固定。
//   CDN 侵害/MITM 時の任意 JS 実行を防ぐ。app/index.html（静的）と shogi_v4.html（loadCloudDeps 動的）両方。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRI = 'sha384-nD3dwv4+ZqdYnmZKe/249ImlV04om7xTCcsoSeQYI+RO+XlKPoqAWaJR1M5SJH9p';
const PIN = 'supabase-js@2.108.2/dist/umd/supabase.js';
let pass = 0, fail = 0;
function ok(m){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+m); }
function ng(m){ fail++; console.error('  ✗ '+m); }
function assert(c,m){ c?ok(m):ng(m); }

var appHtml = fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8');
var shogi   = fs.readFileSync(path.join(ROOT,'shogi_v4.html'),'utf8');

// app/index.html（静的 script タグ）
assert(appHtml.indexOf(PIN)>=0, 'S1-1 app/index.html が supabase-js をバージョン固定(@2.108.2)でロード');
assert(appHtml.indexOf('integrity="'+SRI+'"')>=0, 'S1-2 app/index.html の script に integrity(sha384) がある');
assert(appHtml.indexOf('crossorigin="anonymous"')>=0, 'S1-3 app/index.html に crossorigin=anonymous');
assert(appHtml.indexOf('supabase-js@2/dist')<0, 'S1-4 app/index.html に未固定(@2/)の supabase-js が残っていない');

// shogi_v4.html（loadCloudDeps 動的 injection）
assert(shogi.indexOf(PIN)>=0, 'S1-5 shogi_v4.html(loadCloudDeps) が supabase-js をバージョン固定でロード');
assert(shogi.indexOf(SRI)>=0, 'S1-6 shogi_v4.html に SRI(sha384) 文字列がある');
assert(/sc\.integrity\s*=\s*integrity/.test(shogi), 'S1-7 injof が integrity 属性を script に設定');
assert(/sc\.crossOrigin\s*=\s*'anonymous'/.test(shogi), 'S1-8 injof が crossOrigin=anonymous を設定');
assert(shogi.indexOf("supabase-js@2/dist")<0, 'S1-9 shogi_v4.html に未固定(@2/)の supabase-js が残っていない');
// config.js は同一オリジンなので integrity 無し（誤って付けていない）
assert(/injof\('app\/config\.js'\)/.test(shogi), 'S1-10 app/config.js は integrity 無しで読む（同一オリジン）');

console.log('  SEC-S1 SRI テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
