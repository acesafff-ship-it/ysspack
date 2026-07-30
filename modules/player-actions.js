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
  version: '1.3.1',
  description: 'Pozwala wybrać widoczne akcje gracza i niezależnie ustawić kolor każdej pozycji menu.',
  icon: '🎨',
  settings: [
    { key: 'showNavigate', colorKey: 'colorNavigate', type: 'action', label: 'Nawiguj', defaultValue: false, defaultColor: '#39444d' },
    { key: 'showGroup', colorKey: 'colorGroup', type: 'action', label: 'Zaproś do grupy', defaultValue: true, defaultColor: '#29485d' },
    { key: 'showFriend', colorKey: 'colorFriend', type: 'action', label: 'Dodaj do przyjaciół', defaultValue: false, defaultColor: '#315337' },
    { key: 'showEnemy', colorKey: 'colorEnemy', type: 'action', label: 'Dodaj do wrogów', defaultValue: false, defaultColor: '#6a3030' },
    { key: 'showTrade', colorKey: 'colorTrade', type: 'action', label: 'Handluj', defaultValue: true, defaultColor: '#685727' },
    { key: 'showProfile', colorKey: 'colorProfile', type: 'action', label: 'Pokaż profil', defaultValue: true, defaultColor: '#4f3b5d' },
    { key: 'showAttack', colorKey: 'colorAttack', type: 'action', label: 'Atakuj', defaultValue: true, defaultColor: '#653330' },
    { key: 'showKiss', colorKey: 'colorKiss', type: 'action', label: 'Pocałuj', defaultValue: true, defaultColor: '#704256' },
    { key: 'showMessage', colorKey: 'colorMessage', type: 'action', label: 'Wyślij wiadomość', defaultValue: true, defaultColor: '#315653' },
    { key: 'showEquipment', colorKey: 'colorEquipment', type: 'action', label: 'Pokaż ekwipunek', defaultValue: true, defaultColor: '#46525b' },
    { key: 'showReport', colorKey: 'colorReport', type: 'action', label: 'Zgłoś', defaultValue: true, defaultColor: '#72502d' },
    { key: 'showOutfit', colorKey: 'colorOutfit', type: 'action', label: 'Zmień strój', defaultValue: true, defaultColor: '#584735' }
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
    const settingColor = (key, fallback) => {
      const value = String(context.getSetting?.(key, fallback) || fallback);
      return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    };
    const colors = {
      navigate: settingColor('colorNavigate', '#39444d'),
      group: settingColor('colorGroup', '#29485d'),
      friend: settingColor('colorFriend', '#315337'),
      enemy: settingColor('colorEnemy', '#6a3030'),
      trade: settingColor('colorTrade', '#685727'),
      profile: settingColor('colorProfile', '#4f3b5d'),
      attack: settingColor('colorAttack', '#653330'),
      kiss: settingColor('colorKiss', '#704256'),
      message: settingColor('colorMessage', '#315653'),
      equipment: settingColor('colorEquipment', '#46525b'),
      report: settingColor('colorReport', '#72502d'),
      outfit: settingColor('colorOutfit', '#584735')
    };
    const style = document.createElement('style');
    style.dataset.ysspackModule = 'player-actions';
    style.textContent = `
      [data-yss-player-action]{color:#fff!important;text-shadow:1px 1px #000!important}
      ${hiddenRules}
      ${Object.entries(colors).map(([action, color]) =>
        `[data-yss-player-action="${action}"],[data-yss-player-action="${action}"]>.background{background-color:${color}!important;background-image:none!important}`
      ).join('\n')}
      [data-yss-player-action="trade"],[data-yss-player-action="trade"]>.background{color:#eee1a6!important}`;
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
