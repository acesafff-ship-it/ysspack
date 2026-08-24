const MODULE_ID = 'chat-item-icons';
const STYLE_ID = 'yss-chat-item-icons-style';
const LINK_SELECTOR = '.linked-chat-item';
const READY_CLASS = 'yss-chat-item-icon-ready';
const ORIGINAL_TEXT_KEY = 'yssChatItemOriginalText';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export default {
  id: MODULE_ID,
  name: 'Ikony przedmiotów na czacie',
  version: '1.3.6',
  description: 'Automatycznie zastępuje nazwy podlinkowanych przedmiotów na czacie ich natywnymi ikonami.',
  icon: '◆',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    let fetchPausedUntil = 0;
    let observedHeroId = currentHeroId();
    let heroStableSince = observedHeroId == null ? 0 : Date.now() - 1200;
    const pending = new Set();
    const queued = new Set();
    let batchScheduled = false;
    const rendered = new Map();
    const formattedLootSections = new Set();

    const interfaceLayer = document.querySelector('.interface-layer');
    if (interfaceLayer?.scrollTop) interfaceLayer.scrollTop = 0;

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

    function chatScrollAtBottom(element) {
      const current = element?.closest('.chat-message-wrapper')?.querySelector(':scope > .scroll-pane')
        ?? element?.closest('.scroll-pane');
      if (!current || !current.closest('.chat-message-wrapper')) return null;
      const remaining = current.scrollHeight - current.clientHeight - current.scrollTop;
      return remaining <= 24 ? current : null;
    }

    function currentHeroId() {
      return window.Engine?.hero?.d?.id ?? window.hero?.id ?? null;
    }

    function updateSessionState() {
      const heroId = currentHeroId();
      if (heroId == null || heroId !== observedHeroId) {
        observedHeroId = heroId;
        heroStableSince = heroId == null ? 0 : Date.now();
      }
      return heroId != null && Date.now() - heroStableSince >= 1200 && Date.now() >= fetchPausedUntil;
    }

    function pauseFetching(milliseconds = 15000) {
      fetchPausedUntil = Math.max(fetchPausedUntil, Date.now() + milliseconds);
      heroStableSince = 0;
    }

    function isSessionAction(target) {
      const action = target?.closest?.('button, a, [role="button"], .menu-item, .option, .button');
      if (!action) return false;
      const descriptor = [action.textContent, action.title, action.getAttribute('aria-label'), action.dataset?.tip]
        .filter(Boolean).join(' ').toLocaleLowerCase('pl');
      return /wylog|przelog|zmie[nń]\s*posta[cć]|wybierz\s*posta[cć]|logout|relog|change\s*character/.test(descriptor);
    }

    function onPossibleSessionAction(event) {
      if (isSessionAction(event.target)) pauseFetching();
    }

    async function waitForStableSession(element) {
      while (!stopped && element?.isConnected) {
        if (updateSessionState()) return true;
        await wait(100);
      }
      return false;
    }

    function keepChatAtBottom(scroller) {
      if (!scroller?.isConnected) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (scroller.isConnected) scroller.scrollTop = scroller.scrollHeight;
      }));
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

    async function processBatch(elements) {
      const batch = elements.filter(element =>
        !stopped && element?.isConnected && !element.classList.contains(READY_CLASS)
      );
      if (!batch.length) return;

      batch.forEach(element => {
        pending.add(element);
        if (!(ORIGINAL_TEXT_KEY in element.dataset)) element.dataset[ORIGINAL_TEXT_KEY] = element.textContent || '';
      });

      if (await waitForStableSession(batch[0])) {
        batch.forEach(element => {
          if (!itemFor(element)) requestItem(element);
        });

        for (let attempt = 0; attempt < 40 && !stopped; attempt += 1) {
          if (batch.every(element => !element.isConnected || itemFor(element))) break;
          await wait(50);
          if (!updateSessionState()) break;
        }
      }

      const prepared = batch.map(element => {
        try { window.jQuery?.(element)?.tipHide?.(); } catch (_) { /* tooltip nie blokuje ikony */ }
        const item = itemFor(element);
        const native = item ? createNativeView(item) : null;
        return { element, native, chatScroller: native ? chatScrollAtBottom(element) : null };
      });

      await new Promise(resolve => requestAnimationFrame(resolve));
      prepared.forEach(({ element, native, chatScroller }) => {
        if (!stopped && element.isConnected && native?.view) {
          element.replaceChildren(native.view);
          element.classList.add(READY_CLASS);
          element.setAttribute('aria-label', originalText(element).replace(/^\[|\]$/g, ''));
          rendered.set(element, native);
          formatLootDistribution(element.closest('.message-section'));
          keepChatAtBottom(chatScroller);
        }
        pending.delete(element);
      });
    }

    function flushQueue() {
      batchScheduled = false;
      const batch = [...queued];
      queued.clear();
      processBatch(batch);
    }

    function enqueue(root = document) {
      const elements = root.matches?.(LINK_SELECTOR)
        ? [root]
        : [...root.querySelectorAll?.(LINK_SELECTOR) ?? []];
      elements.forEach(element => {
        if (!pending.has(element) && !queued.has(element) && !element.classList.contains(READY_CLASS)) {
          queued.add(element);
        }
      });
      if (queued.size && !batchScheduled) {
        batchScheduled = true;
        queueMicrotask(flushQueue);
      }
    }

    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) enqueue(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', onPossibleSessionAction, true);
    window.addEventListener('pagehide', pauseFetching, true);
    window.addEventListener('beforeunload', pauseFetching, true);
    enqueue();

    return () => {
      stopped = true;
      observer.disconnect();
      document.removeEventListener('pointerdown', onPossibleSessionAction, true);
      window.removeEventListener('pagehide', pauseFetching, true);
      window.removeEventListener('beforeunload', pauseFetching, true);
      queued.clear();
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
