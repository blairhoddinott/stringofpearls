'use strict';

// Focused characterization of the in-app changelog extraction. The dialog must
// render only the newest release body while still recognizing the inherited
// `# X.Y.Z (Month D, YYYY)` headings as section boundaries.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { renderChangelogHtml } = require('./build');

const MODERN_CHANGELOG = [
    '# Changelog',
    '',
    'All notable changes are documented here.',
    '',
    '## [1.1.0] - 2026-10-01',
    '',
    '### Features',
    '',
    '- **traffic:** add mode selection',
    '',
    '## [1.0.0] - 2026-09-22',
    '',
    '### Features',
    '',
    '- **strips:** first release feature',
    '',
    '# 6.29.0 (October 1, 2022)',
    '### New Features',
    '- inherited feature',
    ''
].join('\n');

const INHERITED_ONLY_CHANGELOG = [
    '# 6.29.0 (October 1, 2022)',
    '### New Features',
    '- inherited feature',
    '',
    '# 6.28.0 (July 3, 2022)',
    '### New Features',
    '- older inherited feature',
    ''
].join('\n');

test('renderChangelogHtml renders only the newest modern release body', () => {
    const html = renderChangelogHtml(MODERN_CHANGELOG);

    assert.match(html, /add mode selection/);
    assert.doesNotMatch(html, /first release feature/);
    assert.doesNotMatch(html, /inherited feature/);
    assert.doesNotMatch(html, /All notable changes/);
});

test('renderChangelogHtml stays compatible with inherited-only changelogs', () => {
    const html = renderChangelogHtml(INHERITED_ONLY_CHANGELOG);

    assert.match(html, /inherited feature/);
    assert.doesNotMatch(html, /older inherited feature/);
});

test('renderChangelogHtml fails closed when there is no release heading', () => {
    assert.throws(() => renderChangelogHtml('# Changelog\n\nNothing here.\n'));
});
