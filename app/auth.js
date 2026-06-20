/* =============================================================================
 * DATA-PERSISTENCE-PHASE2 / Stage A — マジックリンク・ログイン + 幹事管理（runtime）
 *   正本: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md（更新3 / A3）
 *
 * 方針:
 *   - 当日運営（shogi_v4.html / localStorage）には一切触れない別レイヤー。
 *   - publishable key + Project URL のみ使用（window.SHOGI_CLOUD_CONFIG）。secret は使わない。
 *   - パスワードレス（signInWithOtp のマジックリンク）。パスワード欄・「お忘れ」導線を出さない。
 *   - セッションは supabase-js が長期保持。再訪は開くだけ。復旧は同じメールで再送。
 *   - 権限判定は必ず DB 側 RLS。クライアントの role 表示・最後のadminガードは UX 補助で、
 *     最終的な強制は RLS / トリガ（claim_organizer_seat・prevent_last_admin_removal）。
 *   - build / bind / coordinator パターン（build=純粋にHTML文字列・bind=イベント・render=統括）。
 *
 * テスト容易性: supabase client は引数で注入できる（node から mock を渡せる）。
 *   トップレベルで document を参照しない（window.ShogiAuth に API を生やすだけ）。
 * ============================================================================= */
(function (global) {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function isValidEmail(s) { return typeof s === 'string' && EMAIL_RE.test(s.trim()); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  var ROLE_LABEL = { owner: 'オーナー', admin: '管理者', organizer: '幹事', viewer: '閲覧' };
  var STATUS_LABEL = { active: '有効', suspended: '一時停止', retired: '退任' };

  // ---- 所属（claim_organizer_seat の戻り）から表示状態を要約（純粋）----
  function summarizeMemberships(memberships, preferredClubId) {
    var list = Array.isArray(memberships) ? memberships : [];
    if (!list.length) return { isRegistered: false, isActive: false, isAdmin: false };
    var actives = list.filter(function (m) { return m.status === 'active'; });
    var pick = null;
    if (preferredClubId) pick = actives.filter(function (m) { return m.club_id === preferredClubId; })[0] || null;
    if (!pick) pick = actives[0] || null;
    if (!pick) {
      // 登録はあるが active が無い（suspended / retired のみ）。
      var any = list[0];
      return { isRegistered: true, isActive: false, isAdmin: false, role: any.role, status: any.status,
               clubId: any.club_id, clubName: any.club_name, displayName: any.display_name };
    }
    return {
      isRegistered: true, isActive: true,
      isAdmin: (pick.role === 'owner' || pick.role === 'admin'),
      role: pick.role, status: pick.status,
      clubId: pick.club_id, clubName: pick.club_name, displayName: pick.display_name,
      memberships: list
    };
  }

  // ---- 最後の active owner/admin ガード（UX 補助。DB は trigger で強制）----
  function countActiveAdmins(organizers) {
    return (organizers || []).filter(function (o) {
      return o.status === 'active' && (o.role === 'owner' || o.role === 'admin');
    }).length;
  }
  function isLastActiveAdmin(organizers, org) {
    var isAdmin = org && org.status === 'active' && (org.role === 'owner' || org.role === 'admin');
    return !!isAdmin && countActiveAdmins(organizers) <= 1;
  }

  // ===========================================================================
  // build（純粋・HTML 文字列を返す。イベントは持たない）
  // ===========================================================================
  function buildLoginViewHtml() {
    // パスワード欄なし・「お忘れ」導線なし。メール1つだけ。
    return '' +
      '<section class="card" id="loginView">' +
      '<h1>沼津支部 幹事ログイン</h1>' +
      '<p class="muted">登録メールにログイン用リンクを送ります。パスワードはありません。</p>' +
      '<form id="magicForm" autocomplete="on">' +
      '<label for="emailInput">メールアドレス</label>' +
      '<input type="email" id="emailInput" name="email" inputmode="email" autocomplete="email" required placeholder="you@example.com">' +
      '<button type="submit" id="sendLinkBtn" class="primary">ログインリンクを送る</button>' +
      '</form>' +
      '<p id="loginMsg" class="msg" role="status"></p>' +
      '</section>';
  }
  function buildCheckEmailViewHtml(email) {
    return '' +
      '<section class="card" id="checkEmailView">' +
      '<h1>メールを確認してください</h1>' +
      '<p><strong>' + esc(email) + '</strong> 宛にログイン用リンクを送りました。' +
      'メール内のボタンを開くとログインできます（リンクは一定時間で失効します）。</p>' +
      '<p class="muted">届かない場合は迷惑メールを確認するか、下のボタンで再送できます。</p>' +
      '<button type="button" id="resendBtn">リンクを再送する</button>' +
      '<p id="loginMsg" class="msg" role="status"></p>' +
      '</section>';
  }
  function buildUnregisteredViewHtml(email) {
    return '' +
      '<section class="card" id="unregisteredView">' +
      '<h1>幹事登録がありません</h1>' +
      '<p>このメール（<strong>' + esc(email) + '</strong>）は幹事として登録されていません。' +
      'クラブの管理者（オーナー）にご連絡ください。</p>' +
      '<button type="button" id="signOutBtn">別のメールでログイン</button>' +
      '</section>';
  }
  function buildOrganizerRowHtml(org, organizers) {
    var lastGuard = isLastActiveAdmin(organizers, org);
    var who = esc(org.display_name || org.email || '(無名)');
    var role = ROLE_LABEL[org.role] || org.role;
    var status = STATUS_LABEL[org.status] || org.status;
    var id = esc(org.id);
    var h = '<li class="org-row" data-id="' + id + '">' +
      '<span class="org-who">' + who + '</span>' +
      '<span class="org-meta">' + esc(role) + ' / ' + esc(status) + '</span>' +
      '<span class="org-actions">';
    if (org.status === 'active') {
      h += '<button type="button" class="act-suspend" data-id="' + id + '"' + (lastGuard ? ' disabled title="最後のオーナー/管理者は停止できません"' : '') + '>一時停止</button>';
      h += '<button type="button" class="act-retire"  data-id="' + id + '"' + (lastGuard ? ' disabled title="最後のオーナー/管理者は退任にできません"' : '') + '>退任</button>';
    } else {
      h += '<button type="button" class="act-reactivate" data-id="' + id + '">再有効化（再招待）</button>';
    }
    h += '</span></li>';
    return h;
  }
  function buildAdminPanelHtml(organizers, summary) {
    var rows = (organizers || []).map(function (o) { return buildOrganizerRowHtml(o, organizers); }).join('');
    return '' +
      '<section class="card" id="adminPanel">' +
      '<h2>幹事の管理</h2>' +
      '<p class="muted">オーナー/管理者のみ。停止・退任しても会員名簿や履歴は消えません。' +
      'オーナー/管理者は常に1人以上必要です。</p>' +
      '<form id="inviteForm">' +
      '<label for="inviteEmail">メールで招待</label>' +
      '<input type="email" id="inviteEmail" name="email" autocomplete="off" placeholder="new@example.com" required>' +
      '<select id="inviteRole" name="role">' +
      '<option value="organizer">幹事</option>' +
      '<option value="admin">管理者</option>' +
      '<option value="viewer">閲覧</option>' +
      '</select>' +
      '<button type="submit" id="inviteBtn">招待する</button>' +
      '</form>' +
      '<ul class="org-list">' + rows + '</ul>' +
      '<p id="adminMsg" class="msg" role="status"></p>' +
      '</section>';
  }
  function buildAppViewHtml(summary, organizers) {
    var name = esc(summary.displayName || '');
    var club = esc(summary.clubName || '');
    var role = ROLE_LABEL[summary.role] || summary.role;
    var head = '' +
      '<section class="card" id="appView">' +
      '<h1>' + club + '</h1>' +
      '<p>ようこそ、' + (name ? name + ' さん' : 'ゲスト') + '（' + esc(role) + '）</p>' +
      '<button type="button" id="signOutBtn">ログアウト</button>' +
      '</section>';
    return head + (summary.isAdmin ? buildAdminPanelHtml(organizers, summary) : '');
  }

  // ===========================================================================
  // supabase ラッパ（client を引数注入・テストで mock 可）
  // ===========================================================================
  function redirectTo() {
    try { return global.location.origin + global.location.pathname; } catch (e) { return undefined; }
  }
  function requestMagicLink(client, email) {
    var addr = (email || '').trim();
    if (!isValidEmail(addr)) return Promise.resolve({ ok: false, message: 'メールアドレスの形式が正しくありません。' });
    return client.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: redirectTo() }
    }).then(function (res) {
      if (res && res.error) return { ok: false, message: '送信に失敗しました: ' + res.error.message };
      return { ok: true, email: addr, message: 'ログイン用リンクを送りました。メールを確認してください。' };
    });
  }
  function loadSession(client) {
    return client.auth.getSession().then(function (res) {
      return (res && res.data) ? res.data.session : null;
    });
  }
  function claimAndLoadMemberships(client) {
    // SECURITY DEFINER RPC: email 一致の招待を claim し、自分の所属一覧を返す。
    return client.rpc('claim_organizer_seat').then(function (res) {
      if (res && res.error) return { error: res.error, memberships: [] };
      return { memberships: Array.isArray(res.data) ? res.data : [] };
    });
  }
  function fetchOrganizers(client, clubId) {
    return client.from('organizers').select('id,email,role,status,display_name,user_id,club_id')
      .eq('club_id', clubId).then(function (res) {
        if (res && res.error) return { error: res.error, organizers: [] };
        return { organizers: Array.isArray(res.data) ? res.data : [] };
      });
  }
  function inviteOrganizer(client, clubId, email, role) {
    var addr = (email || '').trim();
    if (!isValidEmail(addr)) return Promise.resolve({ ok: false, message: 'メールアドレスの形式が正しくありません。' });
    var r = (['owner', 'admin', 'organizer', 'viewer'].indexOf(role) >= 0) ? role : 'organizer';
    return client.from('organizers').insert({ club_id: clubId, email: addr, role: r, status: 'active' })
      .then(function (res) {
        if (res && res.error) return { ok: false, message: '招待できませんでした（権限/重複の可能性）: ' + res.error.message };
        return { ok: true, message: addr + ' を招待しました。本人がメールのリンクからログインすると有効になります。' };
      });
  }
  // status 変更（suspend/retire/active）。最後の active owner/admin を消す操作はクライアントでも弾く。
  function setOrganizerStatus(client, id, status, organizers) {
    var target = (organizers || []).filter(function (o) { return o.id === id; })[0];
    if (target && (status === 'suspended' || status === 'retired') && isLastActiveAdmin(organizers, target)) {
      return Promise.resolve({ ok: false, message: '最後のオーナー/管理者は停止・退任できません。先に別の管理者を有効化してください。' });
    }
    return client.from('organizers').update({ status: status }).eq('id', id).then(function (res) {
      if (res && res.error) return { ok: false, message: '変更できませんでした: ' + res.error.message };
      return { ok: true, message: '更新しました。' };
    });
  }
  function signOut(client) { return client.auth.signOut(); }

  // ===========================================================================
  // coordinator（render = build → mount → bind）。document/client は init で解決。
  // ===========================================================================
  function makeController(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof global.document !== 'undefined' ? global.document : null);
    var client = opts.client || null;
    var root = null;
    var pendingEmail = '';
    var lastSummary = null;
    var lastOrganizers = [];

    function mount(html) { if (root) root.innerHTML = html; }
    function byId(id) { return doc ? doc.getElementById(id) : null; }
    function setMsg(id, text) { var el = byId(id); if (el) el.textContent = text || ''; }

    function showLogin() { mount(buildLoginViewHtml()); bindLogin(); }
    function showCheckEmail(email) { pendingEmail = email; mount(buildCheckEmailViewHtml(email)); bindCheckEmail(); }
    function showUnregistered(email) { mount(buildUnregisteredViewHtml(email)); bindUnregistered(); }
    function showApp(summary, organizers) { lastSummary = summary; lastOrganizers = organizers || []; mount(buildAppViewHtml(summary, lastOrganizers)); bindApp(); }

    function bindLogin() {
      var form = byId('magicForm');
      if (form) form.addEventListener('submit', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var email = (byId('emailInput') || {}).value || '';
        setMsg('loginMsg', '送信中…');
        requestMagicLink(client, email).then(function (r) {
          if (r.ok) showCheckEmail(r.email); else setMsg('loginMsg', r.message);
        });
      });
    }
    function bindCheckEmail() {
      var btn = byId('resendBtn');
      if (btn) btn.addEventListener('click', function () {
        setMsg('loginMsg', '再送中…');
        requestMagicLink(client, pendingEmail).then(function (r) { setMsg('loginMsg', r.message); });
      });
    }
    function bindUnregistered() {
      var btn = byId('signOutBtn');
      if (btn) btn.addEventListener('click', function () { signOut(client).then(showLogin); });
    }
    function bindApp() {
      var so = byId('signOutBtn');
      if (so) so.addEventListener('click', function () { signOut(client).then(showLogin); });
      var inviteForm = byId('inviteForm');
      if (inviteForm) inviteForm.addEventListener('submit', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var email = (byId('inviteEmail') || {}).value || '';
        var role = (byId('inviteRole') || {}).value || 'organizer';
        inviteOrganizer(client, lastSummary.clubId, email, role).then(function (r) {
          setMsg('adminMsg', r.message); if (r.ok) refreshAdmin();
        });
      });
      bindOrgActions();
    }
    function bindOrgActions() {
      if (!doc || !doc.querySelectorAll) return;
      function wire(sel, status) {
        var nodes = doc.querySelectorAll(sel); if (!nodes) return;
        Array.prototype.forEach.call(nodes, function (n) {
          n.addEventListener('click', function () {
            setOrganizerStatus(client, n.getAttribute('data-id'), status, lastOrganizers)
              .then(function (r) { setMsg('adminMsg', r.message); if (r.ok) refreshAdmin(); });
          });
        });
      }
      wire('.act-suspend', 'suspended');
      wire('.act-retire', 'retired');
      wire('.act-reactivate', 'active');
    }
    function refreshAdmin() {
      if (!lastSummary || !lastSummary.isAdmin) return Promise.resolve();
      return fetchOrganizers(client, lastSummary.clubId).then(function (r) {
        showApp(lastSummary, r.organizers);
      });
    }

    // ログイン状態を評価して適切なビューを出す（セッション復元・claim・未登録分岐）。
    function evaluate() {
      return loadSession(client).then(function (session) {
        if (!session) { showLogin(); return; }
        var email = (session.user && session.user.email) || '';
        return claimAndLoadMemberships(client).then(function (r) {
          var summary = summarizeMemberships(r.memberships);
          if (!summary.isRegistered || !summary.isActive) { showUnregistered(email); return; }
          if (summary.isAdmin) {
            return fetchOrganizers(client, summary.clubId).then(function (o) { showApp(summary, o.organizers); });
          }
          showApp(summary, []);
        });
      });
    }

    function init() {
      root = byId('app-root');
      // セッション変化（マジックリンク帰着・サインアウト）で再評価。
      if (client && client.auth && client.auth.onAuthStateChange) {
        client.auth.onAuthStateChange(function () { evaluate(); });
      }
      return evaluate();
    }

    return {
      init: init, evaluate: evaluate,
      showLogin: showLogin, showApp: showApp, showUnregistered: showUnregistered, showCheckEmail: showCheckEmail,
      _setRoot: function (r) { root = r; }
    };
  }

  // 実ページ用のブートストラップ（config から client を作って init）。
  function boot() {
    var cfg = global.SHOGI_CLOUD_CONFIG;
    var doc = global.document;
    function fail(msg) { var el = doc && doc.getElementById('app-root'); if (el) el.innerHTML = '<section class="card"><h1>設定エラー</h1><p>' + esc(msg) + '</p></section>'; }
    if (!cfg || !cfg.url || !cfg.publishableKey || /REPLACE_ME|YOUR_PROJECT_REF/.test(cfg.url + cfg.publishableKey)) {
      fail('app/config.js が未設定です。app/config.example.js を複製して URL と publishable key を設定してください。'); return;
    }
    if (!global.supabase || !global.supabase.createClient) { fail('supabase-js を読み込めませんでした。'); return; }
    var client = global.supabase.createClient(cfg.url, cfg.publishableKey);
    var ctrl = makeController({ client: client, document: doc });
    ctrl.init();
  }

  global.ShogiAuth = {
    // 純粋ヘルパ（テスト対象）
    isValidEmail: isValidEmail,
    summarizeMemberships: summarizeMemberships,
    countActiveAdmins: countActiveAdmins,
    isLastActiveAdmin: isLastActiveAdmin,
    // build
    buildLoginViewHtml: buildLoginViewHtml,
    buildCheckEmailViewHtml: buildCheckEmailViewHtml,
    buildUnregisteredViewHtml: buildUnregisteredViewHtml,
    buildOrganizerRowHtml: buildOrganizerRowHtml,
    buildAdminPanelHtml: buildAdminPanelHtml,
    buildAppViewHtml: buildAppViewHtml,
    // actions（client 注入）
    requestMagicLink: requestMagicLink,
    loadSession: loadSession,
    claimAndLoadMemberships: claimAndLoadMemberships,
    fetchOrganizers: fetchOrganizers,
    inviteOrganizer: inviteOrganizer,
    setOrganizerStatus: setOrganizerStatus,
    signOut: signOut,
    // coordinator
    makeController: makeController,
    boot: boot
  };
})(typeof window !== 'undefined' ? window : this);
