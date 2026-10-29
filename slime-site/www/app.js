'use strict';

/* ───────── настройки ───────── */
// id — номер аниме на Shikimori / MyAnimeList. Нужен ещё сезон или фильм — добавь строку.
const SEASONS = [
  { id: 37430, name: 'Сезон 1', episodes: 24 },
  { id: 39551, name: 'Сезон 2, часть 1', episodes: 12 },
  { id: 41487, name: 'Сезон 2, часть 2', episodes: 12 },
  { id: 53580, name: 'Сезон 3', episodes: 24 },
];
// Shikimori часто меняет домен и блокируется, поэтому пробуем несколько зеркал по очереди.
// Настоящие адреса источников знает только start.ps1 ($Upstreams); здесь только короткие буквы.
const SHIKI_MIRRORS = ['b', 'c', 'd'];
let shikiBase = SHIKI_MIRRORS[0];
const CAST_FROM = 37430;

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Сюда плагины из папки plugins добавляют себя.
window.SlimePlugins = window.SlimePlugins || [];

/* ───────── помощники ───────── */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const api = async (id, path) => {
  const r = await fetch(`/s/${id}${path}`);
  if (!r.ok) throw new Error('ошибка ' + r.status);
  return r.json();
};
// Если источник не отвечает, две минуты его не трогаем: сайт остаётся быстрым.
const downUntil = { shiki: 0, jikan: 0 };
async function guarded(kind, fn) {
  if (Date.now() < downUntil[kind]) throw new Error('источник временно недоступен');
  try { return await fn(); } catch (e) { downUntil[kind] = Date.now() + 120000; throw e; }
}
const shikiGet = (path) => guarded('shiki', async () => {
  const order = [shikiBase, ...SHIKI_MIRRORS.filter((m) => m !== shikiBase)];
  let last;
  for (const id of order) {
    try { const r = await api(id, path); shikiBase = id; return r; } catch (e) { last = e; }
  }
  throw last;
});
const jikanGet = (path) => guarded('jikan', () => api('a', path));
window.SlimeApi = { get: api };
const flipName = (n) => (n && n.includes(', ') ? n.split(', ').reverse().join(' ') : n || '');
const plain = (html) => {
  const d = new DOMParser().parseFromString(html || '', 'text/html');
  return d.body.textContent.replace(/\s+/g, ' ').trim();
};
const cut = (t, max) => {
  if (t.length <= max) return t;
  const s = t.slice(0, max);
  const i = s.lastIndexOf('. ');
  return (i > max * 0.5 ? s.slice(0, i + 1) : s.trimEnd() + '…');
};

/* ───────── печатная машинка ───────── */
let typeTimer = 0;
function typeInto(node, text, step = 2, speed = 14) {
  clearInterval(typeTimer);
  if (reduce) { node.textContent = text; return; }
  node.textContent = '';
  let i = 0;
  typeTimer = setInterval(() => {
    i += step;
    node.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(typeTimer);
  }, speed);
}

/* ───────── просмотрено ───────── */
const SEEN_KEY = 'slime.seen';
function readSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch { return {}; } }
function writeSeen(o) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(o)); } catch { /* нет хранилища */ } }

/* ───────── состояние ───────── */
let current = SEASONS[0];
let info = null;
let epTitles = new Map();
let epCount = 0;
let loadId = 0;

/* ───────── сезоны ───────── */
function renderTabs() {
  const box = $('#tabs');
  box.replaceChildren();
  SEASONS.forEach((s) => {
    const b = el('button', 'tab', s.name);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s === current));
    b.addEventListener('click', () => { if (s !== current) selectSeason(s); });
    box.append(b);
  });
}

async function loadAllEpisodes(id) {
  const out = [];
  try {
    for (let page = 1; page <= 3; page++) {
      const r = await jikanGet(`/anime/${id}/episodes?page=${page}`);
      out.push(...(r.data || []));
      if (!r.pagination || !r.pagination.has_next_page) break;
    }
  } catch (e) {
    if (!out.length) throw e;
  }
  return out;
}

async function selectSeason(s) {
  const my = ++loadId;
  current = s;
  info = null;
  epTitles = new Map();
  renderTabs();
  $('#episodes').replaceChildren(el('li', 'loading', 'Хищник поглощает данные…'));
  $('#seen-text').textContent = '';
  $('#seen-bar').style.width = '0';

  const [i, e] = await Promise.allSettled([
    shikiGet(`/api/animes/${s.id}`),
    loadAllEpisodes(s.id),
  ]);
  if (my !== loadId) return;

  let problem = '';
  if (i.status === 'fulfilled') info = i.value;
  else problem = 'Shikimori сейчас недоступен (' + i.reason.message + '). Он блокируется у части провайдеров — помогает VPN.';
  if (e.status === 'fulfilled') e.value.forEach((x) => epTitles.set(x.mal_id, x));

  renderFacts(problem);
  renderEpisodes();
}

const STATUS = { released: 'вышло', ongoing: 'выходит сейчас', anons: 'анонс' };

function renderFacts(problem) {
  const dl = $('#facts');
  dl.replaceChildren();
  const rows = [
    ['Название', (info && (info.russian || info.name)) || 'О моём перерождении в слизь'],
    ['Часть', current.name],
  ];
  if (info) {
    rows.push(['Статус', STATUS[info.status] || info.status || '—']);
    if (info.episodes || info.episodes_aired) rows.push(['Серий', String(info.episodes || info.episodes_aired)]);
    if (info.score && info.score !== '0.0') rows.push(['Оценка', info.score]);
    if (info.genres && info.genres.length) rows.push(['Жанры', info.genres.map((g) => g.russian || g.name).join(', ')]);
  }
  rows.forEach(([k, v]) => { dl.append(el('dt', null, k), el('dd', null, v)); });

  if (info) {
    const text = cut(plain(info.description_html || info.description), 620);
    typeInto($('#synopsis'), 'Ответ. ' + (text || 'Описание для этой части не найдено.'));
  } else {
    typeInto($('#synopsis'), 'Предупреждение. ' + (problem || 'Данные недоступны.') + ' Список серий и плагины работают без него. Через пару минут выбери часть ещё раз.');
  }
}

/* ───────── серии ───────── */
function countEpisodes() {
  if (info) {
    if (info.status === 'ongoing' && info.episodes_aired) return info.episodes_aired;
    if (info.episodes) return info.episodes;
    if (info.episodes_aired) return info.episodes_aired;
  }
  return epTitles.size || current.episodes || 0;
}

function updateProgress() {
  const seen = new Set(readSeen()[current.id] || []);
  const done = [...seen].filter((n) => n <= epCount).length;
  $('#seen-text').textContent = epCount ? `Поглощено серий: ${done} из ${epCount}` : '';
  $('#seen-bar').style.width = epCount ? Math.round((done / epCount) * 100) + '%' : '0';
}

function renderEpisodes() {
  const list = $('#episodes');
  list.replaceChildren();
  epCount = countEpisodes();
  if (!epCount) {
    list.append(el('li', 'loading', 'Список серий не получен. Попробуй выбрать часть ещё раз.'));
    updateProgress();
    return;
  }
  const seen = new Set(readSeen()[current.id] || []);

  for (let n = 1; n <= epCount; n++) {
    const t = epTitles.get(n);
    const li = el('li', 'ep' + (seen.has(n) ? ' seen' : ''));

    const open = el('button', 'ep-open');
    open.type = 'button';
    open.append(
      el('span', 'ep-num', String(n)),
      el('span', 'ep-name', (t && t.title) || `Серия ${n}`),
      el('span', 'ep-jp', (t && t.title_japanese) || '')
    );
    open.addEventListener('click', () => openPortal(n));

    const mark = el('button', 'ep-seen', '✓');
    mark.type = 'button';
    mark.setAttribute('aria-pressed', String(seen.has(n)));
    mark.setAttribute('aria-label', `Серия ${n}: отметить просмотренной`);
    mark.addEventListener('click', () => {
      const all = readSeen();
      const set = new Set(all[current.id] || []);
      if (set.has(n)) set.delete(n); else set.add(n);
      all[current.id] = [...set];
      writeSeen(all);
      li.classList.toggle('seen', set.has(n));
      mark.setAttribute('aria-pressed', String(set.has(n)));
      updateProgress();
    });

    li.append(open, mark);
    list.append(li);
  }
  updateProgress();
}

/* ───────── окно с источниками ───────── */
const portal = $('#portal');

function ctxFor(n) {
  const t = epTitles.get(n);
  return {
    animeId: current.id,
    season: SEASONS.indexOf(current) + 1,
    seasonLabel: current.name,
    episode: n,
    episodeTitle: (t && t.title) || '',
    titleRu: (info && info.russian) || 'О моём перерождении в слизь',
    titleEn: (info && info.english && info.english[0]) || (info && info.name) || 'That Time I Got Reincarnated as a Slime',
    titleRomaji: (info && info.name) || 'Tensei shitara Slime Datta Ken',
  };
}

function showEmbed(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('ссылка плеера должна начинаться с http:// или https://');
  const player = $('#player');
  player.replaceChildren();
  const f = document.createElement('iframe');
  f.src = url;
  f.allow = 'fullscreen; autoplay; encrypted-media; picture-in-picture';
  f.allowFullscreen = true;
  f.referrerPolicy = 'no-referrer';
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
  player.className = 'player embed';
  player.append(f);
  player.hidden = false;
  player.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
}

function markSeen(n) {
  const all = readSeen();
  const set = new Set(all[current.id] || []);
  set.add(n);
  all[current.id] = [...set];
  writeSeen(all);
  const li = $('#episodes').children[n - 1];
  if (li && li.classList) {
    li.classList.add('seen');
    const m = li.querySelector('.ep-seen');
    if (m) m.setAttribute('aria-pressed', 'true');
  }
  updateProgress();
}

let activePlugin = null;

function showPlayer(ctx, preset) {
  if (!window.SlimePlayer) throw new Error('не загрузился player.js');
  const player = $('#player');
  window.SlimePlayer.mount(player, ctx, { count: epCount, goto: goEpisode, markSeen, preset });
  player.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
}

function goEpisode(n) {
  const ctx = ctxFor(n);
  $('#portal-title').textContent = `${current.name}, серия ${n}`;
  $('#portal-sub').textContent = ctx.episodeTitle;
  if (activePlugin && activePlugin.id !== 'my-player') runPlugin(activePlugin, ctx);
  else showPlayer(ctx);
}

function showChoose(res, ctx) {
  const box = $('#player');
  box.className = 'player panel';
  box.hidden = false;
  box.replaceChildren(el('p', 'mp-status', res.title || 'Выбери вариант'));
  const ul = el('ul', 'plugins');
  res.options.forEach((o) => {
    const li = el('li');
    const b = el('button', 'plug');
    b.type = 'button';
    b.append(el('span', 'plug-mark', o.mark || '◆'), el('span', 'plug-name', o.label), el('span', 'plug-note', o.note || ''));
    b.addEventListener('click', async () => {
      $('#portal-sub').textContent = 'Хищник ищет серию…';
      try {
        await handleResult(await res.pick(o.value), ctx);
        $('#portal-sub').textContent = ctx.episodeTitle;
      } catch (e) {
        $('#portal-sub').textContent = 'Предупреждение. ' + e.message;
      }
    });
    li.append(b);
    ul.append(li);
  });
  box.append(ul);
}

async function handleResult(res, ctx) {
  if (!res) return;
  if (res.kind === 'player') showPlayer(ctx);
  else if (res.kind === 'video') showPlayer(ctx, res);
  else if (res.kind === 'embed') showEmbed(res.url);
  else if (res.kind === 'choose') showChoose(res, ctx);
  else if (res.kind === 'link') throw new Error('плагин хочет открыть другой сайт; такие переходы отключены, нужен плагин, который отдаёт видео внутрь этого сайта');
  else throw new Error('плагин вернул непонятный ответ');
}

async function runPlugin(p, ctx) {
  activePlugin = p;
  $('#portal-sub').textContent = 'Хищник ищет серию…';
  try {
    await handleResult(await p.resolve(ctx), ctx);
    $('#portal-sub').textContent = ctx.episodeTitle;
  } catch (e) {
    $('#portal-sub').textContent = `Предупреждение. Плагин «${p.name}» не сработал: ${e.message}`;
  }
}

function openPortal(n) {
  activePlugin = null;
  const ctx = ctxFor(n);
  $('#portal-title').textContent = `${current.name}, серия ${n}`;
  $('#portal-sub').textContent = ctx.episodeTitle;
  const player = $('#player');
  player.hidden = true;
  player.className = 'player';
  player.replaceChildren();

  const list = $('#portal-plugins');
  list.replaceChildren();
  if (!window.SlimePlugins.length) {
    list.append(el('li', 'loading', 'Плагины не найдены. Положи файл .js в папку www/plugins.'));
  }
  window.SlimePlugins.forEach((p) => {
    const li = el('li');
    const b = el('button', 'plug');
    b.type = 'button';
    b.append(el('span', 'plug-mark', p.mark || '◆'), el('span', 'plug-name', p.name), el('span', 'plug-note', p.note || ''));
    b.addEventListener('click', () => runPlugin(p, ctx));
    li.append(b);
    list.append(li);
  });
  portal.showModal();
}

$('#portal-close').addEventListener('click', () => portal.close());
portal.addEventListener('click', (e) => { if (e.target === portal) portal.close(); });
portal.addEventListener('close', () => { $('#player').replaceChildren(); });

/* ───────── плагины ───────── */
function renderPluginList() {
  const ul = $('#pluginlist');
  ul.replaceChildren();
  if (!window.SlimePlugins.length) {
    ul.append(el('li', 'loading', 'Пока ни одного плагина.'));
    return;
  }
  window.SlimePlugins.forEach((p) => {
    const li = el('li');
    li.append(el('b', null, p.name), el('p', null, p.note || ''));
    if (typeof p.configure === 'function') {
      const b = el('button', 'cfg', 'Настроить');
      b.type = 'button';
      b.addEventListener('click', () => p.configure());
      li.append(b);
    }
    ul.append(li);
  });
}

async function loadPlugins() {
  try {
    const files = await (await fetch('/api/plugins')).json();
    await Promise.all(files.map((src) => new Promise((done) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = done;
      s.onerror = () => { console.warn('Плагин не загрузился:', src); done(); };
      document.head.append(s);
    })));
  } catch (e) {
    console.warn('Список плагинов недоступен', e);
  }
  renderPluginList();
}

/* ───────── персонажи ───────── */
// Нарисованные аватарки (не официальные арты): цвет волос, глаз, кожи, рожки, уши.
const FALLBACK_CAST = [
  { name: 'Римуру Темпест', role: 'Главная роль', hair: '#7fd4ff', eye: '#ffd24a', skin: '#ffe3d0', long: true },
  { name: 'Вельдора', role: 'Грозовой дракон', hair: '#1b1b2e', eye: '#ffb020', skin: '#f3d2bf', long: true },
  { name: 'Бенимару', role: 'Командир воинов', hair: '#d6362f', eye: '#f2a31b', skin: '#ffd8c4', horn: '#ff8a5c', long: true },
  { name: 'Шуна', role: 'Жрица', hair: '#ff9ec7', eye: '#ff6fa8', skin: '#ffe3d6', horn: '#ffc4dc', long: true },
  { name: 'Сион', role: 'Секретарь', hair: '#8a5bd6', eye: '#d65bd6', skin: '#ffe0d0', horn: '#c9a7ff' },
  { name: 'Сёэй', role: 'Разведчик', hair: '#274a9e', eye: '#6bd0ff', skin: '#f6d8c8', horn: '#7fa0ff' },
  { name: 'Хакуро', role: 'Наставник', hair: '#f2f2f2', eye: '#444b5e', skin: '#e7c2a2', horn: '#d9d9d9' },
  { name: 'Ранга', role: 'Звёздный волк', hair: '#14141c', eye: '#ffcc33', skin: '#2a2a3a', ears: true },
  { name: 'Милим Нава', role: 'Драконья принцесса', hair: '#ff6fb1', eye: '#ff4f9a', skin: '#ffe6d9', long: true },
  { name: 'Хината Сакагути', role: 'Рыцарь-паладин', hair: '#1d2a55', eye: '#3a5fd0', skin: '#ffe2d2', long: true },
  { name: 'Диабло', role: 'Первородный демон', hair: '#2b2038', eye: '#ffcf3f', skin: '#e6d8f0', horn: '#8c5cff' },
  { name: 'Гобта', role: 'Король гоблинов', hair: '#3d7a3a', eye: '#2b2b2b', skin: '#8fcf7f', ears: true, bald: true },
];

function avatarSVG(a, i) {
  const g = 'av' + i;
  let x = `<defs><radialGradient id="${g}" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="#d6f7ff"/><stop offset="1" stop-color="#2a8fe0"/></radialGradient></defs>`;
  x += `<rect width="100" height="100" fill="url(#${g})"/>`;
  if (a.horn) x += `<path d="M36 30L32 10L47 26Z" fill="${a.horn}"/><path d="M64 30L68 10L53 26Z" fill="${a.horn}"/>`;
  if (!a.bald) {
    x += a.long
      ? `<path d="M20 60C15 18 85 18 80 60L88 100L12 100Z" fill="${a.hair}"/>`
      : `<ellipse cx="50" cy="42" rx="29" ry="25" fill="${a.hair}"/>`;
  }
  x += '<path d="M14 100C18 80 82 80 86 100Z" fill="#0b2a63"/>';
  if (a.ears) x += `<path d="M28 52L10 40L29 64Z" fill="${a.skin}"/><path d="M72 52L90 40L71 64Z" fill="${a.skin}"/>`;
  x += `<ellipse cx="50" cy="55" rx="23" ry="26" fill="${a.skin}"/>`;
  if (!a.bald) x += `<path d="M26 48C27 22 73 22 74 48C66 40 58 36 50 38C42 36 34 40 26 48Z" fill="${a.hair}"/>`;
  x += `<ellipse cx="40" cy="57" rx="4.6" ry="6.4" fill="${a.eye}"/><ellipse cx="60" cy="57" rx="4.6" ry="6.4" fill="${a.eye}"/>`;
  x += '<ellipse cx="40" cy="58" rx="2.3" ry="3.6" fill="#0a1a3a"/><ellipse cx="60" cy="58" rx="2.3" ry="3.6" fill="#0a1a3a"/>';
  x += '<circle cx="38.6" cy="55.5" r="1.3" fill="#fff"/><circle cx="58.6" cy="55.5" r="1.3" fill="#fff"/>';
  x += '<path d="M44 69Q50 74 56 69" fill="none" stroke="#5a2a2a" stroke-width="2.2" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${x}</svg>`;
}

function castItem(avatar, name, role, va) {
  const li = el('li');
  const who = el('div', 'who');
  who.append(el('b', null, name), el('small', null, role));
  if (va) who.append(el('small', null, 'Сэйю: ' + va));
  li.append(avatar, who);
  return li;
}

function renderFallbackCast(box) {
  box.replaceChildren();
  FALLBACK_CAST.forEach((a, i) => {
    const av = el('span', 'avatar');
    av.innerHTML = avatarSVG(a, i); // только наши собственные данные
    box.append(castItem(av, a.name, a.role));
  });
}

async function loadCast() {
  const box = $('#castlist');
  try {
    const r = await jikanGet(`/anime/${CAST_FROM}/characters`);
    box.replaceChildren();
    (r.data || []).slice(0, 18).forEach((c) => {
      const ch = c.character || {};
      const name = flipName(ch.name);
      const va = (c.voice_actors || []).find((v) => v.language === 'Japanese');
      const src = ch.images && ((ch.images.webp && ch.images.webp.image_url) || (ch.images.jpg && ch.images.jpg.image_url));
      let av;
      if (src) {
        av = document.createElement('img');
        av.src = src;
        av.alt = name;
        av.loading = 'lazy';
        av.referrerPolicy = 'no-referrer';
        av.addEventListener('error', () => av.replaceWith(el('span', 'ph', name[0] || '?')));
      } else {
        av = el('span', 'ph', name[0] || '?');
      }
      box.append(castItem(av, name, c.role === 'Main' ? 'Главная роль' : 'Второстепенный', va && va.person ? flipName(va.person.name) : ''));
    });
    if (!box.children.length) renderFallbackCast(box);
  } catch (e) {
    renderFallbackCast(box);
  }
}

/* ───────── слизь: глаза, тычки, фразы ───────── */
const QUOTES = [
  'Ответ. Это слизь. Слизь довольна.',
  'Уведомление. Щекотка обнаружена. Сопротивление отключено.',
  'Предупреждение. Уровень умиления превышает допустимый.',
  'Ответ. Поглощено: один тычок. Осталось: бесконечность.',
  'Уведомление. Умение «Бездельничать» освоено полностью.',
];
let sayTimer = 0;
function say(text) {
  const p = $('#slime-say');
  p.textContent = text;
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { p.textContent = ''; }, 3800);
}

function setupSlime() {
  const btn = $('#slime');
  const pupils = $('#pupils');
  let last = -1;
  btn.addEventListener('click', () => {
    btn.classList.remove('squish');
    void btn.offsetWidth;
    btn.classList.add('squish');
    let i;
    do { i = Math.floor(Math.random() * QUOTES.length); } while (i === last);
    last = i;
    say(QUOTES[i]);
  });
  window.addEventListener('pointermove', (e) => {
    const r = btn.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height * 0.6);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 300) * 5;
    pupils.style.transform = `translate(${(dx / d) * k}px, ${(dy / d) * k}px)`;
  });
}

/* ───────── заголовок из желейных букв ───────── */
function setupTitle() {
  const h1 = $('#title');
  const text = h1.textContent;
  h1.setAttribute('aria-label', text);
  h1.replaceChildren();
  text.split(' ').forEach((w, wi, arr) => {
    const word = el('span', 'word');
    word.setAttribute('aria-hidden', 'true');
    [...w].forEach((c) => word.append(el('span', 'ch', c)));
    h1.append(word);
    if (wi < arr.length - 1) h1.append(' ');
  });
}

/* ───────── фон: пузыри и след курсора ───────── */
function setupBubbles() {
  if (reduce) return;
  const box = $('#bubbles');
  for (let i = 0; i < 16; i++) {
    const b = document.createElement('i');
    const size = 10 + Math.random() * 56;
    b.style.width = b.style.height = size + 'px';
    b.style.left = Math.random() * 100 + '%';
    b.style.animationDuration = 16 + Math.random() * 22 + 's';
    b.style.animationDelay = -Math.random() * 30 + 's';
    box.append(b);
  }
}

function setupTrail() {
  if (reduce || !matchMedia('(pointer: fine)').matches) return;
  const box = $('#trail');
  const dots = [];
  for (let i = 0; i < 7; i++) {
    const d = document.createElement('i');
    d.style.setProperty('--s', 20 - i * 2.4 + 'px');
    d.style.setProperty('--n', i);
    d.style.transform = 'translate(-50px, -50px)';
    box.append(d);
    dots.push({ d, x: -50, y: -50 });
  }
  let mx = -50, my = -50;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; });
  (function loop() {
    let px = mx, py = my;
    dots.forEach((o, i) => {
      const k = 0.36 - i * 0.04;
      o.x += (px - o.x) * k;
      o.y += (py - o.y) * k;
      o.d.style.transform = `translate(${o.x}px, ${o.y}px)`;
      px = o.x;
      py = o.y;
    });
    requestAnimationFrame(loop);
  })();
}

/* ───────── заставка ───────── */
const BOOT_LINES = [
  'Уведомление. Запрос из PowerShell подтверждён.',
  'Ответ. Врата открыты. Хищник поглощает данные из внешних источников…',
  'Ответ. Можно входить.',
];

function runBoot() {
  const boot = $('#boot');
  if (reduce) { boot.remove(); return; }
  const out = $('#boot-text');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    boot.classList.add('open');
    setTimeout(() => boot.remove(), 1300);
  };
  $('#boot-skip').addEventListener('click', close);
  window.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { close(); window.removeEventListener('keydown', onKey); }
  });

  let line = 0, ch = 0, shown = '';
  (function tick() {
    if (closed) return;
    if (line >= BOOT_LINES.length) { setTimeout(close, 500); return; }
    const cur = BOOT_LINES[line];
    if (ch < cur.length) {
      ch++;
      out.textContent = shown + cur.slice(0, ch);
      setTimeout(tick, 22);
    } else {
      shown += cur + '\n';
      line++;
      ch = 0;
      setTimeout(tick, 380);
    }
  })();
}

/* ───────── старт ───────── */
setupTitle();
setupBubbles();
setupTrail();
setupSlime();
runBoot();
renderTabs();
loadPlugins();
selectSeason(SEASONS[0]).then(loadCast);
