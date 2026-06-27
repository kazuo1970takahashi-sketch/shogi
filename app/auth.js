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
    var standingsCard = '' +
      '<section class="card" id="cloudStandingsView">' +
      '<h2>通年集計（シーズン別成績）</h2>' +
      '<div id="standingsControls"><span id="seasonSelectWrap"></span><span id="classSelectWrap"></span></div>' +
      '<div id="cloudStandings" class="muted">読み込み中…</div>' +
      '</section>' +
      '<section class="card" id="cloudGrowthView"><h2>成長賞（前年度比 勝率の伸び）</h2><div id="cloudGrowth" class="muted">読み込み中…</div></section>' +
      '<section class="card" id="cloudRecordsView"><h2>記録・殿堂</h2><div id="cloudRecords" class="muted">読み込み中…</div></section>' +
      '<section class="card" id="cloudMonthlyView"><h2>月別チャンピオン</h2><div id="cloudMonthly" class="muted">読み込み中…</div></section>' +
      '<section class="card" id="cloudCityView"><h2>市町村対抗</h2><div id="cloudCity" class="muted">読み込み中…</div></section>';
    return head + readCard + standingsCard + (summary.isAdmin ? (buildAdminPanelHtml(organizers, summary) + buildImportPanelHtml()) : '');
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
        return client.from('players').select('id,member_id,members(name,branch)').eq('club_id', clubId).then(function (pr) {
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
      branch: (m && m.branch) || '',
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
  // 市町村別: 延べ出場/通算勝/人数。
  function aggregateByCity(rows) {
    var by = {};
    for (var i = 0; i < (rows || []).length; i++) { var r = rows[i]; var c = r.branch || '(不明)'; var a = by[c] || (by[c] = { branch: c, games: 0, wins: 0, _m: {} }); a.games += 1; a.wins += (r.wins || 0); if (r.member_id) a._m[r.member_id] = 1; }
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
    var rows = l.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.branch) + '</td><td>' + x.members + '</td><td>' + x.games + '</td><td>' + x.wins + '</td></tr>'; }).join('');
    return '<table class="cloud-entries"><thead><tr><th>順</th><th>市町村</th><th>人数</th><th>延べ出場</th><th>通算勝</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

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
  // 論理削除の確認メッセージ（純粋・テスト対象）。誤操作防止に confirm で挟む。
  function memberDeleteConfirmMessage(name) {
    var nm = (typeof name === 'string' && name) ? name : 'この会員';
    return '「' + nm + '」を論理削除します。よろしいですか？\n（削除後も「復元」で元に戻せます）';
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
      byNameBranch[nk + '\u0001' + impSquash(em.branch || '')] = em;
      (byName[nk] = byName[nk] || []).push(em);
    }
    var idMap = {}, newMembers = [], matched = 0, ambiguous = [], used = {};
    var ms = Array.isArray(payload.members) ? payload.members : [];
    for (var m = 0; m < ms.length; m++) {
      var pm = ms[m], nk = impSquash(pm.name), match = null;
      // ① 氏名＋branch 完全一致を優先（同名別人を区別）。
      var exact = byNameBranch[nk + '\u0001' + impSquash(pm.branch || '')];
      if (exact && !used[exact.member_id]) match = exact;
      // ② 無ければ氏名のみ一致（branch 未設定の既存名簿向け）。ただし未使用が1件のときだけ。
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
    var newRows = resolution.newMembers.map(function (m) { return { club_id: clubId, member_id: m.member_id, name: m.name, branch: (m.branch || null) }; });
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
    return '' +
      '<section class="card" id="importPanel">' +
      '<h2>過去大会データの取り込み（移行）</h2>' +
      '<p class="muted">cowork が作成した投入データ（JSON）を読み込み、プレビューで確認してから取り込みます。既存会員は上書きしません。何度実行しても重複しません。</p>' +
      '<input type="file" id="importFile" accept=".json,application/json">' +
      '<button type="button" id="importPreviewBtn">プレビュー（確認）</button>' +
      '<div id="importPreview" class="muted"></div>' +
      '<button type="button" id="importRunBtn" disabled>クラウドへ取り込む</button>' +
      '<p id="importStatus" class="msg" role="status" aria-live="polite"></p>' +
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
      bindImport();
    }
    function loadReadViews() {
      if (!lastSummary) return;
      fetchTournaments(client, lastSummary.clubId).then(function (r) {
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
            setMsg('importStatus', '取り込み完了：新規会員 ' + c.members_new + ' 名・選手 ' + c.players + ' 名・大会 ' + c.tournaments + ' 件・成績 ' + c.entries + ' 件' + ((c.unresolved || 0) > 0 ? '（未解決 ' + c.unresolved + ' 件）' : ''));
            loadReadViews();
          } else {
            setMsg('importStatus', '取り込み失敗（' + (r.step || '') + '）：' + (r.message || '')); run.disabled = false;
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
          var el = byId('cloudEntries'); if (el) el.innerHTML = '<p class="muted">読み込み中…</p>';
          fetchEntries(client, tid, lastSummary.clubId).then(function (r) {
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
