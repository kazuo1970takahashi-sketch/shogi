#!/usr/bin/env node
// PWA-PREP / 相互ナビリンク（docs/PWA-PLAN）: 当日アプリ⇄app/ をワンタップで行き来できること。
//   PWA 収束（1アプリ・管理は内部ページ）の先行投資。別タブを増やさない＝同一ウィンドウ遷移。
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0;
const ok=m=>{pass++; if(process.env.VERBOSE)console.log('  ✓ '+m);};
const ng=m=>{fail++; console.error('  ✗ '+m);};
const assert=(c,m)=>c?ok(m):ng(m);

const shogi=fs.readFileSync(path.join(ROOT,'shogi_v4.html'),'utf8');
const appHtml=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8');

// 当日アプリ → app/（相対リンク・別タブにしない＝target=_blank を付けない）
assert(/href="app\/"/.test(shogi), 'X1 当日アプリに app/ への相対リンクがある');
const m=shogi.match(/<a href="app\/"[^>]*>/);
assert(!!m && !/target=/.test(m[0]), 'X2 app/ リンクは同一ウィンドウ遷移（target 属性なし）');
assert(/クラウド管理/.test(shogi), 'X3 リンク文言にクラウド管理を含む');

// app/ → 当日アプリ
assert(/href="\.\.\/shogi_v4\.html"/.test(appHtml), 'X4 app/ に当日アプリへ戻る相対リンクがある');
assert(/当日運営アプリへ戻る/.test(appHtml), 'X5 戻りリンクの文言');

console.log('  PWA-PREP 相互ナビリンク テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
