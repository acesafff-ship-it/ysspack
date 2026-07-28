const MODULE_ID = 'chat-item-icons';
const STYLE_ID = 'yss-chat-item-icons-style';
const LINK_SELECTOR = '.linked-chat-item';
const READY_CLASS = 'yss-chat-item-icon-ready';
const ORIGINAL_TEXT_KEY = 'yssChatItemOriginalText';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export default {
  id: MODULE_ID,
  name: 'Ikony przedmiotów na czacie',
  version: '1.1.2',
  description: 'Automatycznie zastępuje nazwy podlinkowanych przedmiotów na czacie ich natywnymi ikonami.',
  icon: '◆',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    let processing = false;
    const pending = new Set();
    const queue = [];
    const rendered = new Map();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${LINK_SELECTOR}.${READY_CLASS}{
        display:inline-flex!important;
        width:22px!important;
        height:22px!important;
        margin:-3px 1px -4px!important;
        align-items:center!important;
        justify-content:center!important;
        vertical-align:middle!important;
        overflow:visible!important;
        cursor:help!important
      }
      ${LINK_SELECTOR}.${READY_CLASS}>.yss-chat-native-item{
        position:relative!important;
        inset:auto!important;
        display:block!important;
        width:20px!important;
        min-width:20px!important;
        height:20px!important;
        min-height:20px!important;
        margin:0!important;
        padding:0!important;
        transform:none!important;
        pointer-events:none!important
      }
      ${LINK_SELECTOR}.${READY_CLASS}>.yss-chat-native-item canvas{
        position:absolute!important;
        inset:0!important;
        width:20px!important;
        height:20px!important;
        pointer-events:none!important
      }
      ${LINK_SELECTOR}.${READY_CLASS}>.yss-chat-native-item .highlight{
        position:absolute!important;
        inset:0!important;
        width:20px!important;
        height:20px!important;
        pointer-events:none!important
      }`;
    document.head.appendChild(style);

    function originalText(element) {
      return element.dataset[ORIGINAL_TEXT_KEY] || element.textContent || '';
    }

    function itemFor(element) {
      try { return window.jQuery?.(element)?.data?.('item') ?? null; } catch (_) { return null; }
    }

    function requestItem(element) {
      try {
        const $element = window.jQuery?.(element);
        if (!$element?.trigger) return false;
        $element.trigger('mouseenter');
        $element.trigger('mouseout');
        $element.tipHide?.();
        return true;
      } catch (_) {
        return false;
      }
    }

    function createNativeView(item) {
      const engine = window.Engine;
      const viewType = engine?.itemsViewData?.CHAT_LINKED_VIEW;
      const isItem = item?.isItem?.() === true;
      const manager = isItem ? engine?.items : engine?.tpls;
      if (!manager?.createViewIcon || viewType === undefined) return null;

      try {
        const result = isItem
          ? manager.createViewIcon(item.id, viewType)
          : manager.createViewIcon(item.id, viewType, item.loc);
        const view = result?.[0]?.[0] ?? result?.[0] ?? null;
        if (!(view instanceof Element)) return null;
        view.classList.add('yss-chat-native-item');
        return { view, manager, item, viewType };
      } catch (_) {
        return null;
      }
    }

    async function decorate(element) {
      if (stopped || !element?.isConnected || element.classList.contains(READY_CLASS)) return;
      pending.add(element);
      if (!(ORIGINAL_TEXT_KEY in element.dataset)) element.dataset[ORIGINAL_TEXT_KEY] = element.textContent || '';

      let item = itemFor(element);
      if (!item && requestItem(element)) {
        for (let attempt = 0; attempt < 40 && !stopped && element.isConnected; attempt += 1) {
          await wait(50);
          item = itemFor(element);
          if (item) break;
        }
      }

      try { window.jQuery?.(element)?.tipHide?.(); } catch (_) { /* tooltip nie blokuje ikony */ }
      const native = item ? createNativeView(item) : null;
      if (!stopped && element.isConnected && native?.view) {
        element.replaceChildren(native.view);
        element.classList.add(READY_CLASS);
        element.setAttribute('aria-label', originalText(element).replace(/^\[|\]$/g, ''));
        rendered.set(element, native);
      }
      pending.delete(element);
    }

    async function processQueue() {
      if (processing || stopped) return;
      processing = true;
      while (queue.length && !stopped) {
        const element = queue.shift();
        if (element?.isConnected && !element.classList.contains(READY_CLASS)) await decorate(element);
      }
      processing = false;
    }

    function enqueue(root = document) {
      const elements = root.matches?.(LINK_SELECTOR)
        ? [root]
        : [...root.querySelectorAll?.(LINK_SELECTOR) ?? []];
      elements.forEach(element => {
        if (!pending.has(element) && !queue.includes(element) && !element.classList.contains(READY_CLASS)) {
          queue.push(element);
        }
      });
      processQueue();
    }

    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) enqueue(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    enqueue();

    return () => {
      stopped = true;
      observer.disconnect();
      queue.length = 0;
      rendered.forEach(({ manager, item, viewType }, element) => {
        try { manager?.deleteViewIconIfExist?.(item.id, viewType); } catch (_) { /* bez wpływu na wyłączenie */ }
        if (element.isConnected) {
          element.textContent = originalText(element);
          element.classList.remove(READY_CLASS);
          element.removeAttribute('aria-label');
          delete element.dataset[ORIGINAL_TEXT_KEY];
        }
      });
      rendered.clear();
      style.remove();
    };
  }
};
