'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    releaseBranchForVersion,
    releaseTagForVersion,
    parseReleaseBranch,
    classifyMasterPush,
    selectReleaseBaseline,
    resolveOpenReleasePr,
    buildReleasePullRequest,
    buildGitHubRelease,
    verifyReleaseArtifactsAgree,
    reconcileExistingRelease
} = require('./lifecycle');
const { ReleaseError } = require('./errors');
const { BOOTSTRAP_BASELINE } = require('./constants');
const { renderReleaseDoc } = require('./release-doc');

test('releaseBranchForVersion and releaseTagForVersion are the canonical names', () => {
    assert.equal(releaseBranchForVersion('1.2.3'), 'chore/release-v1.2.3');
    assert.equal(releaseTagForVersion('1.2.3'), 'v1.2.3');
});

test('releaseBranchForVersion rejects a malformed version', () => {
    assert.throws(() => releaseBranchForVersion('1.2'), ReleaseError);
});

test('parseReleaseBranch extracts the version from either a bare or fully-qualified ref', () => {
    assert.equal(parseReleaseBranch('chore/release-v1.2.3'), '1.2.3');
    assert.equal(parseReleaseBranch('refs/heads/chore/release-v10.20.30'), '10.20.30');
});

test('parseReleaseBranch returns null for a non-release branch', () => {
    assert.equal(parseReleaseBranch('feat/x'), null);
    assert.equal(parseReleaseBranch('chore/release-vNOPE'), null);
    assert.equal(parseReleaseBranch(''), null);
});

test('classifyMasterPush recognizes a merged release PR by its head ref, not the message', () => {
    const result = classifyMasterPush({
        mergeCommitSha: 'sha-merge',
        associatedPulls: [
            {
                number: 42,
                merged_at: '2026-09-22T00:00:00Z',
                merge_commit_sha: 'sha-merge',
                head: {
                    ref: 'chore/release-v1.2.3',
                    sha: 'b'.repeat(40),
                    repo: { full_name: 'blairhoddinott/stringofpearls' },
                    user: { login: 'blairhoddinott' }
                },
                base: { ref: 'master', repo: { full_name: 'blairhoddinott/stringofpearls' } }
            }
        ]
    });

    assert.deepEqual(result, { kind: 'release-pr', version: '1.2.3', pull: result.pull });
    assert.equal(result.pull.number, 42);
});

test('classifyMasterPush rejects a release-shaped branch from a fork', () => {
    assert.throws(() => classifyMasterPush({
        mergeCommitSha: 'sha-merge',
        associatedPulls: [{
            number: 43,
            merged_at: '2026-09-22T00:00:00Z',
            merge_commit_sha: 'sha-merge',
            head: {
                ref: 'chore/release-v1.2.3',
                repo: { full_name: 'someone-else/stringofpearls' },
                user: { login: 'someone-else' }
            },
            base: { ref: 'master', repo: { full_name: 'blairhoddinott/stringofpearls' } }
        }]
    }), /trusted repository owner/);
});

test('classifyMasterPush recognizes an ordinary feature merge', () => {
    const result = classifyMasterPush({
        mergeCommitSha: 'sha-merge',
        associatedPulls: [
            {
                number: 7,
                merged_at: '2026-09-22T00:00:00Z',
                merge_commit_sha: 'sha-merge',
                head: { ref: 'feat/traffic' },
                base: { ref: 'master', repo: { full_name: 'blairhoddinott/stringofpearls' } }
            }
        ]
    });

    assert.equal(result.kind, 'feature-merge');
    assert.equal(result.pull.number, 7);
});

test('classifyMasterPush rejects an ambiguous match or foreign base', () => {
    const pull = {
        number: 7,
        merged_at: '2026-09-22T00:00:00Z',
        merge_commit_sha: 'sha-merge',
        head: { ref: 'feat/traffic' },
        base: { ref: 'master', repo: { full_name: 'blairhoddinott/stringofpearls' } }
    };

    assert.throws(
        () => classifyMasterPush({ mergeCommitSha: 'sha-merge', associatedPulls: [pull, { ...pull, number: 8 }] }),
        (error) => error.code === 'ambiguous-pull-request'
    );
    assert.throws(
        () => classifyMasterPush({
            mergeCommitSha: 'sha-merge',
            associatedPulls: [{ ...pull, base: { ref: 'master', repo: { full_name: 'other/repo' } } }]
        }),
        (error) => error.code === 'untrusted-base'
    );
});

test('classifyMasterPush ignores PRs whose merge commit does not match the push', () => {
    const result = classifyMasterPush({
        mergeCommitSha: 'sha-actual',
        associatedPulls: [
            { number: 7, merged_at: '2026-09-22T00:00:00Z', merge_commit_sha: 'other', head: { ref: 'feat/x' }, base: { ref: 'master', repo: { full_name: 'blairhoddinott/stringofpearls' } } }
        ]
    });

    assert.equal(result.kind, 'none');
});

test('classifyMasterPush treats an unmerged associated PR as nothing to do', () => {
    const result = classifyMasterPush({
        mergeCommitSha: 'sha-merge',
        associatedPulls: [
            { number: 7, merged_at: null, merge_commit_sha: null, head: { ref: 'feat/x' }, base: { ref: 'master', repo: { full_name: 'blairhoddinott/stringofpearls' } } }
        ]
    });

    assert.equal(result.kind, 'none');
});

test('classifyMasterPush fails closed on a non-array payload', () => {
    assert.throws(() => classifyMasterPush({ mergeCommitSha: 'x', associatedPulls: null }), ReleaseError);
});

test('selectReleaseBaseline picks the highest signed semver tag when tags exist', () => {
    const decision = selectReleaseBaseline({ tagNames: ['v1.0.0', 'v1.2.0', 'v1.10.0', 'v1.2.1'] });

    assert.deepEqual(decision, { bootstrap: false, baseline: 'v1.10.0' });
});

test('selectReleaseBaseline falls back to the tracked bootstrap baseline when no tag exists', () => {
    const decision = selectReleaseBaseline({ tagNames: [] });

    assert.deepEqual(decision, { bootstrap: true, baseline: BOOTSTRAP_BASELINE });
});

test('selectReleaseBaseline ignores prerelease and non-semver tags', () => {
    const decision = selectReleaseBaseline({ tagNames: ['v1.2.3-rc.1', 'nightly', 'v1.2.3'] });

    assert.deepEqual(decision, { bootstrap: false, baseline: 'v1.2.3' });
});

test('resolveOpenReleasePr fails closed even when the open PR has the same version', () => {
    const pulls = [
        { number: 5, head: { ref: 'chore/release-v2.0.0' } },
        { number: 8, head: { ref: 'feat/x' } }
    ];

    assert.throws(
        () => resolveOpenReleasePr({ openPulls: pulls, version: '2.0.0' }),
        (error) => error instanceof ReleaseError && error.code === 'release-in-progress'
    );
});

test('resolveOpenReleasePr returns null when no release PR is open', () => {
    assert.equal(resolveOpenReleasePr({ openPulls: [{ number: 8, head: { ref: 'feat/x' } }], version: '2.0.0' }), null);
});

test('resolveOpenReleasePr fails closed when a different version release PR is already open', () => {
    const pulls = [{ number: 5, head: { ref: 'chore/release-v1.9.0' } }];

    assert.throws(() => resolveOpenReleasePr({ openPulls: pulls, version: '2.0.0' }), (error) => {
        assert.ok(error instanceof ReleaseError);
        assert.equal(error.code, 'release-in-progress');
        return true;
    });
});

test('buildReleasePullRequest targets master from the release branch with the generated notes', () => {
    const payload = buildReleasePullRequest({
        version: '1.2.3',
        tag: 'v1.2.3',
        releaseBody: '### Features\n\n- **traffic:** add mode',
        previousVersion: '1.2.2'
    });

    assert.equal(payload.head, 'chore/release-v1.2.3');
    assert.equal(payload.base, 'master');
    assert.equal(payload.title, 'chore(release): v1.2.3');
    assert.match(payload.body, /1\.2\.2 → 1\.2\.3/);
    assert.match(payload.body, /add mode/);
    assert.match(payload.body, /do not edit/i);
});

test('buildGitHubRelease emits an exact, non-draft release from the generated notes', () => {
    const payload = buildGitHubRelease({ tag: 'v1.2.3', notes: '### Features\n\n- x' });

    assert.deepEqual(payload, {
        tag_name: 'v1.2.3',
        name: 'v1.2.3',
        body: '### Features\n\n- x',
        draft: false,
        prerelease: false
    });
});

const AGREEING = {
    manifestText: JSON.stringify({ version: '1.2.3' }),
    lockText: JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.3' } } }),
    changelogText: '# Changelog\n\n## [1.2.3] - 2026-09-22\n\n### Features\n\n- x\n\n## [1.2.2] - 2026-01-01\n\n- old\n',
    latestReleaseDocText: renderReleaseDoc({
        longDate: 'September 22, 2026',
        releaseBody: '### Features\n\n- x',
        repoUrl: 'https://github.com/blairhoddinott/stringofpearls',
        tag: 'v1.2.3'
    })
};

test('verifyReleaseArtifactsAgree returns the agreed version and tag when everything matches', () => {
    const result = verifyReleaseArtifactsAgree(AGREEING);

    assert.deepEqual(result, { version: '1.2.3', tag: 'v1.2.3', notes: '### Features\n\n- x' });
});

test('verifyReleaseArtifactsAgree fails closed when the lockfile disagrees', () => {
    assert.throws(() => verifyReleaseArtifactsAgree({
        ...AGREEING,
        lockText: JSON.stringify({ version: '1.2.2', packages: { '': { version: '1.2.2' } } })
    }), (error) => {
        assert.equal(error.code, 'artifact-mismatch');
        return true;
    });
});

test('verifyReleaseArtifactsAgree fails closed when the changelog heading disagrees', () => {
    assert.throws(() => verifyReleaseArtifactsAgree({
        ...AGREEING,
        changelogText: '# Changelog\n\n## [9.9.9] - 2026-09-22\n\n- x\n'
    }), (error) => {
        assert.equal(error.code, 'artifact-mismatch');
        return true;
    });
});

test('verifyReleaseArtifactsAgree fails closed when the latest-release doc disagrees', () => {
    assert.throws(() => verifyReleaseArtifactsAgree({
        ...AGREEING,
        latestReleaseDocText: '## Latest release — v0.0.1 (x)\n'
    }), (error) => {
        assert.equal(error.code, 'artifact-mismatch');
        return true;
    });
});

test('verifyReleaseArtifactsAgree rejects altered notes or date in the latest-release doc', () => {
    for (const latestReleaseDocText of [
        '# String of Pearls releases\n\n## Latest release — v1.2.3 (September 22, 2026)\n\n### Features\n\n- altered\n\n[View v1.2.3 on GitHub](x)\n',
        '# String of Pearls releases\n\n## Latest release — v1.2.3 (September 23, 2026)\n\n### Features\n\n- x\n\n[View v1.2.3 on GitHub](x)\n'
    ]) {
        assert.throws(
            () => verifyReleaseArtifactsAgree({ ...AGREEING, latestReleaseDocText }),
            (error) => error.code === 'artifact-mismatch'
        );
    }
});

test('verifyReleaseArtifactsAgree rejects an inherited heading before the generated release', () => {
    const changelogText = '# Changelog\n\n# 9.9.9 (Yesterday)\n\nWRONG BODY\n\n## [1.2.3] - 2026-09-22\n\n### Features\n\n- x\n';

    assert.throws(
        () => verifyReleaseArtifactsAgree({ ...AGREEING, changelogText }),
        (error) => error.code === 'artifact-mismatch'
    );
});

test('reconcileExistingRelease accepts an exact idempotent match', () => {
    const outcome = reconcileExistingRelease({
        existing: { tag_name: 'v1.2.3', name: 'v1.2.3', body: '### Features\n\n- x', draft: false, prerelease: false },
        expected: { tag_name: 'v1.2.3', name: 'v1.2.3', body: '### Features\n\n- x', draft: false, prerelease: false }
    });

    assert.equal(outcome, 'match');
});

test('reconcileExistingRelease rejects a draft or prerelease rerun', () => {
    const expected = { tag_name: 'v1.2.3', name: 'v1.2.3', body: 'notes', draft: false, prerelease: false };

    assert.throws(() => reconcileExistingRelease({ existing: { ...expected, draft: true }, expected }), /different GitHub Release/);
    assert.throws(() => reconcileExistingRelease({ existing: { ...expected, prerelease: true }, expected }), /different GitHub Release/);
});

test('reconcileExistingRelease rejects a conflicting release for the same tag', () => {
    assert.throws(() => reconcileExistingRelease({
        existing: { tag_name: 'v1.2.3', name: 'v1.2.3', body: 'different notes' },
        expected: { tag_name: 'v1.2.3', name: 'v1.2.3', body: '### Features\n\n- x', draft: false, prerelease: false }
    }), (error) => {
        assert.equal(error.code, 'release-conflict');
        return true;
    });
});
