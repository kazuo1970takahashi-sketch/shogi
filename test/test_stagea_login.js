#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage A — マジックリンク・ログイン + 幹事管理 runtime（app/auth.js）単体テスト。
//   正本: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md（更新3 / A3）
//   観点:
//     L  ログイン: パスワード欄なし / signInWithOtp 発行 / 不正メール拒否 / 再送で復帰。
//     S  セッション/claim: 未ログイン→login / active→app / 未登録(空)→案内文 / suspended のみ→案内文。
//     A  管理: owner/admin のみ admin パネル表示 / 招待は insert / 停止・退任で update /
//        最後の active owner/admin を停止・退任できないガード（クライアント）。
//   実データ・実会員名簿は使わない（架空のみ）。supabase client は mock 注入。当日運営(shogi_v4.html)は触らない。

const fs = require('fs');
const path = require('path');

const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(m){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+m); }
function ng(m){ fail++; console.error('  ✗ '+m); }
function assert(c,m){ c?ok(m):ng(m); }

// ---- 最小 DOM mock（controller のビュー差し替えを innerHTML で観測する）----
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
// ---- fake window で auth.js を読み込む ----
function loadAuth(extra){
  const win = Object.assign({ location:{ origin:'https://app.test', pathname:'/app/' } }, extra||{});
  new Function('window', AUTH_JS)(win);
  return win.ShogiAuth;
}

// ---- mock supabase client（呼び出しを記録）----
function makeClient(opts){
  opts = opts || {};
  const calls = { otp:[], insert:[], update:[], signOut:0, rpc:0, getSession:0 };
  function result(data, error){ return Promise.resolve({ data: (data===undefined?null:data), error: error||null }); }
  // チェーン可能で thenable な query builder。
  function builder(table, op, payload){
    const b = { _table:table, _op:op, _payload:payload, _filters:{} };
    b.eq = function(k,v){ this._filters[k]=v; return this; };
    b.select = function(){ return this; };
    b.then = function(res, rej){
      let out;
      if(op==='insert'){ calls.insert.push({table, payload}); out = opts.insertResult || result(null); }
      else if(op==='update'){ calls.update.push({table, payload, filters:b._filters}); out = opts.updateResult || result(null); }
      else { out = result(opts.selectData!==undefined?opts.selectData:[]); }
      return out.then(res, rej);
    };
    return b;
  }
  return {
    _calls: calls,
    auth: {
      signInWithOtp(args){ calls.otp.push(args); return opts.otpError?result(null,{message:opts.otpError}):result({},null); },
      getSession(){ calls.getSession++; return result({ session: (opts.session!==undefined?opts.session:null) }); },
      signOut(){ calls.signOut++; return result({}); },
      onAuthStateChange(cb){ calls._authCb = cb; return { data:{ subscription:{ unsubscribe(){} } } }; }
    },
    rpc(name){ calls.rpc++; calls._rpcName=name; return result(opts.memberships!==undefined?opts.memberships:[]); },
    from(table){ return { select:()=>builder(table,'select'), insert:(p)=>builder(table,'insert',p), update:(p)=>builder(table,'update',p), delete:()=>builder(table,'delete') }; }
  };
}

const A = loadAuth();

// ============================================================ L. ログイン
(function(){
  // パスワード欄が無い・メール欄がある
  const html = A.buildLoginViewHtml();
  assert(html.indexOf('type="email"')>=0, 'L1 ログイン画面にメール入力欄がある');
  assert(html.indexOf('type="password"')<0 && html.toLowerCase().indexOf('password')<0, 'L2 ログイン画面にパスワード欄が無い');
  assert(html.indexOf('お忘れ')<0 && html.indexOf('リセット')<0 && html.indexOf('再設定')<0, 'L3 パスワード再設定/「お忘れ」導線が無い');

  assert(A.isValidEmail('a@b.co')===true && A.isValidEmail('bad')===false, 'L4 メール形式バリデーション');

  // signInWithOtp 発行（パスワードを渡さない）
  const c = makeClient();
  return A.requestMagicLink(c, ' Test@Example.com ').then(function(r){
    assert(r.ok===true, 'L5 マジックリンク発行に成功');
    assert(c._calls.otp.length===1, 'L6 signInWithOtp が1回呼ばれる');
    const arg = c._calls.otp[0];
    assert(arg.email==='Test@Example.com', 'L7 メールは trim される（パスワードは渡さない）');
    assert(!('password' in arg) && arg.options && arg.options.shouldCreateUser===true, 'L8 password を渡さず shouldCreateUser=true');
    // 不正メールは送信しない
    return A.requestMagicLink(c, 'nope').then(function(r2){
      assert(r2.ok===false && c._calls.otp.length===1, 'L9 不正メールは送信しない（otp 呼び出し増えず）');
      // 再送（同じメールで何度でも）＝復帰
      return A.requestMagicLink(c, 'again@example.com').then(function(r3){
        assert(r3.ok===true && c._calls.otp.length===2, 'L10 再送で復帰（同じ導線でもう一度送れる）');
      });
    });
  });
})();

// ============================================================ S. セッション/claim 分岐
(function(){
  const active = [{ club_id:'CA', club_name:'架空クラブA', role:'admin', status:'active', display_name:'架空アドミン' }];
  const sActive = A.summarizeMemberships(active);
  assert(sActive.isRegistered && sActive.isActive && sActive.isAdmin, 'S1 active admin を要約（登録/有効/管理者）');
  const sOrg = A.summarizeMemberships([{ club_id:'CA', role:'organizer', status:'active' }]);
  assert(sOrg.isActive && sOrg.isAdmin===false, 'S2 active organizer は管理者でない');
  const sNone = A.summarizeMemberships([]);
  assert(sNone.isRegistered===false && sNone.isActive===false, 'S3 空＝未登録（案内文を出す側）');
  const sSus = A.summarizeMemberships([{ club_id:'CA', role:'organizer', status:'suspended' }]);
  assert(sSus.isRegistered===true && sSus.isActive===false, 'S4 suspended のみ＝登録ありだが無効');

  // controller.evaluate のルーティング（innerHTML マーカーで観測）
  const doc1 = makeDoc();
  const cLogin = makeClient({ session:null });
  const ctrl1 = A.makeController({ client:cLogin, document:doc1 });
  return ctrl1.init().then(function(){
    assert(doc1.getElementById('app-root').innerHTML.indexOf('magicForm')>=0, 'S5 未ログイン → ログイン画面');

    const doc2 = makeDoc();
    const cApp = makeClient({ session:{ user:{ email:'admin@example.test' } }, memberships:active, selectData:active });
    const ctrl2 = A.makeController({ client:cApp, document:doc2 });
    return ctrl2.init().then(function(){
      const h = doc2.getElementById('app-root').innerHTML;
      assert(h.indexOf('adminPanel')>=0, 'S6 active admin → アプリ＋幹事管理パネル');
      assert(cApp._calls.rpc===1 && cApp._calls._rpcName==='claim_organizer_seat', 'S7 ログイン時に claim_organizer_seat を呼ぶ');

      const doc3 = makeDoc();
      const cUnreg = makeClient({ session:{ user:{ email:'stranger@example.test' } }, memberships:[] });
      const ctrl3 = A.makeController({ client:cUnreg, document:doc3 });
      return ctrl3.init().then(function(){
        assert(doc3.getElementById('app-root').innerHTML.indexOf('幹事登録がありません')>=0, 'S8 未登録メール → 案内文（幹事登録がありません）');
      });
    });
  });
})();

// ============================================================ A. 管理（招待 / 停止 / 退任 / 最後の admin ガード）
(function(){
  const organizers = [
    { id:'o1', email:'owner@example.test', role:'owner', status:'active', display_name:'O' },
    { id:'o2', email:'org@example.test', role:'organizer', status:'active', display_name:'G' }
  ];
  assert(A.countActiveAdmins(organizers)===1, 'A1 active owner/admin の数を数える');
  assert(A.isLastActiveAdmin(organizers, organizers[0])===true, 'A2 唯一の owner は「最後の admin」');
  assert(A.isLastActiveAdmin(organizers, organizers[1])===false, 'A3 organizer は admin ガード対象外');

  // 非 admin（organizer）にはパネルを出さない
  const sOrg = A.summarizeMemberships([{ club_id:'CA', role:'organizer', status:'active' }]);
  assert(A.buildAppViewHtml(sOrg, []).indexOf('adminPanel')<0, 'A4 organizer 画面に幹事管理パネルを出さない');

  // owner 画面のリスト：最後の owner の「一時停止/退任」は disabled
  const ownerRow = A.buildOrganizerRowHtml(organizers[0], organizers);
  assert(/act-suspend[^>]*disabled/.test(ownerRow) && /act-retire[^>]*disabled/.test(ownerRow), 'A5 最後の owner の停止/退任ボタンは disabled');

  const c = makeClient();
  // 招待 = organizers へ insert（active・user_id なし）
  return A.inviteOrganizer(c, 'CA', ' New@Example.com ', 'organizer').then(function(r){
    assert(r.ok===true && c._calls.insert.length===1, 'A6 招待は organizers へ1回 insert');
    const p = c._calls.insert[0].payload;
    assert(p.club_id==='CA' && p.email==='New@Example.com' && p.role==='organizer' && p.status==='active' && !('user_id' in p),
      'A7 招待 payload は club_id/email/role/active・user_id を持たない（claim で後付け）');
    // 不正メールは招待しない
    return A.inviteOrganizer(c, 'CA', 'bad', 'admin').then(function(r2){
      assert(r2.ok===false && c._calls.insert.length===1, 'A8 不正メールは招待しない');
      // 最後の owner を停止しようとするとガードで update を呼ばない
      return A.setOrganizerStatus(c, 'o1', 'suspended', organizers).then(function(r3){
        assert(r3.ok===false && c._calls.update.length===0, 'A9 最後の owner/admin の停止はクライアントガードで弾く（update 呼ばず）');
        // organizer なら停止できる（update が走る）
        return A.setOrganizerStatus(c, 'o2', 'suspended', organizers).then(function(r4){
          assert(r4.ok===true && c._calls.update.length===1 && c._calls.update[0].payload.status==='suspended', 'A10 organizer は停止できる（status=suspended で update）');
        });
      });
    });
  });
})();

// 非同期テストの収束を待ってから集計（簡易: microtask を十分に流す）。
setTimeout(function(){
  console.log('');
  console.log('  Stage A login テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail===0?0:1);
}, 50);
