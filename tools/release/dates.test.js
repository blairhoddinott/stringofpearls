'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveReleaseDate, formatIsoDate, formatLongDate } = require('./dates');
const { ReleaseError } = require('./errors');

test('resolveReleaseDate prefers an explicit RELEASE_DATE', () => {
    const date = resolveReleaseDate({ RELEASE_DATE: '2026-09-22' });

    assert.equal(date.toISOString(), '2026-09-22T00:00:00.000Z');
});

test('resolveReleaseDate falls back to SOURCE_DATE_EPOCH seconds', () => {
    // 1_600_000_000 seconds == 2020-09-13T12:26:40Z
    const date = resolveReleaseDate({ SOURCE_DATE_EPOCH: '1600000000' });

    assert.equal(date.toISOString(), '2020-09-13T12:26:40.000Z');
});

test('resolveReleaseDate lets RELEASE_DATE win over SOURCE_DATE_EPOCH', () => {
    const date = resolveReleaseDate({ RELEASE_DATE: '2026-01-02', SOURCE_DATE_EPOCH: '1600000000' });

    assert.equal(formatIsoDate(date), '2026-01-02');
});

test('resolveReleaseDate fails closed on a malformed RELEASE_DATE', () => {
    assert.throws(() => resolveReleaseDate({ RELEASE_DATE: '2026-13-40' }), ReleaseError);
    assert.throws(() => resolveReleaseDate({ RELEASE_DATE: 'September 22, 2026' }), ReleaseError);
    assert.throws(() => resolveReleaseDate({ RELEASE_DATE: '2026-9-2' }), ReleaseError);
});

test('resolveReleaseDate fails closed on a malformed SOURCE_DATE_EPOCH', () => {
    assert.throws(() => resolveReleaseDate({ SOURCE_DATE_EPOCH: 'yesterday' }), ReleaseError);
    assert.throws(() => resolveReleaseDate({ SOURCE_DATE_EPOCH: '-5' }), ReleaseError);
});

test('resolveReleaseDate uses the injected clock only when no env override exists', () => {
    const fixedNow = Date.parse('2031-07-04T09:00:00Z');
    const date = resolveReleaseDate({}, { now: () => fixedNow });

    assert.equal(formatIsoDate(date), '2031-07-04');
});

test('resolveReleaseDate rejects an implicit wall clock', () => {
    assert.throws(
        () => resolveReleaseDate({}),
        (error) => error instanceof ReleaseError && error.code === 'missing-date'
    );
});

test('formatIsoDate and formatLongDate render deterministic UTC dates', () => {
    const date = new Date('2026-09-22T00:00:00.000Z');

    assert.equal(formatIsoDate(date), '2026-09-22');
    assert.equal(formatLongDate(date), 'September 22, 2026');
});
