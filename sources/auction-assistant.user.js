// ==UserScript==
// @name         Margonem — Asystent Aukcji
// @namespace    krol-yss.margonem.auction-assistant
// @version      1.2.6
// @description  Wyszukuje na aukcji przedmiot wybrany do sprzedaży i pozostawia decyzję o cenie graczowi.
// @author       Król Yss
// @match        https://*.margonem.pl/*
// @match        https://*.margonem.com/*
// @exclude      https://www.margonem.pl/*
// @exclude      https://forum.margonem.pl/*
// @exclude      https://www.margonem.com/*
// @exclude      https://forum.margonem.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "1.2.6";
  const PANEL_ID = "kyaa-panel";
  const STYLE_ID = "kyaa-style";
  const itemNameCache = new Map();

  let panel = null;
  let itemLabel = null;
  let statusLabel = null;
  let searchButton = null;
  let queued = false;
  let running = false;

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("pl-PL");
  }

  function visible(element) {
    return Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  }

  function classNumber(element, prefix) {
    const className = Array.from(element?.classList || []).find((name) => name.startsWith(prefix));
    const value = className ? Number(className.slice(prefix.length)) : NaN;
    return Number.isFinite(value) ? value : null;
  }

  function getWindow(title) {
    const wanted = normalize(title);
    return Array.from(document.querySelectorAll(".c-window")).find((element) =>
      visible(element) && normalize(element.querySelector(".header-label .text")?.textContent) === wanted
    ) || null;
  }

  function getAuctionWindow() {
    return getWindow("Aukcje");
  }

  function getSellWindow() {
    return getWindow("Wystaw przedmiot");
  }

  function nativeClick(element) {
    if (!element) return false;
    try {
      HTMLElement.prototype.click.call(element);
      return true;
    } catch (_) {
      try {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  function setInput(input, value) {
    if (!input) return false;
    try {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, String(value ?? ""));
    } catch (_) {
      input.value = String(value ?? "");
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(getter, timeout = 4000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = getter();
      if (value) return value;
      await sleep(100);
    }
    return null;
  }

  function findButton(root, text) {
    const wanted = normalize(text);
    return Array.from(root?.querySelectorAll(".button, .auction-but, button") || []).find((element) =>
      normalize(element.textContent).includes(wanted)
    ) || null;
  }

  function itemDataById(itemId) {
    if (!Number.isFinite(itemId)) return null;
    const sources = [
      window.Engine?.items,
      window.Engine?.equipment,
      window.Engine?.hero?.items,
      window.Engine?.hero?.d?.items,
      window.Engine?.hero?.eq,
      window.g?.item,
      window.g?.items,
    ].filter(Boolean);

    for (const source of sources) {
      for (const method of ["getItemById", "get", "getById", "findById"]) {
        if (typeof source?.[method] !== "function") continue;
        for (const key of [itemId, String(itemId)]) {
          try {
            const item = source[method](key);
            if (item) return item;
          } catch (_) {}
        }
      }
      const direct = source[itemId] ?? source[String(itemId)];
      if (direct) return direct;
    }
    return null;
  }

  function nameFromData(item) {
    const data = item?.d || item?.data || {};
    return String(
      item?.name ?? item?.nick ?? item?.n ??
      data?.name ?? data?.nick ?? data?.n ?? ""
    ).trim();
  }

  function rememberItemName(element) {
    const item = element?.closest?.(".item");
    const id = classNumber(item, "item-id-");
    if (!Number.isFinite(id)) return;
    const name = nameFromData(itemDataById(id));
    if (name) itemNameCache.set(id, name);
  }

  document.addEventListener("pointerdown", (event) => rememberItemName(event.target), true);
  document.addEventListener("click", (event) => rememberItemName(event.target), true);

  function readSelection() {
    const item = getSellWindow()?.querySelector(".auction-off-item-panel .item");
    if (!item) return null;
    const id = classNumber(item, "item-id-");
    const templateId = classNumber(item, "item-tpl-");
    const dataName = nameFromData(itemDataById(id));
    if (dataName) itemNameCache.set(id, dataName);
    return {
      id,
      templateId,
      name: dataName || itemNameCache.get(id) || "",
      amount: Math.max(1, Number(item.querySelector(".amount")?.textContent) || 1),
    };
  }

  async function closeSellWindow() {
    const sellWindow = getSellWindow();
    if (!sellWindow) return true;
    const cancelButton = findButton(sellWindow, "Anuluj");
    nativeClick(cancelButton || sellWindow.querySelector(".close-button"));
    return Boolean(await waitFor(() => !getSellWindow(), 3000));
  }

  async function openPlayerAuctions() {
    const auctionWindow = getAuctionWindow();
    const tab = auctionWindow?.querySelector(".ALL_AUCTION-tab");
    if (!tab) return false;
    nativeClick(tab);
    return Boolean(await waitFor(() => tab.classList.contains("active"), 3000));
  }

  function clearOtherTextFilters(auctionWindow) {
    for (const placeholder of ["Min. cena", "Max. cena", "Min. poziom", "Max. poziom"]) {
      setInput(auctionWindow.querySelector(`input[placeholder="${placeholder}"]`), "");
    }
  }

  async function showAuctions() {
    if (running) return;
    const selection = readSelection();
    if (!selection) return setStatus("Najpierw wybierz przedmiot.", "#ff8b8b");
    if (!selection.name) return setStatus("Nie udało się odczytać nazwy przedmiotu. Wybierz go ponownie.", "#ff8b8b");

    running = true;
    searchButton.classList.add("disabled");
    searchButton.setAttribute("aria-disabled", "true");
    setStatus("Otwieram aukcje i wyszukuję nazwę…", "#7fd7ff");

    try {
      if (!(await closeSellWindow())) throw new Error("Nie udało się zamknąć formularza wystawiania.");
      if (!(await openPlayerAuctions())) throw new Error("Nie udało się otworzyć karty Aukcje Graczy.");
      const auctionWindow = getAuctionWindow();
      const nameInput = auctionWindow?.querySelector('input[placeholder="Nazwa przedmiotu"]');
      if (!nameInput) throw new Error("Nie znaleziono pola nazwy przedmiotu.");

      clearOtherTextFilters(auctionWindow);
      setInput(nameInput, selection.name);
      const refreshButton = findButton(auctionWindow.querySelector(".refresh-button-wrapper"), "Odśwież");
      if (!nativeClick(refreshButton)) throw new Error("Nie znaleziono przycisku Odśwież.");
      // Celowo nie wracamy do formularza. Gracz ogląda oferty i sam ustala cenę.
    } catch (error) {
      console.warn("[Asystent Aukcji]", error);
      setStatus(error?.message || "Nie udało się otworzyć ofert.", "#ff8b8b");
    } finally {
      running = false;
      if (searchButton) {
        searchButton.classList.remove("disabled");
        searchButton.removeAttribute("aria-disabled");
      }
    }
  }

  function setStatus(text, color = "#bbb") {
    if (!statusLabel) return;
    statusLabel.textContent = text;
    statusLabel.style.color = color;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}.c-window{display:block!important;visibility:visible!important;position:fixed!important;z-index:2147483000!important;width:286px!important;height:190px!important;box-sizing:border-box;background:#1d1210!important;background-clip:border-box!important;background-origin:border-box!important;border-radius:12px!important;color:#fff;font:12.8px/16.64px Arimo,Calibri,"Segoe UI",Arial,sans-serif;filter:drop-shadow(0 3px 5px #000)}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID}>.content{position:absolute;inset:0;width:auto!important;height:auto!important;padding:22px 10px 8px!important;background:#1d1210!important;color:#fff;overflow:hidden}
      #${PANEL_ID}>.content:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.025),transparent 20%,transparent 80%,rgba(0,0,0,.18));pointer-events:none}
      #${PANEL_ID} .inner-content{position:relative!important;width:100%!important;height:100%!important;color:#fff!important}
      #${PANEL_ID} .header-label-positioner{z-index:5}
      #${PANEL_ID} .header-label .text{color:#ead9c0!important;text-shadow:1px 1px #000;white-space:nowrap}
      #${PANEL_ID} .kyaa-version{position:absolute;right:2px;top:-17px;color:#b8aa96;font-size:9px;text-shadow:1px 1px #000}
      #${PANEL_ID} .kyaa-item{height:22px;padding:1px 2px 4px;color:#ffd75c;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
      #${PANEL_ID} .kyaa-search.button{display:block;width:100%!important;height:28px!important;margin:0 auto;line-height:24px;cursor:pointer}
      #${PANEL_ID} .kyaa-search.button .label{width:100%;text-align:center;font-size:11px;font-weight:bold;color:#e6d6bf}
      #${PANEL_ID} .kyaa-search.button.disabled{filter:grayscale(1);opacity:.55;cursor:not-allowed}
      #${PANEL_ID} .kyaa-status{height:30px;margin-top:7px;padding:4px 6px 0;border-top:1px solid #665a4b;background:transparent;color:#d8cabb;text-align:center;font-size:10px;line-height:12px;overflow:hidden}
      #${PANEL_ID} .c-window__bottom-bar{pointer-events:none}
    `;
    document.documentElement.appendChild(style);
  }

  function createPanel() {
    injectStyles();
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "c-window border-window";
    panel.innerHTML = `
      <div class="header-label-positioner">
        <div class="header-label">
          <div class="left-decor"></div><div class="right-decor"></div>
          <div class="text">Asystent Aukcji</div>
        </div>
      </div>
      <div class="content"><div class="inner-content">
        <span class="kyaa-version">v${VERSION}</span>
        <div class="kyaa-item">Wybierz przedmiot</div>
        <div class="kyaa-search button small green"><div class="background"></div><div class="label">Pokaż aukcje przedmiotu</div></div>
        <div class="kyaa-status">Wyszuka nazwę i pozostawi otwartą listę ofert. Cenę wybierasz sam.</div>
      </div></div>
      <div class="c-window__bottom-bar"><div class="interface-element-bottom-bar-background-stretch"></div></div>`;
    document.documentElement.appendChild(panel);
    itemLabel = panel.querySelector(".kyaa-item");
    statusLabel = panel.querySelector(".kyaa-status");
    searchButton = panel.querySelector(".kyaa-search");
    searchButton.addEventListener("click", showAuctions);
  }

  function positionPanel() {
    const sellWindow = getSellWindow();
    if (!panel || !sellWindow) return;
    const rect = sellWindow.getBoundingClientRect();
    const width = panel.offsetWidth || 286;
    const height = panel.offsetHeight || 190;
    let left = rect.right + 8;
    if (left + width > innerWidth - 6) left = rect.left - width - 8;
    panel.style.left = `${Math.max(6, Math.min(left, innerWidth - width - 6))}px`;
    panel.style.top = `${Math.max(6, Math.min(rect.top, innerHeight - height - 6))}px`;
  }

  function updatePanel() {
    if (!getSellWindow()) {
      panel?.remove();
      panel = itemLabel = statusLabel = searchButton = null;
      return;
    }
    if (!panel) createPanel();
    positionPanel();
    const selection = readSelection();
    itemLabel.textContent = selection?.name
      ? `${selection.name}${selection.amount > 1 ? ` ×${selection.amount}` : ""}`
      : selection ? `Przedmiot #${selection.templateId || selection.id || "?"}` : "Wybierz przedmiot";
    itemLabel.title = itemLabel.textContent;
  }

  function queueUpdate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      updatePanel();
    });
  }

  const observer = new MutationObserver(queueUpdate);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  window.addEventListener("resize", queueUpdate);
  setInterval(queueUpdate, 750);
  queueUpdate();
})();
