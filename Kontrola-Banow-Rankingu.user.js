// ==UserScript==
// @name         Margonem — Kontrola banów rankingu
// @namespace    krol-yss.margonem.ranking-ban-scanner
// @version      1.0.0
// @description  Sprawdza bany graczy nieaktywnych co najmniej 24 godziny na bieżącej stronie rankingu.
// @author       Król Yss
// @match        https://www.margonem.pl/ladder/*/players*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(async () => {
  'use strict';
  if (window.__YSS_RANKING_BAN_SCANNER__) return;
  window.__YSS_RANKING_BAN_SCANNER__ = true;

  try {
    const url = `https://acesafff-ship-it.github.io/ysspack/modules/ranking-ban-scanner.js?t=${Date.now()}`;
    const module = await import(url);
    window.__YSS_RANKING_BAN_SCANNER_CLEANUP__ = module.default.start();
  } catch (error) {
    delete window.__YSS_RANKING_BAN_SCANNER__;
    console.error('[Kontrola banów] Nie udało się uruchomić dodatku:', error);
  }
})();
