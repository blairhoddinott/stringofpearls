'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { repoUrlFromManifest, bumpManifest, bumpLockfile } = require('./manifest');
const { ReleaseError } = require('./errors');

test('repoUrlFromManifest normalizes a git+https url object', () => {
    assert.equal(
        repoUrlFromManifest({ repository: { url: 'git+https://github.com/blairhoddinott/stringofpearls.git' } }),
        'https://github.com/blairhoddinott/stringofpearls'
    );
});

test('repoUrlFromManifest accepts a shorthand string repository', () => {
    assert.equal(repoUrlFromManifest({ repository: 'git+https://github.com/foo/bar.git' }), 'https://github.com/foo/bar');
    assert.equal(repoUrlFromManifest({ repository: { url: 'https://github.com/foo/bar' } }), 'https://github.com/foo/bar');
});

test('repoUrlFromManifest fails closed on a missing or non-GitHub repository', () => {
    assert.throws(() => repoUrlFromManifest({}), ReleaseError);
    assert.throws(() => repoUrlFromManifest({ repository: { url: 'git@github.com:foo/bar.git' } }), ReleaseError);
    assert.throws(() => repoUrlFromManifest({ repository: { url: 'https://gitlab.com/foo/bar' } }), ReleaseError);
});

test('bumpManifest updates only the version and preserves formatting', () => {
    const original = `${JSON.stringify({ name: 'stringofpearls', version: '6.29.0-BETA', scripts: { build: 'x' } }, null, 2)}\n`;
    const updated = bumpManifest(original, '1.0.0');
    const parsed = JSON.parse(updated);

    assert.equal(parsed.version, '1.0.0');
    assert.equal(parsed.name, 'stringofpearls');
    assert.deepEqual(parsed.scripts, { build: 'x' });
    assert.ok(updated.endsWith('\n'));
    assert.equal(updated, `${JSON.stringify(parsed, null, 2)}\n`);
});

test('bumpLockfile updates the root and root-package versions', () => {
    const original = `${JSON.stringify({
        name: 'stringofpearls',
        version: '6.29.0-BETA',
        lockfileVersion: 3,
        packages: {
            '': { name: 'stringofpearls', version: '6.29.0-BETA' },
            'node_modules/express': { version: '4.22.3' }
        }
    }, null, 2)}\n`;
    const updated = bumpLockfile(original, '1.0.0');
    const parsed = JSON.parse(updated);

    assert.equal(parsed.version, '1.0.0');
    assert.equal(parsed.packages[''].version, '1.0.0');
    // An unrelated dependency that happens to share no coupling stays put.
    assert.equal(parsed.packages['node_modules/express'].version, '4.22.3');
    assert.ok(updated.endsWith('\n'));
});

test('bumpLockfile fails closed when the lockfile has no root version', () => {
    const original = `${JSON.stringify({ name: 'stringofpearls', packages: {} }, null, 2)}\n`;

    assert.throws(() => bumpLockfile(original, '1.0.0'), ReleaseError);
});
