// Плагин: AniLibria (русская озвучка). Играет серию внутри сайта через открытый API AniLibria,
// ни на какие другие сайты не переводит. Нужен интернет без блокировок до сервера AniLibria.
(function () {
  const BASES = ['e', 'f']; // короткие имена источников; настоящие адреса — в start.ps1 ($Upstreams)
  const KEY = 'slime.anilibria.release';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* нет хранилища */ } };
  let base = BASES[0];

  async function api(path) {
    const order = [base, ...BASES.filter((b) => b !== base)];
    let last;
    for (const b of order) {
      try { const r = await window.SlimeApi.get(b, path); base = b; return r; } catch (e) { last = e; }
    }
    throw new Error('AniLibria не отвечает (' + (last ? last.message : 'нет ответа') + ')');
  }

  async function search(ctx) {
    const queries = [...new Set([ctx.titleRu, ctx.titleRomaji, 'Tensei shitara Slime Datta Ken'].filter(Boolean))];
    const found = new Map();
    let lastErr;
    for (const q of queries) {
      try {
        const r = await api('/app/search/releases?query=' + encodeURIComponent(q));
        (Array.isArray(r) ? r : r.data || []).forEach((x) => { if (x && x.id != null && !found.has(x.id)) found.set(x.id, x); });
      } catch (e) { lastErr = e; }
      if (found.size) break;
    }
    if (!found.size && lastErr) throw lastErr;
    return [...found.values()];
  }

  async function episodeResult(release, n) {
    const r = await api('/anime/releases/' + encodeURIComponent(release));
    const eps = r.episodes || [];
    let ep = eps.find((e) => Number(e.ordinal) === n) || eps[n - 1];
    if (!ep) throw new Error(`в этом релизе нет серии ${n} (там серий: ${eps.length})`);
    if (!ep.hls_1080 && !ep.hls_720 && !ep.hls_480 && ep.id) ep = await api('/anime/releases/episodes/' + ep.id);
    const urls = [['1080p', ep.hls_1080], ['720p', ep.hls_720], ['480p', ep.hls_480]]
      .filter((x) => x[1])
      .map(([label, url]) => ({ label, url }));
    if (!urls.length) throw new Error('у этой серии нет видеопотока');
    return { kind: 'video', label: 'AniLibria: ' + ((r.name && r.name.main) || release), urls };
  }

  (window.SlimePlugins = window.SlimePlugins || []).push({
    id: 'anilibria',
    name: 'AniLibria',
    mark: 'Л',
    note: 'Русская озвучка. Играет прямо здесь. Релиз выбирается один раз для каждой части.',
    configure() {
      if (confirm('Сбросить выбранные релизы AniLibria? В следующий раз сайт предложит выбрать заново.')) write({});
    },
    async resolve(ctx) {
      const saved = read()[ctx.animeId];
      if (saved) {
        try { return await episodeResult(saved, ctx.episode); }
        catch (e) { throw new Error(e.message + '. Если релиз выбран неверно — раздел «Плагины», кнопка «Настроить».'); }
      }
      const found = await search(ctx);
      if (!found.length) throw new Error('релиз не найден на AniLibria');
      return {
        kind: 'choose',
        title: `Выбери релиз для части «${ctx.seasonLabel}»`,
        options: found.slice(0, 8).map((x) => ({
          label: (x.name && x.name.main) || x.alias,
          note: [x.year, x.type && x.type.description, x.episodes_total ? x.episodes_total + ' эп.' : ''].filter(Boolean).join(', '),
          value: x.alias || x.id,
          mark: 'Л',
        })),
        pick: async (value) => {
          const all = read();
          all[ctx.animeId] = value;
          write(all);
          return episodeResult(value, ctx.episode);
        },
      };
    },
  });
})();
