'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    parseCommit,
    isMergeCommit,
    isReleasePreparationCommit,
    collectReleaseCommits,
    classifyCommit,
    COMMIT_GROUPS
} = require('./conventional-commits');
const { ReleaseError } = require('./errors');

test('parseCommit reads type, scope, and description', () => {
    const parsed = parseCommit({ hash: 'abcdef1234567890', subject: 'feat(traffic): add traffic mode selection' });

    assert.equal(parsed.type, 'feat');
    assert.equal(parsed.scope, 'traffic');
    assert.equal(parsed.description, 'add traffic mode selection');
    assert.equal(parsed.breaking, false);
    assert.equal(parsed.group, 'features');
    assert.equal(parsed.hash, 'abcdef1234567890');
    assert.equal(parsed.shortHash, 'abcdef1');
});

test('parseCommit allows a missing scope', () => {
    const parsed = parseCommit({ hash: 'f'.repeat(40), subject: 'fix: correct the thing' });

    assert.equal(parsed.type, 'fix');
    assert.equal(parsed.scope, null);
    assert.equal(parsed.group, 'fixes');
    assert.equal(parsed.breaking, false);
});

test('parseCommit flags a bang breaking change', () => {
    const withScope = parseCommit({ hash: '1234567', subject: 'feat(api)!: drop legacy command parser' });
    const withoutScope = parseCommit({ hash: '7654321', subject: 'refactor!: remove global window state' });

    assert.equal(withScope.breaking, true);
    assert.equal(withScope.group, 'breaking');
    assert.equal(withoutScope.breaking, true);
    assert.equal(withoutScope.group, 'breaking');
});

test('parseCommit flags a BREAKING CHANGE footer and captures the note', () => {
    const parsed = parseCommit({
        hash: 'deadbeef',
        subject: 'fix(engine): rework separation math',
        body: 'Rewrites the solver.\n\nBREAKING CHANGE: separation tuning constants moved to config.'
    });

    assert.equal(parsed.breaking, true);
    assert.equal(parsed.group, 'breaking');
    assert.equal(parsed.breakingDescription, 'separation tuning constants moved to config.');
});

test('parseCommit accepts the hyphenated BREAKING-CHANGE footer token', () => {
    const parsed = parseCommit({
        hash: 'cafebabe',
        subject: 'perf(render): batch canvas writes',
        body: 'BREAKING-CHANGE: minimum browser bumped to evergreen only.'
    });

    assert.equal(parsed.breaking, true);
    assert.equal(parsed.breakingDescription, 'minimum browser bumped to evergreen only.');
});

test('classifyCommit maps each known type to its release-note group', () => {
    const cases = {
        feat: 'features',
        fix: 'fixes',
        perf: 'performance',
        docs: 'docs',
        refactor: 'refactors',
        ci: 'ci',
        build: 'ci',
        test: 'maintenance',
        chore: 'maintenance',
        style: 'other',
        revert: 'other',
        wibble: 'other'
    };

    for (const [type, group] of Object.entries(cases)) {
        assert.equal(classifyCommit(parseCommit({ hash: 'aaaaaaa', subject: `${type}: some change` })), group, type);
    }
});

test('COMMIT_GROUPS is ordered breaking-first and other-last', () => {
    const keys = COMMIT_GROUPS.map((group) => group.key);

    assert.deepEqual(keys, [
        'breaking',
        'features',
        'fixes',
        'performance',
        'docs',
        'refactors',
        'ci',
        'maintenance',
        'other'
    ]);
});

test('isMergeCommit recognizes merge subjects and multi-parent commits', () => {
    assert.equal(isMergeCommit({ subject: 'Merge pull request #5 from foo/bar' }), true);
    assert.equal(isMergeCommit({ subject: 'Merge branch master into topic' }), true);
    assert.equal(isMergeCommit({ subject: 'feat: real change', parents: ['a', 'b'] }), true);
    assert.equal(isMergeCommit({ subject: 'feat: real change', parents: ['a'] }), false);
    assert.equal(isMergeCommit({ subject: 'feat: real change' }), false);
});

test('isReleasePreparationCommit recognizes the generated release commit', () => {
    assert.equal(isReleasePreparationCommit({ subject: 'chore(release): 1.0.0' }), true);
    assert.equal(isReleasePreparationCommit({ subject: 'chore(release): v2.3.4' }), true);
    assert.equal(isReleasePreparationCommit({ subject: 'feat(release): add a real feature' }), false);
    assert.equal(isReleasePreparationCommit({ subject: 'fix: unrelated' }), false);
});

test('parseCommit fails closed on a non-conventional subject', () => {
    assert.throws(() => parseCommit({ hash: 'abc', subject: 'Complete Phase 5 architecture modernization' }), ReleaseError);
    assert.throws(() => parseCommit({ hash: 'abc', subject: 'feat add without colon' }), ReleaseError);
    assert.throws(() => parseCommit({ hash: 'abc', subject: 'feat(): empty scope not allowed' }), ReleaseError);
    assert.throws(() => parseCommit({ hash: 'abc', subject: 'FEAT: uppercase type' }), ReleaseError);
    assert.throws(() => parseCommit({ hash: 'abc', subject: 'feat: ' }), ReleaseError);
});

test('collectReleaseCommits drops merges and release-prep, parses the remainder', () => {
    const raw = [
        { hash: '1111111', subject: 'Merge pull request #9 from x/y' },
        { hash: '2222222', subject: 'chore(release): 1.0.0' },
        { hash: '3333333', subject: 'feat(traffic): add mode selection' },
        { hash: '4444444', subject: 'fix(ci): isolate required context' }
    ];

    const commits = collectReleaseCommits(raw);

    assert.equal(commits.length, 2);
    assert.deepEqual(commits.map((commit) => commit.type), ['feat', 'fix']);
});

test('collectReleaseCommits fails closed when a non-excluded commit is malformed', () => {
    const raw = [
        { hash: '3333333', subject: 'feat(traffic): add mode selection' },
        { hash: '5555555', subject: 'random unstructured commit message' }
    ];

    assert.throws(() => collectReleaseCommits(raw), ReleaseError);
});

test('collectReleaseCommits preserves legacy subjects only when bootstrap explicitly allows them', () => {
    const raw = [
        { hash: '3333333', subject: 'feat(traffic): add mode selection' },
        { hash: '5555555', subject: 'Complete Phase 5 architecture modernization' }
    ];

    const commits = collectReleaseCommits(raw, { allowLegacy: true });

    assert.equal(commits.length, 2);
    assert.deepEqual(commits[1], {
        hash: '5555555',
        shortHash: '5555555',
        type: 'legacy',
        scope: null,
        breaking: false,
        description: 'Complete Phase 5 architecture modernization',
        breakingDescription: null,
        group: 'other'
    });
});
