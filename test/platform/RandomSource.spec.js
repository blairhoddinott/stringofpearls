import ava from 'ava';
import sinon from 'sinon';
import RandomSource from '../../src/assets/scripts/client/platform/RandomSource';

ava('.fraction() returns the exact value produced by the injected fraction callable', (t) => {
    const value = 0.4242;
    const fraction = sinon.stub().returns(value);
    const randomSource = new RandomSource(fraction, sinon.stub(), sinon.stub());

    const result = randomSource.fraction();

    t.is(result, value);
});

ava('.fraction() invokes the injected fraction callable exactly once with no arguments', (t) => {
    const fraction = sinon.stub().returns(0.5);
    const randomSource = new RandomSource(fraction, sinon.stub(), sinon.stub());

    randomSource.fraction();

    t.true(fraction.calledOnceWithExactly());
});

ava('.fraction() lets a thrown error propagate with the exact error identity', (t) => {
    const failure = new Error('fraction unavailable');
    const fraction = sinon.stub().throws(failure);
    const randomSource = new RandomSource(fraction, sinon.stub(), sinon.stub());

    const thrown = t.throws(() => randomSource.fraction());

    t.is(thrown, failure);
});

ava('.integer() returns the exact value produced by the injected integer callable', (t) => {
    const value = 7;
    const integer = sinon.stub().returns(value);
    const randomSource = new RandomSource(sinon.stub(), integer, sinon.stub());

    const result = randomSource.integer(3, 9);

    t.is(result, value);
});

ava('.integer() forwards exactly the lower and upper bounds to the injected callable', (t) => {
    const integer = sinon.stub().returns(0);
    const randomSource = new RandomSource(sinon.stub(), integer, sinon.stub());

    randomSource.integer(3, 9);

    t.true(integer.calledOnceWithExactly(3, 9));
});

ava('.integer() lets a thrown error propagate with the exact error identity', (t) => {
    const failure = new Error('integer unavailable');
    const integer = sinon.stub().throws(failure);
    const randomSource = new RandomSource(sinon.stub(), integer, sinon.stub());

    const thrown = t.throws(() => randomSource.integer(1, 2));

    t.is(thrown, failure);
});

ava('.real() returns the exact value produced by the injected real callable', (t) => {
    const value = 12.5;
    const real = sinon.stub().returns(value);
    const randomSource = new RandomSource(sinon.stub(), sinon.stub(), real);

    const result = randomSource.real(10, 20);

    t.is(result, value);
});

ava('.real() forwards exactly the lower and upper bounds to the injected callable', (t) => {
    const real = sinon.stub().returns(0);
    const randomSource = new RandomSource(sinon.stub(), sinon.stub(), real);

    randomSource.real(10, 20);

    t.true(real.calledOnceWithExactly(10, 20));
});

ava('.real() lets a thrown error propagate with the exact error identity', (t) => {
    const failure = new Error('real unavailable');
    const real = sinon.stub().throws(failure);
    const randomSource = new RandomSource(sinon.stub(), sinon.stub(), real);

    const thrown = t.throws(() => randomSource.real(1, 2));

    t.is(thrown, failure);
});
