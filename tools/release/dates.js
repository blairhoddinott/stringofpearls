'use strict';

const { ReleaseError } = require('./errors');

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EPOCH_PATTERN = /^\d+$/;

const LONG_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
});

/**
 * Resolve the release date deterministically.
 *
 * Precedence is RELEASE_DATE, then SOURCE_DATE_EPOCH, then an explicitly
 * injected clock. There is no implicit wall-clock fallback.
 *
 * @param {Record<string, string|undefined>} [env]
 * @param {{ now?: () => number }} [options]
 * @returns {Date} a UTC-anchored release date
 * @throws {ReleaseError} when an override is present but malformed
 */
function resolveReleaseDate(env = process.env, { now } = {}) {
    const releaseDate = env.RELEASE_DATE;

    if (releaseDate !== undefined && releaseDate !== '') {
        if (!ISO_DATE_PATTERN.test(releaseDate)) {
            throw new ReleaseError(`RELEASE_DATE must be an ISO date (YYYY-MM-DD): ${JSON.stringify(releaseDate)}`, 'invalid-date');
        }

        const date = new Date(`${releaseDate}T00:00:00.000Z`);

        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== releaseDate) {
            throw new ReleaseError(`RELEASE_DATE is not a real calendar date: ${JSON.stringify(releaseDate)}`, 'invalid-date');
        }

        return date;
    }

    const epoch = env.SOURCE_DATE_EPOCH;

    if (epoch !== undefined && epoch !== '') {
        if (!EPOCH_PATTERN.test(epoch)) {
            throw new ReleaseError(`SOURCE_DATE_EPOCH must be a non-negative integer of seconds: ${JSON.stringify(epoch)}`, 'invalid-date');
        }

        return new Date(Number(epoch) * 1000);
    }

    if (typeof now !== 'function') {
        throw new ReleaseError('RELEASE_DATE or SOURCE_DATE_EPOCH is required', 'missing-date');
    }

    return new Date(now());
}

/**
 * @param {Date} date
 * @returns {string} the date as YYYY-MM-DD in UTC
 */
function formatIsoDate(date) {
    return date.toISOString().slice(0, 10);
}

/**
 * @param {Date} date
 * @returns {string} the date as e.g. "September 22, 2026" in UTC
 */
function formatLongDate(date) {
    return LONG_DATE_FORMAT.format(date);
}

module.exports = { resolveReleaseDate, formatIsoDate, formatLongDate };
