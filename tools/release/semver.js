'use strict';

const { ReleaseError } = require('./errors');

// Core semver: three non-negative integers without leading zeroes, plus an
// optional dot-separated prerelease. Build metadata is intentionally
// unsupported because the release automation never emits it.
const VERSION_PATTERN = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const BOOTSTRAP_VERSION = '1.0.0';

const BUMP_BY_TYPE = new Map([
    ['feat', 'minor'],
    ['fix', 'patch'],
    ['perf', 'patch']
]);

const BUMP_RANK = { major: 3, minor: 2, patch: 1 };

/**
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number, prerelease: string|null }}
 * @throws {ReleaseError} when the string is not a valid semantic version
 */
function parseVersion(version) {
    const match = typeof version === 'string' ? VERSION_PATTERN.exec(version) : null;

    if (!match) {
        throw new ReleaseError(`invalid semantic version: ${JSON.stringify(version)}`, 'invalid-version');
    }

    return {
        major: Number(match.groups.major),
        minor: Number(match.groups.minor),
        patch: Number(match.groups.patch),
        prerelease: match.groups.prerelease || null
    };
}

/**
 * @param {{ major: number, minor: number, patch: number, prerelease?: string|null }} version
 * @returns {string}
 */
function formatVersion(version) {
    const core = `${version.major}.${version.minor}.${version.patch}`;

    return version.prerelease ? `${core}-${version.prerelease}` : core;
}

/**
 * @param {Array<{ type: string, breaking: boolean }>} commits
 * @returns {'major'|'minor'|'patch'|null} the highest bump the commits demand, or null for none
 */
function bumpLevelFromCommits(commits) {
    let level = null;

    for (const commit of commits) {
        const candidate = commit.breaking ? 'major' : BUMP_BY_TYPE.get(commit.type) || null;

        if (candidate && (level === null || BUMP_RANK[candidate] > BUMP_RANK[level])) {
            level = candidate;
        }
    }

    return level;
}

/**
 * @param {{ major: number, minor: number, patch: number }} version
 * @param {'major'|'minor'|'patch'} level
 * @returns {{ major: number, minor: number, patch: number, prerelease: null }}
 * @throws {ReleaseError} on an unknown bump level
 */
function applyBump(version, level) {
    switch (level) {
        case 'major':
            return { major: version.major + 1, minor: 0, patch: 0, prerelease: null };
        case 'minor':
            return { major: version.major, minor: version.minor + 1, patch: 0, prerelease: null };
        case 'patch':
            return { major: version.major, minor: version.minor, patch: version.patch + 1, prerelease: null };
        default:
            throw new ReleaseError(`unknown bump level: ${JSON.stringify(level)}`, 'invalid-bump');
    }
}

/**
 * Decide the next version.
 *
 * The bootstrap release is forced to 1.0.0 regardless of the commits or the
 * inherited version, per the independent-versioning decision for String of
 * Pearls. A normal release bumps from the current version according to the
 * commits, or returns null when no release-worthy commit is present.
 *
 * @param {{ currentVersion: string, commits: Array<object>, bootstrap?: boolean }} params
 * @returns {string|null} the next version string, or null when nothing is releasable
 * @throws {ReleaseError} when the current version is malformed
 */
function computeNextVersion({ currentVersion, commits, bootstrap = false }) {
    // Validate the current version even on the bootstrap path so a corrupt
    // package.json is always reported rather than silently ignored.
    parseVersion(currentVersion);

    if (bootstrap) {
        return BOOTSTRAP_VERSION;
    }

    const level = bumpLevelFromCommits(commits);

    if (level === null) {
        return null;
    }

    return formatVersion(applyBump(parseVersion(currentVersion), level));
}

module.exports = {
    BOOTSTRAP_VERSION,
    parseVersion,
    formatVersion,
    bumpLevelFromCommits,
    applyBump,
    computeNextVersion
};
