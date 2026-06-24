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
    var readCard = '' +
      '<section class="card" id="cloudReadView">' +
      '<h2>過去の大会（クラウド・閲覧）</h2>' +
      '<div id="cloudTournaments" class="muted">読み込み中…</div>' +
      '<h2>大会結果</h2>' +
      '<div id="cloudEntries" class="muted">上の大会を選ぶと結果を表示します。</div>' +
      '<h2>名簿（クラウド・編集）</h2>' +
      '<div id="cloudMembers" class="muted">読み込み中…</div>' +
      '</section>';
    return head + readCard + (summary.isAdmin ? buildAdminPanelHtml(organizers, summary) : '');
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
    var rows = list.map(function (t) {
      var st = TSTATUS_LABEL[t && t.status] || esc((t && t.status) || '');
      return '<li class="org-row">' +
        '<button type="button" class="cloud-tnt" data-id="' + esc((t && t.id) || '') + '">' +
        esc((t && t.date) || '') + '　' + esc((t && t.name) || '(名称未設定)') + '</button>' +
        '<span class="org-meta">' + esc((t && t.season) || '') + '／' + st + '</span></li>';
    }).join('');
    return '<ul class="org-list">' + rows + '</ul>';
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
  function shapeEntryRow(e) {
    var p = e && e.players, m = p && p.members;
    return {
      rank: (e && e.final_rank != null) ? e.final_rank : null,
      cls: (e && e['class']) || '',
      name: (m && m.name) || '',
      yomi: (m && m.yomi) || '',
      wins: (e && e.wins) || 0,
      losses: (e && e.losses) || 0,
      sos: (e && e.sos != null) ? e.sos : '',
      sodos: (e && e.sodos != null) ? e.sodos : ''
    };
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
    var rows = list.map(function (r) {
      return '<tr><td>' + esc(r.cls) + '</td><td>' + (r.rank == null ? '-' : esc(String(r.rank))) + '</td>' +
        '<td>' + esc(r.name) + '</td><td>' + esc(String(r.wins)) + '</td><td>' + esc(String(r.losses)) + '</td>' +
        '<td>' + esc(String(r.sos)) + '</td><td>' + esc(String(r.sodos)) + '</td></tr>';
    }).join('');
    return '<table class="cloud-entries"><thead><tr><th>クラス</th><th>順位</th><th>氏名</th><th>勝</th><th>負</th><th>B(SOS)</th><th>C(SODOS)</th></tr></thead><tbody>' + rows + '</tbody></table>';
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
  function fetchEntries(client, tournamentId) {
    return client.from('entries')
      .select('final_rank,class,wins,losses,sos,sodos,participated,players(member_id,members(name,yomi))')
      .eq('tournament_id', tournamentId).then(function (res) {
        if (res.error) return { ok:false, message:'結果の読み込みに失敗しました', entries:[] };
        return { ok:true, entries: res.data || [] };
      });
  }

  // ===========================================================================
  // B-5（#343）: 名簿の編集（追加 / 氏名・ふりがな・支部の更新 / 論理削除・復元）。
  //   クラウド members を正本として app/ から直接編集する。権限は RLS が最終強制
  //   （insert/update＝active organizer 全員可・物理 delete は admin 限定＝本UIは行わない）。
  //   論理削除＝deleted_at に時刻を set する update（復元＝null に戻す）。当日アプリ
  //   (shogi_v4.html) には一切触れない。build/bind/coordinator パターン・client 注入。
  // ===========================================================================
  function fetchMembersForEdit(client, clubId) {
    return client.from('members').select('member_id,name,yomi,branch,deleted_at').eq('club_id', clubId).then(function (res) {
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
                yomi: (fields.yomi || '').trim() || null, branch: (fields.branch || '').trim() || null };
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
      loadReadViews();
    }
    function loadReadViews() {
      if (!lastSummary) return;
      fetchTournaments(client, lastSummary.clubId).then(function (r) {
        var el = byId('cloudTournaments');
        if (el) el.innerHTML = r.ok ? buildTournamentListHtml(r.tournaments) : '<p class="muted">' + esc(r.message) + '</p>';
        bindTournamentRows();
      });
      loadMemberEditor();
    }
    // ---- B-5: 名簿編集（#cloudMembers を読取専用から編集可能パネルへ昇格）----
    var membersForEdit = [];
    var editingMemberId = null;
    function renderMemberEditor() {
      var el = byId('cloudMembers'); if (!el) return;
      el.innerHTML = buildMemberEditPanelHtml(membersForEdit, editingMemberId);
      bindMemberEditor();
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
    function bindTournamentRows() {
      if (!doc || !doc.querySelectorAll) return;
      var nodes = doc.querySelectorAll('.cloud-tnt'); if (!nodes) return;
      Array.prototype.forEach.call(nodes, function (n) {
        n.addEventListener('click', function () {
          var tid = n.getAttribute('data-id');
          var el = byId('cloudEntries'); if (el) el.innerHTML = '<p class="muted">読み込み中…</p>';
          fetchEntries(client, tid).then(function (r) {
            var e2 = byId('cloudEntries');
            if (e2) e2.innerHTML = r.ok ? buildEntryTableHtml(r.entries) : '<p class="muted">' + esc(r.message) + '</p>';
          });
        });
      });
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
    // B-1 read-only（#343）
    sortTournamentsDesc: sortTournamentsDesc,
    buildTournamentListHtml: buildTournamentListHtml,
    buildMemberListHtml: buildMemberListHtml,
    shapeEntryRow: shapeEntryRow,
    buildEntryTableHtml: buildEntryTableHtml,
    fetchTournaments: fetchTournaments,
    fetchMembers: fetchMembers,
    fetchEntries: fetchEntries,
    // B-5 名簿編集（#343）
    fetchMembersForEdit: fetchMembersForEdit,
    newMemberId: newMemberId,
    insertMember: insertMember,
    updateMember: updateMember,
    setMemberDeleted: setMemberDeleted,
    sortMembersForEdit: sortMembersForEdit,
    buildMemberEditRowHtml: buildMemberEditRowHtml,
    buildMemberEditPanelHtml: buildMemberEditPanelHtml,
    // coordinator
    makeController: makeController,
    boot: boot
  };
})(typeof window !== 'undefined' ? window : this);
