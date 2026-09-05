import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('player actions scans only likely menu controls', async () => {
  const source = await read('modules/player-actions.js');
  assert.match(source, /querySelectorAll\?\.\(CANDIDATE_SELECTOR\)/);
  assert.doesNotMatch(source, /querySelectorAll\?\.\('\*'\)/);
});

test('item tooltip hover state is cleared and listener is removed', async () => {
  const source = await read('modules/item-time.js');
  assert.match(source, /hoveredItemId = null/);
  assert.match(source, /addEventListener\('mouseout', onMouseOut, true\)/);
  assert.match(source, /removeEventListener\('mouseout', onMouseOut, true\)/);
});

test('async modules report startup errors to the pack', async () => {
  const [pack, bestiary, auction] = await Promise.all([
    read('pack.js'), read('modules/bestiary.js'), read('modules/auction-assistant.js')
  ]);
  assert.match(pack, /onError: error => failModule\(module, error\)/);
  assert.match(bestiary, /context\.onError\?\.\(error\)/);
  assert.match(auction, /context\.onError\?\.\(error\)/);
});

test('bestiary uses the current standalone source and lifecycle', async () => {
  const source = await read('modules/bestiary.js');
  assert.match(source, /margohelp-bestiariusz\/main\/MargoHelp-Bestiariusz\.user\.js/);
  assert.match(source, /__KROL_YSS_BESTIARY_LIFECYCLE__/);
});

test('pack modules load in parallel and cache by release version', async () => {
  const [loader, pack] = await Promise.all([read('YssPack.user.js'), read('pack.js')]);
  assert.match(pack, /Promise\.all\(moduleFiles\.map/);
  assert.doesNotMatch(pack, /moduleCacheKey/);
  assert.doesNotMatch(loader, /const cacheKey/);
});

test('auction assistant removes document listeners and limits DOM observation', async () => {
  const [source, wrapper] = await Promise.all([
    read('sources/auction-assistant.user.js'), read('modules/auction-assistant.js')
  ]);
  assert.match(source, /onRememberItemPointerDown/);
  assert.match(source, /observer\.observe\(document\.body/);
  assert.match(wrapper, /removeEventListener\("pointerdown", onRememberItemPointerDown/);
  assert.match(wrapper, /removeEventListener\("click", onRememberItemClick/);
});

test('chat icon retries and removed views are cleaned up', async () => {
  const source = await read('modules/chat-item-icons.js');
  assert.match(source, /const retryTimers = new Set/);
  assert.match(source, /function releaseRemovedTree/);
  assert.match(source, /retryTimers\.forEach\(clearTimeout\)/);
});
