'use strict';

/**
 * Fixed, security-critical constants for the release automation.
 *
 * These are deliberately hard-coded rather than configurable: the workflow, the
 * signing identity, and the repository are part of the trust boundary, so making
 * them injectable would only widen the attack surface. Tests import the same
 * constants so an accidental change to any of them is caught immediately.
 */

// The only repository the automation will ever operate on. Every API response
// and git ref is validated against this owner/repo pair.
const REPO_OWNER = 'blairhoddinott';
const REPO_NAME = 'stringofpearls';
const REPO_FULL_NAME = `${REPO_OWNER}/${REPO_NAME}`;

// The single OpenPGP key permitted to sign release commits and tags. Commits and
// tags are always produced with `--gpg-sign=<fingerprint>` / `--local-user` and
// then verified locally before any push.
const SIGNING_FINGERPRINT = '55752C968BC2E769D973F65727D0742393C6CAA3';

// The tracked lower bound for the very first (bootstrap) release, used only when
// no signed semver tag exists yet.
const BOOTSTRAP_BASELINE = '485a4c74942ed003ec0ea973e14cbc3cc50bbd2c';

// The machine-owned branch namespace for generated release-preparation commits.
const RELEASE_BRANCH_PREFIX = 'chore/release-';

// The base branch releases are cut from and merged back into.
const BASE_BRANCH = 'master';

// The environment variable the push token is read from. It is never placed on a
// command line, in a URL, in git config, or in a file.
const TOKEN_ENV_VAR = 'RELEASE_AUTOMATION_TOKEN';

module.exports = {
    REPO_OWNER,
    REPO_NAME,
    REPO_FULL_NAME,
    SIGNING_FINGERPRINT,
    BOOTSTRAP_BASELINE,
    RELEASE_BRANCH_PREFIX,
    BASE_BRANCH,
    TOKEN_ENV_VAR
};
