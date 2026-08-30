import test from 'node:test';
import assert from 'node:assert/strict';
import { isBattleEffect } from '../modules/battle-log-reader.js';

test('recognizes standalone effects with native prefixes', () => {
  for (const value of ['+Zamrożenie', '+Cios krytyczny', '+Cios bardzo krytyczny', '+Cios krytyczny broni pomocniczej', '-Unik', '+Przebicie', '+Ogłuszenie', '+Dotyk anioła', 'Przerwanie ciosu specjalnego.']) assert.ok(isBattleEffect(value), value);
});
test('does not decorate damage, players or incidental mentions', () => {
  for (const value of ['Król Yss', '+1250', 'otrzymał 120 obrażeń', 'Gracz wykonuje Zamrożenie.', 'Zamrożenie(100%) uderzył', '+Niszczenie pancerza o 15', '']) assert.ok(!isBattleEffect(value), value);
});
