import test from 'node:test';
import assert from 'node:assert/strict';
import { readSuperCast, formatStat, formatTurns } from '../modules/tytan-help.js';

test('reads the current cast, including zero progress', () => {
  assert.deepEqual(readSuperCast({ super_cast: { name: 'Tryptyk płonący', turn: 0, total_turns: 3 } }), { name: 'Tryptyk płonący', progress: 0, remaining: 3 });
  assert.deepEqual(readSuperCast({ super_cast: { name: 'Symfonia żywiołów', turn: 1, total_turns: 3 } }), { name: 'Symfonia żywiołów', progress: 33, remaining: 2 });
});

test('clears the cast when interrupted or completed', () => {
  const warrior = { super_cast: { name: 'Tryptyk płonący', turn: 2, total_turns: 3 } };
  assert.equal(readSuperCast(warrior).progress, 66);
  assert.equal(readSuperCast(warrior).remaining, 1);
  warrior.super_cast = null;
  assert.equal(readSuperCast(warrior), null);
  assert.equal(readSuperCast({}), null);
});

test('remaining turns are bounded and unknown values stay unknown', () => {
  const read = (turn, total_turns) => readSuperCast({ super_cast: { name: 'Cast', turn, total_turns } }).remaining;
  assert.equal(read(0, 0), 0);
  assert.equal(read(5, 3), 0);
  assert.equal(read(-1, 3), 3);
  assert.equal(read(undefined, 3), null);
  assert.equal(read(1, undefined), null);
  assert.deepEqual([0, 1, 2, 5, 12, 22].map(formatTurns), ['0 tur', '1 tura', '2 tury', '5 tur', '12 tur', '22 tury']);
});

test('base and positive or negative bonus remain separate', () => {
  assert.equal(formatStat({ cur: 497, bonus: 120 }), '497 (+120)');
  assert.equal(formatStat({ cur: 497, bonus: 0 }), '497');
  assert.equal(formatStat({ cur: 42, bonus: -10 }, '%'), '42% (-10%)');
  assert.equal(formatStat({ cur: '42', bonus: '15' }, '%'), '42% (+15%)');
  assert.equal(formatStat({ cur: 42 }, '%'), '42%');
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
