import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../pack.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('function renderUpdateStatus()'), source.indexOf('async function checkPackVersion()'));

test('all update states render in the shared toolbar', () => {
  for (const [status, text] of [['checking', 'Sprawdzanie wersji'], ['current', 'YssPack jest aktualny'], ['error', 'Nie udało się sprawdzić'], ['outdated', 'Aktualizuj YssPack']]) {
    const context = { updateState: { status, latestVersion: '0.15.75' }, UPDATE_INSTALL_URL: 'https://example.com/YssPack.user.js', escapeHtml: String, packUpdate: { innerHTML: '' } };
    runInNewContext(`${renderer}\nrenderPackUpdate();`, context);
    assert.ok(context.packUpdate.innerHTML.includes(text));
    assert.equal((context.packUpdate.innerHTML.match(/<a /g) || []).length, status === 'outdated' ? 1 : 0);
  }
});

test('module details contain no pack update controls', () => {
  const details = source.slice(source.indexOf('function renderModuleDetails()'), source.indexOf('function renderUpdateStatus()'));
  assert.ok(!details.includes('renderUpdateStatus'));
  assert.ok(details.includes('mhp-detail-toggle'));
  assert.ok(details.includes('module.version'));
  assert.equal((source.match(/class="mhp-pack-update"/g) || []).length, 1);
  const check = source.slice(source.indexOf('async function checkPackVersion()'), source.indexOf('function compareVersions('));
  assert.ok(check.includes('renderPackUpdate()'));
  assert.ok(!check.includes('renderModuleDetails()'));
});
