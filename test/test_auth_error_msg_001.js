#!/usr/bin/env node
// AUTH-ERROR-MSG-001（#601）— ログイン失敗エラー文言の改善（app/auth.js）単体テスト。
//   観点:
//     E  整形: 空 error/'{}' でも人が読める文言＋次の行動（再試行・管理者連絡）。
//        生のエラー文字列は画面に出さない（STYLE-GUIDE §4.3・詳細は console.warn）。
//        429/rate limit は文言を分ける。
//     R  requestMagicLink: error 応答・Promise reject の両方で ok:false＋整形済み文言。
//        成功文言・既存バリデーションは無改変。
//   実データ不使用（架空のみ）。supabase client は mock 注入。shogi_v4.html は触らない。

const fs = require('fs');
const path = require('path');

const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(m){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+m); }
function ng(m){ fail++; console.error('  ✗ '+m); }
function assert(c,m){ c?ok(m):ng(m); }

function loadAuth(extra){
  const win = Object.assign({ location:{ origin:'https://app.test', pathname:'/app/' } }, extra||{});
  new Function('window', AUTH_JS)(win);
  return win.ShogiAuth;
}

const warns = [];
const A = loadAuth({ console: { warn: function(){ warns.push(Array.prototype.join.call(arguments,' ')); } } });

const GENERIC = 'メールを送信できませんでした';
const RATE = 'メールの送信回数が上限に達しました';

// ============================================================ E. 整形
(function(){
  assert(typeof A.formatMagicLinkError === 'function', 'E1 formatMagicLinkError が公開されている');

  const m1 = A.formatMagicLinkError({});
  assert(m1.indexOf(GENERIC)>=0 && m1.indexOf('もう一度')>=0, 'E2 空 error でも汎用文言＋再試行案内');
  assert(m1.indexOf('{}')<0 && m1.indexOf('undefined')<0, 'E3 空 error で {} / undefined を表示しない');
  assert(m1.indexOf('ご連絡ください')>=0, 'E4 次の行動（管理者へ連絡）を添える');

  const m2 = A.formatMagicLinkError({ message: '{}' });
  assert(m2.indexOf(GENERIC)>=0 && m2.indexOf('{}')<0, 'E5 message="{}" でも {} を表示しない');

  const m3 = A.formatMagicLinkError({ status: 429, message: 'over_email_send_rate_limit' });
  assert(m3.indexOf(RATE)>=0, 'E6 429 はレート制限文言に分岐');

  const m4 = A.formatMagicLinkError({ message: 'Email rate limit exceeded' });
  assert(m4.indexOf(RATE)>=0, 'E7 message の rate limit でもレート制限文言');

  const m5 = A.formatMagicLinkError({ status: 500, message: 'Error sending magic link email' });
  assert(m5.indexOf(GENERIC)>=0 && m5.indexOf('Error sending')<0, 'E8 生のエラー文字列を画面文言に含めない');

  const m6 = A.formatMagicLinkError(null);
  assert(typeof m6==='string' && m6.indexOf(GENERIC)>=0, 'E9 err=null でも例外なく汎用文言');

  assert(warns.length>=6 && warns.some(w=>w.indexOf('Error sending magic link email')>=0), 'E10 詳細は console.warn に出る');

  assert(AUTH_JS.indexOf("'送信に失敗しました: ' + res.error.message")<0, 'E11 旧・生連結の文言が残っていない');
})();

// ============================================================ R. requestMagicLink 統合
(function(){
  function clientWithError(err){
    return { auth: { signInWithOtp(){ return Promise.resolve({ data:null, error: err }); } } };
  }
  function clientReject(err){
    return { auth: { signInWithOtp(){ return Promise.reject(err); } } };
  }
  function clientOk(){
    return { auth: { signInWithOtp(){ return Promise.resolve({ data:{}, error:null }); } } };
  }

  return A.requestMagicLink(clientWithError({ message:'' }), 'kakuu@example.com').then(function(r){
    assert(r.ok===false && r.message.indexOf(GENERIC)>=0, 'R1 空 message エラーで ok:false＋汎用文言');
    assert(r.message.indexOf('送信に失敗しました:')<0, 'R2 旧文言（生連結）を出さない');
    return A.requestMagicLink(clientWithError({ status:429, message:'rate limit' }), 'kakuu@example.com');
  }).then(function(r){
    assert(r.ok===false && r.message.indexOf(RATE)>=0, 'R3 429 エラーでレート制限文言');
    return A.requestMagicLink(clientReject(new Error('network down')), 'kakuu@example.com');
  }).then(function(r){
    assert(r.ok===false && r.message.indexOf(GENERIC)>=0, 'R4 Promise reject でも未処理にせず汎用文言');
    return A.requestMagicLink(clientOk(), 'kakuu@example.com');
  }).then(function(r){
    assert(r.ok===true && r.message==='ログイン用リンクを送りました。メールを確認してください。', 'R5 成功文言は無改変');
    return A.requestMagicLink(clientOk(), 'nope');
  }).then(function(r){
    assert(r.ok===false && r.message==='メールアドレスの形式が正しくありません。', 'R6 形式バリデーション文言は無改変');
  }).then(done, function(e){ ng('R* 例外: '+(e&&e.message)); done(); });
})();

function done(){
  console.log('AUTH-ERROR-MSG-001: PASS='+pass+' FAIL='+fail);
  process.exit(fail>0?1:0);
}
