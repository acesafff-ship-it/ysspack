// ==UserScript==
// @name         YssPack
// @namespace    acesaff-ysspack
// @version      0.5.0
// @description  YssPack — panel dodatków działający bezpośrednio w Margonem.
// @author       Król Yss
// @homepageURL  https://www.margonem.pl/profile/view,10050726#char_5601,luvia
// @icon         https://acesafff-ship-it.github.io/ysspack/assets/logo-ysspack.png
// @updateURL    https://raw.githubusercontent.com/acesafff-ship-it/ysspack/main/YssPack.user.js
// @downloadURL  https://raw.githubusercontent.com/acesafff-ship-it/ysspack/main/YssPack.user.js
// @match        https://*.margonem.pl/*
// @match        https://*.margonem.com/*
// @exclude      https://www.margonem.pl/*
// @exclude      https://forum.margonem.pl/*
// @exclude      https://www.margonem.com/*
// @exclude      https://forum.margonem.com/*
// @run-at       document-body
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      acesafff-ship-it.github.io
// @connect      raw.githubusercontent.com
// @connect      forum.margonem.pl
// ==/UserScript==

(() => {
  'use strict';

  if (document.yssPack?.loaderVersion) return;

  const BASE_URL = 'https://acesafff-ship-it.github.io/ysspack/';
  const LOADER_VERSION = '0.5.0';
  const now = new Date();
  const cacheKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');

  document.yssPack = {
    baseUrl: BASE_URL,
    loaderVersion: LOADER_VERSION,
    GM_addStyle,
    GM_getValue,
    GM_setValue,
    GM_deleteValue,
    GM_xmlhttpRequest
  };

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = `${BASE_URL}pack.css?t=${LOADER_VERSION}-${cacheKey}`;
  stylesheet.dataset.yssPack = 'style';

  const script = document.createElement('script');
  script.type = 'module';
  script.src = `${BASE_URL}pack.js?t=${LOADER_VERSION}-${cacheKey}`;
  script.dataset.yssPack = 'script';
  script.addEventListener('error', () => console.error('[YssPack] Nie udało się pobrać pack.js. Sprawdź publikację GitHub Pages.'));

  document.head.append(stylesheet, script);
})();
