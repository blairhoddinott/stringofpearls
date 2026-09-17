/**
 * A pure adapter around three injected randomness callables.
 *
 * The callables are anything that produce random-like values when invoked:
 * `fraction()` returns a value in the half-open range `[0, 1)` (for example
 * `() => Math.random()`), `integer(lower, upper)` returns an inclusive integer
 * between the bounds, and `real(lower, upper)` returns an inclusive floating
 * point value between the bounds. This adapter intentionally references no
 * globals and holds no defaults so it stays trivially testable with fake
 * callables, and it forwards arguments verbatim and returns each callable's
 * value unchanged so callers own how the random value is interpreted.
 *
 * @class RandomSource
 */
export default class RandomSource {
    /**
     * @constructor
     * @param fraction {Function}  callable returning a fractional value in `[0, 1)`
     * @param integer {Function}   callable returning an inclusive integer for `(lower, upper)`
     * @param real {Function}      callable returning an inclusive real for `(lower, upper)`
     */
    constructor(fraction, integer, real) {
        this._fraction = fraction;
        this._integer = integer;
        this._real = real;
    }

    /**
     * Read a fractional value from the injected `fraction` callable.
     *
     * Delegates exactly to the callable with no arguments and returns its value
     * verbatim, letting any thrown error propagate unchanged.
     *
     * @for RandomSource
     * @method fraction
     * @return {number}
     */
    fraction() {
        return this._fraction();
    }

    /**
     * Read an inclusive integer from the injected `integer` callable.
     *
     * Forwards exactly the supplied bounds and returns the callable's value
     * verbatim, letting any thrown error propagate unchanged.
     *
     * @for RandomSource
     * @method integer
     * @param lower {number}
     * @param upper {number}
     * @return {number}
     */
    integer(lower, upper) {
        return this._integer(lower, upper);
    }

    /**
     * Read an inclusive real from the injected `real` callable.
     *
     * Forwards exactly the supplied bounds and returns the callable's value
     * verbatim, letting any thrown error propagate unchanged.
     *
     * @for RandomSource
     * @method real
     * @param lower {number}
     * @param upper {number}
     * @return {number}
     */
    real(lower, upper) {
        return this._real(lower, upper);
    }
}
