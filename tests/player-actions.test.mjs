import test from 'node:test';
import assert from 'node:assert/strict';
import module from '../modules/player-actions.js';

test('does not color or hide YssPack settings while styling game actions', () => {
  const original = Object.fromEntries(['Element', 'Document', 'document', 'location', 'MutationObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class FakeElement {
    constructor(text, inPanel = false) { this.textContent = text; this.inPanel = inPanel; this.dataset = {}; }
    closest() { return this.inPanel ? {} : null; }
    querySelectorAll() { return []; }
    remove() {}
  }
  class FakeDocument {}
  const setting = new FakeElement('Nawiguj', true);
  const action = new FakeElement('Nawiguj');
  const document = new FakeDocument();
  document.createElement = () => new FakeElement('');
  document.documentElement = { append() {} };
  document.querySelectorAll = () => [setting, action];
  let onMutation;
  try {
    Object.assign(globalThis, { Element: FakeElement, Document: FakeDocument, document, location: { hostname: 'luvia.margonem.pl' }, MutationObserver: class {
      constructor(callback) { onMutation = callback; }
      observe() {}
      disconnect() {}
    } });
    const cleanup = module.start();
    assert.equal(setting.dataset.yssPlayerAction, undefined);
    assert.equal(action.dataset.yssPlayerAction, 'navigate');
    const addedSetting = new FakeElement('Handluj', true);
    onMutation([{ addedNodes: [addedSetting] }]);
    assert.equal(addedSetting.dataset.yssPlayerAction, undefined);
    cleanup();
    assert.equal(action.dataset.yssPlayerAction, undefined);
  } finally {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
