// Плагин: страница аниме на Shikimori (описание, обсуждения, ссылки на просмотр).
(window.SlimePlugins = window.SlimePlugins || []).push({
  id: 'shikimori',
  name: 'Страница на Shikimori',
  mark: 'Ш',
  note: 'Описание на русском, обсуждения серий и список источников.',
  resolve(ctx) {
    return { kind: 'link', url: ctx.shikimoriUrl };
  },
});
