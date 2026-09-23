'use strict';

const { ReleaseError } = require('./errors');
const { parseVersion } = require('./semver');
const { SIGNING_FINGERPRINT } = require('./constants');

// A fully-qualified `vX.Y.Z` release tag. Prerelease/build suffixes are rejected
// so the automation only ever signs and pushes clean release tags.
const RELEASE_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * These builders return the exact argument vector passed to `git` via
 * `execFile`. Keeping the argument construction pure (no side effects, no
 * exec) means the security-critical shape of every git invocation — that a
 * signature is forced, that the fixed fingerprint is used, that a token can
 * never reach a URL — is unit-testable without a real repository, key, or
 * network. `git.js` is the thin side-effecting wrapper that runs them.
 */

function requireNonEmpty(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new ReleaseError(`a git ${label} is required`, 'invalid-argument');
    }

    return value;
}

function requireReleaseTag(tag) {
    if (typeof tag !== 'string' || !RELEASE_TAG_PATTERN.test(tag)) {
        throw new ReleaseError(`expected a vX.Y.Z release tag: ${JSON.stringify(tag)}`, 'invalid-argument');
    }

    return tag;
}

/**
 * Build the arguments for a release commit that is always signed with the fixed
 * fingerprint. `--gpg-sign=<fingerprint>` forces a signature regardless of local
 * config, so an unsigned commit can never slip through.
 *
 * @param {{ message: string }} params
 * @returns {string[]}
 */
function signedCommitArgs({ message }) {
    requireNonEmpty(message, 'commit message');

    return [
        '-c', `user.signingkey=${SIGNING_FINGERPRINT}`,
        'commit',
        `--gpg-sign=${SIGNING_FINGERPRINT}`,
        '--message', message
    ];
}

/**
 * Build the arguments for a signed, annotated release tag targeting a specific
 * commit.
 *
 * @param {{ tag: string, message: string, commit: string }} params
 * @returns {string[]}
 */
function signedAnnotatedTagArgs({ tag, message, commit }) {
    requireReleaseTag(tag);
    requireNonEmpty(message, 'tag message');
    requireNonEmpty(commit, 'commit');

    return [
        'tag',
        '--sign',
        `--local-user=${SIGNING_FINGERPRINT}`,
        '--message', message,
        tag,
        commit
    ];
}

/**
 * @param {string} ref
 * @returns {string[]} arguments for a local commit-signature verification
 */
function verifyCommitArgs(ref) {
    return ['verify-commit', '--raw', requireNonEmpty(ref, 'ref')];
}

/**
 * @param {string} tag
 * @returns {string[]} arguments for a local tag-signature verification
 */
function verifyTagArgs(tag) {
    return ['verify-tag', '--raw', requireReleaseTag(tag)];
}

/**
 * @param {string} branch
 * @returns {string[]} arguments that create or reset a branch at HEAD
 */
function checkoutNewBranchArgs(branch) {
    return ['checkout', '-B', requireNonEmpty(branch, 'branch')];
}

/**
 * @param {string[]} paths
 * @returns {string[]} arguments that stage exactly the given paths
 */
function addPathsArgs(paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
        throw new ReleaseError('at least one path is required to stage', 'invalid-argument');
    }

    for (const entry of paths) {
        requireNonEmpty(entry, 'path');
    }

    return ['add', '--', ...paths];
}

/**
 * Build the arguments to push the current HEAD to a branch. The token is never
 * part of the argument vector or the remote URL; authentication is supplied out
 * of band by the GIT_ASKPASS helper.
 *
 * @param {{ remote: string, branch: string }} params
 * @returns {string[]}
 */
function pushBranchArgs({ remote, branch }) {
    requireNonEmpty(remote, 'remote');
    requireNonEmpty(branch, 'branch');

    return ['push', '--force-with-lease', remote, `HEAD:refs/heads/${branch}`];
}

/**
 * @param {{ remote: string, tag: string }} params
 * @returns {string[]} arguments to push a single, immutable release tag
 */
function pushTagArgs({ remote, tag }) {
    requireNonEmpty(remote, 'remote');
    requireReleaseTag(tag);

    return ['push', remote, `refs/tags/${tag}`];
}

/**
 * @returns {string[]} arguments listing only version-shaped tags
 */
function listSemverTagsArgs() {
    return ['tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*'];
}

/**
 * @param {string} tag
 * @returns {string[]} arguments that quietly verify a tag ref resolves to a commit
 */
function tagExistsArgs(tag) {
    return ['rev-parse', '--verify', '--quiet', `refs/tags/${requireReleaseTag(tag)}^{commit}`];
}

/**
 * @param {string} tag
 * @returns {string} the semver core of a release tag
 * @throws {ReleaseError} when the tag is not a clean vX.Y.Z tag
 */
function versionFromTag(tag) {
    requireReleaseTag(tag);
    const version = tag.slice(1);

    parseVersion(version);

    return version;
}

module.exports = {
    RELEASE_TAG_PATTERN,
    signedCommitArgs,
    signedAnnotatedTagArgs,
    verifyCommitArgs,
    verifyTagArgs,
    checkoutNewBranchArgs,
    addPathsArgs,
    pushBranchArgs,
    pushTagArgs,
    listSemverTagsArgs,
    tagExistsArgs,
    versionFromTag
};
