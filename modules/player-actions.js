const ACTIONS = new Map([
  ['nawiguj', 'navigate'],
  ['zaproś do grupy', 'group'],
  ['zaproś do drużyny', 'group'],
  ['zaproś do znajomych', 'friend'],
  ['dodaj do znajomych', 'friend'],
  ['zaproś do przyjaciół', 'friend'],
  ['dodaj do przyjaciół', 'friend'],
  ['dodaj do wrogów', 'enemy'],
  ['zaproś do wrogów', 'enemy'],
  ['handluj', 'trade'],
  ['pokaż profil', 'profile'],
  ['atakuj', 'attack'],
  ['pocałuj', 'kiss'],
  ['wyślij wiadomość', 'message'],
  ['pokaż ekwipunek', 'equipment'],
  ['złoś się', 'report'],
  ['zmień strój', 'outfit']
]);

const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export default {
  id: 'player-actions',
  name: 'Kolorowe akcje gracza',
  version: '1.2.0',
  description: 'Koloruje akcje gracza i pozwala wybrać, które pozycje mają być widoczne w menu.',
  icon: '🎨',
  settings: [
    { key: 'showNavigate', type: 'checkbox', label: 'Pokaż: Nawiguj', defaultValue: false },
    { key: 'showGroup', type: 'checkbox', label: 'Pokaż: Zaproś do grupy', defaultValue: true },
    { key: 'showFriend', type: 'checkbox', label: 'Pokaż: Dodaj do przyjaciół', defaultValue: false },
    { key: 'showEnemy', type: 'checkbox', label: 'Pokaż: Dodaj do wrogów', defaultValue: false },
    { key: 'showTrade', type: 'checkbox', label: 'Pokaż: Handluj', defaultValue: true },
    { key: 'showProfile', type: 'checkbox', label: 'Pokaż: Profil', defaultValue: true },
    { key: 'showAttack', type: 'checkbox', label: 'Pokaż: Atakuj', defaultValue: true },
    { key: 'showKiss', type: 'checkbox', label: 'Pokaż: Pocałuj', defaultValue: true },
    { key: 'showMessage', type: 'checkbox', label: 'Pokaż: Wiadomość', defaultValue: true },
    { key: 'showEquipment', type: 'checkbox', label: 'Pokaż: Ekwipunek', defaultValue: true },
    { key: 'showReport', type: 'checkbox', label: 'Pokaż: Zgłoś', defaultValue: true },
    { key: 'showOutfit', type: 'checkbox', label: 'Pokaż: Zmień strój', defaultValue: true }
  ],

  start(context = {}) {
    if (location.hostname === 'www.margonem.pl') return () => {};
    const marked = new Set();
    const visible = {
      navigate: context.getSetting?.('showNavigate', false) ?? false,
      group: context.getSetting?.('showGroup', true) ?? true,
      friend: context.getSetting?.('showFriend', false) ?? false,
      enemy: context.getSetting?.('showEnemy', false) ?? false,
      trade: context.getSetting?.('showTrade', true) ?? true,
      profile: context.getSetting?.('showProfile', true) ?? true,
      attack: context.getSetting?.('showAttack', true) ?? true,
      kiss: context.getSetting?.('showKiss', true) ?? true,
      message: context.getSetting?.('showMessage', true) ?? true,
      equipment: context.getSetting?.('showEquipment', true) ?? true,
      report: context.getSetting?.('showReport', true) ?? true,
      outfit: context.getSetting?.('showOutfit', true) ?? true
    };
    const hiddenRules = Object.entries(visible)
      .filter(([, isVisible]) => !isVisible)
      .map(([action]) => `[data-yss-player-action="${action}"]{display:none!important}`)
      .join('\n');
    const style = document.createElement('style');
    style.dataset.ysspackModule = 'player-actions';
    style.textContent = `
      [data-yss-player-action]{color:#fff!important;text-shadow:1px 1px #000!important}
      ${hiddenRules}
      [data-yss-player-action="group"],[data-yss-player-action="group"]>.background{background-color:#29485d!important;background-image:none!important}
      [data-yss-player-action="friend"],[data-yss-player-action="friend"]>.background{background-color:#315337!important;background-image:none!important}
      [data-yss-player-action="enemy"],[data-yss-player-action="enemy"]>.background{background-color:#6a3030!important;background-image:none!important}
      [data-yss-player-action="trade"],[data-yss-player-action="trade"]>.background{background-color:#685727!important;background-image:none!important;color:#eee1a6!important}
      [data-yss-player-action="profile"],[data-yss-player-action="profile"]>.background{background-color:#4f3b5d!important;background-image:none!important}
      [data-yss-player-action="attack"],[data-yss-player-action="attack"]>.background{background-color:#653330!important;background-image:none!important}
      [data-yss-player-action="kiss"],[data-yss-player-action="kiss"]>.background{background-color:#704256!important;background-image:none!important}
      [data-yss-player-action="message"],[data-yss-player-action="message"]>.background{background-color:#315653!important;background-image:none!important}
      [data-yss-player-action="equipment"],[data-yss-player-action="equipment"]>.background{background-color:#46525b!important;background-image:none!important}
      [data-yss-player-action="report"],[data-yss-player-action="report"]>.background{background-color:#72502d!important;background-image:none!important}
      [data-yss-player-action="outfit"],[data-yss-player-action="outfit"]>.background{background-color:#584735!important;background-image:none!important}`;
    document.documentElement.appendChild(style);

    const mark = element => {
      let target = element;
      while (target.parentElement && normalize(target.parentElement.textContent) === normalize(target.textContent)) {
        target = target.parentElement;
      }
      const action = ACTIONS.get(normalize(target.textContent));
      if (!action || target === document.body || target === document.documentElement) return;
      target.dataset.yssPlayerAction = action;
      marked.add(target);
    };

    const scan = root => {
      if (!(root instanceof Element || root instanceof Document)) return;
      if (root instanceof Element && ACTIONS.has(normalize(root.textContent))) mark(root);
      root.querySelectorAll?.('*').forEach(element => {
        if (ACTIONS.has(normalize(element.textContent))) mark(element);
      });
    };

    scan(document);
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
        if (node instanceof Element) scan(node);
      }));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      marked.forEach(element => delete element.dataset.yssPlayerAction);
      marked.clear();
      style.remove();
    };
  }
};
