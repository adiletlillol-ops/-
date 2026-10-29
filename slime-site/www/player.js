'use strict';

/* Мой плеер: свои файлы и ссылки.
   - папка с сериями (номер серии определяется по имени файла), автопереход на следующую;
   - один файл или ссылка (.mp4, .webm, .m3u8, либо страница плеера — откроется во фрейме);
   - субтитры .srt/.vtt (в том числе в кодировке Windows-1251);
   - запоминает ссылку и место просмотра для каждой серии. */
(function () {
  const LINKS_KEY = 'slime.player.links';
  const POS_KEY = 'slime.player.pos';
  const libs = {}; // animeId -> { videos: Map(серия -> File), subs: Map(серия -> File) }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* нет хранилища */ } },
  };

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const btn = (text, fn) => {
    const b = el('button', 'mp-btn', text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const hiddenFile = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.hidden = true;
    return i;
  };

  // Номер серии из имени файла: "[Group] Name - 05 [1080p].mp4", "S01E05", "ep05", "Name 05.mkv"
  function guessEpisode(name) {
    const base = name.replace(/\.[^.]+$/, '');
    let m = base.match(/(?:^|[\s._\-\[(])(?:s\d{1,2})?e(?:p(?:isode)?)?[\s._-]?(\d{1,3})(?=$|[\s._\-\])v])/i);
    if (m) return +m[1];
    m = base.match(/(?:серия|series)[\s._-]?(\d{1,3})/i);
    if (m) return +m[1];
    const all = [...base.matchAll(/(?:^|[\s_\-\[(])(\d{1,3})(?:v\d)?(?=$|[\s_\-\]).])/g)];
    return all.length ? +all[all.length - 1][1] : 0;
  }

  function srtToVtt(text) {
    return 'WEBVTT\n\n' + text.replace(/\r+/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  }

  function mount(box, ctx, opts) {
    box.className = 'player panel';
    box.hidden = false;
    box.replaceChildren();

    const id = ctx.animeId;
    const n = ctx.episode;
    const lib = libs[id] || (libs[id] = { videos: new Map(), subs: new Map() });
    let objUrl = '';

    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    const stage = el('div', 'mp-stage');
    stage.append(video);
    const status = el('p', 'mp-status');
    const setStatus = (t) => { status.textContent = t; };

    const useVideo = () => { if (video.parentNode !== stage) stage.replaceChildren(video); };

    let hlsInst = null;
    const dropHls = () => { if (hlsInst) { hlsInst.destroy(); hlsInst = null; } };

    function loadHls(url) {
      dropHls();
      if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; return; }
      const go = () => {
        if (!window.Hls || !window.Hls.isSupported()) { setStatus('Этот браузер не умеет играть потоки m3u8.'); return; }
        hlsInst = new window.Hls();
        hlsInst.on(window.Hls.Events.ERROR, (e, d) => {
          if (d.fatal) setStatus('Поток не загрузился (' + d.details + '). Источник может быть недоступен из твоей сети или не разрешать показ на других сайтах.');
        });
        hlsInst.loadSource(url);
        hlsInst.attachMedia(video);
      };
      if (window.Hls) { go(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
      s.onload = go;
      s.onerror = () => setStatus('Не удалось загрузить библиотеку для m3u8 (нужен интернет).');
      document.head.append(s);
    }

    function loadUrl(raw, save = true) {
      const url = raw.trim();
      if (!/^https?:\/\//i.test(url)) { setStatus('Ссылка должна начинаться с http:// или https://'); return; }
      const path = url.split(/[?#]/)[0].toLowerCase();
      if (/\.(mp4|webm|ogv|m4v|mov)$/.test(path)) {
        dropHls(); useVideo(); video.src = url; video.load(); setStatus('Играет по ссылке.');
      } else if (/\.m3u8$/.test(path)) {
        useVideo(); loadHls(url); setStatus('Играет поток m3u8.');
      } else {
        const f = document.createElement('iframe');
        f.src = url;
        f.allow = 'fullscreen; autoplay; encrypted-media; picture-in-picture';
        f.allowFullscreen = true;
        f.referrerPolicy = 'no-referrer';
        f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
        stage.replaceChildren(f);
        setStatus('Страница плеера показана во фрейме. Сайт сам решает, пустит ли он себя во фрейм.');
      }
      if (save) {
        const all = store.get(LINKS_KEY);
        all[id] = all[id] || {};
        all[id][n] = url;
        store.set(LINKS_KEY, all);
      }
    }

    async function addSubs(file) {
      const buf = await file.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch { text = new TextDecoder('windows-1251').decode(buf); }
      text = text.replace(/^\uFEFF/, '');
      if (!/^WEBVTT/.test(text)) text = srtToVtt(text);
      video.querySelectorAll('track').forEach((t) => t.remove());
      const t = document.createElement('track');
      t.kind = 'subtitles';
      t.label = 'Субтитры';
      t.srclang = 'ru';
      t.src = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
      t.default = true;
      video.append(t);
      setTimeout(() => { if (t.track) t.track.mode = 'showing'; }, 150);
    }

    function startLocal(file) {
      dropHls();
      useVideo();
      if (objUrl) URL.revokeObjectURL(objUrl);
      objUrl = URL.createObjectURL(file);
      video.src = objUrl;
      video.load();
      setStatus('Играет: ' + file.name);
      const sub = lib.subs.get(n);
      if (sub) addSubs(sub);
      video.play().catch(() => {});
    }

    /* — управление — */
    const folderIn = hiddenFile();
    folderIn.setAttribute('webkitdirectory', '');
    folderIn.multiple = true;
    const fileIn = hiddenFile();
    fileIn.accept = 'video/*,.mkv';
    const subIn = hiddenFile();
    subIn.accept = '.srt,.vtt';

    folderIn.addEventListener('change', () => {
      lib.videos.clear();
      lib.subs.clear();
      for (const f of folderIn.files) {
        const ext = f.name.split('.').pop().toLowerCase();
        const ep = guessEpisode(f.name);
        if (!ep) continue;
        if (/^(mp4|mkv|webm|m4v|mov)$/.test(ext)) { if (!lib.videos.has(ep)) lib.videos.set(ep, f); }
        else if (/^(srt|vtt)$/.test(ext)) { if (!lib.subs.has(ep)) lib.subs.set(ep, f); }
      }
      const found = lib.videos.get(n);
      if (found) startLocal(found);
      else setStatus(`В папке найдено серий: ${lib.videos.size}. Серии ${n} среди них нет.`);
    });
    fileIn.addEventListener('change', () => {
      const f = fileIn.files[0];
      if (!f) return;
      lib.videos.set(n, f);
      startLocal(f);
    });
    subIn.addEventListener('change', () => {
      const f = subIn.files[0];
      if (f) { lib.subs.set(n, f); addSubs(f); }
    });

    const speed = el('select', 'mp-speed');
    speed.setAttribute('aria-label', 'Скорость');
    ['0.75', '1', '1.25', '1.5', '2'].forEach((v) => {
      const o = el('option', null, v + '×');
      o.value = v;
      if (v === '1') o.selected = true;
      speed.append(o);
    });
    speed.addEventListener('change', () => { video.playbackRate = +speed.value; });

    const auto = el('label', 'mp-auto');
    const autoBox = document.createElement('input');
    autoBox.type = 'checkbox';
    autoBox.checked = true;
    auto.append(autoBox, el('span', null, 'Автопереход'));

    const preset = opts.preset;
    const presetUrls = preset ? preset.urls || (preset.url ? [{ label: '', url: preset.url }] : []) : [];
    const qual = el('select', 'mp-speed');
    qual.setAttribute('aria-label', 'Качество');
    presetUrls.forEach((q, i) => {
      const o = el('option', null, q.label || 'Видео');
      o.value = String(i);
      qual.append(o);
    });
    const playPreset = (i, keepTime) => {
      const t = keepTime ? video.currentTime : 0;
      loadUrl(presetUrls[i].url, false);
      setStatus((preset.label || 'Источник') + (presetUrls[i].label ? ' · ' + presetUrls[i].label : ''));
      if (t > 1) video.addEventListener('loadedmetadata', () => { video.currentTime = t; }, { once: true });
      video.play().catch(() => {});
    };
    qual.addEventListener('change', () => playPreset(+qual.value, true));

    const row1 = el('div', 'mp-row');
    if (presetUrls.length > 1) row1.append(qual);
    row1.append(
      btn('Папка с сериями', () => folderIn.click()),
      btn('Файл серии', () => fileIn.click()),
      btn('Субтитры', () => subIn.click()),
      speed,
      auto
    );
    if (n > 1) row1.append(btn('◀ Предыдущая', () => opts.goto(n - 1)));
    if (n < opts.count) row1.append(btn('Следующая ▶', () => opts.goto(n + 1)));

    const url = document.createElement('input');
    url.type = 'text';
    url.className = 'mp-url';
    url.placeholder = 'Ссылка на видео (.mp4, .m3u8) или страницу плеера (https://…)';
    url.setAttribute('aria-label', 'Ссылка на видео');
    const saved = (store.get(LINKS_KEY)[id] || {})[n];
    if (saved) url.value = saved;
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUrl(url.value); });
    const row2 = el('div', 'mp-row');
    row2.append(url, btn('Играть', () => loadUrl(url.value)));

    box.append(stage, status, row1, row2, folderIn, fileIn, subIn);

    /* — запоминание места — */
    const posKey = id + ':' + n;
    let lastSave = 0;
    video.addEventListener('loadedmetadata', () => {
      const p = store.get(POS_KEY)[posKey];
      if (p > 5 && p < video.duration - 15) video.currentTime = p;
    });
    video.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - lastSave < 4000) return;
      lastSave = now;
      const all = store.get(POS_KEY);
      all[posKey] = Math.floor(video.currentTime);
      store.set(POS_KEY, all);
    });
    video.addEventListener('ended', () => {
      const all = store.get(POS_KEY);
      delete all[posKey];
      store.set(POS_KEY, all);
      if (opts.markSeen) opts.markSeen(n);
      if (autoBox.checked && n < opts.count) opts.goto(n + 1);
      else setStatus('Серия закончилась.');
    });

    /* — что играть при открытии — */
    video.addEventListener('error', () => {
      if (video.error && video.src) setStatus('Не удалось воспроизвести. Лучше всего работают mp4, webm и m3u8; источник мог закрыть доступ.');
    });
    const local = lib.videos.get(n);
    if (presetUrls.length) playPreset(0, false);
    else if (local) startLocal(local);
    else if (saved) loadUrl(saved);
    else setStatus('Выбери папку с сериями (номер берётся из имени файла), один файл или вставь ссылку.');
  }

  window.SlimePlayer = { mount, _guess: guessEpisode };
})();
