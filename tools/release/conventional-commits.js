'use strict';

const { ReleaseError } = require('./errors');

/**
 * Ordered release-note groups. The order here is the order sections render in
 * the changelog and release body, so it is deliberately breaking-first and
 * other-last. `types` lists the Conventional Commit types routed to each group;
 * the `breaking` and `other` groups are populated by rule rather than by type
 * (breaking overrides the type, and unknown-but-well-formed types fall through
 * to `other`).
 *
 * @type {ReadonlyArray<{ key: string, title: string, types: ReadonlyArray<string> }>}
 */
const COMMIT_GROUPS = Object.freeze([
    { key: 'breaking', title: 'Breaking Changes', types: Object.freeze([]) },
    { key: 'features', title: 'Features', types: Object.freeze(['feat']) },
    { key: 'fixes', title: 'Bug Fixes', types: Object.freeze(['fix']) },
    { key: 'performance', title: 'Performance', types: Object.freeze(['perf']) },
    { key: 'docs', title: 'Documentation', types: Object.freeze(['docs']) },
    { key: 'refactors', title: 'Refactoring', types: Object.freeze(['refactor']) },
    { key: 'ci', title: 'CI & Build', types: Object.freeze(['ci', 'build']) },
    { key: 'maintenance', title: 'Tests & Maintenance', types: Object.freeze(['test', 'chore']) },
    { key: 'other', title: 'Other Changes', types: Object.freeze([]) }
].map(Object.freeze));

const TYPE_TO_GROUP = new Map();
for (const group of COMMIT_GROUPS) {
    for (const type of group.types) {
        TYPE_TO_GROUP.set(type, group.key);
    }
}

// `type(scope)!: description`. Type is lowercase per the Conventional Commits
// convention; the scope, when present, must be a non-empty token; the optional
// bang marks a breaking change; the description must be non-empty.
const SUBJECT_PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9][a-z0-9\-_./]*)\))?(?<bang>!)?: (?<description>.+)$/;
const BREAKING_FOOTER_PATTERN = /^BREAKING[ -]CHANGE:\s*(?<note>.+)$/m;
const MERGE_SUBJECT_PATTERN = /^Merge (?:pull request|branch|remote-tracking branch|commit|tag) /;
const RELEASE_PREP_SUBJECT_PATTERN = /^chore\(release\): v?\d/;

/**
 * @param {{ subject?: string, parents?: string[] }} raw
 * @returns {boolean} whether the commit is a merge commit
 */
function isMergeCommit(raw) {
    if (Array.isArray(raw.parents) && raw.parents.length > 1) {
        return true;
    }

    return typeof raw.subject === 'string' && MERGE_SUBJECT_PATTERN.test(raw.subject);
}

/**
 * @param {{ subject?: string }} raw
 * @returns {boolean} whether the commit is a previously generated release-prep commit
 */
function isReleasePreparationCommit(raw) {
    return typeof raw.subject === 'string' && RELEASE_PREP_SUBJECT_PATTERN.test(raw.subject);
}

/**
 * @param {{ type: string, breaking: boolean }} parsed
 * @returns {string} the release-note group key for a parsed commit
 */
function classifyCommit(parsed) {
    if (parsed.breaking) {
        return 'breaking';
    }

    return TYPE_TO_GROUP.get(parsed.type) || 'other';
}

/**
 * Parse a single raw commit into a structured, grouped record.
 *
 * @param {{ hash?: string, subject?: string, body?: string }} raw
 * @returns {{ hash: string, shortHash: string, type: string, scope: string|null,
 *   breaking: boolean, description: string, breakingDescription: string|null, group: string }}
 * @throws {ReleaseError} when the subject is not a well-formed Conventional Commit
 */
function parseCommit(raw) {
    const subject = typeof raw.subject === 'string' ? raw.subject.trim() : '';
    const match = SUBJECT_PATTERN.exec(subject);

    if (!match) {
        throw new ReleaseError(
            `commit ${raw.hash || '<unknown>'} is not a Conventional Commit: ${JSON.stringify(subject)}`,
            'malformed-commit'
        );
    }

    const { type, scope, bang, description } = match.groups;
    const body = typeof raw.body === 'string' ? raw.body : '';
    const breakingFooter = BREAKING_FOOTER_PATTERN.exec(body);
    const breaking = Boolean(bang) || breakingFooter !== null;
    const hash = typeof raw.hash === 'string' ? raw.hash : '';

    const parsed = {
        hash,
        shortHash: hash.slice(0, 7),
        type,
        scope: scope || null,
        breaking,
        description: description.trim(),
        breakingDescription: breakingFooter ? breakingFooter.groups.note.trim() : null,
        group: 'other'
    };

    parsed.group = classifyCommit(parsed);

    return parsed;
}

/**
 * Filter out merges and prior release-prep commits, then parse every remaining
 * commit. Fails closed: any non-excluded commit that is not a well-formed
 * Conventional Commit aborts the whole collection.
 *
 * @param {Array<{ hash?: string, subject?: string, body?: string, parents?: string[] }>} rawCommits
 * @returns {Array<object>} parsed release commits, in input order
 * @throws {ReleaseError} on the first malformed non-excluded commit
 */
function collectReleaseCommits(rawCommits, { allowLegacy = false } = {}) {
    if (!Array.isArray(rawCommits)) {
        throw new ReleaseError('expected an array of raw commits', 'invalid-input');
    }

    const commits = [];

    for (const raw of rawCommits) {
        if (isMergeCommit(raw) || isReleasePreparationCommit(raw)) {
            continue;
        }

        try {
            commits.push(parseCommit(raw));
        } catch (error) {
            if (!allowLegacy || !(error instanceof ReleaseError) || error.code !== 'malformed-commit') {
                throw error;
            }

            const description = typeof raw.subject === 'string' ? raw.subject.trim() : '';

            if (description.length === 0) {
                throw error;
            }

            const hash = typeof raw.hash === 'string' ? raw.hash : '';
            commits.push({
                hash,
                shortHash: hash.slice(0, 7),
                type: 'legacy',
                scope: null,
                breaking: false,
                description,
                breakingDescription: null,
                group: 'other'
            });
        }
    }

    return commits;
}

module.exports = {
    COMMIT_GROUPS,
    parseCommit,
    classifyCommit,
    isMergeCommit,
    isReleasePreparationCommit,
    collectReleaseCommits
};
