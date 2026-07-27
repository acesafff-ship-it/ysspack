// ==UserScript==
// @name         Margonem — Asystent Aukcji
// @namespace    krol-yss.margonem.auction-assistant
// @version      1.9.2
// @description  Automatycznie pobiera ceny przedmiotu wybranego do sprzedaży bez otwierania listy aukcji.
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

  const VERSION = "1.9.2";
  const PANEL_ID = "kyaa-panel";
  const STYLE_ID = "kyaa-style";
  const itemNameCache = new Map();

  let panel = null;
  let itemLabel = null;
  let statusLabel = null;
  let searchButton = null;
  let offersList = null;
  let activeSelection = null;
  let lastOffers = [];
  let lastLookupKey = "";
  let lookupSequence = 0;
  let lookupTimer = 0;
  let iconHydrationTimer = 0;
  let queued = false;
  let running = false;

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("pl-PL");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
    );
  }

  function formatGold(value) {
    const number = Math.max(0, Number(value) || 0);
    const units = [[1e9, "g"], [1e6, "m"], [1e3, "k"]];
    for (const [divisor, suffix] of units) {
      if (number < divisor) continue;
      return `${(number / divisor).toFixed(number < divisor * 10 ? 1 : 0).replace(".0", "")}${suffix}`;
    }
    return Math.round(number).toLocaleString("pl-PL");
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    if (typeof window.getSecondLeft === "function") {
      try {
        return window.getSecondLeft(value, { short: true });
      } catch (_) {}
    }
    if (value >= 86400) return `${Math.ceil(value / 86400)}d`;
    if (value >= 3600) return `${Math.ceil(value / 3600)}h`;
    if (value >= 60) return `${Math.ceil(value / 60)}m`;
    return `${Math.ceil(value)}s`;
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

  function offersFromResponse(response) {
    const rawOffers = response?.auctions?.show?.offers ?? response?.ah?.show?.offers;
    const offers = Array.isArray(rawOffers)
      ? rawOffers
      : rawOffers && typeof rawOffers === "object" ? Object.values(rawOffers) : [];
    return offers.map((offer) => {
      const buyGold = Number(offer?.bo_g) || 0;
      const buyPremium = Number(offer?.bo_c) || 0;
      const bidGold = Number(offer?.bid_g) || 0;
      const bidPremium = Number(offer?.bid_c) || 0;
      const isBuyNow = buyGold > 0 || buyPremium > 0;
      const gold = isBuyNow ? buyGold : bidGold;
      const premium = isBuyNow ? buyPremium : bidPremium;
      if (!gold && !premium) return null;
      return {
        price: `${gold ? formatGold(gold) : ""}${gold && premium ? " + " : ""}${premium ? `${premium} SŁ` : ""}`,
        priceValue: premium ? Number.POSITIVE_INFINITY : gold,
        type: isBuyNow ? "Kup teraz" : "Licytacja",
        time: formatTime(offer?.time),
        amount: 1,
        itemId: Number(offer?.item_id) || null,
        auctionId: Number(offer?.id) || null,
      };
    }).filter(Boolean).sort((left, right) => left.priceValue - right.priceValue).slice(0, 5);
  }

  function requestOffers(itemName) {
    return new Promise((resolve, reject) => {
      if (typeof window._g !== "function") return reject(new Error("Silnik aukcji nie jest jeszcze gotowy."));
      const filter = `||||||0|4|0|1|${encodeURIComponent(itemName)}`;
      const query = `ah&cat=0&filter=${filter}&sort=3|1`;
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Serwer aukcji nie odpowiedział."));
      }, 7000);
      try {
        window._g(query, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (response?.alert) return reject(new Error(String(response.alert)));
          resolve(offersFromResponse(response));
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async function showAuctionsList() {
    const selection = readSelection() || activeSelection;
    if (!selection) return setStatus("Najpierw wybierz przedmiot.", "#ff8b8b");
    if (!selection.name) return setStatus("Nie udało się odczytać nazwy przedmiotu.", "#ff8b8b");
    activeSelection = selection;
    setStatus("Otwieram listę aukcji…", "#7fd7ff");

    try {
      const sellWindow = getSellWindow();
      if (sellWindow) {
        nativeClick(findButton(sellWindow, "Anuluj") || sellWindow.querySelector(".close-button"));
        if (!(await waitFor(() => !getSellWindow(), 3000))) throw new Error("Nie udało się zamknąć formularza.");
      }
      const auctionWindow = getAuctionWindow();
      const tab = auctionWindow?.querySelector(".ALL_AUCTION-tab");
      if (!auctionWindow || !tab) throw new Error("Nie znaleziono listy aukcji.");
      nativeClick(tab);
      await waitFor(() => tab.classList.contains("active"), 3000);

      const nameInput = auctionWindow.querySelector('input[placeholder="Nazwa przedmiotu"]');
      if (!nameInput) throw new Error("Nie znaleziono pola nazwy przedmiotu.");
      for (const placeholder of ["Min. cena", "Max. cena", "Min. poziom", "Max. poziom"]) {
        setInput(auctionWindow.querySelector(`input[placeholder="${placeholder}"]`), "");
      }
      setInput(nameInput, selection.name);
      const auctionSort = window.Engine?.auctions?.getAuctionSort?.();
      if (auctionSort?.getSortType?.() !== 3 || auctionSort?.getSortOrder?.() !== 1) {
        auctionSort?.callChangeSort?.(3);
        await sleep(350);
      }
      if (auctionSort?.getSortType?.() !== 3 || auctionSort?.getSortOrder?.() !== 1) {
        auctionSort?.callChangeSort?.(3);
        await sleep(350);
      }
      const refreshButton = findButton(auctionWindow.querySelector(".refresh-button-wrapper"), "Odśwież");
      if (!nativeClick(refreshButton)) throw new Error("Nie znaleziono przycisku Odśwież.");
      setStatus("Lista aukcji przedmiotu została otwarta.", "#bfe38a");
    } catch (error) {
      console.warn("[Asystent Aukcji]", error);
      setStatus(error?.message || "Nie udało się otworzyć aukcji.", "#ff8b8b");
    }
  }

  function buyOffer(auctionId) {
    const offer = lastOffers.find((entry) => entry.auctionId === auctionId);
    if (!offer?.auctionId || offer.type !== "Kup teraz") return;
    const itemName = activeSelection?.name || "ten przedmiot";
    const question = `Kupić ${itemName} za ${offer.price}?`;
    const perform = () => {
      if (typeof window._g !== "function") {
        setStatus("Silnik aukcji nie jest gotowy.", "#ff8b8b");
        return;
      }
      setStatus("Kupuję przedmiot…", "#7fd7ff");
      window._g(`ah&action=buyout&auction=${offer.auctionId}`, (response) => {
        if (response?.alert) {
          setStatus(String(response.alert), "#d8cabb");
        } else {
          setStatus("Przedmiot został kupiony.", "#bfe38a");
        }
        lastLookupKey = "";
        setTimeout(() => checkPrices(activeSelection, true), 500);
      });
    };
    if (typeof window.confirmWithCallback === "function") {
      window.confirmWithCallback({ msg: question, clb: perform });
    } else if (window.confirm(question)) {
      perform();
    }
  }

  function renderOffers(offers) {
    lastOffers = offers;
    if (!offersList || !panel) return;
    panel.classList.add("kyaa-has-offers");
    offersList.innerHTML = offers.length
      ? offers.map((offer, index) => `
          <div class="kyaa-offer">
            <span class="kyaa-rank">${index + 1}.</span>
            <span class="kyaa-offer-icon" data-item-id="${offer.itemId || ""}">${offer.itemId ? "" : "?"}</span>
            <span class="kyaa-offer-price">${escapeHtml(offer.price)}</span>
            ${offer.type === "Kup teraz" && offer.auctionId
              ? `<span class="kyaa-buy button small green" data-auction-id="${offer.auctionId}"><span class="background"></span><span class="label">Kup teraz</span></span>`
              : `<span class="kyaa-offer-type">${escapeHtml(offer.type)}</span>`}
            <span class="kyaa-offer-time">${escapeHtml(offer.time)}${offer.amount > 1 ? ` · ×${offer.amount}` : ""}</span>
          </div>`).join("")
      : '<div class="kyaa-empty">Brak aktualnych ofert dla tego przedmiotu.</div>';
    offersList.parentElement.hidden = false;
    hydrateOfferIcons();
    positionPanel();
  }

  function hydrateOfferIcons(attempt = 0) {
    clearTimeout(iconHydrationTimer);
    if (!offersList) return;
    let pending = false;
    for (const target of offersList.querySelectorAll(".kyaa-offer-icon[data-item-id]")) {
      if (target.querySelector(".item")) continue;
      const item = itemDataById(Number(target.dataset.itemId));
      if (!item?.imgLoaded || typeof window.Engine?.items?.createViewIcon !== "function") {
        pending = true;
        continue;
      }
      try {
        const view = window.Engine.items.createViewIcon(Number(target.dataset.itemId));
        const element = view?.[0]?.[0];
        if (!element) {
          pending = true;
          continue;
        }
        target.replaceChildren(element);
        element.classList.add("kyaa-game-item");
      } catch (_) {
        pending = true;
      }
    }
    if (pending && attempt < 30) {
      iconHydrationTimer = setTimeout(() => hydrateOfferIcons(attempt + 1), 150);
    }
  }

  async function checkPrices(selection = readSelection(), force = false) {
    if (running) return;
    if (!selection) return setStatus("Najpierw wybierz przedmiot.", "#ff8b8b");
    if (!selection.name) return setStatus("Nie udało się odczytać nazwy przedmiotu. Wybierz go ponownie.", "#ff8b8b");

    const lookupKey = `${selection.id || selection.templateId || ""}:${normalize(selection.name)}`;
    if (!force && lookupKey === lastLookupKey) return;
    lastLookupKey = lookupKey;
    const sequence = ++lookupSequence;
    running = true;
    activeSelection = selection;
    renderOffers([]);
    searchButton.classList.add("disabled");
    searchButton.setAttribute("aria-disabled", "true");
    setStatus("Sprawdzam aktualne ceny w tle…", "#7fd7ff");

    try {
      const offers = await requestOffers(selection.name);
      if (sequence !== lookupSequence) return;
      renderOffers(offers);
      setStatus(offers.length ? `Znaleziono ${offers.length} najtańszych ofert.` : "Brak ofert dla tego przedmiotu.", offers.length ? "#bfe38a" : "#d8cabb");
    } catch (error) {
      if (sequence !== lookupSequence) return;
      console.warn("[Asystent Aukcji]", error);
      lastLookupKey = "";
      setStatus(error?.message || "Nie udało się pobrać cen.", "#ff8b8b");
    } finally {
      if (sequence !== lookupSequence) return;
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
      #${PANEL_ID}.c-window{display:block!important;visibility:visible!important;position:fixed!important;z-index:100!important;width:286px!important;height:260px!important;box-sizing:border-box;background:#1d1210!important;background-clip:border-box!important;background-origin:border-box!important;border-radius:12px!important;color:#fff;font:12.8px/16.64px Arimo,Calibri,"Segoe UI",Arial,sans-serif;filter:drop-shadow(0 3px 5px #000)}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID}>.content{position:absolute;inset:0;width:auto!important;height:auto!important;padding:22px 10px 8px!important;background:#1d1210!important;color:#fff;overflow:hidden}
      #${PANEL_ID}>.content:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.025),transparent 20%,transparent 80%,rgba(0,0,0,.18));pointer-events:none}
      #${PANEL_ID} .inner-content{position:relative!important;width:100%!important;height:100%!important;color:#fff!important}
      #${PANEL_ID} .header-label-positioner{z-index:5}
      #${PANEL_ID} .header-label .text{color:#ead9c0!important;text-shadow:1px 1px #000;white-space:nowrap}
      #${PANEL_ID} .kyaa-version{position:absolute;right:2px;top:-17px;color:#b8aa96;font-size:9px;text-shadow:1px 1px #000}
      #${PANEL_ID} .kyaa-item{height:22px;padding:1px 2px 4px;color:#ffd75c;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
      #${PANEL_ID} .kyaa-search.button{display:block;width:100%!important;height:28px!important;margin:0 auto 4px;line-height:24px;cursor:pointer}
      #${PANEL_ID} .kyaa-search.button .label{width:100%;text-align:center;font-size:11px;font-weight:bold;color:#e6d6bf}
      #${PANEL_ID} .kyaa-search.button.disabled{filter:grayscale(1);opacity:.55;cursor:not-allowed}
      #${PANEL_ID} .kyaa-status{height:30px;margin-top:7px;padding:4px 6px 0;border-top:1px solid #665a4b;background:transparent;color:#d8cabb;text-align:center;font-size:10px;line-height:12px;overflow:hidden}
      #${PANEL_ID}.kyaa-has-offers{height:520px!important}
      #${PANEL_ID}.kyaa-has-offers>.content{padding-bottom:10px!important}
      #${PANEL_ID} .kyaa-offers{margin-top:5px;border:1px solid #6d5133;background:linear-gradient(135deg,rgba(31,21,14,.98),rgba(14,11,9,.99));box-shadow:inset 0 0 0 1px #0b0806}
      #${PANEL_ID} .kyaa-offers-title{height:24px;padding:4px 7px;border-bottom:1px solid #6d5133;color:#efd27f;font-size:10px;font-weight:bold;text-shadow:1px 1px #000}
      #${PANEL_ID} .kyaa-offer{display:grid;grid-template-columns:14px 34px 43px 70px 1fr;align-items:center;min-height:38px;padding:3px 5px;border-bottom:1px solid rgba(122,91,53,.32);font-size:9px;line-height:12px}
      #${PANEL_ID} .kyaa-offer:last-child{border-bottom:0}
      #${PANEL_ID} .kyaa-rank{color:#9c8c75}
      #${PANEL_ID} .kyaa-offer-icon{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border:1px solid #73552f;background:#100c09;color:#88765e;box-shadow:inset 0 0 0 1px #050403}
      #${PANEL_ID} .kyaa-offer-icon .item.kyaa-game-item{position:relative!important;inset:auto!important;display:block!important;width:32px!important;height:32px!important;margin:0!important}
      #${PANEL_ID} .kyaa-offer-icon .item.kyaa-game-item canvas{display:block;width:32px!important;height:32px!important}
      #${PANEL_ID} .kyaa-offer-price{color:#ffd75c;font-weight:bold;text-align:right}
      #${PANEL_ID} .kyaa-offer-type{padding-left:7px;color:#cdbb9d}
      #${PANEL_ID} .kyaa-offer-time{color:#9fb9c4;text-align:right}
      #${PANEL_ID} .kyaa-buy.button{display:block;width:66px!important;height:22px!important;margin-left:3px;line-height:18px;cursor:pointer}
      #${PANEL_ID} .kyaa-buy.button .label{width:100%;text-align:center;color:#e6d6bf;font-size:8px;font-weight:bold;white-space:nowrap}
      #${PANEL_ID} .kyaa-empty{padding:15px 8px;color:#aa9d88;text-align:center;font-size:10px}
      #${PANEL_ID} .kyaa-credits{margin-top:8px;padding-top:6px;border-top:1px solid #665a4b;color:#918574;text-align:center;font-size:8px;line-height:12px}
      #${PANEL_ID} .kyaa-credits a{color:#d8ba70;text-decoration:none}
      #${PANEL_ID} .kyaa-credits a:hover{color:#ffe19a;text-decoration:underline}
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
        <div class="kyaa-search kyaa-open button small green"><div class="background"></div><div class="label">Pokaż aukcje</div></div>
        <div class="kyaa-search kyaa-refresh button small green"><div class="background"></div><div class="label">Odśwież ceny</div></div>
        <div class="kyaa-status">Po wybraniu przedmiotu ceny zostaną pobrane automatycznie.</div>
        <div class="kyaa-offers" hidden><div class="kyaa-offers-title">Najtańsze aktualne oferty</div><div class="kyaa-offers-list"></div></div>
        <div class="kyaa-credits">
          <div>Autor dodatku: <a href="https://www.margonem.pl/profile/view,10050726#char_5601,luvia" target="_blank" rel="noopener noreferrer">Król Yss</a></div>
          <div>Grafiki są własnością <a href="https://garmory.pl/" target="_blank" rel="noopener noreferrer">Garmory</a>.</div>
        </div>
      </div></div>
      <div class="c-window__bottom-bar"><div class="interface-element-bottom-bar-background-stretch"></div></div>`;
    (document.querySelector(".alerts-layer") || document.documentElement).appendChild(panel);
    itemLabel = panel.querySelector(".kyaa-item");
    statusLabel = panel.querySelector(".kyaa-status");
    searchButton = panel.querySelector(".kyaa-refresh");
    offersList = panel.querySelector(".kyaa-offers-list");
    panel.querySelector(".kyaa-open").addEventListener("click", showAuctionsList);
    searchButton.addEventListener("click", () => checkPrices(readSelection() || activeSelection, true));
    offersList.addEventListener("click", (event) => {
      const button = event.target.closest(".kyaa-buy[data-auction-id]");
      if (button) buyOffer(Number(button.dataset.auctionId));
    });
    if (lastOffers.length) renderOffers(lastOffers);
  }

  function positionPanel() {
    const anchorWindow = getSellWindow() || getAuctionWindow();
    if (!panel || !anchorWindow) return;
    const rect = anchorWindow.getBoundingClientRect();
    const width = panel.offsetWidth || 286;
    const height = panel.offsetHeight || 190;
    let left = rect.right + 8;
    if (left + width > innerWidth - 6) left = rect.left - width - 8;
    panel.style.left = `${Math.max(6, Math.min(left, innerWidth - width - 6))}px`;
    panel.style.top = `${Math.max(6, Math.min(rect.top, innerHeight - height - 6))}px`;
  }

  function updatePanel() {
    const sellWindow = getSellWindow();
    const auctionWindow = getAuctionWindow();
    if (!sellWindow && !(auctionWindow && activeSelection) && !running) {
      panel?.remove();
      clearTimeout(lookupTimer);
      clearTimeout(iconHydrationTimer);
      panel = itemLabel = statusLabel = searchButton = offersList = null;
      return;
    }
    if (!panel) createPanel();
    const gameWindowLayer = document.querySelector(".alerts-layer");
    if (gameWindowLayer && panel.parentElement !== gameWindowLayer) gameWindowLayer.appendChild(panel);
    positionPanel();
    const selection = readSelection() || activeSelection;
    itemLabel.textContent = selection?.name
      ? `${selection.name}${selection.amount > 1 ? ` ×${selection.amount}` : ""}`
      : selection ? `Przedmiot #${selection.templateId || selection.id || "?"}` : "Wybierz przedmiot";
    itemLabel.title = itemLabel.textContent;
    if (sellWindow && selection?.name) {
      const lookupKey = `${selection.id || selection.templateId || ""}:${normalize(selection.name)}`;
      if (lookupKey !== lastLookupKey && !running) {
        clearTimeout(lookupTimer);
        lookupTimer = setTimeout(() => checkPrices(selection), 250);
      }
    }
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
