import test from 'node:test';
import assert from 'node:assert/strict';
import { readSuperCast } from '../modules/tytan-help.js';

test('reads the current cast, including zero progress', () => {
  assert.deepEqual(readSuperCast({ super_cast: { name: 'Tryptyk płonący', turn: 0, total_turns: 3 } }), { name: 'Tryptyk płonący', progress: 0 });
  assert.deepEqual(readSuperCast({ super_cast: { name: 'Symfonia żywiołów', turn: 1, total_turns: 3 } }), { name: 'Symfonia żywiołów', progress: 33 });
});

test('clears the cast when interrupted or completed', () => {
  const warrior = { super_cast: { name: 'Tryptyk płonący', turn: 2, total_turns: 3 } };
  assert.equal(readSuperCast(warrior).progress, 66);
  warrior.super_cast = null;
  assert.equal(readSuperCast(warrior), null);
  assert.equal(readSuperCast({}), null);
});

test('handles instant, string, invalid and out-of-range progress', () => {
  const read = (turn, total_turns) => readSuperCast({ super_cast: { name: 'Cast', turn, total_turns } }).progress;
  assert.equal(read(0, 0), 100);
  assert.equal(read('1', '2'), 50);
  assert.equal(read(5, 2), 100);
  assert.equal(read(-1, 2), 0);
  assert.equal(read(undefined, 2), null);
  assert.equal(read(1, undefined), null);
  assert.equal(read('invalid', 2), null);
  assert.equal(readSuperCast({ super_cast: { name: ' ' } }), null);
});
