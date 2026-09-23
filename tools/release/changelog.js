'use strict';

const { ReleaseError } = require('./errors');

// A release heading is either the modern String of Pearls Keep-a-Changelog form
// `## [X.Y.Z] - YYYY-MM-DD`, or an inherited openScope form `# X.Y.Z (Month D,
// YYYY)`. Both are recognized so the newest section can be isolated while the
// preserved upstream headings continue to act as section boundaries. Version
// components allow multiple digits so the format survives past `x.x.9`.
const HEADING_SOURCE = '^(?:## \\[\\d+\\.\\d+\\.\\d+\\] - \\d{4}-\\d{2}-\\d{2}|# \\d+\\.\\d+\\.\\d+ \\([^)]*\\))';
const HEADING_LINE_PATTERN = new RegExp(HEADING_SOURCE);

/**
 * A fresh global, multiline regex for splitting/scanning. Returned per call so a
 * stateful `lastIndex` never leaks between callers.
 *
 * @returns {RegExp}
 */
function createReleaseHeadingRegex() {
    return new RegExp(HEADING_SOURCE, 'gm');
}

/**
 * @param {string} version
 * @param {string} isoDate YYYY-MM-DD
 * @returns {string} a Keep-a-Changelog release heading
 */
function renderReleaseHeading(version, isoDate) {
    return `## [${version}] - ${isoDate}`;
}

/**
 * @param {string} line
 * @returns {boolean} whether the line is a recognized release heading
 */
function isReleaseHeading(line) {
    return HEADING_LINE_PATTERN.test(line);
}

/**
 * Split a changelog into its preamble followed by one entry per release body.
 * The result mirrors `String.prototype.split`: index 0 is the preamble, index 1
 * is the newest release body, and so on.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
function splitReleaseSections(markdown) {
    return markdown.split(createReleaseHeadingRegex());
}

/**
 * @param {string} markdown
 * @returns {string} the newest release body
 * @throws {ReleaseError} when no release heading is present
 */
function newestReleaseBody(markdown) {
    const sections = splitReleaseSections(markdown);

    if (sections.length < 2) {
        throw new ReleaseError('changelog does not contain a version heading', 'changelog-empty');
    }

    return sections[1];
}

/**
 * @param {string} markdown
 * @param {string} version
 * @returns {boolean} whether a release for the version already exists (either format)
 */
function changelogContainsVersion(markdown, version) {
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(`^(?:## \\[${escaped}\\] -|# ${escaped} \\()`, 'm').test(markdown);
}

/**
 * Insert a rendered release section so it becomes the newest release, leaving
 * the preamble and all existing history untouched.
 *
 * @param {string} markdown
 * @param {string} section the heading and body of the new release
 * @returns {string}
 * @throws {ReleaseError} when there is no existing heading to anchor against
 */
function prependRelease(markdown, section) {
    const anchor = createReleaseHeadingRegex().exec(markdown);

    if (!anchor) {
        throw new ReleaseError('changelog has no release heading to anchor the new release', 'changelog-anchor');
    }

    const preamble = markdown.slice(0, anchor.index).replace(/\s+$/, '');
    const remainder = markdown.slice(anchor.index);
    const normalizedSection = section.replace(/\s+$/, '');

    return `${preamble}\n\n${normalizedSection}\n\n${remainder}`;
}

module.exports = {
    HEADING_SOURCE,
    createReleaseHeadingRegex,
    renderReleaseHeading,
    isReleaseHeading,
    splitReleaseSections,
    newestReleaseBody,
    changelogContainsVersion,
    prependRelease
};
