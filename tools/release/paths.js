'use strict';

const path = require('path');

const { ReleaseError } = require('./errors');

/**
 * Resolve a repository-relative path underneath a root, refusing anything that
 * would escape the root (absolute paths, `..` traversal, or empty values). The
 * release tooling only ever writes to a fixed, known set of files, so any path
 * that resolves outside the repository is treated as a hard, fail-closed error
 * rather than silently clamped.
 *
 * @param {string} root the repository root (absolute)
 * @param {string} relative a repository-relative path
 * @returns {string} the absolute, contained path
 * @throws {ReleaseError} when the path is empty or escapes the root
 */
function resolveWithinRoot(root, relative) {
    if (typeof relative !== 'string' || relative.length === 0) {
        throw new ReleaseError('a file path is required', 'unsafe-path');
    }

    if (path.isAbsolute(relative)) {
        throw new ReleaseError(`file path must be repository-relative: ${JSON.stringify(relative)}`, 'unsafe-path');
    }

    const rootResolved = path.resolve(root);
    const target = path.resolve(rootResolved, relative);
    const contained = target === rootResolved || target.startsWith(`${rootResolved}${path.sep}`);

    if (!contained) {
        throw new ReleaseError(`file path escapes the repository: ${JSON.stringify(relative)}`, 'unsafe-path');
    }

    return target;
}

module.exports = { resolveWithinRoot };
