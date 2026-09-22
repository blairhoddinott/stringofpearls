'use strict';

const fsp = require('fs/promises');
const path = require('path');

const { ReleaseError } = require('./errors');
const { resolveWithinRoot } = require('./paths');
const { collectReleaseCommits } = require('./conventional-commits');
const { computeNextVersion } = require('./semver');
const { repoUrlFromManifest, bumpManifest, bumpLockfile } = require('./manifest');
const {
    renderReleaseHeading,
    changelogContainsVersion,
    prependRelease
} = require('./changelog');
const { renderReleaseBody } = require('./release-notes');
const { renderReleaseDoc } = require('./release-doc');
const { resolveReleaseDate, formatIsoDate, formatLongDate } = require('./dates');

const MANIFEST_PATH = 'package.json';
const LOCKFILE_PATH = 'package-lock.json';
const CHANGELOG_PATH = 'CHANGELOG.md';
// The generated, release-facing summary page. It lives one directory deep so the
// links baked into `renderReleaseDoc` (`../CHANGELOG.md`) resolve correctly. It
// is intentionally distinct from the hand-authored policy page at
// `documentation/releases.md`.
const RELEASE_DOC_PATH = 'documentation/latest-release.md';

const MODES = new Set(['check', 'write']);

const defaultIo = {
    readFile: (filename) => fsp.readFile(filename, 'utf8'),
    async writeFile(filename, contents) {
        await fsp.mkdir(path.dirname(filename), { recursive: true });
        await fsp.writeFile(filename, contents);
    }
};

/**
 * Deterministically prepare a release from an explicit commit range.
 *
 * The operation never touches the network and never consults a hidden wall
 * clock: the git history arrives through the injected `git` collaborator, the
 * date through `RELEASE_DATE`/`SOURCE_DATE_EPOCH` (or an injected `now`), and
 * every file read/write goes through the injected `io`. It computes the whole
 * plan before writing anything, so any validation failure aborts the entire
 * preparation with the working tree untouched.
 *
 * @param {object} options
 * @param {object} options.git injected git collaborator (status/verifyCommit/listCommits)
 * @param {string} options.cwd repository root
 * @param {Record<string, string|undefined>} [options.env]
 * @param {boolean} [options.bootstrap] force the bootstrap 1.0.0 release
 * @param {string|null} [options.baseline] exclusive lower bound ref for a normal release
 * @param {string} [options.head] upper bound ref (defaults to HEAD)
 * @param {'check'|'write'} [options.mode] check = dry run, write = generate files
 * @param {object} [options.io] filesystem collaborator
 * @param {() => number} [options.now] injected clock for the date fallback
 * @param {string} [options.docPath] override for the generated docs page path
 * @returns {Promise<object>} the release plan
 * @throws {ReleaseError} on any refusal
 */
async function prepareRelease(options) {
    const {
        git,
        cwd,
        env = process.env,
        bootstrap = false,
        baseline = null,
        head = 'HEAD',
        mode = 'check',
        io = defaultIo,
        now,
        docPath = RELEASE_DOC_PATH
    } = options;

    if (!MODES.has(mode)) {
        throw new ReleaseError(`unknown mode: ${JSON.stringify(mode)}`, 'invalid-mode');
    }

    if (!git || typeof git.status !== 'function') {
        throw new ReleaseError('a git collaborator is required', 'invalid-git');
    }

    // 1. Refuse to operate on a dirty tree so the generated diff is exactly the
    //    release preparation and nothing else.
    const status = await git.status();

    if (!status || status.clean !== true) {
        const entries = status && Array.isArray(status.entries) ? status.entries.join(', ') : '';
        throw new ReleaseError(`working tree is dirty; commit or stash first${entries ? `: ${entries}` : ''}`, 'dirty-tree');
    }

    // 2. Resolve the commit range. A normal release must be anchored to an
    //    explicit baseline; the bootstrap release walks the whole history.
    const to = await git.verifyCommit(head);
    let from;

    if (bootstrap) {
        from = baseline ? await git.verifyCommit(baseline) : null;
    } else {
        if (typeof baseline !== 'string' || baseline.length === 0) {
            throw new ReleaseError('a baseline ref is required for a normal release', 'missing-baseline');
        }

        from = await git.verifyCommit(baseline);
    }

    if (from !== null) {
        await git.assertAncestor(from, to);
    }

    // 3. Collect and parse commits, failing closed on any non-conventional one.
    const rawCommits = await git.listCommits({ from, to });

    if (!Array.isArray(rawCommits)) {
        throw new ReleaseError('git collaborator did not return a commit list', 'invalid-git');
    }

    const commits = collectReleaseCommits(rawCommits, { allowLegacy: bootstrap });

    // 4. Read the manifest and decide the next version.
    const manifestPath = resolveWithinRoot(cwd, MANIFEST_PATH);
    const manifestText = await io.readFile(manifestPath);
    const manifest = JSON.parse(manifestText);
    const previousVersion = manifest.version;
    const repoUrl = repoUrlFromManifest(manifest);
    const version = computeNextVersion({ currentVersion: previousVersion, commits, bootstrap });

    if (version === null) {
        return {
            released: false,
            bootstrap,
            mode,
            previousVersion,
            commitCount: commits.length,
            reason: 'no releasable commits in the given range',
            changes: []
        };
    }

    // 5. Build every artifact in memory before writing anything.
    const date = resolveReleaseDate(env, now ? { now } : {});
    const isoDate = formatIsoDate(date);
    const longDate = formatLongDate(date);
    const tag = `v${version}`;
    const releaseBody = renderReleaseBody(commits, { repoUrl });

    const lockPath = resolveWithinRoot(cwd, LOCKFILE_PATH);
    const changelogPath = resolveWithinRoot(cwd, CHANGELOG_PATH);
    const resolvedDocPath = resolveWithinRoot(cwd, docPath);

    const lockText = await io.readFile(lockPath);
    const changelogText = await io.readFile(changelogPath);

    if (changelogContainsVersion(changelogText, version)) {
        throw new ReleaseError(`CHANGELOG.md already contains a ${version} release`, 'duplicate-release');
    }

    const section = `${renderReleaseHeading(version, isoDate)}\n\n${releaseBody}`;

    const changes = [
        { path: MANIFEST_PATH, absolutePath: manifestPath, contents: bumpManifest(manifestText, version) },
        { path: LOCKFILE_PATH, absolutePath: lockPath, contents: bumpLockfile(lockText, version) },
        { path: CHANGELOG_PATH, absolutePath: changelogPath, contents: prependRelease(changelogText, section) },
        {
            path: docPath,
            absolutePath: resolvedDocPath,
            contents: renderReleaseDoc({ version, longDate, releaseBody, repoUrl, tag })
        }
    ];

    // 6. Only now, with everything validated, touch the working tree.
    if (mode === 'write') {
        for (const change of changes) {
            await io.writeFile(change.absolutePath, change.contents);
        }
    }

    return {
        released: true,
        bootstrap,
        mode,
        version,
        previousVersion,
        tag,
        branch: `chore/release-${tag}`,
        commitMessage: `chore(release): ${tag}`,
        releaseDate: { iso: isoDate, long: longDate },
        releaseBody,
        commitCount: commits.length,
        changes: changes.map((change) => ({ path: change.path, contents: change.contents }))
    };
}

module.exports = {
    prepareRelease,
    RELEASE_DOC_PATH,
    MANIFEST_PATH,
    LOCKFILE_PATH,
    CHANGELOG_PATH
};
