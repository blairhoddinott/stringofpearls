'use strict';

const { ReleaseError } = require('./errors');
const { parseVersion } = require('./semver');

const GITHUB_HTTPS_PATTERN = /^https:\/\/github\.com\/[^/]+\/[^/]+$/;

/**
 * Derive the canonical `https://github.com/<owner>/<repo>` URL from a package
 * manifest's `repository` field, accepting both the object and shorthand string
 * forms and stripping any `git+` prefix and `.git` suffix.
 *
 * @param {{ repository?: string | { url?: string } }} pkg
 * @returns {string}
 * @throws {ReleaseError} when the repository is missing or is not a GitHub HTTPS URL
 */
function repoUrlFromManifest(pkg) {
    const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository && pkg.repository.url;

    if (typeof raw !== 'string' || raw.length === 0) {
        throw new ReleaseError('package.json is missing a repository url', 'invalid-repository');
    }

    const normalized = raw.replace(/^git\+/, '').replace(/\.git$/, '');

    if (!GITHUB_HTTPS_PATTERN.test(normalized)) {
        throw new ReleaseError(`repository url must be an https github url: ${JSON.stringify(raw)}`, 'invalid-repository');
    }

    return normalized;
}

function serialize(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Return package.json text with only its version changed. The whole document is
 * re-serialized with two-space indentation and a trailing newline, which is a
 * byte-for-byte round trip for this repository's manifests.
 *
 * @param {string} manifestText
 * @param {string} nextVersion
 * @returns {string}
 * @throws {ReleaseError} when the manifest has no valid version
 */
function bumpManifest(manifestText, nextVersion) {
    const pkg = JSON.parse(manifestText);

    if (typeof pkg.version !== 'string') {
        throw new ReleaseError('package.json has no version field', 'invalid-manifest');
    }

    parseVersion(pkg.version);
    pkg.version = nextVersion;

    return serialize(pkg);
}

/**
 * Return package-lock.json text with the root and root-package versions changed,
 * leaving every dependency entry untouched.
 *
 * @param {string} lockText
 * @param {string} nextVersion
 * @returns {string}
 * @throws {ReleaseError} when the lockfile has no root version
 */
function bumpLockfile(lockText, nextVersion) {
    const lock = JSON.parse(lockText);

    if (typeof lock.version !== 'string') {
        throw new ReleaseError('package-lock.json has no root version field', 'invalid-lockfile');
    }

    parseVersion(lock.version);
    lock.version = nextVersion;

    if (lock.packages && lock.packages[''] && typeof lock.packages[''].version === 'string') {
        lock.packages[''].version = nextVersion;
    }

    return serialize(lock);
}

module.exports = { repoUrlFromManifest, bumpManifest, bumpLockfile };
