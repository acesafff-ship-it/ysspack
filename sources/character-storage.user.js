// ==UserScript==
// @name         Margonem — Magazyn Postaci
// @namespace    codex.margonem.character-storage
// @version      1.4.1
// @description  Zapamiętuje zawartość toreb własnych postaci i pozwala ją przeglądać oraz przeszukiwać.
// @author       Codex
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

  const VERSION = "1.4.1";
  const STORAGE_KEY = "codex-margonem-character-storage-v1";
  const UI_KEY = "codex-margonem-character-storage-ui-v1";
  const ROOT_ID = "codex-character-storage";
  const SCAN_INTERVAL = 30000;
  const RARITY_ORDER = { leg: 5, her: 4, uni: 3, upg: 2, norm: 1 };
  const RARITY_LABELS = { leg: "legendarny", her: "heroiczny", uni: "unikatowy", upg: "ulepszony", norm: "zwykły" };
  const RARITY_TIP_TYPES = { leg: "t-leg", her: "t-her", uni: "t-uniupg", upg: "t-upgraded", norm: "t-norm" };
  const PROF_LABELS = { w: "Wojownik", p: "Paladyn", m: "Mag", t: "Tropiciel", h: "Łowca", b: "Tancerz ostrzy" };

  let root = null;
  let panel = null;
  let launcher = null;
  let tooltip = null;
  let selectedCharacter = "all";
  let searchQuery = "";
  let lastInventoryHash = "";
  let scanBusy = false;
  let renderQueued = false;
  let inventoryObserver = null;

  const readJson = (key, fallback) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("[Magazyn Postaci] Nie udało się zapisać danych:", error);
      return false;
    }
  };

  const getUiState = () => readJson(UI_KEY, { open: true, minimized: false, x: null, y: 120 });
  const saveUiState = (changes) => writeJson(UI_KEY, { ...getUiState(), ...changes });

  const getDatabase = () => {
    const db = readJson(STORAGE_KEY, null);
    if (db?.version === 1 && db.worlds && typeof db.worlds === "object") return db;
    return { version: 1, worlds: {} };
  };

  const saveDatabase = (db) => writeJson(STORAGE_KEY, db);

  const getEngine = () => window.Engine;
  const getHero = () => getEngine()?.hero?.d || null;
  const getWorld = () => String(getEngine()?.worldName || location.hostname.split(".")[0] || "nieznany").toLowerCase();

  function getHeroGold() {
    const hero = getHero();
    const candidates = [hero?.gold, hero?.currency?.gold, hero?.warrior_stats?.gold, getEngine()?.hero?.gold];
    for (const value of candidates) {
      if (value == null || value === "") continue;
      const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^\d-]/g, ""));
      if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
    }
    return null;
  }

  function getCharacterMeta() {
    const hero = getHero();
    const nick = String(hero?.nick || hero?.name || "").trim();
    if (!hero || !nick) return null;
    const id = hero.id ?? hero.charId ?? hero.characterId ?? null;
    return {
      key: id != null ? String(id) : `${getWorld()}:${nick.toLocaleLowerCase("pl")}`,
      id: id != null ? String(id) : null,
      nick,
      lvl: Number(hero.lvl ?? hero.level) || 0,
      prof: String(hero.prof || hero.profession || ""),
      gold: getHeroGold(),
      world: getWorld(),
    };
  }

  function parseStats(stat) {
    if (!stat) return {};
    if (typeof stat === "object") return stat;
    const result = {};
    String(stat).split(";").forEach((part) => {
      const [key, ...rest] = part.split("=");
      if (key) result[key.trim()] = rest.join("=").trim();
    });
    return result;
  }

  function normalizeRarity(item, element) {
    const raw = String(
      item?.itemType || item?.rarity || item?.quality || element?.dataset?.itemType || ""
    ).toLowerCase();
    if (raw.includes("leg")) return "leg";
    if (raw.includes("her")) return "her";
    if (raw.includes("uni")) return "uni";
    if (raw.includes("upg")) return "upg";
    return "norm";
  }

  function readAmount(item, stats, element) {
    const value = item?.amount ?? item?._cachedStats?.amount ?? stats.amount ?? element?.querySelector?.(".amount")?.textContent;
    const parsed = Number(String(value ?? "1").replace(/\D/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  function getItemId(item, element) {
    if (item?.id != null) return String(item.id);
    const className = element?.className || "";
    return String(className).match(/(?:^|\s)item-id-(\d+)/)?.[1] || element?.getAttribute?.("tip-id") || "";
  }

  function normalizeIcon(icon) {
    if (!icon) return "";
    if (typeof icon === "object") {
      icon = icon.src || icon.url || icon.path || icon.file || icon.filename || icon.name || "";
    }
    if (!icon || typeof icon !== "string") return "";
    const value = String(icon).replace(/^url\(["']?|["']?\)$/g, "");
    if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
    if (value.startsWith("//")) return `${location.protocol}${value}`;
    if (value.startsWith("/")) return `${location.origin}${value}`;
    if (value.includes("/")) return `${location.origin}/${value.replace(/^\.\//, "")}`;
    const gameItemPath = String(window.CFG?.r_ipath || "");
    if (gameItemPath) {
      try {
        return new URL(value, gameItemPath.endsWith("/") ? gameItemPath : `${gameItemPath}/`).href;
      } catch (_) {
        return `${gameItemPath}${value}`;
      }
    }
    return `${location.origin}/obrazki/itemy/${value}`;
  }

  function iconFromCanvas(canvas) {
    if (canvas?.width && canvas?.height) {
      try {
        const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height)?.data;
        let hasVisiblePixel = false;
        if (pixels) {
          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] !== 0) {
              hasVisiblePixel = true;
              break;
            }
          }
        }
        if (hasVisiblePixel) return canvas.toDataURL("image/png");
      } catch (_) {}
    }
    return "";
  }

  function iconFromElement(element) {
    if (!element) return "";
    const image = element.querySelector?.("img");
    if (image?.src) return image.src;
    const canvasIcon = iconFromCanvas(element.querySelector?.("canvas.icon, canvas.canvas-icon"));
    if (canvasIcon) return canvasIcon;
    const candidates = [element, element.querySelector?.(".canvas-icon"), element.querySelector?.(".icon")].filter(Boolean);
    for (const node of candidates) {
      const background = getComputedStyle(node).backgroundImage;
      const url = background?.match(/url\(["']?(.+?)["']?\)/)?.[1];
      if (url) return url;
    }
    return "";
  }

  function shouldKeepItem(item, element) {
    const loc = String(item?.loc ?? item?.location ?? "g").toLowerCase();
    if (loc && loc !== "g" && loc !== "bag") return false;
    const position = Number(item?.st ?? item?.position);
    if (Number.isFinite(position) && position !== 0) return false;
    const itemClass = Number(item?.cl ?? item?.itemClass ?? item?.class);
    if (itemClass === 21) return false;
    if (element?.classList?.contains("bag")) return false;
    return true;
  }

  function normalizeItem(item, element = null) {
    if (!item && !element) return null;
    if (!shouldKeepItem(item, element)) return null;
    const id = getItemId(item, element);
    const stats = parseStats(item?.stat || item?.stats);
    const tpl = item?.tpl ?? item?.tplId ?? item?.templateId ?? element?.className?.match(/item-tpl-(\d+)/)?.[1] ?? "";
    const name = String(item?.name || item?._name || element?.getAttribute?.("aria-label") || element?.getAttribute?.("title") || `Przedmiot #${id || tpl || "?"}`);
    const spriteIcon = item?.sprite?.currentSrc || item?.sprite?.src || "";
    const masterCanvas = item?.$canvasIcon?.[0] || item?.ctx?.canvas || null;
    const masterCanvasIcon = item?.onload === true ? iconFromCanvas(masterCanvas) : "";
    const rawGameIcon = item?.icon || item?.img || item?.image || "";
    const itemPath = String(window.CFG?.r_ipath || "");
    const configuredGameIcon = rawGameIcon && itemPath && !/^(?:https?:|data:|blob:|\/\/)/i.test(String(rawGameIcon))
      ? `${itemPath}${rawGameIcon}`
      : rawGameIcon;
    const icon = masterCanvasIcon || normalizeIcon(configuredGameIcon || spriteIcon || iconFromElement(element));
    let tipHtml = "";
    try {
      const gameTip = item?.getTipContent?.();
      if (typeof gameTip === "string") tipHtml = gameTip;
    } catch (_) {}
    return {
      id,
      tpl: String(tpl || ""),
      name,
      icon,
      amount: readAmount(item, stats, element),
      rarity: normalizeRarity(item, element),
      tipHtml,
      x: Number(item?.x) || 0,
      y: Number(item?.y) || 0,
    };
  }

  function collectFromDom(target) {
    document.querySelectorAll(".inner-grid .inventory-item, .inventory-grid .inventory-item").forEach((element) => {
      const id = getItemId(null, element);
      let item = null;
      try {
        if (id) item = getEngine()?.items?.getItemById?.(Number(id)) || getEngine()?.items?.getItemById?.(id);
      } catch (_) {}
      const normalized = normalizeItem(item, element);
      if (normalized) {
        const visibleCanvasIcon = iconFromElement(element);
        if (visibleCanvasIcon) normalized.icon = visibleCanvasIcon;
        const key = normalized.id || `dom:${normalized.tpl}:${normalized.x}:${normalized.y}`;
        const previous = target.get(key);
        target.set(key, previous ? {
          ...normalized,
          name: previous.name || normalized.name,
          icon: normalized.icon || previous.icon,
          tpl: previous.tpl || normalized.tpl,
          tipHtml: normalized.tipHtml || previous.tipHtml || "",
          x: previous.x || normalized.x,
          y: previous.y || normalized.y,
        } : normalized);
      }
    });
  }

  async function collectInventory() {
    const itemsApi = getEngine()?.items;
    const found = new Map();
    const add = (item) => {
      const normalized = normalizeItem(item);
      if (normalized) found.set(normalized.id || `api:${normalized.tpl}:${normalized.x}:${normalized.y}`, normalized);
    };

    if (typeof itemsApi?.fetch === "function") {
      const fetchQuery = { loc: "g", k: "CODEX_CHARACTER_STORAGE" };
      try {
        itemsApi.fetch(fetchQuery, add);
        await new Promise((resolve) => setTimeout(resolve, 350));
      } catch (error) {
        console.debug("[Magazyn Postaci] fetch niedostępny:", error);
      } finally {
        try {
          itemsApi.removeCallback?.(fetchQuery);
        } catch (_) {}
      }
    }

    if (!found.size && itemsApi) {
      for (const methodName of ["getList", "getAll", "getItems", "getDrawableList"]) {
        try {
          const value = itemsApi[methodName]?.();
          const list = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
          list.forEach(add);
          if (found.size) break;
        } catch (_) {}
      }
    }

    collectFromDom(found);
    return [...found.values()].sort((a, b) => a.y - b.y || a.x - b.x || a.name.localeCompare(b.name, "pl"));
  }

  function inventoryHash(items, gold) {
    return `${gold ?? "?"}::${items.map((item) => `${item.id}:${item.tpl}:${item.amount}:${item.x}:${item.y}:${item.icon}:${item.tipHtml?.length || 0}`).sort().join("|")}`;
  }

  async function snapshotCurrentCharacter(force = false) {
    if (scanBusy) return false;
    const character = getCharacterMeta();
    if (!character || !getEngine()?.items) return false;
    scanBusy = true;
    try {
      const items = await collectInventory();
      const hash = inventoryHash(items, character.gold);
      if (!force && hash === lastInventoryHash) return true;
      lastInventoryHash = hash;
      const db = getDatabase();
      const world = db.worlds[character.world] ||= {};
      Object.entries(world).forEach(([key, saved]) => {
        const nick = String(saved?.nick || "").trim().toLocaleLowerCase("pl");
        if (!nick || nick === "nieznana postać") delete world[key];
      });
      world[character.key] = { ...character, updatedAt: Date.now(), items };
      if (saveDatabase(db)) scheduleRender();
      return true;
    } finally {
      scanBusy = false;
    }
  }

  function currentWorldCharacters() {
    const world = getDatabase().worlds[getWorld()] || {};
    return Object.values(world).sort((a, b) => a.nick.localeCompare(b.nick, "pl"));
  }

  function formatDate(timestamp) {
    if (!timestamp) return "brak danych";
    return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(timestamp);
  }

  function formatGold(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Number(value)).toLocaleString("pl-PL") : "brak danych";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function filteredItems(character) {
    const query = searchQuery.trim().toLocaleLowerCase("pl");
    const list = Array.isArray(character.items) ? character.items : [];
    return list.filter((item) => !query || item.name.toLocaleLowerCase("pl").includes(query));
  }

  function renderCharacter(character, collapsedCharacters) {
    const items = filteredItems(character);
    const stacks = items.length;
    const units = items.reduce((sum, item) => sum + (item.amount || 1), 0);
    const collapsed = collapsedCharacters.has(character.key);
    return `
      <section class="mcs-character${collapsed ? " mcs-character-collapsed" : ""}" data-character-key="${escapeHtml(character.key)}">
        <div class="mcs-character-head" title="${collapsed ? "Rozwiń postać" : "Zwiń postać"}">
          <div class="mcs-character-name"><i class="mcs-collapse-arrow">${collapsed ? "▶" : "▼"}</i><div><strong>${escapeHtml(character.nick)}</strong><span>${character.lvl || "?"} lvl · ${escapeHtml(PROF_LABELS[character.prof] || character.prof || "?")}</span></div></div>
          <div class="mcs-updated" title="Ostatni zapis zawartości toreb">${escapeHtml(formatDate(character.updatedAt))}</div>
        </div>
        <div class="mcs-summary"><span>${stacks} ${stacks === 1 ? "stos" : "stosów"} · ${units} szt.</span><span class="mcs-gold" title="Zapisane złoto tej postaci">${escapeHtml(formatGold(character.gold))} zł</span></div>
        <div class="mcs-grid">
          ${items.map((item) => `
            <div class="mcs-item rarity-${item.rarity}" data-name="${escapeHtml(item.name)}" data-rarity="${escapeHtml(item.rarity)}" data-amount="${item.amount || 1}" data-character="${escapeHtml(character.nick)}" data-character-key="${escapeHtml(character.key)}" data-item-id="${escapeHtml(item.id)}">
              ${item.icon ? `<img src="${escapeHtml(item.icon)}" alt="">` : `<span class="mcs-no-icon">?</span>`}
              ${(item.amount || 1) > 1 ? `<span class="mcs-amount">${item.amount}</span>` : ""}
            </div>`).join("") || `<div class="mcs-empty">${searchQuery ? "Brak pasujących przedmiotów." : "Torby były puste albo gra nie udostępniła ich zawartości."}</div>`}
        </div>
      </section>`;
  }

  function render() {
    if (!root || !panel) return;
    const hero = getCharacterMeta();
    const characters = currentWorldCharacters().filter((character) => character.key !== hero?.key);
    const collapsedCharacters = new Set(Array.isArray(getUiState().collapsedCharacters) ? getUiState().collapsedCharacters.map(String) : []);
    if (selectedCharacter !== "all" && !characters.some((character) => character.key === selectedCharacter)) selectedCharacter = "all";
    const visible = selectedCharacter === "all" ? characters : characters.filter((character) => character.key === selectedCharacter);
    const content = panel.querySelector(".mcs-body");
    const select = panel.querySelector(".mcs-select");
    const totalGold = characters.reduce((sum, character) => sum + (Number.isFinite(Number(character.gold)) ? Number(character.gold) : 0), 0);
    select.innerHTML = `<option value="all">Wszystkie postacie (${characters.length})</option>${characters.map((character) => `<option value="${escapeHtml(character.key)}">${escapeHtml(character.nick)} (${character.lvl || "?"} lvl)</option>`).join("")}`;
    select.value = selectedCharacter;
    content.innerHTML = characters.length
      ? visible.map((character) => renderCharacter(character, collapsedCharacters)).join("")
      : `<div class="mcs-welcome"><strong>Brak innych zapisanych postaci</strong><br>Aktualna postać jest celowo ukryta. Zaloguj się kolejno na pozostałe postacie, aby zapisać ich torby.</div>`;
    const status = panel.querySelector(".mcs-status");
    status.textContent = hero
      ? `Ukryta: ${hero.nick} · Złoto pozostałych: ${formatGold(totalGold)} zł`
      : `Świat: ${getWorld()} · Złoto: ${formatGold(totalGold)} zł`;
  }

  function installStoredItemHeader(scope, item, sourceTile = null) {
    if (!scope || !item) return;
    const originalHead = scope.querySelector(".item-head");
    let secondaryText = "";
    if (originalHead) {
      secondaryText = String(originalHead.textContent || "").replace(item.name || "", "").trim();
      originalHead.remove();
    }
    const header = document.createElement("div");
    header.className = "mcs-forced-tip-head";
    const iconBox = document.createElement("div");
    iconBox.className = `mcs-saved-tip-item rarity-${item.rarity || "norm"}`;
    const sourceImage = sourceTile?.querySelector?.("img");
    const iconUrl = sourceImage?.currentSrc || sourceImage?.src || item.icon || "";
    if (iconUrl) {
      const image = document.createElement("img");
      image.src = iconUrl;
      image.alt = "";
      iconBox.appendChild(image);
    } else {
      const missing = document.createElement("span");
      missing.className = "mcs-no-icon";
      missing.textContent = "?";
      iconBox.appendChild(missing);
    }
    if ((item.amount || 1) > 1) {
      const amount = document.createElement("span");
      amount.className = "mcs-saved-tip-amount";
      amount.textContent = String(item.amount);
      iconBox.appendChild(amount);
    }
    const meta = document.createElement("div");
    meta.className = "mcs-forced-tip-meta";
    const name = document.createElement("strong");
    name.className = `rarity-${item.rarity || "norm"}`;
    name.textContent = item.name || "Przedmiot";
    meta.appendChild(name);
    if (secondaryText) {
      const type = document.createElement("span");
      type.textContent = secondaryText;
      meta.appendChild(type);
    }
    header.append(iconBox, meta);
    scope.prepend(header);
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function injectStyles() {
    if (document.getElementById(`${ROOT_ID}-style`)) return;
    const style = document.createElement("style");
    style.id = `${ROOT_ID}-style`;
    style.textContent = `
      #${ROOT_ID}{position:fixed;z-index:2147483000;left:20px;top:120px;width:326px;color:#e5e5df;font:12px/1.3 Arimo,Calibri,"Segoe UI",Arial,sans-serif}
      #${ROOT_ID},#${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .mcs-panel{position:relative;border-radius:4px;background:rgba(9,10,9,.93);box-shadow:0 0 0 1px #010101,0 0 0 2px #ccc,0 0 0 3px #0c0d0d,2px 2px 3px 3px rgba(12,13,13,.55);overflow:hidden}
      #${ROOT_ID} .mcs-header{height:28px;display:flex;align-items:center;gap:6px;padding:0 5px;background:linear-gradient(#383834 0,#20201e 48%,#111 52%,#252522 100%);border-bottom:1px solid #090909;color:#f5f5dc;cursor:move;user-select:none;box-shadow:inset 0 1px #64645d,inset 0 -1px #484843}
      #${ROOT_ID} .mcs-title{font-weight:bold;flex:1;text-align:center;text-shadow:1px 1px #000;font-size:11px}
      #${ROOT_ID} .mcs-version{font-size:9px;color:#aaa79a;text-shadow:1px 1px #000}
      #${ROOT_ID} button{position:relative;font:600 11px Arimo,Calibri,"Segoe UI",Arial,sans-serif;color:#eee;border:1px solid #aaa;border-radius:4px;background:linear-gradient(#464744,#202220);box-shadow:inset 0 0 0 1px #111,inset 0 1px 0 1px rgba(255,255,255,.16);text-shadow:1px 1px #000;cursor:pointer}
      #${ROOT_ID} button:hover{filter:brightness(1.16)}
      #${ROOT_ID} button:active{transform:translateY(1px);filter:brightness(.95)}
      #${ROOT_ID} .mcs-min{width:22px;height:20px;padding:0;color:#eee;font-size:13px;line-height:16px}
      #${ROOT_ID} .mcs-controls{display:grid;grid-template-columns:1fr 72px;gap:5px;padding:7px 6px 6px;background:linear-gradient(#171815,#0d0e0c);border-bottom:1px solid #4b4b45}
      #${ROOT_ID} .mcs-search,#${ROOT_ID} .mcs-select{height:27px;border:1px solid #6d6d67;border-radius:1px;background:linear-gradient(#292a28,#1b1c1a);box-shadow:inset 1px 1px 2px #050505;color:#eee;padding:4px 7px;outline:none;font:12px Arimo,Calibri,"Segoe UI",Arial,sans-serif}
      #${ROOT_ID} .mcs-search:focus,#${ROOT_ID} .mcs-select:focus{border-color:#aaa99f;box-shadow:inset 1px 1px 2px #050505,0 0 2px #cfcfc3}
      #${ROOT_ID} .mcs-select{grid-column:1/-1}
      #${ROOT_ID} .mcs-refresh{background:linear-gradient(#4f8a3b,#23541f 51%,#173e15 52%,#286322);border-color:#a9b2a3;color:#fff;font-weight:bold}
      #${ROOT_ID} .mcs-status{padding:4px 7px;color:#d6c36b;background:#171712;border-bottom:1px solid #4d4b3a;font-size:10px;text-shadow:1px 1px #000}
      #${ROOT_ID} .mcs-body{max-height:460px;overflow:auto;padding:6px;background:rgba(8,9,8,.46);scrollbar-color:#77766d #171817;scrollbar-width:thin}
      #${ROOT_ID} .mcs-character{margin-bottom:6px;border:1px solid #55564f;background:rgba(12,13,12,.9);box-shadow:inset 0 0 0 1px #090909}
      #${ROOT_ID} .mcs-character:last-child{margin-bottom:0}
      #${ROOT_ID} .mcs-character-head{display:flex;justify-content:space-between;align-items:center;padding:5px 7px;background:linear-gradient(#2f302d,#191a18);border-bottom:1px solid #595a53;box-shadow:inset 0 1px rgba(255,255,255,.08);cursor:pointer;user-select:none}
      #${ROOT_ID} .mcs-character-head:hover{filter:brightness(1.14)}
      #${ROOT_ID} .mcs-character-name{display:flex;align-items:center;gap:5px;min-width:0}
      #${ROOT_ID} .mcs-collapse-arrow{width:10px;color:#d8c66c;font-size:8px;font-style:normal;text-align:center;text-shadow:1px 1px #000}
      #${ROOT_ID} .mcs-character-head strong{display:block;color:#f1d66c;font-size:12px;text-shadow:1px 1px #000}
      #${ROOT_ID} .mcs-character-head span{display:block;color:#b8b8b1;font-size:9px;margin-top:1px}
      #${ROOT_ID} .mcs-updated{color:#aaa;font-size:9px;text-align:right}
      #${ROOT_ID} .mcs-summary{display:flex;justify-content:space-between;gap:8px;padding:3px 7px;color:#c6c6bf;font-size:9px;border-bottom:1px solid #353631;background:#111210}
      #${ROOT_ID} .mcs-gold{color:#f0d45b;font-weight:bold;text-shadow:1px 1px #000;white-space:nowrap}
      #${ROOT_ID} .mcs-character-collapsed .mcs-character-head{border-bottom:0}
      #${ROOT_ID} .mcs-character-collapsed .mcs-summary,#${ROOT_ID} .mcs-character-collapsed .mcs-grid{display:none}
      #${ROOT_ID} .mcs-grid{display:grid;grid-template-columns:repeat(7,38px);gap:4px;padding:6px;min-height:50px}
      #${ROOT_ID} .mcs-item{position:relative;width:38px;height:38px;border:2px solid #747873;background:linear-gradient(135deg,#202220,#0c0d0c);box-shadow:inset 0 0 0 1px #050505,inset 0 0 6px #000;display:flex;align-items:center;justify-content:center}
      #${ROOT_ID} .mcs-item:hover{filter:brightness(1.2);box-shadow:inset 0 0 0 1px #050505,inset 0 0 6px #000,0 0 3px #ddd}
      #${ROOT_ID} .mcs-item img{display:block;max-width:34px;max-height:34px;image-rendering:auto}
      #${ROOT_ID} .mcs-item.rarity-upg{border-color:#7a8a91}#${ROOT_ID} .mcs-item.rarity-uni{border-color:#f4db00}#${ROOT_ID} .mcs-item.rarity-her{border-color:#18c8ff;box-shadow:0 0 5px #14aee0,inset 0 0 5px #000}#${ROOT_ID} .mcs-item.rarity-leg{border-color:#ff9e00;box-shadow:0 0 5px #d88000,inset 0 0 5px #000}
      #${ROOT_ID} .mcs-amount{position:absolute;right:1px;bottom:0;color:#fff;font:bold 10px Arial;text-shadow:-1px -1px #000,1px 1px #000,1px -1px #000,-1px 1px #000}
      #${ROOT_ID} .mcs-no-icon{color:#777;font:bold 20px Arial}
      #mcs-character-storage-tooltip{display:none;position:fixed;z-index:2147483647;min-width:175px;max-width:285px;padding:8px 10px;border:1px solid #777;background:rgba(12,12,12,.97);box-shadow:0 2px 8px #000;color:#ddd;font:12px Arial,sans-serif;pointer-events:none}
      #mcs-character-storage-tooltip strong{display:block;margin-bottom:5px;color:#eee;font-size:13px}
      #mcs-character-storage-tooltip .mcs-tip-rarity{font-weight:bold;text-transform:capitalize}
      #mcs-character-storage-tooltip .rarity-leg{color:#ff9e00}#mcs-character-storage-tooltip .rarity-her{color:#22cfff}#mcs-character-storage-tooltip .rarity-uni{color:#f2de25}#mcs-character-storage-tooltip .rarity-upg{color:#a8bac2}#mcs-character-storage-tooltip .rarity-norm{color:#bbb}
      #mcs-character-storage-tooltip small{display:block;margin-top:5px;padding-top:5px;border-top:1px solid #444;color:#999}
      #mcs-character-storage-tooltip.mcs-rich-tip{max-width:390px;padding:0;border-color:#555;background:rgba(8,8,8,.98)}
      #mcs-character-storage-tooltip.mcs-rich-tip[data-item-type="t-upgraded"]{border-color:#e35aad;box-shadow:0 0 0 1px #50183e,0 2px 8px #000}
      #mcs-character-storage-tooltip.mcs-rich-tip[data-item-type="t-uniupg"]{border-color:#e6d200;box-shadow:0 0 0 1px #675f00,0 2px 8px #000}
      #mcs-character-storage-tooltip.mcs-rich-tip[data-item-type="t-her"]{border-color:#19cfff;box-shadow:0 0 0 1px #075a70,0 2px 8px #000}
      #mcs-character-storage-tooltip.mcs-rich-tip[data-item-type="t-leg"]{border-color:#ff9e00;box-shadow:0 0 0 1px #743f00,0 2px 8px #000}
      #mcs-character-storage-tooltip .mcs-game-tip{padding:7px 9px}
      #mcs-character-storage-tooltip .mcs-tip-owner{display:block;margin:0 8px 7px;padding-top:5px;border-top:1px solid #444;color:#999;font-size:10px}
      #mcs-character-storage-tooltip .mcs-forced-tip-head{display:flex!important;align-items:center!important;gap:8px!important;margin:0 0 7px!important;padding:0 0 7px!important;border-bottom:1px solid #555!important}
      #mcs-character-storage-tooltip .mcs-forced-tip-meta{min-width:0;line-height:1.25}
      #mcs-character-storage-tooltip .mcs-forced-tip-meta strong{display:block;margin:0 0 3px;font-size:13px}
      #mcs-character-storage-tooltip .mcs-forced-tip-meta strong.rarity-leg{color:#ff9e00}#mcs-character-storage-tooltip .mcs-forced-tip-meta strong.rarity-her{color:#22cfff}#mcs-character-storage-tooltip .mcs-forced-tip-meta strong.rarity-uni{color:#f2de25}#mcs-character-storage-tooltip .mcs-forced-tip-meta strong.rarity-upg{color:#e36bb1}#mcs-character-storage-tooltip .mcs-forced-tip-meta strong.rarity-norm{color:#eee}
      #mcs-character-storage-tooltip .mcs-forced-tip-meta span{display:block;color:#aaa;font-size:11px;white-space:pre-line}
      .tip-layer{z-index:2147483646!important}
      .tip-layer .tip-wrapper,.tip-layer .cmp-tip{z-index:2147483647!important}
      .tip-layer .mcs-saved-tip-item,#mcs-character-storage-tooltip .mcs-saved-tip-item{position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;float:none!important;width:42px!important;height:42px!important;min-width:42px!important;margin-right:8px!important;border:2px solid #777!important;background:#151515!important;box-sizing:border-box!important;overflow:hidden!important}
      .tip-layer .mcs-saved-tip-item img,#mcs-character-storage-tooltip .mcs-saved-tip-item img{display:block!important;max-width:36px!important;max-height:36px!important}
      .tip-layer .mcs-saved-tip-item.rarity-uni,#mcs-character-storage-tooltip .mcs-saved-tip-item.rarity-uni{border-color:#f4db00!important}.tip-layer .mcs-saved-tip-item.rarity-her,#mcs-character-storage-tooltip .mcs-saved-tip-item.rarity-her{border-color:#18c8ff!important;box-shadow:0 0 5px #14aee0!important}.tip-layer .mcs-saved-tip-item.rarity-leg,#mcs-character-storage-tooltip .mcs-saved-tip-item.rarity-leg{border-color:#ff9e00!important;box-shadow:0 0 5px #d88000!important}.tip-layer .mcs-saved-tip-item.rarity-upg,#mcs-character-storage-tooltip .mcs-saved-tip-item.rarity-upg{border-color:#9aabb2!important}
      .tip-layer .mcs-saved-tip-amount,#mcs-character-storage-tooltip .mcs-saved-tip-amount{position:absolute;right:1px;bottom:0;color:#fff;font:bold 10px Arial;text-shadow:-1px -1px #000,1px 1px #000,1px -1px #000,-1px 1px #000}
      #${ROOT_ID} .mcs-empty,#${ROOT_ID} .mcs-welcome{grid-column:1/-1;padding:14px 8px;color:#aaa;text-align:center;line-height:1.5}
      #${ROOT_ID} .mcs-footer{padding:4px;text-align:center;color:#817f74;font-size:8px;border-top:1px solid #484942;background:#10110f}
      #${ROOT_ID}.mcs-minimized{width:270px}
      #${ROOT_ID}.mcs-minimized .mcs-controls,#${ROOT_ID}.mcs-minimized .mcs-status,#${ROOT_ID}.mcs-minimized .mcs-body,#${ROOT_ID}.mcs-minimized .mcs-footer{display:none}
      #${ROOT_ID} .mcs-launcher{display:none;width:36px;height:36px;border:1px solid #ccc;border-radius:4px;background:linear-gradient(#3b3c38,#151614);color:#f0d769;font-size:18px;box-shadow:0 0 0 1px #050505,0 0 0 2px #777,2px 2px 4px #000}
      #${ROOT_ID}.mcs-closed{width:auto;filter:none}
      #${ROOT_ID}.mcs-closed .mcs-panel{display:none}#${ROOT_ID}.mcs-closed .mcs-launcher{display:block}
    `;
    document.head.appendChild(style);
  }

  function makeDraggable(handle) {
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = root.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const x = Math.max(0, Math.min(innerWidth - root.offsetWidth, event.clientX - drag.dx));
      const y = Math.max(0, Math.min(innerHeight - 34, event.clientY - drag.dy));
      root.style.left = `${x}px`;
      root.style.top = `${y}px`;
    });
    const stop = () => {
      if (!drag) return;
      drag = null;
      const rect = root.getBoundingClientRect();
      saveUiState({ x: Math.round(rect.left), y: Math.round(rect.top) });
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  function moveTooltip(event) {
    if (!tooltip || tooltip.style.display === "none") return;
    const gap = 14;
    let left = event.clientX + gap;
    let top = event.clientY + gap;
    if (left + tooltip.offsetWidth > innerWidth - 5) left = event.clientX - tooltip.offsetWidth - gap;
    if (top + tooltip.offsetHeight > innerHeight - 5) top = event.clientY - tooltip.offsetHeight - gap;
    tooltip.style.left = `${Math.max(5, left)}px`;
    tooltip.style.top = `${Math.max(5, top)}px`;
  }

  function showItemTooltip(item, event) {
    if (!tooltip || !item) return;
    const rarity = item.dataset.rarity || "norm";
    const character = (getDatabase().worlds[getWorld()] || {})[item.dataset.characterKey];
    const savedItem = character?.items?.find((entry) => String(entry.id) === String(item.dataset.itemId));
    if (savedItem?.tipHtml) {
      tooltip.className = "tip-wrapper mcs-rich-tip";
      tooltip.setAttribute("data-type", "t_item");
      tooltip.setAttribute("data-tip-type", "t_item");
      tooltip.setAttribute("data-item-type", RARITY_TIP_TYPES[savedItem.rarity] || "t-norm");
      tooltip.innerHTML = `<div class="content mcs-game-tip">${savedItem.tipHtml}</div><span class="mcs-tip-owner">Torba postaci: ${escapeHtml(item.dataset.character || "?")}</span>`;
      installStoredItemHeader(tooltip.querySelector(".mcs-game-tip"), savedItem, item);
    } else {
      tooltip.className = "";
      tooltip.removeAttribute("data-type");
      tooltip.removeAttribute("data-tip-type");
      tooltip.removeAttribute("data-item-type");
      tooltip.innerHTML = `
        <strong>${escapeHtml(item.dataset.name || "Przedmiot")}</strong>
        <div class="mcs-tip-rarity rarity-${escapeHtml(rarity)}">${escapeHtml(RARITY_LABELS[rarity] || "zwykły")}</div>
        <div>Ilość: <b>${escapeHtml(item.dataset.amount || "1")}</b></div>
        <small>Torba postaci: ${escapeHtml(item.dataset.character || "?")}</small>`;
    }
    tooltip.style.display = "block";
    moveTooltip(event);
  }

  function createUi() {
    if (document.getElementById(ROOT_ID)) return;
    injectStyles();
    const ui = getUiState();
    root = document.createElement("div");
    root.id = ROOT_ID;
    if (Number.isFinite(ui.x)) root.style.left = `${Math.max(0, Math.min(innerWidth - 60, ui.x))}px`;
    if (Number.isFinite(ui.y)) root.style.top = `${Math.max(0, Math.min(innerHeight - 40, ui.y))}px`;
    root.classList.toggle("mcs-minimized", Boolean(ui.minimized));
    root.classList.toggle("mcs-closed", ui.open === false);
    root.innerHTML = `
      <div class="mcs-panel">
        <div class="mcs-header"><span class="mcs-title">🎒 Magazyn Postaci</span><span class="mcs-version">v${VERSION}</span><button class="mcs-min" title="Minimalizuj">${ui.minimized ? "+" : "−"}</button></div>
        <div class="mcs-controls"><input class="mcs-search" type="search" placeholder="Szukaj przedmiotu…"><button class="mcs-refresh">Odśwież</button><select class="mcs-select"></select></div>
        <div class="mcs-status">Ładowanie danych postaci…</div>
        <div class="mcs-body"></div>
        <div class="mcs-footer">Dane są zapisywane tylko lokalnie w tej przeglądarce.</div>
      </div>
      <button class="mcs-launcher" title="Otwórz Magazyn Postaci">🎒</button>`;
    document.documentElement.appendChild(root);
    tooltip = document.createElement("div");
    tooltip.id = "mcs-character-storage-tooltip";
    document.documentElement.appendChild(tooltip);
    panel = root.querySelector(".mcs-panel");
    launcher = root.querySelector(".mcs-launcher");
    makeDraggable(root.querySelector(".mcs-header"));

    root.querySelector(".mcs-min").addEventListener("click", () => {
      const minimized = !root.classList.contains("mcs-minimized");
      root.classList.toggle("mcs-minimized", minimized);
      root.querySelector(".mcs-min").textContent = minimized ? "+" : "−";
      saveUiState({ minimized });
    });
    launcher.addEventListener("click", () => {
      root.classList.remove("mcs-closed");
      saveUiState({ open: true });
    });
    root.querySelector(".mcs-search").addEventListener("input", (event) => {
      searchQuery = event.target.value;
      scheduleRender();
    });
    root.querySelector(".mcs-select").addEventListener("change", (event) => {
      selectedCharacter = event.target.value;
      scheduleRender();
    });
    root.addEventListener("click", (event) => {
      const header = event.target.closest?.(".mcs-character-head");
      const character = header?.closest?.(".mcs-character");
      if (!header || !character || !root.contains(character)) return;
      const key = String(character.dataset.characterKey || "");
      if (!key) return;
      const collapsed = new Set(Array.isArray(getUiState().collapsedCharacters) ? getUiState().collapsedCharacters.map(String) : []);
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      saveUiState({ collapsedCharacters: [...collapsed] });
      scheduleRender();
    });
    const scrollBody = root.querySelector(".mcs-body");
    scrollBody.addEventListener("wheel", (event) => {
      if (scrollBody.scrollHeight <= scrollBody.clientHeight) return;
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 28 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? scrollBody.clientHeight : 1;
      scrollBody.scrollTop += event.deltaY * multiplier;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, passive: false });
    root.querySelector(".mcs-refresh").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Czytam…";
      await snapshotCurrentCharacter(true);
      button.disabled = false;
      button.textContent = "Odśwież";
    });
    root.addEventListener("pointerover", (event) => {
      const item = event.target.closest?.(".mcs-item");
      if (item && root.contains(item)) showItemTooltip(item, event);
    });
    root.addEventListener("pointermove", moveTooltip);
    root.addEventListener("pointerout", (event) => {
      const item = event.target.closest?.(".mcs-item");
      if (item && !item.contains(event.relatedTarget)) tooltip.style.display = "none";
    });
    render();
  }

  function watchInventory() {
    if (inventoryObserver) return;
    let timer = null;
    inventoryObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        return target && !target.closest(`#${ROOT_ID}`) && (target.closest(".inner-grid,.inventory-grid,.inventory-item") || [...mutation.addedNodes].some((node) => node instanceof Element && node.matches?.(".inventory-item,.inner-grid,.inventory-grid")));
      });
      if (!relevant) return;
      clearTimeout(timer);
      timer = setTimeout(() => snapshotCurrentCharacter(false), 800);
    });
    inventoryObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  }

  async function waitForGame() {
    const started = Date.now();
    while (Date.now() - started < 60000) {
      if (getHero() && getEngine()?.items) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }

  async function start() {
    createUi();
    const ready = await waitForGame();
    if (!ready) {
      panel.querySelector(".mcs-status").textContent = "Nie udało się odczytać silnika gry. Odśwież stronę.";
      return;
    }
    await snapshotCurrentCharacter(true);
    watchInventory();
    setInterval(() => snapshotCurrentCharacter(false), SCAN_INTERVAL);
  }

  start().catch((error) => console.error("[Magazyn Postaci] Błąd uruchamiania:", error));
})();
