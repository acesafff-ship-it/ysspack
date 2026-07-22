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
  version: '1.0.1',
  description: 'Ukrywa Nawiguj i koloruje najważniejsze akcje w menu gracza.',
  icon: '🎨',

  start() {
    const marked = new Set();
    const style = document.createElement('style');
    style.dataset.ysspackModule = 'player-actions';
    style.textContent = `
      [data-yss-player-action]{color:#fff!important;text-shadow:1px 1px #000!important}
      [data-yss-player-action="navigate"]{display:none!important}
      [data-yss-player-action="group"],[data-yss-player-action="group"]>.background{background-color:#24649a!important;background-image:none!important}
      [data-yss-player-action="friend"],[data-yss-player-action="friend"]>.background{background-color:#277439!important;background-image:none!important}
      [data-yss-player-action="trade"],[data-yss-player-action="trade"]>.background{background-color:#927019!important;background-image:none!important;color:#fff5b0!important}
      [data-yss-player-action="profile"],[data-yss-player-action="profile"]>.background{background-color:#67398a!important;background-image:none!important}
      [data-yss-player-action="attack"],[data-yss-player-action="attack"]>.background{background-color:#8e2b27!important;background-image:none!important}
      [data-yss-player-action="kiss"],[data-yss-player-action="kiss"]>.background{background-color:#a73e77!important;background-image:none!important}`;
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
