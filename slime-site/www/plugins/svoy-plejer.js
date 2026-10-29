// Плагин: свой плеер. Ты задаёшь шаблон ссылки на плеер, сайт подставляет номер серии
// и показывает плеер прямо в окне. Шаблон хранится в браузере (localStorage).
// Доступные подстановки: {ep} {season} {id} {title}
// Пример шаблона: https://example.com/player?anime={id}&episode={ep}
(function () {
  const KEY = 'slime.plugin.player';
  const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const configure = () => {
    const v = prompt('Шаблон ссылки на плеер.\nМожно использовать {ep}, {season}, {id}, {title}:', read());
    if (v === null) return;
    try { localStorage.setItem(KEY, v.trim()); } catch { alert('Браузер не даёт сохранить настройку.'); }
  };
  (window.SlimePlugins = window.SlimePlugins || []).push({
    id: 'my-player',
    name: 'Свой плеер',
    mark: '▶',
    note: 'Встроенный плеер по твоему шаблону ссылки. Настройка — в разделе «Плагины».',
    configure,
    resolve(ctx) {
      let t = read();
      if (!t) { configure(); t = read(); }
      if (!t) throw new Error('шаблон не задан');
      const url = t
        .replaceAll('{ep}', ctx.episode)
        .replaceAll('{season}', ctx.season)
        .replaceAll('{id}', ctx.animeId)
        .replaceAll('{title}', encodeURIComponent(ctx.titleRu));
      return { kind: 'embed', url };
    },
  });
})();
