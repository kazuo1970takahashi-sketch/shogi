/* SHOGI-TOUR Service Worker (PWA Slice2 / #... )
   方針:
   - コード(HTML/JS・same-origin)= network-first：オンラインは常に最新（auth.js 等のキャッシュ事故を根治）、
     オフライン時のみキャッシュへフォールバック。
   - 静的(画像/manifest 等・same-origin)= cache-first（高速・成功レスポンスのみキャッシュ）。
   - 外部オリジン(Supabase / CDN)= 一切介入せず素通り（クラウド送信・SRI 固定 CDN を壊さない）。
   - キャッシュは ok かつ basic(same-origin) かつ 非リダイレクトのレスポンスのみ（キャプティブポータルや 404/500 の混入を防ぐ）。
   - キャッシュ名にバージョン。activate で旧版を削除。skipWaiting + clients.claim で更新を素早く反映。
   ★緊急停止(kill switch): 不具合時は sw.js の中身を下記だけに置き換えて release すると全クライアントで SW を解除できる:
       self.addEventListener('install',function(){self.skipWaiting();});
       self.addEventListener('activate',function(e){e.waitUntil(self.registration.unregister()
         .then(function(){return self.clients.matchAll();})
         .then(function(cs){cs.forEach(function(c){c.navigate(c.url);});}));});
*/
var CACHE = 'shogi-tour-v97';   // ★release ごとにバージョンを上げる（?v と同期）
var PRECACHE = [
  './', 'index.html', 'shogi_v4.html', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'icon-192-maskable.png', 'icon-512-maskable.png',
  'app/', 'app/index.html', 'app/auth.js'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // 1件でも失敗してインストール全体を落とさない（fail-soft）
    return Promise.all(PRECACHE.map(function (u) { return c.add(u).catch(function () {}); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return (k === CACHE) ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // 変更系は触らない
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;  // 外部(Supabase/CDN)は素通り
  if (/\/sw\.js$/.test(url.pathname)) return;        // SW 自身はブラウザ機構に任せる（完全一致）

  var accept = req.headers.get('accept') || '';
  var isCode = (req.mode === 'navigate') || accept.indexOf('text/html') >= 0
            || /\.(html|js)$/.test(url.pathname);   // コードは network-first

  if (isCode) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic' && !res.redirected) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (m) {
          return m || caches.match('shogi_v4.html', { ignoreSearch: true });
        });
      })
    );
    return;
  }

  // 静的: cache-first（あれば即返し・無ければ取得してキャッシュ）
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (m) {
      if (m) return m;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic' && !res.redirected) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      });
    })
  );
});
