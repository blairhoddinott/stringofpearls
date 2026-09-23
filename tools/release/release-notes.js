'use strict';

const { COMMIT_GROUPS } = require('./conventional-commits');

const EMPTY_BODY_PLACEHOLDER = '_No notable changes._';

/**
 * Render a single commit as a Markdown list item.
 *
 * The item carries the scope (bold, when present), the description, and a
 * linked short hash. A breaking-change note, when the commit has one, becomes an
 * indented sub-bullet. Values come straight from the commit message and are only
 * ever emitted into Markdown/files (never into a shell command), so no shell
 * quoting is applied here.
 *
 * @param {{ scope: string|null, description: string, hash: string, shortHash: string, breakingDescription: string|null }} commit
 * @param {{ repoUrl: string }} options
 * @returns {string}
 */
function renderCommitEntry(commit, { repoUrl }) {
    const scope = commit.scope ? `**${commit.scope}:** ` : '';
    const link = commit.hash ? ` ([\`${commit.shortHash}\`](${repoUrl}/commit/${commit.hash}))` : '';
    let entry = `- ${scope}${commit.description}${link}`;

    if (commit.breakingDescription) {
        entry += `\n  - BREAKING CHANGE: ${commit.breakingDescription}`;
    }

    return entry;
}

/**
 * Bucket commits into the canonical, ordered release-note groups, keeping only
 * the groups that actually have commits.
 *
 * @param {Array<{ group: string }>} commits
 * @returns {Array<{ key: string, title: string, commits: Array<object> }>}
 */
function groupCommits(commits) {
    return COMMIT_GROUPS
        .map((group) => ({
            key: group.key,
            title: group.title,
            commits: commits.filter((commit) => commit.group === group.key)
        }))
        .filter((group) => group.commits.length > 0);
}

/**
 * Render the grouped Markdown body shared by the changelog section and the
 * GitHub Release notes.
 *
 * @param {Array<object>} commits
 * @param {{ repoUrl: string }} options
 * @returns {string}
 */
function renderReleaseBody(commits, { repoUrl }) {
    const groups = groupCommits(commits);

    if (groups.length === 0) {
        return EMPTY_BODY_PLACEHOLDER;
    }

    return groups
        .map((group) => {
            const items = group.commits.map((commit) => renderCommitEntry(commit, { repoUrl }));

            return `### ${group.title}\n\n${items.join('\n')}`;
        })
        .join('\n\n');
}

module.exports = {
    EMPTY_BODY_PLACEHOLDER,
    renderCommitEntry,
    groupCommits,
    renderReleaseBody
};
