// Плагин: Crunchyroll. Официальный сервис; русские субтитры зависят от региона.
(window.SlimePlugins = window.SlimePlugins || []).push({
  id: 'crunchyroll',
  name: 'Crunchyroll',
  mark: 'C',
  note: 'Официальный просмотр. Русские субтитры — если доступны в твоём регионе.',
  resolve(ctx) {
    return { kind: 'link', url: `https://www.crunchyroll.com/search?q=${encodeURIComponent(ctx.titleEn)}` };
  },
});
