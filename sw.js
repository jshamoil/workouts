'use strict';
// Offline shell for the workout app.
// index.html is served network-first with a write-through cache: online loads
// always hit the network (so the in-page self-updater and its #buildv check
// keep working exactly as before), and every successful fetch refreshes the
// cached copy that gets served when there's no signal.
var CACHE = 'wk-shell-v1';

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(['./index.html', './icon.png']); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// The self-updater fetches index.html with a cache-busting query string;
// matching on pathname alone means that fetch also lands here and refreshes
// the offline copy whenever it pulls a new build.
function isShell(url){
  return url.origin === self.location.origin &&
    (url.pathname.slice(-1) === '/' || url.pathname.slice(-11) === '/index.html');
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  // content.json is always fetched with a cache-buster and the page keeps its
  // own offline copy in localStorage — never cache it here (unique query
  // strings would bloat the cache one entry per launch)
  if(url.pathname.slice(-12) === 'content.json') return;

  if(isShell(url)){
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
        }
        return res;
      }).catch(function(){
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Everything else (icon, Google Fonts CSS + woff2): cache-first with a
  // background refresh, so fonts render offline after the first online visit.
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if(res && (res.ok || res.type === 'opaque')){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
