#!/usr/bin/env node
// PWA Slice1: manifest＋head タグ＋アイコンの検証（Service Worker は別スライス）。
//   挙動非接触（head/静的ファイルのみ）。実機のインストール/オフラインは別途ブラウザ確認。
const fs=require('fs'), path=require('path');
const target=process.argv[2]||'shogi_v4.html';
const ROOT=path.dirname(path.resolve(target));
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
function pngSize(p){ const b=fs.readFileSync(p); // PNG: 8 sig, then IHDR len(4)+type(4)+W(4)+H(4)
  const sig=b.slice(0,8).toString('hex'); const isPng=sig==='89504e470d0a1a0a';
  return {isPng, w:b.readUInt32BE(16), h:b.readUInt32BE(20)}; }

console.log('=== manifest.webmanifest ===');
const mp=path.join(ROOT,'manifest.webmanifest');
ok(fs.existsSync(mp),'manifest.webmanifest が存在');
let m={}; try{ m=JSON.parse(fs.readFileSync(mp,'utf8')); ok(true,'manifest は妥当な JSON'); }catch(e){ ok(false,'manifest JSON parse: '+e); }
ok(typeof m.name==='string'&&m.name,'name あり');
ok(typeof m.short_name==='string'&&m.short_name,'short_name あり');
ok(m.display==='standalone','display=standalone');
ok(typeof m.scope==='string','scope あり');
ok(/shogi_v4\.html/.test(m.start_url||''),'start_url が当日アプリ（shogi_v4.html）');
ok(/^#/.test(m.theme_color||''),'theme_color あり');
ok(/^#/.test(m.background_color||''),'background_color あり');
ok(Array.isArray(m.icons)&&m.icons.length>=2,'icons 2件以上');
const sizes=(m.icons||[]).map(i=>i.sizes);
ok(sizes.indexOf('192x192')>=0&&sizes.indexOf('512x512')>=0,'192/512 アイコン定義');

console.log('=== アイコン実体（PNG・寸法）===');
[['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]].forEach(([f,sz])=>{
  const p=path.join(ROOT,f);
  if(!fs.existsSync(p)){ ok(false,f+' が存在'); return; }
  const s=pngSize(p);
  ok(s.isPng,f+' は PNG');
  ok(s.w===sz&&s.h===sz,f+' は '+sz+'x'+sz+'（実測 '+s.w+'x'+s.h+'）');
});
// manifest の icons src が実在
(m.icons||[]).forEach(i=>ok(fs.existsSync(path.join(ROOT,i.src)),'manifest icon 実在: '+i.src));

console.log('=== head タグ（shogi_v4.html / index.html）===');
['shogi_v4.html','index.html'].forEach(f=>{
  const html=fs.readFileSync(path.join(ROOT,f),'utf8');
  ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(html),f+': link rel=manifest');
  ok(/<meta name="theme-color" content="#1F3864">/.test(html),f+': theme-color');
  ok(/<meta name="apple-mobile-web-app-capable" content="yes">/.test(html),f+': apple-mobile-web-app-capable');
  ok(/<link rel="apple-touch-icon" href="apple-touch-icon\.png">/.test(html),f+': apple-touch-icon');
});

console.log('PWA-MANIFEST: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
