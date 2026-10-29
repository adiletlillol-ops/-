// Плагин: мой плеер (логика в www/player.js).
(window.SlimePlugins = window.SlimePlugins || []).push({
  id: 'my-player',
  name: 'Мой плеер',
  mark: '▶',
  note: 'Твои файлы и ссылки: папка с сериями, субтитры, автопереход, помнит место.',
  resolve() {
    return { kind: 'player' };
  },
});
