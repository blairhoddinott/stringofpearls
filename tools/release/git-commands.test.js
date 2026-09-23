'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    signedCommitArgs,
    signedAnnotatedTagArgs,
    verifyCommitArgs,
    verifyTagArgs,
    checkoutNewBranchArgs,
    addPathsArgs,
    pushBranchArgs,
    pushTagArgs,
    listSemverTagsArgs,
    tagExistsArgs
} = require('./git-commands');
const { SIGNING_FINGERPRINT } = require('./constants');

test('signedCommitArgs forces a signature with the fixed fingerprint', () => {
    const args = signedCommitArgs({ message: 'chore(release): v1.2.3' });

    assert.deepEqual(args, [
        '-c', `user.signingkey=${SIGNING_FINGERPRINT}`,
        'commit',
        `--gpg-sign=${SIGNING_FINGERPRINT}`,
        '--message', 'chore(release): v1.2.3'
    ]);
    // No shell metacharacters, no token, message passed as its own argv element.
    assert.ok(args.every((part) => typeof part === 'string'));
});

test('signedCommitArgs rejects an empty message', () => {
    assert.throws(() => signedCommitArgs({ message: '' }), /message/);
});

test('signedAnnotatedTagArgs signs with the fixed fingerprint and targets a commit', () => {
    const args = signedAnnotatedTagArgs({ tag: 'v1.2.3', message: 'Release v1.2.3', commit: 'abc1234' });

    assert.deepEqual(args, [
        'tag',
        '--sign',
        `--local-user=${SIGNING_FINGERPRINT}`,
        '--message', 'Release v1.2.3',
        'v1.2.3',
        'abc1234'
    ]);
});

test('signedAnnotatedTagArgs rejects a non-semver tag', () => {
    assert.throws(() => signedAnnotatedTagArgs({ tag: 'release', message: 'x', commit: 'abc' }), /tag/);
});

test('verifyCommitArgs and verifyTagArgs use git local verification', () => {
    assert.deepEqual(verifyCommitArgs('HEAD'), ['verify-commit', '--raw', 'HEAD']);
    assert.deepEqual(verifyTagArgs('v1.2.3'), ['verify-tag', '--raw', 'v1.2.3']);
});

test('verify arg builders reject empty refs', () => {
    assert.throws(() => verifyCommitArgs(''), /ref/);
    assert.throws(() => verifyTagArgs(''), /tag/);
});

test('checkoutNewBranchArgs creates or resets the release branch', () => {
    assert.deepEqual(checkoutNewBranchArgs('chore/release-v1.2.3'), ['checkout', '-B', 'chore/release-v1.2.3']);
});

test('addPathsArgs passes every path after a -- terminator', () => {
    assert.deepEqual(addPathsArgs(['package.json', 'CHANGELOG.md']), ['add', '--', 'package.json', 'CHANGELOG.md']);
});

test('addPathsArgs rejects an empty path list', () => {
    assert.throws(() => addPathsArgs([]), /path/);
});

test('pushBranchArgs pushes HEAD to the named branch with a lease, never a URL', () => {
    const args = pushBranchArgs({ remote: 'origin', branch: 'chore/release-v1.2.3' });

    assert.deepEqual(args, ['push', '--force-with-lease', 'origin', 'HEAD:refs/heads/chore/release-v1.2.3']);
    assert.ok(!args.some((part) => part.includes('https://')));
    assert.ok(!args.some((part) => part.includes('@')));
});

test('pushTagArgs pushes only the fully-qualified tag ref, no force', () => {
    const args = pushTagArgs({ remote: 'origin', tag: 'v1.2.3' });

    assert.deepEqual(args, ['push', 'origin', 'refs/tags/v1.2.3']);
});

test('listSemverTagsArgs lists only version-shaped tags', () => {
    assert.deepEqual(listSemverTagsArgs(), ['tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*']);
});

test('tagExistsArgs quietly verifies a fully-qualified tag ref', () => {
    assert.deepEqual(tagExistsArgs('v1.2.3'), ['rev-parse', '--verify', '--quiet', 'refs/tags/v1.2.3^{commit}']);
});
