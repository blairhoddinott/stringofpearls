'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    renderReleaseHeading,
    isReleaseHeading,
    splitReleaseSections,
    newestReleaseBody,
    changelogContainsVersion,
    prependRelease
} = require('./changelog');
const { ReleaseError } = require('./errors');

const CHANGELOG = [
    '# Changelog',
    '',
    'Intro paragraph about String of Pearls.',
    '',
    '## [1.0.0] - 2026-09-22',
    '',
    '### Features',
    '',
    '- **traffic:** add mode selection',
    '',
    '# 6.29.0 (October 1, 2022)',
    '### New Features',
    '- old inherited feature',
    ''
].join('\n');

test('renderReleaseHeading emits a Keep-a-Changelog heading', () => {
    assert.equal(renderReleaseHeading('1.0.0', '2026-09-22'), '## [1.0.0] - 2026-09-22');
});

test('isReleaseHeading matches both the String of Pearls and inherited formats', () => {
    assert.equal(isReleaseHeading('## [1.0.0] - 2026-09-22'), true);
    assert.equal(isReleaseHeading('## [10.20.30] - 2026-09-22'), true);
    assert.equal(isReleaseHeading('# 6.29.0 (October 1, 2022)'), true);
    assert.equal(isReleaseHeading('# 3.1.0 (November 20, 2016)'), true);
    assert.equal(isReleaseHeading('# Changelog'), false);
    assert.equal(isReleaseHeading('### Features'), false);
    assert.equal(isReleaseHeading('## Inherited openScope history'), false);
});

test('splitReleaseSections separates preamble and every release body', () => {
    const sections = splitReleaseSections(CHANGELOG);

    assert.equal(sections.length, 3);
    assert.match(sections[0], /# Changelog/);
});

test('newestReleaseBody returns only the newest release body', () => {
    const body = newestReleaseBody(CHANGELOG);

    assert.match(body, /add mode selection/);
    assert.doesNotMatch(body, /old inherited feature/);
    assert.doesNotMatch(body, /Intro paragraph/);
});

test('newestReleaseBody fails closed when there is no release heading', () => {
    assert.throws(() => newestReleaseBody('# Changelog\n\nNothing here.\n'), ReleaseError);
});

test('changelogContainsVersion sees existing releases in either format', () => {
    assert.equal(changelogContainsVersion(CHANGELOG, '1.0.0'), true);
    assert.equal(changelogContainsVersion(CHANGELOG, '6.29.0'), true);
    assert.equal(changelogContainsVersion(CHANGELOG, '2.0.0'), false);
});

test('prependRelease inserts the new section as the newest, preserving history', () => {
    const section = ['## [1.1.0] - 2026-10-01', '', '### Features', '', '- **nav:** brand new capability'].join('\n');
    const updated = prependRelease(CHANGELOG, section);

    // The new release is now the newest one rendered in-app.
    assert.match(newestReleaseBody(updated), /brand new capability/);
    assert.doesNotMatch(newestReleaseBody(updated), /add mode selection/);

    // History is preserved: the 1.0.0 and inherited sections still exist.
    assert.match(updated, /## \[1\.0\.0\] - 2026-09-22/);
    assert.match(updated, /# 6\.29\.0 \(October 1, 2022\)/);
    assert.equal(splitReleaseSections(updated).length, 4);

    // The preamble is untouched and still leads the document.
    assert.ok(updated.startsWith('# Changelog'));
});

test('prependRelease fails closed when the changelog has no release heading', () => {
    assert.throws(() => prependRelease('# Changelog\n\nNothing.\n', '## [1.0.0] - 2026-09-22\n\nbody'), ReleaseError);
});
