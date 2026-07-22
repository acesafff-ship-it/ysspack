const ACTIONS = new Map([
  ['nawiguj', 'navigate'],
  ['zaproś do grupy', 'group'],
  ['zaproś do drużyny', 'group'],
  ['zaproś do znajomych', 'friend'],
  ['handluj', 'trade'],
  ['pokaż profil', 'profile'],
  ['atakuj', 'attack'],
  ['pocałuj', 'kiss']
]);

const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export default {
  id: 'player-actions',
  name: 'Kolorowe akcje gracza',
  version: '1.0.0',
  description: 'Ukrywa Nawiguj i koloruje najważniejsze akcje w menu gracza.',
  icon: '🎨',

  start() {
    const marked = new Set();
    const style = document.createElement('style');
    style.dataset.ysspackModule = 'player-actions';
    style.textContent = `
      [data-yss-player-action]{color:#fff!important;text-shadow:1px 1px #000!important}
      [data-yss-player-action]>.background{filter:none!important}
      [data-yss-player-action="navigate"]{display:none!important}
      [data-yss-player-action="group"],[data-yss-player-action="group"]>.background{background:linear-gradient(#347fbd,#174a7a)!important;border-color:#58a8e5!important}
      [data-yss-player-action="friend"],[data-yss-player-action="friend"]>.background{background:linear-gradient(#3d994d,#1d632b)!important;border-color:#63c973!important}
      [data-yss-player-action="trade"],[data-yss-player-action="trade"]>.background{background:linear-gradient(#b88b24,#70500d)!important;border-color:#e1b84c!important;color:#fff5b0!important}
      [data-yss-player-action="profile"],[data-yss-player-action="profile"]>.background{background:linear-gradient(#8552ad,#4d276c)!important;border-color:#b47cda!important}
      [data-yss-player-action="attack"],[data-yss-player-action="attack"]>.background{background:linear-gradient(#b6433e,#721d1a)!important;border-color:#e26a64!important}
      [data-yss-player-action="kiss"],[data-yss-player-action="kiss"]>.background{background:linear-gradient(#d15a99,#842d61)!important;border-color:#f28bc1!important}`;
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
