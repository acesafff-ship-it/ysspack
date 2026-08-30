const ROOT_CLASS = 'yss-readable-battle-log';
const STYLE_ID = 'yss-readable-battle-log-style';
const EFFECT_CLASS = 'yss-battle-effect';

export function isBattleEffect(text) {
  return /^[\s+−-]*(?:cios (?:bardzo )?krytyczny(?: broni pomocniczej)?|zamrożenie|ogłuszenie|unik|przebicie|dotyk anioła|przerwanie ciosu specjalnego)[.!\s]*$/iu.test(text);
}

export default {
  id: 'battle-log-reader',
  name: 'Czytelny log walki',
  version: '1.0.4',
  description: 'Pogrubia wyróżnione akcje i efekty w oryginalnym logu walki.',
  icon: '⚔',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    document.documentElement.classList.add(ROOT_CLASS);
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${ROOT_CLASS} .battle-msg .${EFFECT_CLASS}{
        font-weight:900!important;
        border:1px solid currentColor;
        border-radius:3px;
        padding:0 3px;
        background:rgba(255,255,255,.055);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.12);
        box-decoration-break:clone;
        -webkit-box-decoration-break:clone;
      }`;
    document.head.appendChild(style);

    function decorate(message) {
      const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.parentElement?.closest(`.${EFFECT_CLASS}`) && isBattleEffect(node.nodeValue)) nodes.push(node);
      }
      for (const node of nodes) {
        const badge = document.createElement('span');
        badge.className = EFFECT_CLASS;
        node.replaceWith(badge);
        badge.appendChild(node);
      }
    }

    function scan(node) {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!(element instanceof Element) || element.closest(`.${EFFECT_CLASS}`)) return;
      const message = element.closest('.battle-msg');
      if (message) decorate(message);
      else element.querySelectorAll('.battle-msg').forEach(decorate);
    }

    // Only new/changed log nodes are decorated; no timers or attribute observation.
    const logObserver = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') scan(record.target);
        else record.addedNodes.forEach(scan);
      }
    });
    let controller = null;
    function attach() {
      const next = document.querySelector('.battle-controller');
      if (next === controller) return;
      logObserver.disconnect();
      controller = next;
      if (!controller) return;
      scan(controller);
      logObserver.observe(controller, { childList: true, subtree: true, characterData: true });
    }
    const lifecycleObserver = new MutationObserver(() => {
      if (!controller?.isConnected) attach();
    });
    lifecycleObserver.observe(document.body, { childList: true, subtree: true });
    attach();

    return () => {
      lifecycleObserver.disconnect();
      logObserver.disconnect();
      document.querySelectorAll(`.${EFFECT_CLASS}`).forEach(badge => badge.replaceWith(...badge.childNodes));
      document.documentElement.classList.remove(ROOT_CLASS);
      style.remove();
    };
  }
};
