'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { renderReleaseDoc } = require('./release-doc');

test('renderReleaseDoc renders the latest release with canonical links', () => {
    const doc = renderReleaseDoc({
        version: '1.0.0',
        longDate: 'September 22, 2026',
        releaseBody: '### Features\n\n- **traffic:** add mode selection',
        repoUrl: 'https://github.com/blairhoddinott/stringofpearls',
        tag: 'v1.0.0'
    });

    assert.match(doc, /^# String of Pearls releases/);
    assert.match(doc, /Latest release — v1\.0\.0 \(September 22, 2026\)/);
    assert.match(doc, /add mode selection/);
    assert.match(doc, /https:\/\/github\.com\/blairhoddinott\/stringofpearls\/releases\/tag\/v1\.0\.0/);
    assert.match(doc, /\[CHANGELOG\.md\]\(\.\.\/CHANGELOG\.md\)/);
    assert.ok(doc.endsWith('\n'));
});
