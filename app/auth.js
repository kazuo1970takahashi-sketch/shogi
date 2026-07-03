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
    // APP-UX-004B (作者承認 2026-07-03): 「役割 / 状態」の連結テキストを役割バッジ＋状態表示に分離
    //   （名簿シートの mk-badge と同じ設計言語）。data-id・act-* クラス・disabled ガードは全て温存。
    var lastGuard = isLastActiveAdmin(organizers, org);
    var who = esc(org.display_name || org.email || '(無名)');
    var role = ROLE_LABEL[org.role] || org.role;
    var status = STATUS_LABEL[org.status] || org.status;
    var id = esc(org.id);
    var badgeCls = (org.role === 'organizer') ? ' rb-organizer' : ((org.role === 'viewer') ? ' rb-viewer' : '');
    var statusCls = (org.status === 'active') ? '' : ' st-suspended';
    var h = '<li class="org-row" data-id="' + id + '">' +
      '<span class="org-who">' + who + '</span>' +
      '<span class="org-role-badge' + badgeCls + '">' + esc(role) + '</span>' +
      '<span class="org-status' + statusCls + '">' + esc(status) + '</span>' +
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
    // APP-UX-004B (作者承認 2026-07-03): 幹事管理の整列＋役割説明。
    //   ①招待フォームを .adm-form 化（高さ40px統一・役割 select は内容幅・「役割」ラベル追加）
    //   ②adminMsg を一覧の下→フォーム直下へ移動（操作結果はスクロールせず見える位置に出す）
    //   ③役割説明 .role-help を新設（管理者＝幹事の招待・管理ができる幹事、の整理は作者提示済み）。
    //   id（inviteForm/inviteEmail/inviteRole/inviteBtn/adminMsg）と bind は全て温存。
    var rows = (organizers || []).map(function (o) { return buildOrganizerRowHtml(o, organizers); }).join('');
    return '' +
      '<section class="card" id="adminPanel">' +
      '<h2>幹事の管理</h2>' +
      '<p class="muted">オーナー/管理者のみ。停止・退任しても会員名簿や履歴は消えません。' +
      'オーナー/管理者は常に1人以上必要です。</p>' +
      '<form id="inviteForm" class="adm-form">' +
      '<div class="adm-fld">' +
      '<label for="inviteEmail">メールで招待</label>' +
      '<input type="email" id="inviteEmail" name="email" autocomplete="off" placeholder="new@example.com" required>' +
      '</div>' +
      '<div class="adm-fld adm-fld-role">' +
      '<label for="inviteRole">役割</label>' +
      '<select id="inviteRole" name="role">' +
      '<option value="organizer">幹事</option>' +
      '<option value="admin">管理者</option>' +
      '<option value="viewer">閲覧</option>' +
      '</select>' +
      '</div>' +
      '<button type="submit" id="inviteBtn">招待する</button>' +
      '</form>' +
      '<p id="adminMsg" class="msg" role="status"></p>' +
      '<dl class="role-help">' +
      '<dt>オーナー</dt><dd>クラブの代表。管理者と同じ操作ができます。</dd>' +
      '<dt>管理者</dt><dd>幹事の招待・管理ができる幹事。</dd>' +
      '<dt>幹事</dt><dd>大会結果・名簿の編集ができます。他の幹事の招待・停止はできません。</dd>' +
      '<dt>閲覧</dt><dd>閲覧のみ。編集はできません。</dd>' +
      '</dl>' +
      '<ul class="org-list">' + rows + '</ul>' +
      '</section>';
  }
  // APP-UX-001 (作者依頼 2026-07-02): 「縦一本のカード羅列」をやめ、紺のヘッダバー＋ピル型ナビで
  //   セクション切替する骨格に刷新（当日アプリと同じ設計言語・STYLE-GUIDE M5=primary #1F3864 は index.html 側）。
  //   既存の全 id（cloudTournaments/cloudEntries/cloudMembers/cloudStandings/…/adminPanel）は温存＝
  //   各 render*/bind* は無改変で動く。ナビは .app-sec の display 切替のみ（bindAppNav）。
  //   「名簿」は従来 cloudReadView カード内に同居していたが専用カード（cloudMembersView）へ分離
  //   （中身の #cloudMembers は同一 id＝renderMemberEditor 非接触）。
  function buildAppViewHtml(summary, organizers) {
    var name = esc(summary.displayName || '');
    var club = esc(summary.clubName || '');
    var role = ROLE_LABEL[summary.role] || summary.role;
    var head = '' +
      '<header class="app-bar" id="appView">' +
      '<div class="app-bar-title">' + club + '<span class="app-bar-sub">クラウド管理</span></div>' +
      '<div class="app-bar-user">' + (name ? name + ' さん' : '') + '（' + esc(role) + '）' +
      '<button type="button" id="signOutBtn" class="bar-btn">ログアウト</button></div>' +
      '</header>';
    var nav = '' +
      '<nav class="app-nav" id="appNav">' +
      '<button type="button" class="nav-pill active" data-nav="sec-results">大会結果</button>' +
      '<button type="button" class="nav-pill" data-nav="sec-members">名簿</button>' +
      '<button type="button" class="nav-pill" data-nav="sec-standings">通年集計</button>' +
      '<button type="button" class="nav-pill" data-nav="sec-awards">記録・表彰</button>' +
      (summary.isAdmin ? '<button type="button" class="nav-pill" data-nav="sec-admin">幹事管理</button>' : '') +
      '</nav>';
    // APP-UX-004A2 (作者FB 2026-07-03「選んでも結果が下に出て見えない」＝結果視認性の原則):
    //   一覧⇄詳細のビュー切替。大会を選ぶと一覧を隠して結果だけ表示・「← 大会一覧へ」で戻る。
    //   id（cloudTournaments/cloudEntries）は温存＝既存 render/bind 非接触。
    var resultsSec = '' +
      '<div class="app-sec" id="sec-results">' +
      '<section class="card" id="cloudReadView">' +
      '<div id="tntListView">' +
      '<h2>過去の大会（クラウド・閲覧）</h2>' +
      '<p class="muted">大会を選ぶと結果を表示します。</p>' +
      '<div id="cloudTournaments" class="muted">読み込み中…</div>' +
      '</div>' +
      '<div id="tntDetailView" style="display:none">' +
      '<button type="button" id="tntBackBtn" class="tnt-back">← 大会一覧へ</button>' +
      '<div id="cloudEntries" class="muted"></div>' +
      '</div>' +
      '</section>' +
      '</div>';
    var membersSec = '' +
      '<div class="app-sec" id="sec-members" style="display:none">' +
      '<section class="card" id="cloudMembersView">' +
      '<h2>名簿（クラウド・編集）</h2>' +
      '<div id="cloudMembers" class="muted">読み込み中…</div>' +
      '</section>' +
      '</div>';
    var standingsSec = '' +
      '<div class="app-sec" id="sec-standings" style="display:none">' +
      '<section class="card" id="cloudStandingsView">' +
      '<h2>通年集計（シーズン別成績）</h2>' +
      '<div id="standingsControls"><span id="seasonSelectWrap"></span><span id="classSelectWrap"></span></div>' +
      '<div id="cloudStandings" class="muted">読み込み中…</div>' +
      '</section>' +
      '</div>';
    var awardsSec = '' +
      '<div class="app-sec" id="sec-awards" style="display:none">' +
      '<div class="card-grid">' +
      '<section class="card" id="cloudGrowthView"><h2>成長賞（前年度比 勝率の伸び）</h2><div id="cloudGrowth" class="muted">読み込み中…</div></section>' +
      '<section class="card" id="cloudRecordsView"><h2>記録・殿堂</h2><div id="cloudRecords" class="muted">読み込み中…</div></section>' +
      '<section class="card" id="cloudMonthlyView"><h2>月別チャンピオン</h2><div id="cloudMonthly" class="muted">読み込み中…</div></section>' +
      '<section class="card" id="cloudCityView"><h2>市町村対抗</h2><div id="cloudCity" class="muted">読み込み中…</div></section>' +
      '</div>' +
      '</div>';
    var adminSec = summary.isAdmin ? ('' +
      '<div class="app-sec" id="sec-admin" style="display:none">' +
      buildAdminPanelHtml(organizers, summary) + buildImportPanelHtml() +
      '</div>') : '';
    return head + nav + resultsSec + membersSec + standingsSec + awardsSec + adminSec;
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
  // ===========================================================================
  // B-1（#343）: クラウド read-only 閲覧（過去大会・結果・名簿）。純 build＋fetch ラッパ。
  //   並べ替えは純関数側（mock/実 client とも .order 非依存）。本文は esc() 経由（XSS 安全）。
  // ===========================================================================
  var TSTATUS_LABEL = { draft:'下書き', confirmed:'確定', synced:'同期済み', 'void':'無効' };
  function sortTournamentsDesc(list) {
    return (Array.isArray(list) ? list.slice() : []).sort(function (a, b) {
      var da = (a && a.date) || '', db = (b && b.date) || '';
      if (da !== db) return da < db ? 1 : -1;                 // 日付 降順
      var na = (a && a.name) || '', nb = (b && b.name) || '';
      return na < nb ? -1 : (na > nb ? 1 : 0);
    });
  }
  function buildTournamentListHtml(tournaments) {
    var list = sortTournamentsDesc(tournaments);
    if (!list.length) return '<p class="muted">クラウドに大会がありません。</p>';
    // APP-UX-004C① (作者承認 2026-07-03): 行カード化＝日付・名称・年度・状態バッジをボタン内へ
    //   （行全体タップ）。button の class は 'cloud-tnt' 単独のまま（bindTournamentRows が
    //   className 直代入で 'cloud-tnt'/'cloud-tnt active' にリセットするため余計な class を足さない）。
    var rows = list.map(function (t) {
      var stKey = (t && t.status) || '';
      var st = TSTATUS_LABEL[stKey] || esc(stKey);
      var badge = st ? '<span class="tnt-status' + ((stKey === 'confirmed' || stKey === 'synced') ? '' : ' ts-other') + '">' + st + '</span>' : '';
      return '<li>' +
        '<button type="button" class="cloud-tnt" data-id="' + esc((t && t.id) || '') + '">' +
        '<span class="tnt-date">' + esc((t && t.date) || '') + '</span>' +
        '<span class="tnt-name">' + esc((t && t.name) || '(名称未設定)') + '</span>' +
        '<span class="tnt-season">' + esc((t && t.season) || '') + '</span>' + badge +
        '</button></li>';
    }).join('');
    return '<ul class="tnt-list">' + rows + '</ul>';
  }
  function buildMemberListHtml(members) {
    var list = Array.isArray(members) ? members.slice() : [];
    if (!list.length) return '<p class="muted">名簿が空です。</p>';
    list.sort(function (a, b) {
      var ya = (a && a.yomi) || '', yb = (b && b.yomi) || '';
      if (ya !== yb) return ya < yb ? -1 : 1;
      var na = (a && a.name) || '', nb = (b && b.name) || '';
      return na < nb ? -1 : (na > nb ? 1 : 0);
    });
    var rows = list.map(function (m) {
      var y = (m && m.yomi) ? ' <span class="org-meta">' + esc(m.yomi) + '</span>' : '';
      return '<li class="org-row"><span class="org-who">' + esc((m && m.name) || '') + '</span>' + y + '</li>';
    }).join('');
    return '<ul class="org-list">' + rows + '</ul>';
  }
  // A-4 (SYSTEM-REVIEW #377 follow): クラス集計キーの正規化（純）。表示ラベルの揺れを年度横断の安定キーへ。
  //   B-4 決定「少→B 統一」を読み取り側で吸収（既存データの書換え不要）。A/B/C・その他は trim のみ（恒等）。
  function canonicalizeClass(cls){
    var s=(cls==null)?'':String(cls).trim();
    if(s==='少'||s==='少年')return 'B';
    return s;
  }
  function shapeEntryRow(e) {
    var p = e && e.players, m = p && p.members;
    return {
      rank: (e && e.final_rank != null) ? e.final_rank : null,
      cls: canonicalizeClass((e && e['class']) || ''),
      name: (m && m.name) || '',
      yomi: (m && m.yomi) || '',
      wins: (e && e.wins) || 0,
      losses: (e && e.losses) || 0,
      sos: (e && e.sos != null) ? e.sos : '',
      sodos: (e && e.sodos != null) ? e.sodos : ''
    };
  }
  // APP-UX-004A (作者依頼 2026-07-03「当日アプリの順位表と同じUIに」): クラスごとのブロック・
  //   ふりがなルビ・1位ハイライト・凡例を当日 buildScoreboardClassTableHtml と同型に。
  //   回戦別の○×列はクラウドに一局データが無いため出せない（entries は集計値のみ・将来拡張候補）。
  function _entryNameRubyHtml(name, yomi) {
    var n = esc(name || '');
    return (typeof yomi === 'string' && yomi) ? '<ruby>' + n + '<rt>' + esc(yomi) + '</rt></ruby>' : n;
  }
  function buildEntryTableHtml(entries) {
    var list = (Array.isArray(entries) ? entries : []).map(shapeEntryRow);
    if (!list.length) return '<p class="muted">この大会の結果がありません。</p>';
    list.sort(function (a, b) {
      var ca = a.cls || '', cb = b.cls || '';
      if (ca !== cb) return ca < cb ? -1 : 1;
      var ra = (a.rank == null) ? 9999 : a.rank, rb = (b.rank == null) ? 9999 : b.rank;
      return ra - rb;
    });
    var order = [], byCls = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i].cls || '';
      if (!byCls[c]) { byCls[c] = []; order.push(c); }
      byCls[c].push(list[i]);
    }
    var html = '';
    for (var k = 0; k < order.length; k++) {
      var cls = order[k], rows = byCls[cls];
      html += '<div class="sb-class">';
      html += '<div class="sb-class-h">' + esc(cls ? cls + 'クラス' : '（クラスなし）') + '　<span class="sb-sub">最終結果</span></div>';
      html += '<table class="sb-table"><thead><tr><th class="sb-col-rank">順位</th><th class="sb-col-name">氏名</th><th>勝</th><th>負</th><th>B</th><th>C</th></tr></thead><tbody>';
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        html += '<tr' + (r.rank === 1 ? ' class="sb-row-1"' : '') + '>' +
          '<td class="sb-col-rank">' + (r.rank == null ? '-' : esc(String(r.rank))) + '</td>' +
          '<td class="sb-col-name">' + _entryNameRubyHtml(r.name, r.yomi) + '</td>' +
          '<td class="sb-wins">' + esc(String(r.wins)) + '</td>' +
          '<td class="sb-metric">' + esc(String(r.losses)) + '</td>' +
          '<td class="sb-metric">' + esc(String(r.sos)) + '</td>' +
          '<td class="sb-metric">' + esc(String(r.sodos)) + '</td></tr>';
      }
      html += '</tbody></table></div>';
    }
    html += '<div class="sb-legend">勝・負＝勝敗数　・　B＝対戦相手の勝数合計／C＝勝った相手の勝数合計（順位判定の主要指標）</div>';
    return html;
  }
  // APP-UX-004A: 選択中大会の見出し（大会結果の上に大会名・日付・年度/状態を表示）。
  function buildTournamentHeadHtml(t) {
    if (!t) return '';
    var st = TSTATUS_LABEL[t.status] || esc((t && t.status) || '');
    return '<div class="sb-tnt-head">' + esc(t.date || '') + '　' + esc(t.name || '(名称未設定)') +
      '<span class="sb-tnt-meta">' + esc(t.season || '') + '／' + st + '</span></div>';
  }
  function fetchTournaments(client, clubId) {
    return client.from('tournaments').select('id,name,date,season,status').eq('club_id', clubId).then(function (res) {
      if (res.error) return { ok:false, message:'大会の読み込みに失敗しました', tournaments:[] };
      return { ok:true, tournaments: res.data || [] };
    });
  }
  function fetchMembers(client, clubId) {
    return client.from('members').select('member_id,name,yomi').eq('club_id', clubId).then(function (res) {
      if (res.error) return { ok:false, message:'名簿の読み込みに失敗しました', members:[] };
      return { ok:true, members: res.data || [] };
    });
  }
  // entries→players は FK が2本（player_id / (club_id,player_id)）で埋め込みが曖昧（PGRST200/201）になるため、
  // players は埋め込まず club 単位で別取得し JS で突き合わせる（制約名に非依存・確実）。shapeEntryRow 互換の形に再構成。
  function fetchEntries(client, tournamentId, clubId) {
    return client.from('entries')
      .select('final_rank,class,wins,losses,sos,sodos,participated,player_id')
      .eq('tournament_id', tournamentId).then(function (res) {
        if (res.error) return { ok:false, message:'結果の読み込みに失敗しました', entries:[] };
        var rows = res.data || [];
        return client.from('players').select('id,member_id,members(name,yomi)').eq('club_id', clubId).then(function (pr) {
          if (pr.error) return { ok:false, message:'選手情報の読み込みに失敗しました', entries:[] };
          var byId = {}, plist = pr.data || [];
          for (var i=0;i<plist.length;i++){ if(plist[i]) byId[plist[i].id]=plist[i]; }
          for (var j=0;j<rows.length;j++){ var pl=byId[rows[j] && rows[j].player_id]; rows[j].players = pl ? { member_id: pl.member_id, members: pl.members } : null; }
          return { ok:true, entries: rows };
        });
      });
  }

  // ===========================================================================
  // B-5（#343）: 名簿の編集（追加 / 氏名・ふりがな・支部の更新 / 論理削除・復元）。
  //   クラウド members を正本として app/ から直接編集する。権限は RLS が最終強制
  //   （insert/update＝active organizer 全員可・物理 delete は admin 限定＝本UIは行わない）。
  //   論理削除＝deleted_at に時刻を set する update（復元＝null に戻す）。当日アプリ
  //   (shogi_v4.html) には一切触れない。build/bind/coordinator パターン・client 注入。
  // ===========================================================================

  // ===========================================================================
  // 通年集計（シーズン別成績・#343 / B-4 の活用）: entries＋tournaments(season)＋
  //   players→members(name) を集約し、年度ごとの個人成績（出場・勝・負・優勝回数・勝率）を表示。
  //   read-only。集計は純関数（テスト対象）。client 注入。
  // ===========================================================================
  // entries→players / entries→tournaments はいずれも FK が2本で埋め込みが曖昧（PGRST200/201）になるため、
  // players と tournaments を club 単位で別取得し JS で突き合わせる。shapeStandingRow 互換の形に再構成。
  function fetchSeasonEntries(client, clubId) {
    return client.from('entries')
      .select('wins,losses,final_rank,class,player_id,tournament_id')
      .eq('club_id', clubId).then(function (res) {
        if (res.error) return { ok:false, message:'成績の読み込みに失敗しました', rows:[] };
        var rows = res.data || [];
        return client.from('players').select('id,member_id,members(name,city)').eq('club_id', clubId).then(function (pr) {
          if (pr.error) return { ok:false, message:'成績の読み込みに失敗しました', rows:[] };
          return client.from('tournaments').select('id,season,date').eq('club_id', clubId).then(function (tr) {
            if (tr.error) return { ok:false, message:'成績の読み込みに失敗しました', rows:[] };
            var pById={}, tById={}, pl=pr.data||[], tl=tr.data||[];
            for (var i=0;i<pl.length;i++){ if(pl[i]) pById[pl[i].id]=pl[i]; }
            for (var k=0;k<tl.length;k++){ if(tl[k]) tById[tl[k].id]=tl[k]; }
            for (var j=0;j<rows.length;j++){
              var P=pById[rows[j] && rows[j].player_id]; rows[j].players = P ? { member_id:P.member_id, members:P.members } : null;
              var T=tById[rows[j] && rows[j].tournament_id]; rows[j].tournaments = T ? { season:T.season, date:T.date } : null;
            }
            return { ok:true, rows: rows };
          });
        });
      });
  }
  // entry（embedding 付き）→ 平坦化（純粋）。
  function shapeStandingRow(e) {
    var p = e && e.players, m = p && p.members, t = e && e.tournaments;
    return {
      season: (t && t.season) || '',
      date: (t && t.date) || '',
      cls: canonicalizeClass((e && e['class']) || ''),
      member_id: (p && p.member_id) || '',
      name: (m && m.name) || '',
      city: (m && m.city) || '',
      wins: (e && e.wins) || 0,
      losses: (e && e.losses) || 0,
      rank: (e && e.final_rank != null) ? e.final_rank : null
    };
  }
  // 年度の一覧（降順・新しい年度が先頭）。
  function listSeasons(rows) {
    var seen = {}, out = [];
    for (var i = 0; i < (rows || []).length; i++) { var s = rows[i] && rows[i].season; if (s && !seen[s]) { seen[s] = 1; out.push(s); } }
    out.sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); });
    return out;
  }
  // 指定年度の会員別集計（純粋）。member_id 単位で集約し、勝→優勝回数→勝越し→出場→氏名 で順位付け。
  function aggregateStandings(rows, season, cls) {
    var by = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i]; if (!r || r.season !== season || !r.member_id) continue;
      if (cls && r.cls !== cls) continue;
      var a = by[r.member_id] || (by[r.member_id] = { member_id: r.member_id, name: r.name, games: 0, wins: 0, losses: 0, championships: 0 });
      if (r.name) a.name = r.name;
      a.games += 1; a.wins += (r.wins || 0); a.losses += (r.losses || 0);
      if (r.rank === 1) a.championships += 1;
    }
    var list = [];
    for (var k in by) { if (Object.prototype.hasOwnProperty.call(by, k)) list.push(by[k]); }
    list.forEach(function (x) { var g = x.wins + x.losses; x.winRate = g > 0 ? Math.round(x.wins / g * 1000) / 10 : 0; });
    list.sort(function (a, b) {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.championships !== a.championships) return b.championships - a.championships;
      if ((b.wins - b.losses) !== (a.wins - a.losses)) return (b.wins - b.losses) - (a.wins - a.losses);
      if (b.games !== a.games) return b.games - a.games;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return list;
  }
  function buildSeasonSelectorHtml(seasons, current) {
    var ss = seasons || [];
    if (!ss.length) return '';
    var opts = ss.map(function (s) { return '<option value="' + esc(s) + '"' + (s === current ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
    return '<label for="seasonSelect">年度</label> <select id="seasonSelect">' + opts + '</select>';
  }
  function buildSeasonStandingsHtml(season, standings) {
    var list = standings || [];
    if (!list.length) return '<p class="muted">この年度の成績がありません。</p>';
    var rows = list.map(function (x, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td>' + x.games + '</td><td>' + x.wins + '</td><td>' + x.losses + '</td><td>' + x.championships + '</td><td>' + x.winRate + '%</td></tr>';
    }).join('');
    return '<table class="cloud-entries"><thead><tr><th>順</th><th>氏名</th><th>出場</th><th>勝</th><th>負</th><th>優勝</th><th>勝率</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  // 成長賞（#343 次の伸びしろ）: 前年度→今年度の勝率の伸びが最大の会員（read-only・既存集計の再利用）。
  //   前年度＝listSeasons（新しい順）で当該 season の1つ前。両年度とも minGames（既定3大会）以上出場の会員のみ。
  //   並び: delta(pt)降順→今年度勝率→出場→氏名。list[0] が成長賞候補。
  function aggregateGrowthAward(rows, season, opts) {
    opts = opts || {};
    var minGames = (typeof opts.minGames === 'number') ? opts.minGames : 3;
    var seasons = listSeasons(rows);
    var idx = seasons.indexOf(season);
    if (idx < 0 || idx + 1 >= seasons.length) return { prevSeason: null, minGames: minGames, list: [] };
    var prevSeason = seasons[idx + 1];
    var cur = aggregateStandings(rows, season);
    var prev = aggregateStandings(rows, prevSeason);
    var prevById = {};
    for (var i = 0; i < prev.length; i++) prevById[prev[i].member_id] = prev[i];
    var list = [];
    for (var j = 0; j < cur.length; j++) {
      var c = cur[j], p = prevById[c.member_id];
      if (!p) continue;
      if (c.games < minGames || p.games < minGames) continue;
      list.push({ member_id: c.member_id, name: c.name, prevWinRate: p.winRate, curWinRate: c.winRate,
        delta: Math.round((c.winRate - p.winRate) * 10) / 10, prevGames: p.games, curGames: c.games });
    }
    list.sort(function (a, b) {
      if (b.delta !== a.delta) return b.delta - a.delta;
      if (b.curWinRate !== a.curWinRate) return b.curWinRate - a.curWinRate;
      if (b.curGames !== a.curGames) return b.curGames - a.curGames;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return { prevSeason: prevSeason, minGames: minGames, list: list };
  }
  function buildGrowthAwardHtml(season, result) {
    var r = result || {};
    if (!r.prevSeason) return '<p class="muted">前年度のデータがないため成長賞は算出できません（前年度がある年度を選んでください）。</p>';
    var list = r.list || [];
    if (!list.length) return '<p class="muted">' + esc(r.prevSeason) + '→' + esc(season) + ' の両方に' + (r.minGames || 3) + '大会以上出場した会員がいません。</p>';
    var rows = list.slice(0, 5).map(function (x, i) {
      var sign = x.delta > 0 ? '+' : '';
      var hl = (i === 0) ? ' style="background:#eaf3de;font-weight:600"' : '';
      return '<tr' + hl + '><td>' + (i + 1) + '</td><td>' + esc(x.name) + (i === 0 ? ' \ud83c\udfc5' : '') + '</td><td>' + x.prevWinRate + '%</td><td>' + x.curWinRate + '%</td><td>' + sign + x.delta + 'pt</td><td>' + x.prevGames + '\u2192' + x.curGames + '</td></tr>';
    }).join('');
    return '<p class="muted">' + esc(r.prevSeason) + ' \u2192 ' + esc(season) + ' の勝率の伸び（両年度 ' + (r.minGames || 3) + '大会以上）。\ud83c\udfc5＝成長賞候補。</p>' +
      '<table class="cloud-entries"><thead><tr><th>順</th><th>氏名</th><th>前年度</th><th>今年度</th><th>伸び</th><th>出場</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }


  // ---- 通年集計の拡張: クラス一覧 / 記録殿堂 / 月別王者 / 市町村対抗（すべて純関数）----
  function listClasses(rows, season) {
    var seen = {}, out = [];
    for (var i = 0; i < (rows || []).length; i++) { var r = rows[i]; if (r && r.season === season && r.cls && !seen[r.cls]) { seen[r.cls] = 1; out.push(r.cls); } }
    out.sort();
    return out;
  }
  function _maxRun(nums) { nums.sort(function (a, b) { return a - b; }); var best = 0, run = 0; for (var i = 0; i < nums.length; i++) { run = (i > 0 && nums[i] === nums[i - 1] + 1) ? run + 1 : 1; if (run > best) best = run; } return best; }
  // 記録・殿堂（全期間・member別）: 通算 出場/勝/負/優勝/全勝(4-0)/最長連続出場。
  function aggregateRecords(rows) {
    rows = rows || [];
    var dseen = {}, dlist = [];
    for (var i = 0; i < rows.length; i++) { var d = rows[i].date; if (d && !dseen[d]) { dseen[d] = 1; dlist.push(d); } }
    dlist.sort(); var didx = {}; for (var j = 0; j < dlist.length; j++) didx[dlist[j]] = j;
    var by = {};
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k]; if (!r.member_id) continue;
      var a = by[r.member_id] || (by[r.member_id] = { member_id: r.member_id, name: r.name, games: 0, wins: 0, losses: 0, championships: 0, perfect: 0, _days: {} });
      if (r.name) a.name = r.name;
      a.games += 1; a.wins += (r.wins || 0); a.losses += (r.losses || 0);
      if (r.rank === 1) a.championships += 1;
      if ((r.wins || 0) >= 4 && (r.losses || 0) === 0) a.perfect += 1;
      if (r.date) a._days[didx[r.date]] = 1;
    }
    var list = [];
    for (var key in by) { if (Object.prototype.hasOwnProperty.call(by, key)) { var x = by[key]; var ds = []; for (var dk in x._days) ds.push(Number(dk)); x.maxStreak = _maxRun(ds); delete x._days; list.push(x); } }
    return list;
  }
  function _topBy(list, key, n) {
    return (list || []).filter(function (x) { return (x[key] || 0) > 0; })
      .sort(function (a, b) { if (b[key] !== a[key]) return b[key] - a[key]; return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); })
      .slice(0, n || 5);
  }
  // 月別チャンピオン（大会×クラスの優勝者・日付降順）。
  function aggregateMonthlyChampions(rows) {
    var champ = {};
    for (var i = 0; i < (rows || []).length; i++) { var r = rows[i]; if (r.rank === 1 && r.date && r.cls) { var k = r.date + '' + r.cls; if (!champ[k]) champ[k] = { date: r.date, season: r.season, cls: r.cls, name: r.name }; } }
    var list = []; for (var key in champ) { if (Object.prototype.hasOwnProperty.call(champ, key)) list.push(champ[key]); }
    list.sort(function (a, b) { if (a.date !== b.date) return a.date < b.date ? 1 : -1; return a.cls < b.cls ? -1 : 1; });
    return list;
  }
  // 市町村別: 延べ出場/通算勝/人数。CITY-UNIFY-001: 参照列を branch→city に一本化（旧 branch の市町村は migration 20260703 で city へ移行済み）。
  function aggregateByCity(rows) {
    var by = {};
    for (var i = 0; i < (rows || []).length; i++) { var r = rows[i]; var c = r.city || '(不明)'; var a = by[c] || (by[c] = { city: c, games: 0, wins: 0, _m: {} }); a.games += 1; a.wins += (r.wins || 0); if (r.member_id) a._m[r.member_id] = 1; }
    var list = []; for (var k in by) { if (Object.prototype.hasOwnProperty.call(by, k)) { var x = by[k]; x.members = 0; for (var mk in x._m) x.members++; delete x._m; list.push(x); } }
    list.sort(function (a, b) { if (b.games !== a.games) return b.games - a.games; return b.wins - a.wins; });
    return list;
  }
  // build
  function buildClassSelectorHtml(classes, current) {
    var cs = classes || []; if (!cs.length) return '';
    var opts = '<option value="">全クラス</option>' + cs.map(function (c) { return '<option value="' + esc(c) + '"' + (c === current ? ' selected' : '') + '>' + esc(c) + 'クラス</option>'; }).join('');
    return ' <label for="classSelect">クラス</label> <select id="classSelect">' + opts + '</select>';
  }
  function _miniRank(title, list, key, unit) {
    var l = (list || []);
    if (!l.length) return '';
    var rows = l.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td>' + x[key] + (unit || '') + '</td></tr>'; }).join('');
    return '<div class="rec-block"><h3>' + esc(title) + '</h3><table class="cloud-entries"><tbody>' + rows + '</tbody></table></div>';
  }
  function buildRecordsHtml(records) {
    var r = records || []; if (!r.length) return '<p class="muted">記録がありません。</p>';
    return _miniRank('通算勝数', _topBy(r, 'wins', 5), 'wins', '勝') +
      _miniRank('優勝回数', _topBy(r, 'championships', 5), 'championships', '回') +
      _miniRank('全勝大会(4-0)', _topBy(r, 'perfect', 5), 'perfect', '回') +
      _miniRank('最長連続出場', _topBy(r, 'maxStreak', 5), 'maxStreak', '大会');
  }
  function buildMonthlyChampionsHtml(list) {
    var l = list || []; if (!l.length) return '<p class="muted">優勝記録がありません。</p>';
    var rows = l.map(function (x) { return '<tr><td>' + esc(x.date) + '</td><td>' + esc(x.cls) + '</td><td>' + esc(x.name) + '</td></tr>'; }).join('');
    return '<table class="cloud-entries"><thead><tr><th>大会日</th><th>クラス</th><th>優勝</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function buildCityStandingsHtml(list) {
    var l = list || []; if (!l.length) return '<p class="muted">データがありません。</p>';
    var rows = l.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.city) + '</td><td>' + x.members + '</td><td>' + x.games + '</td><td>' + x.wins + '</td></tr>'; }).join('');
    return '<table class="cloud-entries"><thead><tr><th>順</th><th>市町村</th><th>人数</th><th>延べ出場</th><th>通算勝</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function fetchMembersForEdit(client, clubId) {
    // APP-UX-002/CLOUD-MEMBER-FIELDS-001: 明示列挙→'*'（member_kind/grade/city などスキーマ追補に自動追従）。
    return client.from('members').select('*').eq('club_id', clubId).then(function (res) {
      if (res.error) return { ok:false, message:'名簿の読み込みに失敗しました', members:[] };
      return { ok:true, members: res.data || [] };
    });
  }
  // member_id 採番。当日アプリ(shogi_v4.html)と同形式 'm_' + uuid hex 12。gen 注入でテスト可。
  function newMemberId(gen) {
    var raw;
    if (typeof gen === 'function') raw = gen();
    else if (global.crypto && global.crypto.randomUUID) raw = global.crypto.randomUUID();
    else throw new Error('crypto.randomUUID が利用不可な環境です。ブラウザを更新してください。');
    return 'm_' + String(raw).replace(/-/g, '').slice(0, 12);
  }
  function insertMember(client, clubId, fields, idGen) {
    fields = fields || {};
    var name = (fields.name || '').trim();
    if (!name) return Promise.resolve({ ok:false, message:'氏名を入力してください。' });
    if (!clubId) return Promise.resolve({ ok:false, message:'クラブが特定できません。' });
    var mid;
    try { mid = newMemberId(idGen); } catch (e) { return Promise.resolve({ ok:false, message:e.message }); }
    var row = { club_id: clubId, member_id: mid, name: name,
                yomi: (fields.yomi || '').trim() || null, branch: (fields.branch || '').trim() || null,
                city: (fields.city || '').trim() || null };
    return client.from('members').insert(row).then(function (res) {
      if (res && res.error) return { ok:false, message:'追加できませんでした（権限/重複の可能性）: ' + res.error.message };
      return { ok:true, member_id: mid, message: name + ' を追加しました。' };
    });
  }
  function updateMember(client, clubId, memberId, fields) {
    fields = fields || {};
    var name = (fields.name || '').trim();
    if (!name) return Promise.resolve({ ok:false, message:'氏名は空にできません。' });
    if (!clubId || !memberId) return Promise.resolve({ ok:false, message:'対象を特定できません。' });
    var patch = { name: name, yomi: (fields.yomi || '').trim() || null, branch: (fields.branch || '').trim() || null };
    return client.from('members').update(patch).eq('club_id', clubId).eq('member_id', memberId).then(function (res) {
      if (res && res.error) return { ok:false, message:'更新できませんでした: ' + res.error.message };
      return { ok:true, message:'更新しました。' };
    });
  }
  // 論理削除（deleted=true → deleted_at=now）/ 復元（deleted=false → deleted_at=null）。どちらも update＝幹事全員可。
  function setMemberDeleted(client, clubId, memberId, deleted) {
    if (!clubId || !memberId) return Promise.resolve({ ok:false, message:'対象を特定できません。' });
    var patch = { deleted_at: deleted ? new Date().toISOString() : null };
    return client.from('members').update(patch).eq('club_id', clubId).eq('member_id', memberId).then(function (res) {
      if (res && res.error) return { ok:false, message:(deleted ? '削除' : '復元') + 'できませんでした: ' + res.error.message };
      return { ok:true, message: deleted ? '論理削除しました（復元できます）。' : '復元しました。' };
    });
  }
  // build（純粋）: 有効を先頭・削除済を末尾、各 yomi→name 昇順。
  function sortMembersForEdit(members) {
    var list = Array.isArray(members) ? members.slice() : [];
    list.sort(function (a, b) {
      var da = (a && a.deleted_at) ? 1 : 0, db = (b && b.deleted_at) ? 1 : 0;
      if (da !== db) return da - db;
      var ya = (a && a.yomi) || '', yb = (b && b.yomi) || '';
      if (ya !== yb) return ya < yb ? -1 : 1;
      var na = (a && a.name) || '', nb = (b && b.name) || '';
      return na < nb ? -1 : (na > nb ? 1 : 0);
    });
    return list;
  }
  function buildMemberEditRowHtml(m, editingId) {
    var mid = esc((m && m.member_id) || '');
    var isDeleted = !!(m && m.deleted_at);
    if (m && m.member_id === editingId) {
      return '<li class="org-row member-edit" data-id="' + mid + '">' +
        '<input type="text" class="m-edit-name"   data-id="' + mid + '" value="' + esc((m.name) || '') + '" placeholder="氏名">' +
        '<input type="text" class="m-edit-yomi"   data-id="' + mid + '" value="' + esc((m.yomi) || '') + '" placeholder="ふりがな">' +
        '<input type="text" class="m-edit-branch" data-id="' + mid + '" value="' + esc((m.branch) || '') + '" placeholder="支部">' +
        '<span class="org-actions">' +
        '<button type="button" class="m-save"   data-id="' + mid + '">保存</button>' +
        '<button type="button" class="m-cancel" data-id="' + mid + '">取消</button>' +
        '</span></li>';
    }
    var nameCls = isDeleted ? 'org-who member-deleted' : 'org-who';
    var y = (m && m.yomi) ? ' <span class="org-meta">' + esc(m.yomi) + '</span>' : '';
    var br = (m && m.branch) ? ' <span class="org-meta">' + esc(m.branch) + '</span>' : '';
    var tag = isDeleted ? ' <span class="org-meta">（削除済）</span>' : '';
    var h = '<li class="org-row" data-id="' + mid + '">' +
      '<span class="' + nameCls + '">' + esc((m && m.name) || '') + '</span>' + y + br + tag +
      '<span class="org-actions">';
    if (isDeleted) {
      h += '<button type="button" class="m-restore" data-id="' + mid + '">復元</button>';
    } else {
      h += '<button type="button" class="m-edit"   data-id="' + mid + '">編集</button>';
      h += '<button type="button" class="m-delete" data-id="' + mid + '">論理削除</button>';
    }
    h += '</span></li>';
    return h;
  }
  function buildMemberEditPanelHtml(members, editingId) {
    var list = sortMembersForEdit(members);
    var rows = list.length
      ? list.map(function (m) { return buildMemberEditRowHtml(m, editingId); }).join('')
      : '<li class="org-row"><span class="muted">名簿が空です。下のフォームから追加できます。</span></li>';
    var activeCount = list.filter(function (m) { return !(m && m.deleted_at); }).length;
    return '' +
      '<form id="memberAddForm" class="member-add" autocomplete="off">' +
      '<input type="text" id="memberAddName"   name="name"   placeholder="氏名（必須）" required>' +
      '<input type="text" id="memberAddYomi"   name="yomi"   placeholder="ふりがな">' +
      '<input type="text" id="memberAddBranch" name="branch" placeholder="支部">' +
      '<button type="submit" id="memberAddBtn">追加</button>' +
      '</form>' +
      '<p class="muted">有効 ' + activeCount + ' 名／全 ' + list.length + ' 名。氏名・ふりがな・支部の修正と論理削除（復元可）ができます。物理削除はしません。</p>' +
      '<ul class="org-list member-list">' + rows + '</ul>' +
      '<p id="memberEditMsg" class="msg" role="status"></p>';
  }
  // 論理削除の確認メッセージ（純粋・テスト対象）。誤操作防止に confirm で挟む。
  function memberDeleteConfirmMessage(name) {
    var nm = (typeof name === 'string' && name) ? name : 'この会員';
    return '「' + nm + '」を論理削除します。よろしいですか？\n（削除後も「復元」で元に戻せます）';
  }

  // ===========================================================================
  // APP-UX-002 (作者依頼 2026-07-02): 名簿（クラウド・編集）を当日アプリの MASTER-SHEET と同型の
  //   スプレッドシートへ刷新。行の 編集/論理削除 ボタンを全廃＝セルをタップで直接編集
  //   （氏名/ふりがな・市町村・支部＝入力欄、支部員・会費＝タップで切替）、削除/復元は
  //   行選択（checkbox）→ツールバー。ふりがなは氏名の上（ルビ位置）。
  //   旧 buildMemberEditRowHtml/buildMemberEditPanelHtml/updateMember/bindMemberEditor は
  //   回帰資産として温存（UI 未結線・既存テストの対象のまま）。
  // ===========================================================================
  function memberKindBadgeHtml(kind) {
    return (kind === 'other')
      ? '<span class="mk-badge mk-other">他</span>'
      : '<span class="mk-badge mk-member">支部員</span>';
  }
  function gradeShortLabel(g) { return g === 'chu' ? '中学' : (g === 'josei' ? '女性' : '一般'); }
  // APP-MEMBER-SEARCH-001: 検索用正規化（純）。小文字化・カタカナ→ひらがな・空白（半角/全角）除去。
  //   ふりがな検索でカナ/かなの揺れを吸収する（当日アプリの検索と同趣旨・依存なしの自前実装）。
  function normalizeSearchText(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    var out = '';
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c >= 0x30A1 && c <= 0x30F6) out += String.fromCharCode(c - 0x60);
      else out += t.charAt(i);
    }
    return out.replace(/[\s　]+/g, '');
  }
  // APP-MEMBER-SEARCH-001: 会員が正規化済みクエリに部分一致するか（純）。氏名・ふりがな・市町村を対象。
  function memberMatchesSearch(m, normQuery) {
    if (!normQuery) return true;
    if (!m) return false;
    return normalizeSearchText(m.name).indexOf(normQuery) >= 0
      || normalizeSearchText(m.yomi).indexOf(normQuery) >= 0
      || normalizeSearchText(m.city).indexOf(normQuery) >= 0;
  }
  function buildMemberSheetRowHtml(m, selected) {
    var mid = esc((m && m.member_id) || '');
    var isDel = !!(m && m.deleted_at);
    var yomi = (m && m.yomi) ? esc(m.yomi) : '';
    var yomiHtml = yomi
      ? '<span class="ms-yomi">' + yomi + '</span>'
      : '<span class="ms-yomi ms-yomi-missing">（ふりがな未入力）</span>';
    var h = '<tr class="ms-row' + (isDel ? ' ms-row-deleted' : '') + '" data-id="' + mid + '">';
    h += '<td class="ms-check-cell"><input type="checkbox" class="ms-check" data-id="' + mid + '"' + (selected ? ' checked' : '') + ' aria-label="' + esc((m && m.name) || '') + 'を選択"></td>';
    h += '<td' + (isDel ? '' : ' class="ms-name-cell" data-id="' + mid + '" title="タップで氏名・ふりがなを編集"') + ' style="text-align:left">' + yomiHtml + '<span class="ms-name">' + esc((m && m.name) || '') + '</span>' + (isDel ? ' <span class="ms-del-tag">（削除済）</span>' : '') + '</td>';
    // APP-MEMBER-SHEET-UX-001: 区分セルは「タップで選択肢が開く」ことを ▾ で示す（循環切替は廃止）。
    var caret = isDel ? '' : ' <span class="ms-caret" aria-hidden="true">▾</span>';
    h += '<td class="ms-c' + (isDel ? '' : ' ms-kind-cell') + '" data-id="' + mid + '"' + (isDel ? '' : ' title="タップで選択"') + '>' + memberKindBadgeHtml(m && m.member_kind) + caret + '</td>';
    h += '<td class="ms-c' + (isDel ? '' : ' ms-grade-cell') + '" data-id="' + mid + '"' + (isDel ? '' : ' title="タップで選択"') + '>' + esc(gradeShortLabel(m && m.grade)) + caret + '</td>';
    h += '<td class="ms-c' + (isDel ? '' : ' ms-city-cell') + '" data-id="' + mid + '"' + (isDel ? '' : ' title="タップで編集"') + '>' + esc((m && m.city) || '－') + '</td>';
    h += '</tr>';
    return h;
  }
  function buildMemberSheetHtml(members, selectedMap, searchQuery, showDeleted, addOpen) {
    selectedMap = selectedMap || {};
    var list = sortMembersForEdit(members);
    var selLive = [], selDel = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m && selectedMap[m.member_id]) { (m.deleted_at ? selDel : selLive).push(m.member_id); }
    }
    var activeCount = list.filter(function (mm) { return !(mm && mm.deleted_at); }).length;
    // APP-MEMBER-SHEET-UX-001: 削除済みは既定で非表示（当日アプリ名簿タブの 🗑️トグルと同型）。
    //   showDeleted=true のときだけ末尾に表示する。論理削除行は自動では消えないため、常時表示だと
    //   一覧が汚れる（作者FB 2026-07-03）。復元はトグルで表示してから行選択→ツールバー。
    var deletedCount = list.length - activeCount;
    var scope = showDeleted ? list : list.filter(function (mm) { return !(mm && mm.deleted_at); });
    // APP-MEMBER-SEARCH-001: 氏名・ふりがな・市町村の部分一致フィルタ。表示行のみ絞り込み、
    //   選択状態（selectedMap）とツールバー件数は全会員基準のまま＝絞り込み中に隠れた選択も削除/復元対象
    //   （選択は明示操作の結果であり、フィルタで暗黙解除しない）。value は esc 経由（XSS 安全）。
    var q = normalizeSearchText(searchQuery || '');
    var visible = q ? scope.filter(function (mm) { return memberMatchesSearch(mm, q); }) : scope;
    // APP-UX-004C② (作者承認 2026-07-03): 上部を「検索→サマリ＋削除済みトグル（1行）→
    //   ＋会員を追加（details 折りたたみ・ラベル付き40px統一）」に再配置。id・bind は全温存。
    //   addOpen＝開閉状態（再描画を跨いで保持・省略時 false＝既存テスト互換）。
    var h = '';
    h += '<div class="ms-search"><input type="search" id="msSearchInput" value="' + esc(searchQuery || '') + '" placeholder="検索（氏名・ふりがな・市町村）" autocomplete="off" aria-label="名簿を検索">'
      + (q ? '<button type="button" id="msSearchClear">クリア</button>' : '')
      + '</div>';
    var metaInner;
    if (q) {
      metaInner = '<p class="muted" id="msSearchCount">' + visible.length + '名が一致（有効 ' + activeCount + ' 名／全 ' + list.length + ' 名）。</p>';
    } else {
      metaInner = '<p class="muted">有効 ' + activeCount + ' 名／全 ' + list.length + ' 名。セルをタップで編集／削除・復元は左の□で行を選択（論理削除＝復元できます）。</p>';
    }
    // APP-MEMBER-SHEET-UX-001: 削除済みトグル（削除済みが存在するときだけ表示・件数併記）。
    var togHtml = '';
    if (deletedCount > 0) {
      togHtml = '<div class="ms-del-toggle"><button type="button" id="msShowDeletedBtn">' + (showDeleted ? '削除済みを隠す' : '削除済みを表示（' + deletedCount + '名）') + '</button></div>';
    }
    h += '<div class="ms-meta-row">' + metaInner + togHtml + '</div>';
    h += '<details class="ms-add-details" id="msAddDetails"' + (addOpen ? ' open' : '') + '>' +
      '<summary>＋ 会員を追加</summary>' +
      '<form id="memberAddForm" class="member-add" autocomplete="off">' +
      '<div class="fld"><label for="memberAddName">氏名（必須）</label><input type="text" id="memberAddName" name="name" required placeholder="例）沼津太郎"></div>' +
      '<div class="fld"><label for="memberAddYomi">ふりがな</label><input type="text" id="memberAddYomi" name="yomi" placeholder="例）ぬまづたろう"></div>' +
      '<div class="fld"><label for="memberAddCity">市町村</label><input type="text" id="memberAddCity" name="city" placeholder="例）沼津市"></div>' +
      '<button type="submit" id="memberAddBtn">追加</button>' +
      '</form></details>';
    var selTotal = selLive.length + selDel.length;
    if (selTotal > 0) {
      h += '<div class="ms-toolbar" id="msToolbar"><span>' + selTotal + '名 選択中</span>';
      if (selLive.length > 0) h += '<button type="button" id="msDeleteBtn" class="ms-danger">論理削除（' + selLive.length + '名）</button>';
      if (selDel.length > 0) h += '<button type="button" id="msRestoreBtn">復元（' + selDel.length + '名）</button>';
      // APP-MEMBER-HARD-DELETE-001: 完全削除は削除済み行の選択時のみ（出場記録の有無は実行時にサーバ確認）。
      if (selDel.length > 0) h += '<button type="button" id="msHardDeleteBtn" class="ms-danger">完全削除（' + selDel.length + '名）</button>';
      h += '<button type="button" id="msClearBtn">選択解除</button></div>';
    }
    if (!list.length) {
      h += '<p class="muted">名簿が空です。「＋ 会員を追加」から追加できます。</p>';
    } else if (q && !visible.length) {
      h += '<p class="muted">「' + esc(searchQuery || '') + '」に一致する会員がいません。</p>';
    } else if (!visible.length) {
      h += '<p class="muted">有効な会員がいません（削除済み ' + deletedCount + ' 名は非表示）。</p>';
    } else {
      h += '<div class="ms-wrap"><table class="ms-table"><thead><tr>' +
        '<th class="ms-th-check">選択</th><th class="ms-th-name">氏名（ふりがな）</th><th>支部員</th><th>会費</th><th>市町村</th>' +
        '</tr></thead><tbody>';
      for (var r = 0; r < visible.length; r++) { h += buildMemberSheetRowHtml(visible[r], !!(visible[r] && selectedMap[visible[r].member_id])); }
      h += '</tbody></table></div>';
    }
    h += '<p id="memberEditMsg" class="msg" role="status"></p>';
    return h;
  }
  function memberBulkConfirmMessage(count, namesPreview, deleted) {
    return deleted
      ? (count + '名（' + namesPreview + '）を論理削除します。名簿・当日アプリの取得先から非表示になります（復元できます）。\n\nよろしいですか？')
      : (count + '名（' + namesPreview + '）を復元します。名簿に再表示されます。\n\nよろしいですか？');
  }
  // 部分更新（patch の提供列のみ update・name は空拒否・空文字は null 化）。
  function updateMemberFields(client, clubId, memberId, patch) {
    patch = patch || {};
    if (!clubId || !memberId) return Promise.resolve({ ok: false, message: '対象を特定できません。' });
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      var nm = (patch.name || '').trim();
      if (!nm) return Promise.resolve({ ok: false, message: '氏名は空にできません。' });
      patch.name = nm;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'yomi')) patch.yomi = (patch.yomi || '').trim() || null;
    if (Object.prototype.hasOwnProperty.call(patch, 'city')) patch.city = (patch.city || '').trim() || null;
    if (Object.prototype.hasOwnProperty.call(patch, 'branch')) patch.branch = (patch.branch || '').trim() || null;
    return client.from('members').update(patch).eq('club_id', clubId).eq('member_id', memberId).then(function (res) {
      if (res && res.error) return { ok: false, message: '更新できませんでした: ' + res.error.message };
      return { ok: true, message: '更新しました。' };
    });
  }
  // まとめて論理削除/復元（.in で1リクエスト・冪等）。
  function setMembersDeletedBulk(client, clubId, memberIds, deleted) {
    var ids = Array.isArray(memberIds) ? memberIds.filter(function (x) { return !!x; }) : [];
    if (!clubId || !ids.length) return Promise.resolve({ ok: false, message: '対象を特定できません。' });
    var patch = { deleted_at: deleted ? new Date().toISOString() : null };
    return client.from('members').update(patch).eq('club_id', clubId).in('member_id', ids).then(function (res) {
      if (res && res.error) return { ok: false, message: (deleted ? '削除' : '復元') + 'できませんでした: ' + res.error.message };
      return { ok: true, message: ids.length + '名を' + (deleted ? '論理削除しました（復元できます）' : '復元しました') + '。' };
    });
  }
  // APP-MEMBER-HARD-DELETE-001: 完全削除の confirm 文言（純）。破壊操作＝復元不可・端末復活の注意を明示。
  function memberHardDeleteConfirmMessage(count, namesPreview) {
    return count + '名（' + namesPreview + '）をクラウドから完全に削除します。復元できません。\n'
      + '出場記録（大会成績）のある会員は自動でスキップされ、論理削除のまま残ります。\n\n'
      + '※端末側の名簿に同じ会員が残っていると、次の「名簿全体をクラウドへ一括送信」で復活します。'
      + '先に各端末で「☁ クラウドから取得」を済ませてください。\n\nよろしいですか？';
  }
  // APP-MEMBER-HARD-DELETE-001: 完全削除（物理削除）。スキーマの FK は players→members・entries→players
  //   とも ON DELETE CASCADE のため、出場記録を持つ会員を消すと大会成績が連鎖消滅する。よって
  //   「players 行ゼロ」の会員だけをサーバ側で確認してから削除する（UI の見た目でなく DB を真実とする）。
  //   RLS: members_delete は app_is_admin のみ＝非管理者は 0 行削除になるため .select で実削除数を検証する。
  //   throw せず {ok, deleted, skipped, message} を返す（当日運営を止めない・client 注入）。
  function hardDeleteMembers(client, clubId, memberIds) {
    var ids = Array.isArray(memberIds) ? memberIds.filter(function (x) { return !!x; }) : [];
    if (!clubId || !ids.length) return Promise.resolve({ ok: false, deleted: [], skipped: [], message: '対象を特定できません。' });
    return client.from('players').select('member_id').eq('club_id', clubId).in('member_id', ids).then(function (pr) {
      if (pr && pr.error) return { ok: false, deleted: [], skipped: [], message: '出場記録の確認に失敗しました: ' + pr.error.message };
      var has = {}; var rows = (pr && pr.data) || [];
      for (var i = 0; i < rows.length; i++) { if (rows[i] && rows[i].member_id) has[rows[i].member_id] = true; }
      var eligible = [], skipped = [];
      for (var k = 0; k < ids.length; k++) { (has[ids[k]] ? skipped : eligible).push(ids[k]); }
      if (!eligible.length) return { ok: false, deleted: [], skipped: skipped, message: '選択した会員には出場記録があるため完全削除できません（論理削除のまま保持します）。' };
      return client.from('members').delete().eq('club_id', clubId).in('member_id', eligible).select('member_id').then(function (dr) {
        if (dr && dr.error) return { ok: false, deleted: [], skipped: skipped, message: '完全削除に失敗しました: ' + dr.error.message };
        var deleted = []; var drows = (dr && dr.data) || [];
        for (var d = 0; d < drows.length; d++) { if (drows[d] && drows[d].member_id) deleted.push(drows[d].member_id); }
        if (!deleted.length) return { ok: false, deleted: [], skipped: skipped, message: '完全削除できませんでした（幹事（管理者）の権限が必要です）。' };
        var msg = deleted.length + '名を完全に削除しました。';
        if (skipped.length) msg += '（出場記録のある ' + skipped.length + '名はスキップ＝論理削除のまま）';
        return { ok: true, deleted: deleted, skipped: skipped, message: msg };
      });
    });
  }

  // ===========================================================================
  // B-4（#343）: 過去大会（Excel 由来）データの一括取り込み（移行）。
  //   payload（cowork が Excel から生成: members/tournaments/entries）を、既存クラウド名簿と
  //   氏名で突き合わせ（既存は上書きせず member_id 流用・未知のみ追加）→ べき等 upsert。
  //   全て client 注入・throw せず {ok} を返す。プレビュー（ドライラン）は純関数。
  // ===========================================================================
  function impSquash(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }

  function validateImportPayload(payload) {
    var errors = [];
    if (!payload || typeof payload !== 'object') return { ok: false, errors: ['JSON の形式が不正です'], counts: { members: 0, tournaments: 0, entries: 0 } };
    var M = Array.isArray(payload.members) ? payload.members : null;
    var T = Array.isArray(payload.tournaments) ? payload.tournaments : null;
    var E = Array.isArray(payload.entries) ? payload.entries : null;
    if (!M) errors.push('members 配列がありません');
    if (!T) errors.push('tournaments 配列がありません');
    if (!E) errors.push('entries 配列がありません');
    if (M) for (var i = 0; i < M.length; i++) { if (!M[i] || !M[i].member_id || !M[i].name) { errors.push('members[' + i + '] に member_id/name がありません'); break; } }
    if (T) for (var j = 0; j < T.length; j++) { var t = T[j]; if (!t || !t.app_tournament_id || !t.date || !t.season || !t.name) { errors.push('tournaments[' + j + '] に必須項目がありません'); break; } }
    if (E) for (var k = 0; k < E.length; k++) { var e = E[k]; if (!e || !e.app_tournament_id || !e.member_id || !e['class']) { errors.push('entries[' + k + '] に必須項目がありません'); break; } }
    return { ok: errors.length === 0, errors: errors, counts: { members: M ? M.length : 0, tournaments: T ? T.length : 0, entries: E ? E.length : 0 } };
  }

  // 既存クラウド会員と氏名で突き合わせ。一致=既存 member_id 流用（既存は変更しない）・未知=新規。
  //   同名が複数いる場合は曖昧として新規扱い＋警告（誤った別人への紐付けを避ける）。
  function resolveImportMembers(payload, existingMembers) {
    var existing = Array.isArray(existingMembers) ? existingMembers : [];
    var byNameBranch = {}, byName = {};
    for (var i = 0; i < existing.length; i++) {
      var em = existing[i]; if (!em || !em.name) continue;
      var nk = impSquash(em.name);
      byNameBranch[nk + '\u0001' + impSquash(em.city || em.branch || '')] = em;
      (byName[nk] = byName[nk] || []).push(em);
    }
    var idMap = {}, newMembers = [], matched = 0, ambiguous = [], used = {};
    var ms = Array.isArray(payload.members) ? payload.members : [];
    for (var m = 0; m < ms.length; m++) {
      var pm = ms[m], nk = impSquash(pm.name), match = null;
      // ① 氏名＋市町村（city・旧 payload は branch）完全一致を優先（同名別人を区別）。CITY-UNIFY-001。
      var exact = byNameBranch[nk + '\u0001' + impSquash(pm.city || pm.branch || '')];
      if (exact && !used[exact.member_id]) match = exact;
      // ② 無ければ氏名のみ一致（市町村未設定の既存名簿向け）。ただし未使用が1件のときだけ。
      if (!match) {
        var cands = []; var byn = byName[nk] || [];
        for (var c = 0; c < byn.length; c++) { if (!used[byn[c].member_id]) cands.push(byn[c]); }
        if (cands.length === 1) match = cands[0];
        else if (cands.length > 1) ambiguous.push(pm.name);
      }
      // ③ 一致は既存 id を流用（同一既存会員を二重に使わない＝injective）。未一致は新規。
      if (match) { idMap[pm.member_id] = match.member_id; used[match.member_id] = 1; matched++; }
      else { idMap[pm.member_id] = pm.member_id; newMembers.push(pm); }
    }
    return { idMap: idMap, newMembers: newMembers, matched: matched, ambiguous: ambiguous };
  }

  function buildImportPreview(payload, resolution) {
    var warnings = [];
    if (resolution.ambiguous && resolution.ambiguous.length) warnings.push('クラウドに同名が複数いる会員 ' + resolution.ambiguous.length + ' 名は新規として扱います（要確認）: ' + resolution.ambiguous.slice(0, 5).join('、'));
    var noRank = 0, es = Array.isArray(payload.entries) ? payload.entries : [];
    for (var i = 0; i < es.length; i++) { if (es[i].final_rank == null) noRank++; }
    if (noRank) warnings.push('順位なしの成績 ' + noRank + ' 件（※参考 等・そのまま取り込み）');
    return { newMembers: resolution.newMembers.length, matchedMembers: resolution.matched, tournaments: (payload.tournaments || []).length, entries: es.length, warnings: warnings };
  }

  // オーケストレーション（client 注入・べき等）。members(新規のみ)→players(全resolved・id解決)→tournaments(id解決)→entries。
  function importHistoryToCloud(client, clubId, payload, resolution) {
    if (!client || !client.from) return Promise.resolve({ ok: false, step: 'init', message: 'クラウドに接続していません' });
    if (!clubId) return Promise.resolve({ ok: false, step: 'club', message: 'クラブが特定できません' });
    var idMap = resolution.idMap || {};
    var counts = { members_new: resolution.newMembers.length, players: 0, tournaments: (payload.tournaments || []).length, entries: 0, unresolved: 0 };
    function fail(step, res) { return { ok: false, step: step, counts: counts, message: ((res && res.error && res.error.message) || '取り込みに失敗しました') + '（' + step + '）' }; }
    var newRows = resolution.newMembers.map(function (m) { return { club_id: clubId, member_id: m.member_id, name: m.name, city: ((m.city || m.branch) || null) }; });
    var step1 = newRows.length ? client.from('members').upsert(newRows, { onConflict: 'club_id,member_id' }) : Promise.resolve({ error: null });
    return Promise.resolve(step1).then(function (r1) {
      if (r1 && r1.error) return fail('members', r1);
      var residSet = {}; for (var k in idMap) { if (Object.prototype.hasOwnProperty.call(idMap, k)) residSet[idMap[k]] = 1; }
      var prows = Object.keys(residSet).map(function (mid) { return { club_id: clubId, member_id: mid }; });
      return client.from('players').upsert(prows, { onConflict: 'club_id,member_id' }).select('id,member_id').then(function (r2) {
        if (r2 && r2.error) return fail('players', r2);
        var pidByMember = {}, pd = (r2 && r2.data) || []; for (var i = 0; i < pd.length; i++) { if (pd[i] && pd[i].member_id) pidByMember[pd[i].member_id] = pd[i].id; }
        counts.players = Object.keys(pidByMember).length;
        var trows = (payload.tournaments || []).map(function (t) { return { club_id: clubId, app_tournament_id: t.app_tournament_id, name: t.name, date: t.date, season: t.season, status: 'confirmed', source: 'json_import' }; });
        return client.from('tournaments').upsert(trows, { onConflict: 'club_id,app_tournament_id' }).select('id,app_tournament_id').then(function (r3) {
          if (r3 && r3.error) return fail('tournaments', r3);
          var tidByAppt = {}, td = (r3 && r3.data) || []; for (var j = 0; j < td.length; j++) { if (td[j] && td[j].app_tournament_id) tidByAppt[td[j].app_tournament_id] = td[j].id; }
          var erows = [], es = payload.entries || [], seenTP = {};
          counts.deduped = 0;
          for (var e = 0; e < es.length; e++) {
            var en = es[e], rid = idMap[en.member_id], pid = pidByMember[rid], tid = tidByAppt[en.app_tournament_id];
            if (!pid || !tid) { counts.unresolved++; continue; }
            // 防御: 同一 (tournament_id, player_id) は1件だけ（ON CONFLICT が同一行を二度更新するエラーを防ぐ）。
            var tpk = tid + '\u0001' + pid;
            if (seenTP[tpk]) { counts.deduped++; continue; }
            seenTP[tpk] = 1;
            erows.push({ club_id: clubId, tournament_id: tid, player_id: pid, 'class': en['class'], wins: (en.wins == null ? 0 : en.wins), losses: (en.losses == null ? 0 : en.losses), final_rank: (en.final_rank == null ? null : en.final_rank), sos: (en.sos == null ? null : en.sos), sodos: (en.sodos == null ? null : en.sodos) });
          }
          counts.entries = erows.length;
          if (!erows.length) return { ok: true, counts: counts };
          return client.from('entries').upsert(erows, { onConflict: 'tournament_id,player_id' }).then(function (r4) {
            if (r4 && r4.error) return fail('entries', r4);
            return { ok: true, counts: counts };
          });
        });
      });
    });
  }

  // ---- B-4-wire: 取り込み UI（build＋ファイルテキスト→プレビューの純関数）----
  function buildImportPanelHtml() {
    // APP-UX-003: 役目を終えた初期移行ツールを details で折り畳み（機能・id・bind は温存＝開けば従来どおり）。
    return '' +
      '<section class="card" id="importPanel">' +
      '<details>' +
      '<summary>過去大会データの取り込み（初期移行・通常は使いません）</summary>' +
      '<p class="muted">cowork が作成した投入データ（JSON）を読み込み、プレビューで確認してから取り込みます。既存会員は上書きしません。何度実行しても重複しません。</p>' +
      '<input type="file" id="importFile" accept=".json,application/json">' +
      '<button type="button" id="importPreviewBtn">プレビュー（確認）</button>' +
      '<div id="importPreview" class="muted"></div>' +
      '<button type="button" id="importRunBtn" disabled>クラウドへ取り込む</button>' +
      '<p id="importStatus" class="msg" role="status" aria-live="polite"></p>' +
      '</details>' +
      '</section>';
  }
  function buildImportPreviewHtml(preview) {
    if (!preview) return '';
    var w = (preview.warnings || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    return '取り込み内容：<strong>新規会員 ' + esc(String(preview.newMembers)) + ' 名</strong>／既存一致 ' + esc(String(preview.matchedMembers)) +
      ' 名／大会 ' + esc(String(preview.tournaments)) + ' 件／成績 ' + esc(String(preview.entries)) + ' 件' + (w ? '<ul>' + w + '</ul>' : '');
  }
  // JSON テキスト＋既存名簿 → 検証・突き合わせ・プレビュー（純粋・FileReader 非依存でテスト可）。
  function prepareImportFromText(text, existingMembers) {
    var payload;
    try { payload = JSON.parse(text); } catch (e) { return { ok: false, errors: ['JSON を解釈できません: ' + (e && e.message || e)] }; }
    var v = validateImportPayload(payload);
    if (!v.ok) return { ok: false, errors: v.errors, counts: v.counts };
    var resolution = resolveImportMembers(payload, existingMembers || []);
    return { ok: true, payload: payload, resolution: resolution, preview: buildImportPreview(payload, resolution) };
  }


  // coordinator（render = build → mount → bind）。document/client は init で解決。
  // ===========================================================================
  function makeController(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof global.document !== 'undefined' ? global.document : null);
    var client = opts.client || null;
    var root = null;
    var pendingEmail = '';
    var lastSummary = null;
    // APP-UX-001 L3 P2-1: showApp は refreshAdmin/onAuthStateChange で全再マウントされるため、
    //   アクティブタブを closure に保持し bindApp で復元する（幹事管理の操作結果が見えたまま残る）。
    var activeSec = 'sec-results';
    var lastOrganizers = [];

    function mount(html) { if (root) root.innerHTML = html; }
    function byId(id) { return doc ? doc.getElementById(id) : null; }
    // APP-UX-004C③ (作者承認 2026-07-03): kind='ok'（緑）/'err'（赤）/省略（従来の紺＝中立・進行中）。
    //   全 .msg は class="msg" 固定のため className 再構成で安全（textContent のみ・XSS 非増加）。
    function setMsg(id, text, kind) {
      var el = byId(id); if (!el) return;
      el.textContent = text || '';
      el.className = 'msg' + (kind === 'ok' ? ' msg-ok' : (kind === 'err' ? ' msg-err' : ''));
    }

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
          if (r.ok) showCheckEmail(r.email); else setMsg('loginMsg', r.message, 'err');
        });
      });
    }
    function bindCheckEmail() {
      var btn = byId('resendBtn');
      if (btn) btn.addEventListener('click', function () {
        setMsg('loginMsg', '再送中…');
        requestMagicLink(client, pendingEmail).then(function (r) { setMsg('loginMsg', r.message, r.ok ? 'ok' : 'err'); });
      });
    }
    function bindUnregistered() {
      var btn = byId('signOutBtn');
      if (btn) btn.addEventListener('click', function () { signOut(client).then(showLogin); });
    }
    // APP-UX-001: ピル型ナビ＝.app-sec の display 切替のみ（各セクションは常に DOM に居るため
    //   既存の render*/bind*（cloudTournaments/cloudMembers/cloudStandings…）は無改変で動く）。
    // 現在の activeSec を DOM に反映（存在しないタブ＝権限変化等は sec-results にフォールバック）。
    function applyActiveSec() {
      if (!doc || !doc.querySelectorAll) return;
      var secs = doc.querySelectorAll('.app-sec');
      var found = false;
      for (var f = 0; f < secs.length; f++) { if (secs[f].id === activeSec) { found = true; break; } }
      if (!found) activeSec = 'sec-results';
      for (var j = 0; j < secs.length; j++) { secs[j].style.display = (secs[j].id === activeSec) ? '' : 'none'; }
      var nav = byId('appNav');
      if (nav && nav.querySelectorAll) {
        var pills = nav.querySelectorAll('.nav-pill');
        for (var k = 0; k < pills.length; k++) {
          var dn = pills[k].getAttribute ? pills[k].getAttribute('data-nav') : null;
          pills[k].className = 'nav-pill' + (dn === activeSec ? ' active' : '');
        }
      }
    }
    function bindAppNav() {
      var nav = byId('appNav');
      if (!nav || !nav.querySelectorAll) return;
      var pills = nav.querySelectorAll('.nav-pill');
      for (var i = 0; i < pills.length; i++) {
        pills[i].addEventListener('click', function (e) {
          var t = e.currentTarget || e.target;
          var target = t && t.getAttribute ? t.getAttribute('data-nav') : null;
          if (!target) return;
          activeSec = target;
          applyActiveSec();
        });
      }
    }
    function bindApp() {
      bindAppNav();
      applyActiveSec();
      var so = byId('signOutBtn');
      if (so) so.addEventListener('click', function () { signOut(client).then(showLogin); });
      var inviteForm = byId('inviteForm');
      if (inviteForm) inviteForm.addEventListener('submit', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var email = (byId('inviteEmail') || {}).value || '';
        var role = (byId('inviteRole') || {}).value || 'organizer';
        inviteOrganizer(client, lastSummary.clubId, email, role).then(function (r) {
          setMsg('adminMsg', r.message, r.ok ? 'ok' : 'err'); if (r.ok) refreshAdmin();
        });
      });
      bindOrgActions();
      bindTntBack();
      loadReadViews();
      bindImport();
    }
    var lastTournaments = [];
    function loadReadViews() {
      if (!lastSummary) return;
      fetchTournaments(client, lastSummary.clubId).then(function (r) {
        lastTournaments = (r.ok && r.tournaments) || [];
        var el = byId('cloudTournaments');
        if (el) el.innerHTML = r.ok ? buildTournamentListHtml(r.tournaments) : '<p class="muted">' + esc(r.message) + '</p>';
        bindTournamentRows();
      });
      loadMemberEditor();
      loadSeasonStandings();
    }
    // ---- 通年集計（シーズン別成績）配線 ----
    var standingRows = [];
    var currentSeason = null;
    var currentClass = '';
    function renderSeasonStandings() {
      var sw = byId('seasonSelectWrap'), cw = byId('classSelectWrap'), el = byId('cloudStandings');
      var seasons = listSeasons(standingRows);
      if (!currentSeason && seasons.length) currentSeason = seasons[0];
      if (sw) sw.innerHTML = buildSeasonSelectorHtml(seasons, currentSeason);
      var classes = listClasses(standingRows, currentSeason);
      if (currentClass && classes.indexOf(currentClass) < 0) currentClass = '';
      if (cw) cw.innerHTML = buildClassSelectorHtml(classes, currentClass);
      if (el) el.innerHTML = buildSeasonStandingsHtml(currentSeason, aggregateStandings(standingRows, currentSeason, currentClass));
      var eg = byId('cloudGrowth'); if (eg) eg.innerHTML = buildGrowthAwardHtml(currentSeason, aggregateGrowthAward(standingRows, currentSeason));
      var ss = byId('seasonSelect');
      if (ss) ss.addEventListener('change', function () { currentSeason = ss.value; currentClass = ''; renderSeasonStandings(); });
      var cs = byId('classSelect');
      if (cs) cs.addEventListener('change', function () { currentClass = cs.value; renderSeasonStandings(); });
    }
    function renderRecords() {
      var er = byId('cloudRecords'); if (er) er.innerHTML = buildRecordsHtml(aggregateRecords(standingRows));
      var em = byId('cloudMonthly'); if (em) em.innerHTML = buildMonthlyChampionsHtml(aggregateMonthlyChampions(standingRows));
      var ec = byId('cloudCity'); if (ec) ec.innerHTML = buildCityStandingsHtml(aggregateByCity(standingRows));
    }
    function loadSeasonStandings() {
      if (!lastSummary) return;
      fetchSeasonEntries(client, lastSummary.clubId).then(function (r) {
        var el = byId('cloudStandings');
        if (!r.ok) { if (el) el.innerHTML = '<p class="muted">' + esc(r.message) + '</p>'; return; }
        standingRows = (r.rows || []).map(shapeStandingRow);
        renderSeasonStandings();
        renderRecords();
      });
    }

    // ---- B-5: 名簿編集（#cloudMembers を読取専用から編集可能パネルへ昇格）----
    var membersForEdit = [];
    var editingMemberId = null;
    // APP-UX-002: 描画はシート型（旧 buildMemberEditPanelHtml/bindMemberEditor は回帰資産として温存・未結線）。
    var memberSheetSelected = {};
    var msEditing = null; // {id,kind}（インライン編集中のセル）
    // APP-MEMBER-SEARCH-001: 検索クエリ（再描画・reloadMembers を跨いで保持）と、編集確定後に
    //   追跡フラッシュする行の member_id（MASTER-SHEET-003 の app/ 移植＝ソートで行が飛んでも見失わない）。
    var msSearchQuery = '';
    var msFlashId = null;
    // APP-MEMBER-SHEET-UX-001: 削除済み行の表示トグル（既定=非表示・再描画/再読込を跨いで保持）。
    var msShowDeleted = false;
    // APP-UX-004C②: ＋会員を追加（details）の開閉状態（再描画・再読込を跨いで保持・既定=閉）。
    var msAddOpen = false;
    function msFlashRow(mid) {
      try {
        if (!doc || !doc.querySelector) return;
        var tr = doc.querySelector('tr.ms-row[data-id="' + mid + '"]');
        if (!tr) return;
        if (tr.scrollIntoView) { try { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e0) { tr.scrollIntoView(); } }
        if (tr.style) {
          tr.style.transition = 'background-color 0.3s';
          tr.style.backgroundColor = '#fff3bf';
          setTimeout(function () { try { tr.style.backgroundColor = ''; } catch (e1) {} }, 1500);
        }
      } catch (e) {}
    }
    function renderMemberEditor() {
      var el = byId('cloudMembers'); if (!el) return;
      msEditing = null;
      el.innerHTML = buildMemberSheetHtml(membersForEdit, memberSheetSelected, msSearchQuery, msShowDeleted, msAddOpen);
      bindMemberSheet();
      if (msFlashId) { var fid = msFlashId; msFlashId = null; msFlashRow(fid); }
    }
    function loadMemberEditor() {
      if (!lastSummary) return;
      fetchMembersForEdit(client, lastSummary.clubId).then(function (r) {
        var el = byId('cloudMembers');
        if (!r.ok) { if (el) el.innerHTML = '<p class="muted">' + esc(r.message) + '</p>'; return; }
        membersForEdit = r.members; renderMemberEditor();
      });
    }
    function reloadMembers() { editingMemberId = null; loadMemberEditor(); }
    // APP-UX-002: シートの bind（IME 変換ガードは当日アプリ MASTER-SHEET-004 と同方針）。
    function msFind(id) { for (var i = 0; i < membersForEdit.length; i++) { var m = membersForEdit[i]; if (m && m.member_id === id) return m; } return null; }
    function msCommitPatch(id, patch) {
      setMsg('memberEditMsg', '保存中…');
      updateMemberFields(client, lastSummary.clubId, id, patch).then(function (r) {
        msEditing = null;
        setMsg('memberEditMsg', r.message, r.ok ? 'ok' : 'err');
        // APP-MEMBER-SEARCH-001: 成功時は再読込後にその行へスクロール＋フラッシュ（ソート移動の追跡）。
        if (r.ok) { msFlashId = id; reloadMembers(); } else renderMemberEditor();
      });
    }
    function msBindEditorInputs(cell, commit) {
      var composing = false;
      var inputs = cell.querySelectorAll ? cell.querySelectorAll('input') : [];
      function onComp(on) { return function () { composing = on; }; }
      function onKey(e) {
        if (composing || (e && e.isComposing) || (e && e.keyCode === 229)) return;
        var k = e && (e.key || e.keyCode);
        if (k === 'Enter' || k === 13) { if (e && e.preventDefault) e.preventDefault(); commit(); }
        else if (k === 'Escape' || k === 27) { msEditing = null; renderMemberEditor(); }
      }
      Array.prototype.forEach.call(inputs, function (inp) {
        inp.addEventListener('compositionstart', onComp(true));
        inp.addEventListener('compositionend', onComp(false));
        inp.addEventListener('keydown', onKey);
      });
      cell.addEventListener('focusout', function () {
        setTimeout(function () {
          try {
            if (composing) return;
            if (!msEditing) return;
            if (cell.contains && doc.activeElement && cell.contains(doc.activeElement)) return;
            commit();
          } catch (e2) {}
        }, 0);
      });
      if (inputs && inputs.length && inputs[inputs.length - 1].focus) inputs[inputs.length - 1].focus();
    }
    // APP-MEMBER-SHEET-UX-001: 区分セルの select エディタ結線（タップ循環の置き換え）。
    //   change で選んだ値だけ保存・現在値と同じ選択は書き込まずキャンセル・Escape/外タップ（focusout）
    //   でキャンセル。select はネイティブピッカー（スマホ）で選択肢が見える＝誤タップ即確定を排除。
    function msBindSelectEditor(cell, sel, initial, commit) {
      if (!sel || !sel.addEventListener) return;
      // L3 P2-1 (#517): iOS ネイティブピッカー等では change が複数回発火し得るため one-shot ガード。
      //   一度 commit したら以降の change/keydown/focusout はすべて無視＝多重書き込みと
      //   「commit 進行中に focusout キャンセルが再描画する」競合の両方を防ぐ。
      var committed = false;
      sel.addEventListener('change', function () {
        if (committed) return;
        var v = sel.value;
        if (v === initial) { msEditing = null; renderMemberEditor(); return; }
        committed = true;
        commit(v);
      });
      sel.addEventListener('keydown', function (e) {
        if (committed) return;
        var k = e && (e.key || e.keyCode);
        if (k === 'Escape' || k === 27) { msEditing = null; renderMemberEditor(); }
      });
      cell.addEventListener('focusout', function () {
        setTimeout(function () {
          try {
            if (committed) return;
            if (!msEditing) return;
            if (cell.contains && doc.activeElement && cell.contains(doc.activeElement)) return;
            msEditing = null; renderMemberEditor();
          } catch (e2) {}
        }, 0);
      });
      if (sel.focus) sel.focus();
    }
    function bindMemberSheet() {
      var addForm = byId('memberAddForm');
      if (addForm) addForm.addEventListener('submit', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var fields = { name: (byId('memberAddName') || {}).value || '',
                       yomi: (byId('memberAddYomi') || {}).value || '',
                       city: (byId('memberAddCity') || {}).value || '' };
        setMsg('memberEditMsg', '追加中…');
        insertMember(client, lastSummary.clubId, fields).then(function (r) {
          setMsg('memberEditMsg', r.message, r.ok ? 'ok' : 'err'); if (r.ok) reloadMembers();
        });
      });
      // APP-UX-004C②: 追加 details の開閉を状態変数へ同期（再描画時に open を復元）。
      var msAddDetails = byId('msAddDetails');
      if (msAddDetails && msAddDetails.addEventListener) {
        msAddDetails.addEventListener('toggle', function () { msAddOpen = !!msAddDetails.open; });
      }
      // APP-MEMBER-SEARCH-001: 検索ボックスの結線。IME 変換中は絞り込まない（composing フラグ＋
      //   e.isComposing の二重ガード・確定は compositionend で反映＝MASTER-SHEET-004 と同方針。
      //   Enter 確定 UI ではないため keyCode 229 判定は不要）。
      //   再描画で input が作り直されるため、反映後に refocus（カーソル末尾）して連続入力を保つ。
      var msSearchInput = byId('msSearchInput');
      if (msSearchInput && msSearchInput.addEventListener) {
        var msComposing = false;
        var applyMsSearch = function () {
          var el2 = byId('msSearchInput');
          msSearchQuery = (el2 && el2.value) || '';
          renderMemberEditor();
          var el3 = byId('msSearchInput');
          if (el3 && el3.focus) {
            el3.focus();
            try { var L = (el3.value || '').length; if (el3.setSelectionRange) el3.setSelectionRange(L, L); } catch (e4) {}
          }
        };
        msSearchInput.addEventListener('compositionstart', function () { msComposing = true; });
        msSearchInput.addEventListener('compositionend', function () { msComposing = false; applyMsSearch(); });
        msSearchInput.addEventListener('input', function (e) {
          if (msComposing || (e && e.isComposing)) return;
          applyMsSearch();
        });
      }
      var msSearchClear = byId('msSearchClear');
      if (msSearchClear && msSearchClear.addEventListener) {
        msSearchClear.addEventListener('click', function () { msSearchQuery = ''; renderMemberEditor(); });
      }
      if (!doc || !doc.querySelectorAll) return;
      function each(sel, fn) { var n = doc.querySelectorAll(sel); if (!n) return; Array.prototype.forEach.call(n, fn); }
      each('.ms-check', function (cb) { cb.addEventListener('change', function () {
        var id = cb.getAttribute('data-id'); if (!id) return;
        if (cb.checked) memberSheetSelected[id] = true; else delete memberSheetSelected[id];
        renderMemberEditor();
      }); });
      var clearBtn = byId('msClearBtn');
      if (clearBtn) clearBtn.addEventListener('click', function () { memberSheetSelected = {}; renderMemberEditor(); });
      function selectedSplit() {
        var live = [], del = [], names = [];
        for (var i = 0; i < membersForEdit.length; i++) {
          var m = membersForEdit[i];
          if (m && memberSheetSelected[m.member_id]) {
            (m.deleted_at ? del : live).push(m.member_id);
            if (names.length < 5) names.push(m.name || '');
          }
        }
        return { live: live, del: del, preview: names.join('、') + ((live.length + del.length) > 5 ? ' 他' : '') };
      }
      var delBtn = byId('msDeleteBtn');
      if (delBtn) delBtn.addEventListener('click', function () {
        var s = selectedSplit(); if (!s.live.length) return;
        var ask = (typeof global.confirm === 'function') ? global.confirm : null;
        if (ask && !ask(memberBulkConfirmMessage(s.live.length, s.preview, true))) return;
        setMsg('memberEditMsg', '削除中…');
        setMembersDeletedBulk(client, lastSummary.clubId, s.live, true).then(function (r) {
          if (r.ok) { for (var i = 0; i < s.live.length; i++) delete memberSheetSelected[s.live[i]]; }
          setMsg('memberEditMsg', r.message, r.ok ? 'ok' : 'err'); if (r.ok) reloadMembers();
        });
      });
      var resBtn = byId('msRestoreBtn');
      if (resBtn) resBtn.addEventListener('click', function () {
        var s = selectedSplit(); if (!s.del.length) return;
        var ask = (typeof global.confirm === 'function') ? global.confirm : null;
        if (ask && !ask(memberBulkConfirmMessage(s.del.length, s.preview, false))) return;
        setMsg('memberEditMsg', '復元中…');
        setMembersDeletedBulk(client, lastSummary.clubId, s.del, false).then(function (r) {
          if (r.ok) { for (var i = 0; i < s.del.length; i++) delete memberSheetSelected[s.del[i]]; }
          setMsg('memberEditMsg', r.message, r.ok ? 'ok' : 'err'); if (r.ok) reloadMembers();
        });
      });
      // APP-MEMBER-HARD-DELETE-001: 完全削除（選択中の削除済み行が対象・出場記録はサーバ確認で自動スキップ）。
      var hardBtn = byId('msHardDeleteBtn');
      if (hardBtn) hardBtn.addEventListener('click', function () {
        var s = selectedSplit(); if (!s.del.length) return;
        // L3 P2 (#521): confirm の氏名プレビューは削除対象（削除済み行）だけに絞る。selectedSplit の
        //   preview は live/del 混在の先頭5名のため、混在選択時に「削除されない有効会員の氏名」が
        //   破壊 confirm に出てしまう誤表示を防ぐ。
        var delNames = [];
        for (var dn = 0; dn < membersForEdit.length && delNames.length < 5; dn++) {
          var dm = membersForEdit[dn];
          if (dm && dm.deleted_at && memberSheetSelected[dm.member_id]) delNames.push(dm.name || '');
        }
        var delPreview = delNames.join('、') + (s.del.length > 5 ? ' 他' : '');
        // L3 P3 (#521): 破壊操作は confirm が使えない環境では実行しない（論理削除/復元より厳格側に倒す）。
        if (typeof global.confirm !== 'function') { setMsg('memberEditMsg', '確認ダイアログが使えないため完全削除を実行しません。', 'err'); return; }
        if (!global.confirm(memberHardDeleteConfirmMessage(s.del.length, delPreview))) return;
        setMsg('memberEditMsg', '完全削除中…');
        hardDeleteMembers(client, lastSummary.clubId, s.del).then(function (r) {
          if (r && r.deleted) { for (var i = 0; i < r.deleted.length; i++) delete memberSheetSelected[r.deleted[i]]; }
          setMsg('memberEditMsg', (r && r.message) || '完全削除に失敗しました。', (r && r.ok) ? 'ok' : 'err');
          if (r && r.ok) reloadMembers();
        });
      });
      each('.ms-name-cell', function (cell) { cell.addEventListener('click', function (e) {
        if (e && e.target && e.target.tagName === 'INPUT') return;
        if (msEditing) return;
        var id = cell.getAttribute('data-id'); var m = msFind(id); if (!m) return;
        msEditing = { id: id, kind: 'name' };
        cell.innerHTML = '<input type="text" class="ms-in" id="msEditYomi" value="' + esc(m.yomi || '') + '" placeholder="ふりがな">' +
          '<input type="text" class="ms-in ms-in-name" id="msEditName" value="' + esc(m.name || '') + '" placeholder="氏名">';
        msBindEditorInputs(cell, function () {
          msCommitPatch(id, { name: (byId('msEditName') || {}).value || '', yomi: (byId('msEditYomi') || {}).value || '' });
        });
      }); });
      function bindTextCell(cls, field, elId) {
        each(cls, function (cell) { cell.addEventListener('click', function (e) {
          if (e && e.target && e.target.tagName === 'INPUT') return;
          if (msEditing) return;
          var id = cell.getAttribute('data-id'); var m = msFind(id); if (!m) return;
          msEditing = { id: id, kind: field };
          cell.innerHTML = '<input type="text" class="ms-in" id="' + elId + '" value="' + esc(m[field] || '') + '">';
          msBindEditorInputs(cell, function () {
            var patch = {}; patch[field] = (byId(elId) || {}).value || '';
            msCommitPatch(id, patch);
          });
        }); });
      }
      bindTextCell('.ms-city-cell', 'city', 'msEditCity');
      // APP-MEMBER-SHEET-UX-001: 区分セルはタップ循環を廃止し select 選択に（作者FB 2026-07-03
      //   「選択肢が見えない・こんな操作普通じゃない」）。世の中の一覧編集の定石（スプレッドシート/
      //   Airtable 等のセル内ドロップダウン）に合わせる。保存経路は従来と同じ msCommitPatch。
      each('.ms-kind-cell', function (cell) { cell.addEventListener('click', function (e) {
        if (e && e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION')) return;
        if (msEditing) return;
        var id = cell.getAttribute('data-id'); var m = msFind(id); if (!m) return;
        msEditing = { id: id, kind: 'kind' };
        var cur = (m.member_kind === 'other') ? 'other' : 'member';
        cell.innerHTML = '<select class="ms-in ms-in-select" id="msEditKind" aria-label="支部員区分を選択">'
          + '<option value="member"' + (cur === 'member' ? ' selected' : '') + '>支部員</option>'
          + '<option value="other"' + (cur === 'other' ? ' selected' : '') + '>支部員以外</option>'
          + '</select>';
        msBindSelectEditor(cell, byId('msEditKind'), cur, function (v) { msCommitPatch(id, { member_kind: v }); });
      }); });
      each('.ms-grade-cell', function (cell) { cell.addEventListener('click', function (e) {
        if (e && e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION')) return;
        if (msEditing) return;
        var id = cell.getAttribute('data-id'); var m = msFind(id); if (!m) return;
        msEditing = { id: id, kind: 'grade' };
        var cur = (m.grade === 'chu' || m.grade === 'josei') ? m.grade : 'ippan';
        cell.innerHTML = '<select class="ms-in ms-in-select" id="msEditGrade" aria-label="会費区分を選択">'
          + '<option value="ippan"' + (cur === 'ippan' ? ' selected' : '') + '>一般</option>'
          + '<option value="chu"' + (cur === 'chu' ? ' selected' : '') + '>中学生以下</option>'
          + '<option value="josei"' + (cur === 'josei' ? ' selected' : '') + '>女性</option>'
          + '</select>';
        msBindSelectEditor(cell, byId('msEditGrade'), cur, function (v) { msCommitPatch(id, { grade: v }); });
      }); });
      // APP-MEMBER-SHEET-UX-001: 削除済み表示トグル。
      var msShowDelBtn = byId('msShowDeletedBtn');
      if (msShowDelBtn && msShowDelBtn.addEventListener) {
        msShowDelBtn.addEventListener('click', function () { msShowDeleted = !msShowDeleted; renderMemberEditor(); });
      }
    }
    function bindMemberEditor() {
      var addForm = byId('memberAddForm');
      if (addForm) addForm.addEventListener('submit', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var fields = { name: (byId('memberAddName') || {}).value || '',
                       yomi: (byId('memberAddYomi') || {}).value || '',
                       branch: (byId('memberAddBranch') || {}).value || '' };
        setMsg('memberEditMsg', '追加中…');
        insertMember(client, lastSummary.clubId, fields).then(function (r) {
          setMsg('memberEditMsg', r.message); if (r.ok) reloadMembers();
        });
      });
      if (!doc || !doc.querySelectorAll) return;
      function each(sel, fn) { var n = doc.querySelectorAll(sel); if (!n) return; Array.prototype.forEach.call(n, fn); }
      function val(sel) { var el = doc.querySelector ? doc.querySelector(sel) : null; return el ? (el.value || '') : ''; }
      each('.m-edit', function (b) { b.addEventListener('click', function () { editingMemberId = b.getAttribute('data-id'); renderMemberEditor(); }); });
      each('.m-cancel', function (b) { b.addEventListener('click', function () { editingMemberId = null; renderMemberEditor(); }); });
      each('.m-save', function (b) { b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        var fields = { name: val('.m-edit-name[data-id="' + id + '"]'),
                       yomi: val('.m-edit-yomi[data-id="' + id + '"]'),
                       branch: val('.m-edit-branch[data-id="' + id + '"]') };
        setMsg('memberEditMsg', '保存中…');
        updateMember(client, lastSummary.clubId, id, fields).then(function (r) {
          setMsg('memberEditMsg', r.message); if (r.ok) reloadMembers(); else renderMemberEditor();
        });
      }); });
      each('.m-delete', function (b) { b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        var nm = ''; for (var i = 0; i < membersForEdit.length; i++) { var mm = membersForEdit[i]; if (mm && mm.member_id === id) { nm = mm.name || ''; break; } }
        var ask = (typeof global.confirm === 'function') ? global.confirm : null;
        if (ask && !ask(memberDeleteConfirmMessage(nm))) return;   // キャンセルなら何もしない
        setMsg('memberEditMsg', '削除中…');
        setMemberDeleted(client, lastSummary.clubId, id, true).then(function (r) {
          setMsg('memberEditMsg', r.message); if (r.ok) reloadMembers();
        });
      }); });
      each('.m-restore', function (b) { b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        setMsg('memberEditMsg', '復元中…');
        setMemberDeleted(client, lastSummary.clubId, id, false).then(function (r) {
          setMsg('memberEditMsg', r.message); if (r.ok) reloadMembers();
        });
      }); });
    }
    // ---- B-4-wire: 取り込み UI 配線（ファイル読込→プレビュー→べき等取り込み）----
    var importPrep = null;
    function bindImport() {
      var pv = byId('importPreviewBtn');
      if (pv) pv.addEventListener('click', function () {
        var fi = byId('importFile');
        var f = fi && fi.files && fi.files[0];
        if (!f) { setMsg('importStatus', 'JSON ファイルを選択してください'); return; }
        setMsg('importStatus', '読み込み中…');
        var FR = global.FileReader;
        if (!FR) { setMsg('importStatus', 'このブラウザはファイル読込に対応していません'); return; }
        var rd = new FR();
        rd.onload = function () {
          fetchMembersForEdit(client, lastSummary.clubId).then(function (mr) {
            var existing = (mr && mr.ok) ? mr.members : [];
            var prep = prepareImportFromText(String(rd.result || ''), existing);
            var pvEl = byId('importPreview'), runBtn = byId('importRunBtn');
            if (!prep.ok) {
              if (pvEl) pvEl.innerHTML = '<p class="muted">' + esc((prep.errors || ['不正なデータ']).join(' / ')) + '</p>';
              importPrep = null; if (runBtn) runBtn.disabled = true; setMsg('importStatus', '');
              return;
            }
            importPrep = prep;
            if (pvEl) pvEl.innerHTML = buildImportPreviewHtml(prep.preview);
            if (runBtn) runBtn.disabled = false;
            setMsg('importStatus', 'プレビューを確認して「クラウドへ取り込む」を押してください');
          });
        };
        rd.onerror = function () { setMsg('importStatus', 'ファイルの読み込みに失敗しました'); };
        rd.readAsText(f);
      });
      var run = byId('importRunBtn');
      if (run) run.addEventListener('click', function () {
        if (!importPrep) { setMsg('importStatus', '先にプレビューしてください'); return; }
        var p = importPrep.preview;
        var ask = (typeof global.confirm === 'function') ? global.confirm : null;
        if (ask && !ask('新規会員 ' + p.newMembers + ' 名・大会 ' + p.tournaments + ' 件・成績 ' + p.entries + ' 件をクラウドへ取り込みます。よろしいですか？（重複しません）')) return;
        setMsg('importStatus', '取り込み中…'); run.disabled = true;
        importHistoryToCloud(client, lastSummary.clubId, importPrep.payload, importPrep.resolution).then(function (r) {
          if (r.ok) {
            var c = r.counts;
            setMsg('importStatus', '取り込み完了：新規会員 ' + c.members_new + ' 名・選手 ' + c.players + ' 名・大会 ' + c.tournaments + ' 件・成績 ' + c.entries + ' 件' + ((c.unresolved || 0) > 0 ? '（未解決 ' + c.unresolved + ' 件）' : ''), 'ok');
            loadReadViews();
          } else {
            setMsg('importStatus', '取り込み失敗（' + (r.step || '') + '）：' + (r.message || ''), 'err'); run.disabled = false;
          }
        });
      });
    }

    function bindTournamentRows() {
      if (!doc || !doc.querySelectorAll) return;
      var nodes = doc.querySelectorAll('.cloud-tnt'); if (!nodes) return;
      Array.prototype.forEach.call(nodes, function (n) {
        n.addEventListener('click', function () {
          var tid = n.getAttribute('data-id');
          // APP-UX-004A: 選択中の大会ボタンを active 表示（className 直接更新＝ES5）。
          var all = doc.querySelectorAll('.cloud-tnt');
          Array.prototype.forEach.call(all, function (b) { b.className = 'cloud-tnt'; });
          n.className = 'cloud-tnt active';
          var tnt = null;
          for (var ti = 0; ti < lastTournaments.length; ti++) { if (lastTournaments[ti] && String(lastTournaments[ti].id) === String(tid)) { tnt = lastTournaments[ti]; break; } }
          // APP-UX-004A2: 詳細ビューへ切替（結果視認性の原則＝スクロール不要で結果が見える）。
          showTntDetail(true);
          var el = byId('cloudEntries'); if (el) el.innerHTML = '<p class="muted">読み込み中…</p>';
          fetchEntries(client, tid, lastSummary.clubId).then(function (r) {
            var e2 = byId('cloudEntries');
            if (e2) e2.innerHTML = r.ok ? (buildTournamentHeadHtml(tnt) + buildEntryTableHtml(r.entries)) : '<p class="muted">' + esc(r.message) + '</p>';
          });
        });
      });
    }
    // APP-UX-004A2: 一覧⇄詳細の表示切替（display トグルのみ・fail-soft）。
    function showTntDetail(detail) {
      var lv = byId('tntListView'), dv = byId('tntDetailView');
      if (lv) lv.style.display = detail ? 'none' : '';
      if (dv) dv.style.display = detail ? '' : 'none';
    }
    function bindTntBack() {
      var b = byId('tntBackBtn');
      if (b) b.addEventListener('click', function () { showTntDetail(false); });
    }
    function bindOrgActions() {
      if (!doc || !doc.querySelectorAll) return;
      function wire(sel, status) {
        var nodes = doc.querySelectorAll(sel); if (!nodes) return;
        Array.prototype.forEach.call(nodes, function (n) {
          n.addEventListener('click', function () {
            setOrganizerStatus(client, n.getAttribute('data-id'), status, lastOrganizers)
              .then(function (r) { setMsg('adminMsg', r.message, r.ok ? 'ok' : 'err'); if (r.ok) refreshAdmin(); });
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
    // B-1 read-only（#343）
    sortTournamentsDesc: sortTournamentsDesc,
    buildTournamentListHtml: buildTournamentListHtml,
    buildMemberListHtml: buildMemberListHtml,
    shapeEntryRow: shapeEntryRow,
    buildEntryTableHtml: buildEntryTableHtml,
    buildTournamentHeadHtml: buildTournamentHeadHtml,
    fetchTournaments: fetchTournaments,
    fetchMembers: fetchMembers,
    fetchEntries: fetchEntries,
    // 通年集計（#343）
    fetchSeasonEntries: fetchSeasonEntries,
    canonicalizeClass: canonicalizeClass,
    shapeStandingRow: shapeStandingRow,
    listSeasons: listSeasons,
    aggregateStandings: aggregateStandings,
    aggregateGrowthAward: aggregateGrowthAward,
    buildGrowthAwardHtml: buildGrowthAwardHtml,
    buildSeasonSelectorHtml: buildSeasonSelectorHtml,
    buildSeasonStandingsHtml: buildSeasonStandingsHtml,
    listClasses: listClasses,
    aggregateRecords: aggregateRecords,
    aggregateMonthlyChampions: aggregateMonthlyChampions,
    aggregateByCity: aggregateByCity,
    buildClassSelectorHtml: buildClassSelectorHtml,
    buildRecordsHtml: buildRecordsHtml,
    buildMonthlyChampionsHtml: buildMonthlyChampionsHtml,
    buildCityStandingsHtml: buildCityStandingsHtml,
    // B-5 名簿編集（#343）
    fetchMembersForEdit: fetchMembersForEdit,
    newMemberId: newMemberId,
    insertMember: insertMember,
    updateMember: updateMember,
    setMemberDeleted: setMemberDeleted,
    sortMembersForEdit: sortMembersForEdit,
    buildMemberEditRowHtml: buildMemberEditRowHtml,
    buildMemberEditPanelHtml: buildMemberEditPanelHtml,
    memberDeleteConfirmMessage: memberDeleteConfirmMessage,
    // APP-UX-002（シート型名簿）
    memberKindBadgeHtml: memberKindBadgeHtml,
    gradeShortLabel: gradeShortLabel,
    buildMemberSheetRowHtml: buildMemberSheetRowHtml,
    buildMemberSheetHtml: buildMemberSheetHtml,
    // APP-MEMBER-SEARCH-001
    normalizeSearchText: normalizeSearchText,
    memberMatchesSearch: memberMatchesSearch,
    memberBulkConfirmMessage: memberBulkConfirmMessage,
    updateMemberFields: updateMemberFields,
    setMembersDeletedBulk: setMembersDeletedBulk,
    // APP-MEMBER-HARD-DELETE-001
    hardDeleteMembers: hardDeleteMembers,
    memberHardDeleteConfirmMessage: memberHardDeleteConfirmMessage,
    // B-4 移行取り込み（#343）
    validateImportPayload: validateImportPayload,
    resolveImportMembers: resolveImportMembers,
    buildImportPreview: buildImportPreview,
    importHistoryToCloud: importHistoryToCloud,
    buildImportPanelHtml: buildImportPanelHtml,
    buildImportPreviewHtml: buildImportPreviewHtml,
    prepareImportFromText: prepareImportFromText,
    // coordinator
    makeController: makeController,
    boot: boot
  };
})(typeof window !== 'undefined' ? window : this);
