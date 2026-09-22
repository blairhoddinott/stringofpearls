'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    parseVersion,
    formatVersion,
    bumpLevelFromCommits,
    applyBump,
    computeNextVersion
} = require('./semver');
const { ReleaseError } = require('./errors');

test('parseVersion splits a clean semver', () => {
    assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: null });
});

test('parseVersion captures a prerelease suffix', () => {
    assert.deepEqual(parseVersion('6.29.0-BETA'), { major: 6, minor: 29, patch: 0, prerelease: 'BETA' });
});

test('parseVersion fails closed on malformed input', () => {
    for (const bad of ['1.2', 'v1.2.3', '1.2.3.4', 'x.y.z', '01.2.3', '', '1.2.-1']) {
        assert.throws(() => parseVersion(bad), ReleaseError, bad);
    }
});

test('formatVersion round-trips with and without a prerelease', () => {
    assert.equal(formatVersion({ major: 1, minor: 0, patch: 0, prerelease: null }), '1.0.0');
    assert.equal(formatVersion({ major: 2, minor: 4, patch: 6, prerelease: 'rc.1' }), '2.4.6-rc.1');
});

test('bumpLevelFromCommits honors precedence: breaking > feat > fix/perf', () => {
    const feat = { type: 'feat', breaking: false };
    const fix = { type: 'fix', breaking: false };
    const perf = { type: 'perf', breaking: false };
    const docs = { type: 'docs', breaking: false };
    const breaking = { type: 'refactor', breaking: true };

    assert.equal(bumpLevelFromCommits([breaking, feat, fix]), 'major');
    assert.equal(bumpLevelFromCommits([feat, fix, docs]), 'minor');
    assert.equal(bumpLevelFromCommits([fix, perf, docs]), 'patch');
    assert.equal(bumpLevelFromCommits([perf]), 'patch');
    assert.equal(bumpLevelFromCommits([docs, { type: 'chore', breaking: false }]), null);
    assert.equal(bumpLevelFromCommits([]), null);
});

test('applyBump zeroes lower components and clears any prerelease', () => {
    assert.equal(formatVersion(applyBump(parseVersion('1.4.7-BETA'), 'major')), '2.0.0');
    assert.equal(formatVersion(applyBump(parseVersion('1.4.7'), 'minor')), '1.5.0');
    assert.equal(formatVersion(applyBump(parseVersion('1.4.7'), 'patch')), '1.4.8');
});

test('computeNextVersion forces the bootstrap release to 1.0.0', () => {
    assert.equal(
        computeNextVersion({ currentVersion: '6.29.0-BETA', commits: [{ type: 'fix', breaking: false }], bootstrap: true }),
        '1.0.0'
    );
    // Bootstrap is forced even with breaking changes present.
    assert.equal(
        computeNextVersion({ currentVersion: '6.29.0-BETA', commits: [{ type: 'feat', breaking: true }], bootstrap: true }),
        '1.0.0'
    );
});

test('computeNextVersion bumps a normal release from the current version', () => {
    assert.equal(
        computeNextVersion({ currentVersion: '1.0.0', commits: [{ type: 'feat', breaking: false }], bootstrap: false }),
        '1.1.0'
    );
    assert.equal(
        computeNextVersion({ currentVersion: '1.4.2', commits: [{ type: 'fix', breaking: false }], bootstrap: false }),
        '1.4.3'
    );
    assert.equal(
        computeNextVersion({ currentVersion: '1.4.2', commits: [{ type: 'refactor', breaking: true }], bootstrap: false }),
        '2.0.0'
    );
});

test('computeNextVersion returns null when no release-worthy commits exist', () => {
    assert.equal(
        computeNextVersion({ currentVersion: '1.0.0', commits: [{ type: 'docs', breaking: false }], bootstrap: false }),
        null
    );
});

test('computeNextVersion fails closed on a malformed current version', () => {
    assert.throws(
        () => computeNextVersion({ currentVersion: 'not-a-version', commits: [{ type: 'feat', breaking: false }], bootstrap: false }),
        ReleaseError
    );
});
