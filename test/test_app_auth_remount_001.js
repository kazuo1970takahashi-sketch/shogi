#!/usr/bin/env node
// APP-AUTH-REMOUNT-001 (#565) — onAuthStateChange の event 種別分岐テスト（app/auth.js）。
//   観点:
//     E  event 分岐: TOKEN_REFRESHED / INITIAL_SESSION / 不明値では再マウントしない。
//        SIGNED_IN / SIGNED_OUT / USER_UPDATED では従来どおり再評価・遷移する。
//     C  cold load: init() の evaluate() は一度だけ（claim_organizer_seat RPC が二重に呼ばれない）。
//     P  構造 pin: 素通し登録（イベント無視分岐なし）に戻っていないこと。
//   実データ・実会員名簿は使わない（架空のみ）。supabase client は mock 注入。当日運営(shogi_v4.html)は触らない。

const fs = require('fs');
const path = require('path');

const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(m){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+m); }
function ng(m){ fail++; console.error('  ✗ '+m); }
function assert(c,m){ c?ok(m):ng(m); }

// ---- 最小 DOM mock（test_stagea_login.js と同型・innerHTML で再マウントを観測）----
function makeNode(){
  return { nodeType:1, id:'', innerHTML:'', value:'', textContent:'', disabled:false, _attrs:{}, _listeners:{},
    setAttribute(k,v){this._attrs[k]=String(v);}, getAttribute(k){return (k in this._attrs)?this._attrs[k]:null;},
    addEventListener(ev,cb){(this._listeners[ev]=this._listeners[ev]||[]).push(cb);},
    removeEventListener(){}, querySelectorAll(){return [];} };
}
function makeDoc(){
  const els = {};
  return { _els:els,
    getElementById(id){ if(!els[id]){ const n=makeNode(); n.id=id; els[id]=n; } return els[id]; },
    querySelectorAll(){ return []; },
    addEventListener(){}, removeEventListener(){} };
}
function loadAuth(extra){
  const win = Object.assign({ location:{ origin:'https://app.test', pathname:'/app/' } }, extra||{});
  new Function('window', AUTH_JS)(win);
  return win.ShogiAuth;
}
// ---- mock supabase client（onAuthStateChange の cb を捕まえ、event 種別を注入できる）----
function makeClient(opts){
  opts = opts || {};
  const calls = { rpc:0, getSession:0 };
  function result(data, error){ return Promise.resolve({ data:(data===undefined?null:data), error:error||null }); }
  function builder(){
    const b = { _filters:{} };
    b.eq = function(){ return this; };
    b.select = function(){ return this; };
    b.then = function(res, rej){ return result(opts.selectData!==undefined?opts.selectData:[]).then(res, rej); };
    return b;
  }
  return {
    _calls: calls,
    _fire: function(ev){ if (calls._authCb) calls._authCb(ev); },
    auth: {
      getSession(){ calls.getSession++; return result({ session:(opts.session!==undefined?opts.session:null) }); },
      signOut(){ return result({}); },
      onAuthStateChange(cb){ calls._authCb = cb; return { data:{ subscription:{ unsubscribe(){} } } }; }
    },
    rpc(name){ calls.rpc++; calls._rpcName = name; return result(opts.memberships!==undefined?opts.memberships:[]); },
    from(){ return { select:()=>builder(), insert:()=>builder(), update:()=>builder(), delete:()=>builder() }; }
  };
}
function tick(){ return new Promise(r=>setTimeout(r, 5)); }

const A = loadAuth();
const active = [{ club_id:'CA', role:'owner', status:'active' }];
const SENTINEL = '<!--edit-in-progress-->';

(async function(){
  try {
    // ============================================ C. cold load（一度きり）
    const doc = makeDoc();
    const opts = { session:{ user:{ email:'admin@example.test' } }, memberships:active, selectData:active };
    const c = makeClient(opts);
    const ctrl = A.makeController({ client:c, document:doc });
    await ctrl.init();
    await tick();
    const root = doc.getElementById('app-root');
    assert(root.innerHTML.indexOf('adminPanel')>=0, 'C1 init で app が表示される（前提）');
    assert(c._calls.rpc===1, 'C2 cold load の claim RPC は一度だけ（init 直呼びのみ）');
    assert(typeof c._calls._authCb==='function', 'C3 onAuthStateChange が登録されている');

    // INITIAL_SESSION は無視（cold load 二重 evaluate の解消＝P3-1）
    c._fire('INITIAL_SESSION');
    await tick();
    assert(c._calls.rpc===1, 'C4 INITIAL_SESSION では evaluate が走らない（claim RPC 増えない）');

    // ============================================ E. event 分岐
    // TOKEN_REFRESHED: 編集途中を模した innerHTML が保持される（再マウントしない）
    root.innerHTML = root.innerHTML + SENTINEL;
    c._fire('TOKEN_REFRESHED');
    await tick();
    assert(root.innerHTML.indexOf(SENTINEL)>=0, 'E1 TOKEN_REFRESHED で root が再マウントされない（編集途中状態が保持）');
    assert(c._calls.rpc===1, 'E2 TOKEN_REFRESHED で claim RPC が呼ばれない');

    // 不明値 / undefined も無視（安全側）
    c._fire('SOME_FUTURE_EVENT');
    c._fire(undefined);
    await tick();
    assert(root.innerHTML.indexOf(SENTINEL)>=0 && c._calls.rpc===1, 'E3 不明イベント/undefined でも再マウントしない');

    // USER_UPDATED: 再評価する（sentinel が消え、claim RPC が増える）
    c._fire('USER_UPDATED');
    await tick();
    assert(root.innerHTML.indexOf(SENTINEL)<0, 'E4 USER_UPDATED で再評価（再マウント）される');
    assert(c._calls.rpc===2, 'E5 USER_UPDATED で claim RPC が走る');

    // SIGNED_IN: 再評価する（従来どおり）
    root.innerHTML = root.innerHTML + SENTINEL;
    c._fire('SIGNED_IN');
    await tick();
    assert(root.innerHTML.indexOf(SENTINEL)<0, 'E6 SIGNED_IN で再評価される');
    assert(c._calls.rpc===3, 'E7 SIGNED_IN で claim RPC が走る');

    // SIGNED_OUT: セッションを落としてから発火 → ログイン画面へ遷移
    opts.session = null;
    c._fire('SIGNED_OUT');
    await tick();
    assert(root.innerHTML.indexOf('magicForm')>=0, 'E8 SIGNED_OUT でログイン画面へ遷移する');

    // ============================================ P. 構造 pin（素通し登録への回帰防止）
    assert(!/onAuthStateChange\(function\s*\(\s*\)\s*\{\s*evaluate\(\);?\s*\}\s*\)/.test(AUTH_JS),
      'P1 引数なし素通しの onAuthStateChange(function(){evaluate();}) が残っていない');
    assert(/SIGNED_IN/.test(AUTH_JS) && /SIGNED_OUT/.test(AUTH_JS) && /USER_UPDATED/.test(AUTH_JS),
      'P2 SIGNED_IN / SIGNED_OUT / USER_UPDATED の分岐が存在する');
    assert(AUTH_JS.indexOf('TOKEN_REFRESHED')>=0, 'P3 TOKEN_REFRESHED を無視する意図がコード/コメントに明示されている');
  } catch (e) {
    ng('例外: '+(e && e.message));
  }
  console.log('');
  console.log('  APP-AUTH-REMOUNT-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail===0?0:1);
})();
