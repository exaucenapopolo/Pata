import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceIsoDateRangeSelection, formatIsoDate, isDateInBounds, normalizeIsoDateRange, parseIsoDate } from '../src/lib/date/appCalendar.mjs';

test('parses valid local ISO dates and rejects impossible dates', () => {
  assert.equal(formatIsoDate(parseIsoDate('2026-11-17')), '2026-11-17');
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('17-11-2026'), null);
});

test('respects minimum and maximum date bounds', () => {
  assert.equal(isDateInBounds('2026-11-17', '2026-01-01', '2026-12-31'), true);
  assert.equal(isDateInBounds('2025-12-31', '2026-01-01', ''), false);
  assert.equal(isDateInBounds('2027-01-01', '', '2026-12-31'), false);
});

test('orders the selected date range chronologically', () => {
  assert.deepEqual(normalizeIsoDateRange('2026-11-30', '2026-11-01'), {
    startDate: '2026-11-01', endDate: '2026-11-30',
  });
});

test('keeps the first date while waiting for the second selection', () => {
  assert.deepEqual(normalizeIsoDateRange('2026-11-01', ''), {
    startDate: '2026-11-01', endDate: '',
  });
});


test('keeps the same calendar open after choosing the first range date', () => {
  assert.deepEqual(advanceIsoDateRangeSelection('', '', false, '2026-11-01'), {
    startDate: '2026-11-01', endDate: '', choosingEnd: true,
  });
});

test('completes a range on the second tap and supports reverse selection', () => {
  assert.deepEqual(advanceIsoDateRangeSelection('2026-11-30', '', true, '2026-11-01'), {
    startDate: '2026-11-01', endDate: '2026-11-30', choosingEnd: false,
  });
});

test('starts a new range on the next tap after a completed range', () => {
  assert.deepEqual(advanceIsoDateRangeSelection('2026-11-01', '2026-11-30', false, '2026-12-05'), {
    startDate: '2026-12-05', endDate: '', choosingEnd: true,
  });
});
