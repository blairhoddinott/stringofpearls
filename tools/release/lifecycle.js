'use strict';

const { ReleaseError } = require('./errors');
const { parseVersion, formatVersion } = require('./semver');
const { createReleaseHeadingRegex } = require('./changelog');
const { formatLongDate } = require('./dates');
const { renderReleaseDoc } = require('./release-doc');
const {
    REPO_OWNER,
    REPO_FULL_NAME,
    RELEASE_BRANCH_PREFIX,
    BASE_BRANCH,
    BOOTSTRAP_BASELINE
} = require('./constants');

const RELEASE_BRANCH_PATTERN = new RegExp(`^(?:refs/heads/)?${RELEASE_BRANCH_PREFIX}v(\\d+\\.\\d+\\.\\d+)$`);
const SEMVER_TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/;
const MODERN_CHANGELOG_HEADING_PATTERN = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/;

/**
 * @param {string} version
 * @returns {string} the canonical release branch name for a version
 */
function releaseBranchForVersion(version) {
    parseVersion(version);

    return `${RELEASE_BRANCH_PREFIX}v${version}`;
}

/**
 * @param {string} version
 * @returns {string} the canonical release tag for a version
 */
function releaseTagForVersion(version) {
    parseVersion(version);

    return `v${version}`;
}

/**
 * @param {string} ref a branch name, optionally fully qualified
 * @returns {string|null} the release version encoded in the branch, or null
 */
function parseReleaseBranch(ref) {
    if (typeof ref !== 'string') {
        return null;
    }

    const match = RELEASE_BRANCH_PATTERN.exec(ref);

    return match ? match[1] : null;
}

/**
 * Classify a push to `master` using the GitHub commit-associated-PR API result,
 * never the merge commit's subject line. Only a pull request that is actually
 * merged *and* whose recorded merge commit equals the pushed commit is trusted.
 *
 * @param {{ mergeCommitSha: string, associatedPulls: Array<object> }} params
 * @returns {{ kind: 'release-pr', version: string, pull: object }
 *   | { kind: 'feature-merge', pull: object }
 *   | { kind: 'none', reason: string }}
 * @throws {ReleaseError} when the API payload is not an array
 */
function classifyMasterPush({ mergeCommitSha, associatedPulls }) {
    if (!Array.isArray(associatedPulls)) {
        throw new ReleaseError('commit-associated pull requests must be an array', 'invalid-api-response');
    }

    const matching = associatedPulls.filter(
        (pull) => pull && pull.merged_at && pull.merge_commit_sha === mergeCommitSha
    );

    if (matching.length === 0) {
        return { kind: 'none', reason: 'no merged pull request is associated with the pushed commit' };
    }

    if (matching.length !== 1) {
        throw new ReleaseError('pushed commit is associated with multiple merged pull requests', 'ambiguous-pull-request');
    }

    const merged = matching[0];
    const baseRef = merged.base && merged.base.ref;
    const baseRepository = merged.base && merged.base.repo && merged.base.repo.full_name;

    if (baseRef !== BASE_BRANCH || baseRepository !== REPO_FULL_NAME) {
        throw new ReleaseError('associated pull request does not target the trusted master repository', 'untrusted-base');
    }

    const version = parseReleaseBranch(merged.head && merged.head.ref);

    if (version) {
        const head = merged.head || {};
        const headRepository = head.repo && head.repo.full_name;
        const headOwner = head.user && head.user.login;
        const headSha = head.sha;

        if (headRepository !== REPO_FULL_NAME || headOwner !== REPO_OWNER) {
            throw new ReleaseError(
                'release preparation PR must originate from the trusted repository owner',
                'untrusted-release-pr'
            );
        }

        if (typeof headSha !== 'string' || !/^[0-9a-f]{40}$/.test(headSha)) {
            throw new ReleaseError('release preparation PR is missing an exact head commit SHA', 'invalid-api-response');
        }

        return { kind: 'release-pr', version, pull: merged };
    }

    return { kind: 'feature-merge', pull: merged };
}

function compareVersions(a, b) {
    const left = parseVersion(a);
    const right = parseVersion(b);

    return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

/**
 * Decide the baseline for a normal preparation run. The latest signed semver tag
 * is the exclusive lower bound; when no such tag exists yet, the tracked
 * bootstrap baseline is used and the run is a bootstrap (forced 1.0.0) release.
 *
 * @param {{ tagNames: string[] }} params
 * @returns {{ bootstrap: boolean, baseline: string }}
 */
function selectReleaseBaseline({ tagNames }) {
    const list = Array.isArray(tagNames) ? tagNames : [];
    const releaseTags = list.filter((name) => SEMVER_TAG_PATTERN.test(name));

    if (releaseTags.length === 0) {
        return { bootstrap: true, baseline: BOOTSTRAP_BASELINE };
    }

    const latest = releaseTags.reduce((highest, candidate) =>
        compareVersions(candidate.slice(1), highest.slice(1)) > 0 ? candidate : highest);

    return { bootstrap: false, baseline: latest };
}

/**
 * Serialize releases: any open release-shaped PR blocks new preparation. Never
 * rewrite an existing release PR to absorb commits from a later master merge.
 *
 * @param {{ openPulls: Array<object>, version: string }} params
 * @returns {null} when no release PR is open
 * @throws {ReleaseError} when any release PR is already open
 */
function resolveOpenReleasePr({ openPulls, version }) {
    const pulls = Array.isArray(openPulls) ? openPulls : [];

    for (const pull of pulls) {
        const branchVersion = parseReleaseBranch(pull && pull.head && pull.head.ref);

        if (!branchVersion) {
            continue;
        }

        throw new ReleaseError(
            `release pull request #${pull.number || 'unknown'} is already open for ${branchVersion}; refusing to prepare ${version}`,
            'release-in-progress'
        );
    }

    return null;
}

/**
 * @param {{ version: string, tag: string, releaseBody: string, previousVersion: string }} params
 * @returns {{ title: string, head: string, base: string, body: string }}
 */
function buildReleasePullRequest({ version, tag, releaseBody, previousVersion }) {
    const body = [
        `This automated pull request prepares release **${tag}**.`,
        '',
        `- Version: \`${previousVersion} → ${version}\``,
        '- Generated by the release automation; **do not edit** the diff by hand.',
        '- Merging this pull request publishes the signed tag and GitHub Release.',
        '',
        '---',
        '',
        releaseBody,
        ''
    ].join('\n');

    return {
        title: `chore(release): ${tag}`,
        head: releaseBranchForVersion(version),
        base: BASE_BRANCH,
        body
    };
}

/**
 * @param {{ tag: string, notes: string }} params
 * @returns {{ tag_name: string, name: string, body: string, draft: boolean, prerelease: boolean }}
 */
function buildGitHubRelease({ tag, notes }) {
    return {
        tag_name: tag,
        name: tag,
        body: notes,
        draft: false,
        prerelease: false
    };
}

function versionFromJsonField(text, label) {
    let parsed;

    try {
        parsed = JSON.parse(text);
    } catch {
        throw new ReleaseError(`${label} is not valid JSON`, 'artifact-mismatch');
    }

    if (!parsed || typeof parsed.version !== 'string') {
        throw new ReleaseError(`${label} has no version`, 'artifact-mismatch');
    }

    return parsed;
}

function newestModernRelease(markdown) {
    const headings = createReleaseHeadingRegex();
    const first = headings.exec(markdown || '');

    if (!first) {
        throw new ReleaseError('CHANGELOG.md has no release heading', 'artifact-mismatch');
    }

    const modern = MODERN_CHANGELOG_HEADING_PATTERN.exec(first[0]);

    if (!modern) {
        throw new ReleaseError('CHANGELOG.md newest release is not a modern generated heading', 'artifact-mismatch');
    }

    const next = headings.exec(markdown);
    const end = next ? next.index : markdown.length;

    return {
        version: modern[1],
        isoDate: modern[2],
        notes: markdown.slice(first.index + first[0].length, end).trim()
    };
}

/**
 * Confirm that every generated artifact on a merged release PR agrees on exactly
 * one version before a tag or release is ever created. Any disagreement is a
 * hard refusal.
 *
 * @param {{ manifestText: string, lockText: string, changelogText: string, latestReleaseDocText: string }} params
 * @returns {{ version: string, tag: string, notes: string }}
 * @throws {ReleaseError} on any mismatch or unparsable artifact
 */
function verifyReleaseArtifactsAgree({ manifestText, lockText, changelogText, latestReleaseDocText }) {
    const manifest = versionFromJsonField(manifestText, 'package.json');
    const version = manifest.version;

    parseVersion(version);

    const lock = versionFromJsonField(lockText, 'package-lock.json');
    const lockRootVersion = lock.packages && lock.packages[''] && lock.packages[''].version;

    if (lock.version !== version || lockRootVersion !== version) {
        throw new ReleaseError('package-lock.json version does not match package.json', 'artifact-mismatch');
    }

    const changelog = newestModernRelease(changelogText);

    if (changelog.version !== version) {
        throw new ReleaseError('CHANGELOG.md newest heading does not match package.json', 'artifact-mismatch');
    }

    const notes = changelog.notes;
    const tag = releaseTagForVersion(version);
    const expectedDoc = renderReleaseDoc({
        longDate: formatLongDate(new Date(`${changelog.isoDate}T00:00:00.000Z`)),
        releaseBody: notes,
        repoUrl: `https://github.com/${REPO_FULL_NAME}`,
        tag
    });

    if (latestReleaseDocText !== expectedDoc) {
        throw new ReleaseError('latest-release doc is not the exact generated document', 'artifact-mismatch');
    }

    return {
        version,
        tag,
        notes
    };
}

/**
 * Decide whether an already-present GitHub Release for a tag is an acceptable
 * idempotent rerun or a conflict that must fail closed.
 *
 * @param {{ existing: object, expected: object }} params
 * @returns {'match'}
 * @throws {ReleaseError} when the existing release differs from what would be created
 */
function reconcileExistingRelease({ existing, expected }) {
    const sameTag = existing.tag_name === expected.tag_name;
    const sameName = existing.name === expected.name;
    const sameBody = existing.body === expected.body;
    const sameDraft = existing.draft === expected.draft;
    const samePrerelease = existing.prerelease === expected.prerelease;

    if (sameTag && sameName && sameBody && sameDraft && samePrerelease) {
        return 'match';
    }

    throw new ReleaseError(
        `a different GitHub Release already exists for ${expected.tag_name}`,
        'release-conflict'
    );
}

module.exports = {
    REPO_FULL_NAME,
    releaseBranchForVersion,
    releaseTagForVersion,
    parseReleaseBranch,
    classifyMasterPush,
    selectReleaseBaseline,
    resolveOpenReleasePr,
    buildReleasePullRequest,
    buildGitHubRelease,
    verifyReleaseArtifactsAgree,
    reconcileExistingRelease,
    formatVersion
};
