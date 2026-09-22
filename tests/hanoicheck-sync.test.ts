import assert from 'node:assert/strict';
import test from 'node:test';
import { extractNccCode, parseVietnameseDate, VIETNAM_UTC_OFFSET_HOURS } from '../lib/hanoicheck-sync';

test('extracts NCC code from a supplier food code suffix', () => {
  assert.equal(extractNccCode('CADIEUHONGPHILE-NCC07'), 'NCC-07');
  assert.equal(extractNccCode('BIXANH-NCC04'), 'NCC-04');
  assert.equal(extractNccCode('BOTCHIENXUVANGPANKO1KG-NCC13'), 'NCC-13');
  assert.equal(extractNccCode('GAOGTOP-ncc1'), 'NCC-01');
});

test('returns null when no NCC code can be parsed', () => {
  assert.equal(extractNccCode('KHOAITAY'), null);
  assert.equal(extractNccCode(''), null);
});

test('parses dd/mm/yyyy dates as Vietnam-local (UTC+7) midnight, not UTC midnight', () => {
  const date = parseVietnameseDate('23/09/2026');
  assert.ok(date);
  // 00:00 on 23/09 in Vietnam (UTC+7) is 17:00 UTC on the 22nd.
  assert.equal(date?.toISOString(), '2026-09-22T17:00:00.000Z');
});

test('a batch received "today" in Vietnam is never in the future relative to server UTC now', () => {
  const now = new Date();
  const vietnamNow = new Date(now.getTime() + VIETNAM_UTC_OFFSET_HOURS * 3600_000);
  const todayVietnam = `${String(vietnamNow.getUTCDate()).padStart(2, '0')}/${String(vietnamNow.getUTCMonth() + 1).padStart(2, '0')}/${vietnamNow.getUTCFullYear()}`;
  const parsed = parseVietnameseDate(todayVietnam);
  assert.ok(parsed);
  assert.ok((parsed as Date) <= now, `parsed ${parsed?.toISOString()} should not be after now ${now.toISOString()}`);
});

test('returns null for missing or malformed dates', () => {
  assert.equal(parseVietnameseDate(null), null);
  assert.equal(parseVietnameseDate('—'), null);
  assert.equal(parseVietnameseDate('2026-09-23'), null);
});
