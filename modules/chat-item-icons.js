const MODULE_ID = 'chat-item-icons';
const STYLE_ID = 'yss-chat-item-icons-style';
const LINK_SELECTOR = '.linked-chat-item';
const READY_CLASS = 'yss-chat-item-icon-ready';
const ORIGINAL_TEXT_KEY = 'yssChatItemOriginalText';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export default {
  id: MODULE_ID,
  name: 'Ikony przedmiotów na czacie',
  version: '1.0.0',
  description: 'Zastępuje nazwy podlinkowanych przedmiotów na czacie ich ikonami, zachowując tooltip i menu przedmiotu.',
  icon: '◆',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    const pending = new Set();
    const queue = [];

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${LINK_SELECTOR}.${READY_CLASS}{
        display:inline-flex!important;
        width:28px!important;
        height:28px!important;
        margin:-7px 2px -8px!important;
        align-items:center!important;
        justify-content:center!important;
        vertical-align:middle!important;
        border:1px solid #777!important;
        border-radius:3px!important;
        background:#111!important;
        box-shadow:inset 0 0 0 1px #222!important;
        overflow:hidden!important;
        cursor:help!important
      }
      ${LINK_SELECTOR}.${READY_CLASS}[data-item-type*="leg"]{border-color:#f08a24!important}
      ${LINK_SELECTOR}.${READY_CLASS}[data-item-type*="her"]{border-color:#3aa8e8!important}
      ${LINK_SELECTOR}.${READY_CLASS}[data-item-type*="uni"]{border-color:#d8b635!important}
      ${LINK_SELECTOR}.${READY_CLASS} .yss-chat-item-image{
        display:block!important;
        width:26px!important;
        height:26px!important;
        object-fit:contain!important;
        image-rendering:auto!important;
        pointer-events:none!important
      }`;
    document.head.appendChild(style);

    function linkedItem(element) {
      try { return window.jQuery?.(element)?.data?.('item') ?? null; } catch (_) { return null; }
    }

    function requestData(element) {
      try {
        const $element = window.jQuery?.(element);
        if (!$element?.trigger) return;
        $element.trigger('mouseenter');
        $element.trigger('mouseout');
      } catch (_) { /* kolejna próba nastąpi przy następnym skanowaniu */ }
    }

    function iconDataUrl(item) {
      const isItem = item?.isItem?.() === true;
      const engine = window.Engine;
      const viewData = engine?.itemsViewData;
      const viewType = isItem ? viewData?.TIP_ITEM_VIEW : viewData?.TIP_TPL_ITEM_VIEW;
      const manager = isItem ? engine?.items : engine?.tpls;
      if (!manager?.createViewIcon || viewType === undefined) return '';

      let view;
      try {
        view = isItem
          ? manager.createViewIcon(item.id, viewType)
          : manager.createViewIcon(item.id, viewType, item.loc);
        const root = view?.[0] ?? view;
        const canvas = root?.querySelector?.('canvas.icon, canvas.canvas-icon') ?? root?.querySelector?.('canvas');
        return canvas?.toDataURL?.('image/png') ?? '';
      } catch (_) {
        return '';
      } finally {
        try {
          if (isItem) manager?.deleteViewIconIfExist?.(item.id, viewType);
          else manager?.deleteViewIconIfExist?.(item.id, viewType, item.loc);
        } catch (_) { /* usunięcie widoku pomocniczego nie blokuje dodatku */ }
      }
    }

    async function decorate(element) {
      if (stopped || !element?.isConnected || element.classList.contains(READY_CLASS)) return;
      pending.add(element);
      if (!(ORIGINAL_TEXT_KEY in element.dataset)) {
        element.dataset[ORIGINAL_TEXT_KEY] = element.textContent || '';
      }

      let item = linkedItem(element);
      if (!item) {
        requestData(element);
        for (let attempt = 0; attempt < 20 && !stopped && element.isConnected; attempt += 1) {
          await wait(100);
          item = linkedItem(element);
          if (item) break;
        }
      }

      const dataUrl = item ? iconDataUrl(item) : '';
      if (!stopped && element.isConnected && dataUrl) {
        const image = document.createElement('img');
        image.className = 'yss-chat-item-image';
        image.alt = element.dataset[ORIGINAL_TEXT_KEY].replace(/^\[|\]$/g, '');
        image.src = dataUrl;
        element.replaceChildren(image);
        element.classList.add(READY_CLASS);
      }
      pending.delete(element);
    }

    async function processQueue() {
      if (processQueue.running || stopped) return;
      processQueue.running = true;
      while (queue.length && !stopped) {
        const element = queue.shift();
        if (element?.isConnected && !element.classList.contains(READY_CLASS)) {
          await decorate(element);
        }
      }
      processQueue.running = false;
    }

    function enqueue(root = document) {
      const elements = root.matches?.(LINK_SELECTOR)
        ? [root]
        : [...root.querySelectorAll?.(LINK_SELECTOR) ?? []];
      elements.forEach(element => {
        if (!pending.has(element) && !element.classList.contains(READY_CLASS) && !queue.includes(element)) {
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
      document.querySelectorAll(`${LINK_SELECTOR}[data-${ORIGINAL_TEXT_KEY.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}]`).forEach(element => {
        element.textContent = element.dataset[ORIGINAL_TEXT_KEY] || '';
        delete element.dataset[ORIGINAL_TEXT_KEY];
        element.classList.remove(READY_CLASS);
      });
      style.remove();
    };
  }
};
