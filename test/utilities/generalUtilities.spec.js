import ava from 'ava';
import sinon from 'sinon';

import {
    leftPad,
    choose,
    choose_weight,
    initRandomSource
} from '../../src/assets/scripts/client/utilities/generalUtilities';

const lengthMock = 3;

// Build a random source stub exposing only the `fraction()` contract used by
// `choose`/`choose_weight`, so the randomness boundary is exercised without a
// global `Math.random` backend.
const buildRandomSource = (fractionValue) => ({
    fraction: sinon.stub().returns(fractionValue),
    integer: sinon.stub(),
    real: sinon.stub()
});

// Clear the retained module random source so no test leaks into the next and
// the deterministic unconfigured behavior is restored.
ava.afterEach.always(() => {
    initRandomSource();
});

ava('.leftPad() returns a string prepended with zeros when value provided is less than length', (t) => {
    const result = leftPad(1, lengthMock);

    t.true(result === '001');
});

ava('.leftPad() returns original string when value.length is > length', (t) => {
    const result = leftPad(1234, lengthMock);

    t.true(result === '1234');
});

ava('.leftPad() returns original string when value.length === length', (t) => {
    const result = leftPad(123, lengthMock);

    t.true(result === '123');
});

ava.serial('.choose() selects the element at floor(fraction * length) drawn once from the source', (t) => {
    const list = ['a', 'b', 'c', 'd'];
    const randomSource = buildRandomSource(0.5);
    initRandomSource(randomSource);

    const result = choose(list);

    t.is(result, 'c');
    t.true(randomSource.fraction.calledOnceWithExactly());
});

ava.serial('.choose() without a configured source selects the first element and reads no fraction', (t) => {
    const result = choose(['a', 'b', 'c']);

    t.is(result, 'a');
});

ava.serial('.choose() returns undefined for an empty list', (t) => {
    t.is(choose([]), undefined);

    initRandomSource(buildRandomSource(0.99));

    t.is(choose([]), undefined);
});

ava.serial('.choose_weight() delegates to choose when the first element is not an array', (t) => {
    const randomSource = buildRandomSource(0.5);
    initRandomSource(randomSource);

    const result = choose_weight(['a', 'b', 'c', 'd']);

    t.is(result, 'c');
    t.true(randomSource.fraction.calledOnceWithExactly());
});

ava.serial('.choose_weight() returns undefined for an empty list without reading a fraction', (t) => {
    const randomSource = buildRandomSource(0.5);
    initRandomSource(randomSource);

    const result = choose_weight([]);

    t.is(result, undefined);
    t.true(randomSource.fraction.notCalled);
});

ava.serial('.choose_weight() selects the weighted bucket at fraction * totalWeight drawn once', (t) => {
    const list = [['a', 1], ['b', 1], ['c', 2]];
    // totalWeight === 4; randomWeight === 0.5 * 4 === 2, first cumulative weight > 2 is 'c'
    const randomSource = buildRandomSource(0.5);
    initRandomSource(randomSource);

    const result = choose_weight(list);

    t.is(result, 'c');
    t.true(randomSource.fraction.calledOnceWithExactly());
});

ava.serial('.choose_weight() without a configured source selects the first positive-weight bucket', (t) => {
    const list = [['a', 0], ['b', 3], ['c', 2]];

    const result = choose_weight(list);

    t.is(result, 'b');
});
