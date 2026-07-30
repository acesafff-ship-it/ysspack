const MODULE_ID = 'chat-item-icons';
const STYLE_ID = 'yss-chat-item-icons-style';
const LINK_SELECTOR = '.linked-chat-item';
const READY_CLASS = 'yss-chat-item-icon-ready';
const ORIGINAL_TEXT_KEY = 'yssChatItemOriginalText';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export default {
  id: MODULE_ID,
  name: 'Ikony przedmiotów na czacie',
  version: '1.4.0',
  description: 'Automatycznie zastępuje nazwy podlinkowanych przedmiotów na czacie ich natywnymi ikonami.',
  icon: '◆',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    let activeWorkers = 0;
    const maxWorkers = 8;
    const pending = new Set();
    const queue = [];
    const rendered = new Map();
    const formattedLootSections = new Set();
    const initialBatch = new Set([...document.querySelectorAll(LINK_SELECTOR)]);
    const initialResults = [];
    let initialRemaining = initialBatch.size;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${LINK_SELECTOR}.${READY_CLASS}{
        display:inline-flex!important;
        width:34px!important;
        height:34px!important;
        margin:1px 2px!important;
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
        width:32px!important;
        min-width:32px!important;
        height:32px!important;
        min-height:32px!important;
        margin:0!important;
        padding:0!important;
        transform:none!important;
        pointer-events:none!important
      }
      ${LINK_SELECTOR}.${READY_CLASS}>.yss-chat-native-item canvas{
        position:absolute!important;
        inset:0!important;
        width:32px!important;
        height:32px!important;
        pointer-events:none!important
      }
      ${LINK_SELECTOR}.${READY_CLASS}>.yss-chat-native-item .highlight{
        position:absolute!important;
        inset:0!important;
        width:32px!important;
        height:32px!important;
        pointer-events:none!important
      }
      ${LINK_SELECTOR}.${READY_CLASS}>.yss-chat-native-item[data-item-type="t-norm"] .highlight{
        background-image:url("/img/gui/item_frames/frames/item_frames.png")!important;
        background-position:0 -96px!important
      }
      ${LINK_SELECTOR}.${READY_CLASS}>.yss-chat-native-item[data-item-type="t-norm"] .highlight::after{
        display:none!important
      }
      .yss-chat-loot-message{
        display:flex!important;
        flex-wrap:wrap!important;
        align-items:center!important;
        gap:4px 6px!important;
        line-height:normal!important
      }
      .yss-chat-loot-entry{
        display:inline-flex!important;
        align-items:center!important;
        gap:3px!important;
        min-height:36px!important;
        white-space:nowrap!important
      }
      .yss-chat-loot-entry ${LINK_SELECTOR}.${READY_CLASS}{
        margin:1px 0!important
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

    function formatLootDistribution(section) {
      if (!section || formattedLootSections.has(section) || !/Podział łupów/i.test(section.textContent || '')) return;
      const links = [...section.querySelectorAll(LINK_SELECTOR)];
      if (!links.length || links.some(link => !link.classList.contains(READY_CLASS))) return;

      const originalChildren = [...section.childNodes];
      const segments = [];
      let segmentStart = 0;
      links.forEach(link => {
        const linkIndex = originalChildren.indexOf(link);
        if (linkIndex < segmentStart) return;
        segments.push(originalChildren.slice(segmentStart, linkIndex + 1));
        segmentStart = linkIndex + 1;
      });
      if (segmentStart < originalChildren.length && segments.length) {
        segments[segments.length - 1].push(...originalChildren.slice(segmentStart));
      }

      segments.forEach(nodes => {
        if (!nodes.length) return;
        const group = document.createElement('span');
        group.className = 'yss-chat-loot-entry';
        section.insertBefore(group, nodes[0]);
        nodes.forEach(node => group.appendChild(node));
      });
      section.classList.add('yss-chat-loot-message');
      formattedLootSections.add(section);
    }

    function restoreLootDistribution(section) {
      if (!section?.isConnected) return;
      section.querySelectorAll(':scope > .yss-chat-loot-entry').forEach(group => {
        while (group.firstChild) section.insertBefore(group.firstChild, group);
        group.remove();
      });
      section.classList.remove('yss-chat-loot-message');
    }

    function commitDecoration(element, native) {
      if (stopped || !element.isConnected || !native?.view) return;
      element.replaceChildren(native.view);
      element.classList.add(READY_CLASS);
      element.setAttribute('aria-label', originalText(element).replace(/^\[|\]$/g, ''));
      rendered.set(element, native);
      formatLootDistribution(element.closest('.message-section'));
    }

    function finishInitialElement(element, native) {
      if (!initialBatch.has(element)) {
        commitDecoration(element, native);
        return;
      }
      if (native?.view) initialResults.push({ element, native });
      initialRemaining -= 1;
      if (initialRemaining > 0) return;
      initialResults.forEach(result => commitDecoration(result.element, result.native));
      initialResults.length = 0;
      initialBatch.clear();
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
      finishInitialElement(element, native);
      pending.delete(element);
    }

    function processQueue() {
      if (stopped) return;
      while (queue.length && activeWorkers < maxWorkers) {
        const element = queue.shift();
        if (!element?.isConnected || element.classList.contains(READY_CLASS)) continue;
        activeWorkers += 1;
        decorate(element).finally(() => {
          activeWorkers -= 1;
          processQueue();
        });
      }
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
      formattedLootSections.forEach(restoreLootDistribution);
      formattedLootSections.clear();
      style.remove();
    };
  }
};
