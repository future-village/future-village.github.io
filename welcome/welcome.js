(function () {
  'use strict';
  var root = document.documentElement;
  var metaEl = document.getElementById('lang-meta');
  var meta = null;
  if (metaEl) meta = JSON.parse(metaEl.textContent);

  document.querySelectorAll('a[data-set-lang]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { localStorage.setItem('fv_lang', link.getAttribute('data-set-lang')); } catch (err) {}
    });
  });

  var hint = document.getElementById('lang-hint');
  if (meta && hint) {
    var dismissed = false;
    try { dismissed = sessionStorage.getItem('fv_hint_off') === '1'; } catch (err) {}
    var target = null;
    try {
      var saved = localStorage.getItem('fv_lang');
      if (saved && saved !== meta.current) target = saved;
    } catch (err) {}
    if (!target && navigator.languages) target = prefer(navigator.languages);
    var item = null;
    if (target) {
      for (var i = 0; i < meta.items.length; i++) if (meta.items[i].id === target) item = meta.items[i];
    }
    if (!dismissed && item && item.id !== meta.current) {
      var text = document.getElementById('lang-hint-text');
      var parts = String(meta.hint).split('{name}');
      text.textContent = parts[0] || '';
      var jump = document.createElement('a');
      jump.href = item.href;
      jump.hreflang = item.hreflang;
      jump.lang = item.lang;
      jump.setAttribute('data-set-lang', item.id);
      jump.textContent = item.name;
      jump.addEventListener('click', function () {
        try { localStorage.setItem('fv_lang', item.id); } catch (err) {}
      });
      text.appendChild(jump);
      if (parts[1]) text.appendChild(document.createTextNode(parts[1]));
      hint.hidden = false;
    }
    var close = hint.querySelector('[data-hint-close]');
    if (close) close.addEventListener('click', function () {
      hint.hidden = true;
      try { sessionStorage.setItem('fv_hint_off', '1'); } catch (err) {}
    });
  }

  function prefer(list) {
    for (var i = 0; i < list.length; i++) {
      var tag = String(list[i] || '').toLowerCase();
      if (tag === 'zh-tw' || tag === 'zh-hant' || tag === 'zh-hk' || tag === 'zh-mo' || tag === 'zh' || tag === 'zh-cn' || tag === 'zh-sg' || tag === 'zh-hans') return 'zh-Hant';
      if (tag.indexOf('ja') === 0) return 'ja';
      if (tag.indexOf('ko') === 0) return 'ko';
      if (tag.indexOf('en') === 0) return 'en';
    }
    return null;
  }

  var motionBtn = document.querySelector('[data-motion]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function source(url, type) {
    var node = document.createElement('source');
    node.src = url;
    node.type = type;
    return node;
  }
  function fillVideo(video) {
    if (!video || video.querySelector('source')) return;
    var narrow = window.innerWidth <= 760;
    var webm = narrow ? video.getAttribute('data-webm-tall') : video.getAttribute('data-webm-wide');
    var mp4 = narrow ? video.getAttribute('data-mp4-tall') : video.getAttribute('data-mp4-wide');
    if (!webm && !mp4) {
      webm = video.getAttribute('data-webm-wide') || video.getAttribute('data-webm-tall');
      mp4 = video.getAttribute('data-mp4-wide') || video.getAttribute('data-mp4-tall');
    }
    if (webm) video.appendChild(source(webm, 'video/webm'));
    if (mp4) video.appendChild(source(mp4, 'video/mp4'));
    if (webm || mp4) {
      video.load();
      video.play().catch(function () {});
    }
  }
  function setStill(on) {
    root.classList.toggle('is-still', on);
    if (motionBtn) {
      motionBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      motionBtn.textContent = on ? motionBtn.getAttribute('data-play') : motionBtn.getAttribute('data-pause');
    }
    var video = document.getElementById('hero-video');
    if (!video) return;
    if (on) {
      video.pause();
      var nodes = video.querySelectorAll('source');
      for (var i = 0; i < nodes.length; i++) nodes[i].remove();
    } else fillVideo(video);
  }
  setStill(reduce);
  if (motionBtn) motionBtn.addEventListener('click', function () { setStill(!root.classList.contains('is-still')); });

  document.querySelectorAll('img').forEach(function (img) {
    img.addEventListener('error', function () { img.classList.add('is-broken'); });
  });

  var copyBtn = document.querySelector('[data-copy]');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var text = document.querySelector('#ai-cmd').textContent;
    var done = function () { copyBtn.classList.add('is-copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(function () { fallback(text); done(); });
    else { fallback(text); done(); }
  });
  function fallback(text) {
    var area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (err) {}
    area.remove();
  }

  var soundBtn = document.querySelector('[data-sound]');
  if (soundBtn) {
    var audio = document.createElement('audio');
    audio.preload = 'none';
    audio.loop = true;
    var on = false;
    var timer = 0;
    soundBtn.addEventListener('click', function () {
      on = !on;
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!on) { audio.pause(); return; }
      if (!audio.src) audio.src = soundBtn.getAttribute('data-src');
      audio.volume = 0;
      audio.play().then(function () {
        var t0 = performance.now();
        var step = function (now) {
          var p = Math.min(1, (now - t0) / 2500);
          audio.volume = 0.3 * p;
          if (p < 1 && on) timer = requestAnimationFrame(step);
        };
        timer = requestAnimationFrame(step);
      }).catch(function () {
        on = false;
        soundBtn.setAttribute('aria-pressed', 'false');
      });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) audio.pause();
      else if (on) audio.play().catch(function () {});
    });
  }

  var grow = document.getElementById('grow');
  if (grow && 'IntersectionObserver' in window) {
    var figs = grow.querySelectorAll('[data-step]');
    var sentinels = grow.querySelectorAll('.sentinel');
    var setStep = function () { root.style.setProperty('--step', Math.round(window.innerHeight) + 'px'); };
    setStep();
    window.addEventListener('resize', setStep);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var step = entry.target.getAttribute('data-step');
        for (var i = 0; i < figs.length; i++) figs[i].classList.toggle('is-on', figs[i].getAttribute('data-step') === step);
      });
    }, {threshold: 0.6});
    for (var s = 0; s < sentinels.length; s++) io.observe(sentinels[s]);
  }
})();
