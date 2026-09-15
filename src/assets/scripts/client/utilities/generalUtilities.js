import _isArray from 'lodash/isArray';

/**
 * Shared randomness boundary retained across calls into this module.
 *
 * Remains `null` until a composition root configures it through
 * `initRandomSource()`, so importing this module never touches a global
 * `Math.random`. While unconfigured, `fraction()` reads resolve to a
 * deterministic `0`, which makes `choose` select the first element and
 * `choose_weight` select the first positive-weight bucket.
 *
 * @property _randomSource
 * @type {RandomSource|null}
 */
let _randomSource = null;

/**
 * Configure the shared randomness boundary used by this module.
 *
 * Called by `App` at the composition root before any consumer runs. Storing the
 * source is the only way this module reaches real randomness; before this runs
 * it stays global-free and fraction reads resolve to `0`.
 *
 * @function initRandomSource
 * @param randomSource {RandomSource} [optional]  boundary exposing `fraction()`
 */
export const initRandomSource = (randomSource = null) => {
    _randomSource = randomSource == null ? null : randomSource;
};

/**
 * Read a fractional value in `[0, 1)` from the configured boundary.
 *
 * Resolves to a deterministic `0` while unconfigured so callers never touch a
 * global `Math.random`.
 *
 * @function _fraction
 * @return {number}
 * @private
 */
const _fraction = () => (_randomSource === null ? 0 : _randomSource.fraction());

/**
 * Helper method to translate a unicode character into a readable string value
 *
 * @method unicodeToString
 * @param char {characterCode}
 * @return {string}
 */
export const unicodeToString = (char) => `\\u${char.charCodeAt(0).toString(16).toUpperCase()}`;

/**
 *
 *
 * @function choose
 * @param list
 * @return
 */
export const choose = (list) => {
    const randomIndexFromLength = Math.floor(_fraction() * list.length);

    return list[randomIndexFromLength];
};

/**
 *
 *
 * @function choose_weight
 */
export const choose_weight = (l) => {
    if (l.length === 0) {
        return;
    }

    if (!_isArray(l[0])) {
        return choose(l);
    }

    // l = [[item, weight], [item, weight] ... ];
    let weight = 0;
    for (let i = 0; i < l.length; i++) {
        weight += l[i][1];
    }

    const randomWeight = _fraction() * weight;
    weight = 0;

    for (let i = 0; i < l.length; i++) {
        weight += l[i][1];

        if (weight > randomWeight) {
            return l[i][0];
        }
    }


    return null;
};

/**
 * Prepends zeros to front of str/num to make it the desired length
 *
 * @function leftPad
 * @param value {number|string}  original value
 * @param length {number}        total character length of return string
 * @return {string}              a string of the desired length prepended with zeros when `value` is < `length`
 */
export const leftPad = (value, length) => {
    if (value.toString().length >= length) {
        return value.toString();
    }

    const x = `0000000000000${value}`;

    return x.substr(x.length - length, length);
};
