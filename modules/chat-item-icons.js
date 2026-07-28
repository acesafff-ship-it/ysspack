const MODULE_ID = 'chat-item-icons';
const STYLE_ID = 'yss-chat-item-icons-style';
const LINK_SELECTOR = '.linked-chat-item';
const READY_CLASS = 'yss-chat-item-icon-ready';
const ORIGINAL_TEXT_KEY = 'yssChatItemOriginalText';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export default {
  id: MODULE_ID,
  name: 'Ikony przedmiotów na czacie',
  version: '1.0.1',
  description: 'Zastępuje nazwy podlinkowanych przedmiotów na czacie ich ikonami, zachowując tooltip i menu przedmiotu.',
  icon: '◆',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    const iconCache = new Map();

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

    function originalName(element) {
      return element.dataset[ORIGINAL_TEXT_KEY] || element.textContent || '';
    }

    function copyCanvas(source) {
      if (!source?.width || !source?.height) return null;
      const copy = document.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      copy.getContext('2d')?.drawImage(source, 0, 0);
      return copy;
    }

    function applyIcon(element, sourceCanvas) {
      if (stopped || !element.isConnected || !sourceCanvas) return;
      const canvas = copyCanvas(sourceCanvas);
      if (!canvas) return;
      canvas.className = 'yss-chat-item-image';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', originalName(element).replace(/^\[|\]$/g, ''));
      element.replaceChildren(canvas);
      element.classList.add(READY_CLASS);
    }

    async function captureAfterRealHover(element) {
      if (element.dataset.yssChatItemCapturing === '1') return;
      element.dataset.yssChatItemCapturing = '1';
      for (let attempt = 0; attempt < 40 && !stopped && element.isConnected; attempt += 1) {
        await wait(50);
        const wrapper = document.querySelector('.tip-layer .tip-wrapper[data-tip-type="t_item"], .tip-layer .tip-wrapper[data-item-type^="t-"]');
        const canvas = wrapper?.querySelector('.item-head canvas.icon, .item-head canvas.canvas-icon, .item-head canvas');
        if (!canvas?.width || !canvas?.height) continue;
        const cachedCanvas = copyCanvas(canvas);
        if (!cachedCanvas) break;
        const name = originalName(element);
        iconCache.set(name, cachedCanvas);
        applyIcon(element, cachedCanvas);
        delete element.dataset.yssChatItemCapturing;
        return;
      }
      delete element.dataset.yssChatItemCapturing;
    }

    function enqueue(root = document) {
      const elements = root.matches?.(LINK_SELECTOR)
        ? [root]
        : [...root.querySelectorAll?.(LINK_SELECTOR) ?? []];
      elements.forEach(element => {
        if (!(ORIGINAL_TEXT_KEY in element.dataset)) element.dataset[ORIGINAL_TEXT_KEY] = element.textContent || '';
        const cached = iconCache.get(originalName(element));
        if (cached) applyIcon(element, cached);
      });
    }

    const onRealHover = event => {
      const element = event.target?.closest?.(LINK_SELECTOR);
      if (!element || element.classList.contains(READY_CLASS)) return;
      if (!(ORIGINAL_TEXT_KEY in element.dataset)) element.dataset[ORIGINAL_TEXT_KEY] = element.textContent || '';
      captureAfterRealHover(element);
    };
    document.addEventListener('mouseover', onRealHover, true);

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
      document.removeEventListener('mouseover', onRealHover, true);
      iconCache.clear();
      document.querySelectorAll(`${LINK_SELECTOR}[data-${ORIGINAL_TEXT_KEY.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}]`).forEach(element => {
        element.textContent = element.dataset[ORIGINAL_TEXT_KEY] || '';
        delete element.dataset[ORIGINAL_TEXT_KEY];
        element.classList.remove(READY_CLASS);
      });
      style.remove();
    };
  }
};
