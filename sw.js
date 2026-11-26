/* 사거리인터넷 앱(홈 화면 설치)용 서비스 워커 — 2026-11-26
   · 화면(html)은 항상 인터넷에서 새로 받음 → GitHub에 Push하면 앱도 바로 새 내용 (자동 업데이트)
   · 인터넷이 끊겼을 때만 마지막으로 본 화면을 보여줌
   · 사진·아이콘은 기기에 보관해 빠르게 (뒤에서 새로 받아 갱신)
   · 사거리온(ADMIN-01)·신분증(id.html)·전화 링크(call.html)·요금표·접수 등 다른 주소는 전혀 건드리지 않음
   · 손님 정보는 보관하지 않음 (보내는 요청 POST 는 손대지 않음) */
var VER = 'sg-app-v1';
var SKIP = /\/ADMIN-01\/|\/id\.html|\/call\.html/i;
var STATIC = /\.(png|jpe?g|gif|svg|webp|ico|webmanifest)$/i;
var PAGES = ['./', 'index.html', 'rental.html', 'boss.html', 'privacy.html', 'water.html', 'appliance.html'];

self.addEventListener('install', function (e) {
    self.skipWaiting();
    e.waitUntil(caches.open(VER).then(function (c) { return Promise.all(['./', 'icon-192.png', 'icon-512.png'].map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () { }); })); }));
});
self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k.indexOf('sg-app-') === 0 && k !== VER; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});
function offlinePage() {
    var h = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>사거리인터넷</title>'
        + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0E343B;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}'
        + 'h1{font-size:20px;margin:0 0 8px}p{color:#cfe0de;margin:0 0 18px;line-height:1.6}a{display:inline-block;margin:6px;padding:14px 22px;border-radius:14px;font-weight:800;text-decoration:none}'
        + '.t{background:#F3D58F;color:#0E343B}.r{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4)}</style></head><body><div>'
        + '<h1>인터넷 연결이 끊겼어요</h1><p>연결되면 다시 열어 주세요.<br>급하시면 전화로 바로 상담해 드려요.</p>'
        + '<a class="t" href="tel:18332440">📞 1833-2440 전화 상담</a><a class="r" href="./">다시 열기</a></div></body></html>';
    return new Response(h, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url;
    try { url = new URL(req.url); } catch (er) { return; }
    if (url.origin !== self.location.origin) return;          // 요금표·렌탈 자료·글꼴 등 바깥 주소는 그대로
    if (SKIP.test(url.pathname)) return;                       // 사거리온·신분증·전화 링크는 그대로
    if (req.mode === 'navigate') {                             // 화면: 항상 새로 → 끊기면 마지막 화면
        e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
            if (res && res.ok && res.type === 'basic') {
                var page = url.pathname.split('/').pop() || './';
                if (PAGES.indexOf(page) >= 0) { var cp = res.clone(); caches.open(VER).then(function (c) { c.put(url.pathname, cp); }); }
            }
            return res;
        }).catch(function () {
            return caches.match(url.pathname).then(function (m) { return m || caches.match('./') ; }).then(function (m) { return m || offlinePage(); });
        }));
        return;
    }
    if (STATIC.test(url.pathname)) {                           // 사진·아이콘: 보관본 먼저, 뒤에서 새로 받아 갱신
        e.respondWith(caches.open(VER).then(function (c) {
            return c.match(req).then(function (hit) {
                var net = fetch(req).then(function (res) { if (res && res.ok && res.type === 'basic') c.put(req, res.clone()); return res; });
                if (hit) { e.waitUntil(net.catch(function () { })); return hit; }
                return net;
            });
        }));
    }
});
