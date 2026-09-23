'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { createGit, assertValidSignatureStatus } = require('./git');
const { SIGNING_FINGERPRINT } = require('./constants');

let repo;

// A deterministic, unsigned git environment. These tests only exercise the
// non-signing collaborator methods; commit and tag signing require the fixed
// OpenPGP key and are covered by the pure git-command builders instead.
const GIT_ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
};

async function git(args) {
    await execFileAsync('git', args, { cwd: repo, env: GIT_ENV });
}

before(async () => {
    repo = await fsp.mkdtemp(path.join(os.tmpdir(), 'sop-git-test-'));
    await git(['init', '--quiet', '--initial-branch=master']);
    await fsp.writeFile(path.join(repo, 'a.txt'), 'one\n');
    await git(['add', '--', 'a.txt']);
    await git(['commit', '--quiet', '--no-gpg-sign', '--message', 'feat(x): first']);
    await git(['tag', '--annotate', '--message', 'r', 'v1.0.0']);
    await git(['tag', '--annotate', '--message', 'r', 'v1.2.0']);
    await git(['tag', '--annotate', '--message', 'r', 'nightly']);
});

after(async () => {
    await fsp.rm(repo, { recursive: true, force: true });
});

test('listSemverTags returns only version-shaped tags', async () => {
    const collaborator = createGit({ cwd: repo });
    const tags = await collaborator.listSemverTags();

    assert.deepEqual(tags.sort(), ['v1.0.0', 'v1.2.0']);
});

test('assertValidSignatureStatus requires Balder primary fingerprint', () => {
    const signingSubkey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const status = `[GNUPG:] VALIDSIG ${signingSubkey} 2026-09-22 0 4 0 22 8 00 ${SIGNING_FINGERPRINT}\n`;

    assert.doesNotThrow(() => assertValidSignatureStatus(status));
    assert.throws(
        () => assertValidSignatureStatus(`[GNUPG:] VALIDSIG ${signingSubkey} 2026-09-22 0 4 0 22 8 00 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\n`),
        /expected Balder signing key/
    );
});

test('status reports a clean tree and then a dirty one', async () => {
    const collaborator = createGit({ cwd: repo });
    assert.equal((await collaborator.status()).clean, true);

    await fsp.writeFile(path.join(repo, 'b.txt'), 'two\n');
    const dirty = await collaborator.status();
    assert.equal(dirty.clean, false);
    assert.ok(dirty.entries.some((entry) => entry.includes('b.txt')));

    await fsp.rm(path.join(repo, 'b.txt'));
});

test('commitDate returns the commit date as an ISO calendar date', async () => {
    const collaborator = createGit({ cwd: repo });

    assert.match(await collaborator.commitDate('HEAD'), /^\d{4}-\d{2}-\d{2}$/);
});

test('assertAncestor accepts an ancestor and rejects a non-ancestor ref', async () => {
    const collaborator = createGit({ cwd: repo });

    await assert.doesNotReject(() => collaborator.assertAncestor('v1.0.0', 'HEAD'));
    await assert.rejects(() => collaborator.assertAncestor('HEAD', 'missing-ref'), /not an ancestor/);
});

test('checkoutBranch, addPaths and revParse operate on the real repo', async () => {
    const collaborator = createGit({ cwd: repo });

    await collaborator.checkoutBranch('chore/release-v1.3.0');
    await fsp.writeFile(path.join(repo, 'c.txt'), 'three\n');
    await collaborator.addPaths(['c.txt']);

    const staged = await execFileAsync('git', ['diff', '--cached', '--name-only'], { cwd: repo, env: GIT_ENV });
    assert.match(staged.stdout, /c\.txt/);

    const head = await collaborator.revParse('HEAD');
    assert.match(head, /^[0-9a-f]{40}$/);

    // Reset the working tree for isolation.
    await git(['checkout', '--quiet', '--', '.']);
    await execFileAsync('git', ['reset', '--quiet', '--hard'], { cwd: repo, env: GIT_ENV });
    await git(['checkout', '--quiet', 'master']);
});

test('tagCommit resolves an existing tag and returns null for a missing one', async () => {
    const collaborator = createGit({ cwd: repo });

    const sha = await collaborator.tagCommit('v1.0.0');
    assert.match(sha, /^[0-9a-f]{40}$/);

    assert.equal(await collaborator.tagCommit('v9.9.9'), null);
});

test('remoteTag proves the remote annotated-tag object and peeled commit', async () => {
    const collaborator = createGit({ cwd: repo });
    const remote = await collaborator.remoteTag({ remote: repo, tag: 'v1.0.0', env: GIT_ENV });

    assert.equal(remote.object, await collaborator.tagObject('v1.0.0'));
    assert.equal(remote.commit, await collaborator.tagCommit('v1.0.0'));
});

test('verifyCommit resolves a ref to its commit hash', async () => {
    const collaborator = createGit({ cwd: repo });
    const hash = await collaborator.verifyCommit('v1.0.0');

    assert.match(hash, /^[0-9a-f]{40}$/);
});
