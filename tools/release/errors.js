'use strict';

/**
 * Error raised whenever the release tooling refuses to proceed.
 *
 * Every failure surfaces as a `ReleaseError` so the command-line entry points
 * can fail closed with a stable, non-zero exit status and a single-line
 * diagnostic instead of leaking a stack trace. The `code` is a short,
 * machine-stable slug used by tests and by the workflow to distinguish a hard
 * refusal from a benign "nothing to release" outcome.
 */
class ReleaseError extends Error {
    constructor(message, code = 'release-error') {
        super(message);
        this.name = 'ReleaseError';
        this.code = code;
    }
}

module.exports = { ReleaseError };
