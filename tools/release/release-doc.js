'use strict';

/**
 * Render the concise, release-facing documentation page. The page is rebuilt in
 * full on every preparation so it always reflects the newest release and never
 * accumulates drift.
 *
 * @param {{ longDate: string, releaseBody: string, repoUrl: string, tag: string }} release
 * @returns {string}
 */
function renderReleaseDoc({ longDate, releaseBody, repoUrl, tag }) {
    return `${[
        '# String of Pearls releases',
        '',
        'String of Pearls ships automated releases. Versions follow',
        '[Semantic Versioning](https://semver.org/spec/v2.0.0.html) derived from',
        '[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): every eligible merge to',
        '`master` opens a release-preparation pull request, and merging that pull request publishes a',
        'signed `vX.Y.Z` tag and a matching GitHub Release.',
        '',
        '- Full history: [CHANGELOG.md](../CHANGELOG.md)',
        `- All releases: [${repoUrl}/releases](${repoUrl}/releases)`,
        '- How releases work: [Release automation](releases.md)',
        '',
        `## Latest release — ${tag} (${longDate})`,
        '',
        releaseBody,
        '',
        `[View ${tag} on GitHub](${repoUrl}/releases/tag/${tag})`,
        ''
    ].join('\n')}`.replace(/\s+$/, '\n');
}

module.exports = { renderReleaseDoc };
