/* 루카 통합사전 — 오프라인 캐시 서비스 워커
   앱 화면·내장 데이터·글꼴·아이콘만 기기에 저장합니다.
   검색 기록과 단어장은 서비스 워커를 거치지 않고 브라우저 localStorage에만 남습니다. */
const CACHE = 'luka-dict-v10';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/data-hanja.js',
  './js/data-en.js',
  './js/data-ko.js',
  './icons/app-icon-192.png',
  './icons/app-icon-512.png',
  './fonts/PretendardVariable.woff2',
  './fonts/DictHanja.woff2',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  // 캐시 버전을 올릴 때 브라우저 HTTP 캐시의 옛 파일을 쓰지 않도록
  // cache: 'reload'로 서버에서 새로 받아 저장합니다.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((url) =>
        fetch(new Request(url, { cache: 'reload' })).then((res) => {
          if (res && res.status === 200) return cache.put(url, res);
        })
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 다른 곳의 사전 API는 그때그때 인터넷에서 받아옵니다.
  if (!sameOrigin) return;

  // 페이지 이동은 네트워크 우선, 끊기면 저장된 화면으로.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // 화면을 이루는 파일은 저장본 우선.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
