import ava from 'ava';
import sinon from 'sinon';
import AnalyticsAdapter from '../../src/assets/scripts/client/platform/AnalyticsAdapter';

ava('.record() delegates with the exact ("event", eventName, parameters) argument shape', (t) => {
    const transport = sinon.stub().returns(undefined);
    const analyticsAdapter = new AnalyticsAdapter(transport);
    const parameters = { event_category: 'category', event_label: 'label' };

    analyticsAdapter.record('some-event', parameters);

    t.true(transport.calledOnceWithExactly('event', 'some-event', parameters));
});

ava('.record() returns the transport result verbatim', (t) => {
    const result = { forwarded: true };
    const transport = sinon.stub().returns(result);
    const analyticsAdapter = new AnalyticsAdapter(transport);

    t.is(analyticsAdapter.record('some-event', {}), result);
});

ava('.record() lets a thrown error propagate with the exact error identity', (t) => {
    const failure = new Error('transport unavailable');
    const transport = sinon.stub().throws(failure);
    const analyticsAdapter = new AnalyticsAdapter(transport);

    const thrown = t.throws(() => analyticsAdapter.record('some-event', {}));

    t.is(thrown, failure);
});

ava('.record() returns undefined without side effects when no transport is provided', (t) => {
    const analyticsAdapter = new AnalyticsAdapter();

    t.is(analyticsAdapter.record('some-event', {}), undefined);
});

ava('.record() returns undefined without side effects when the transport is explicitly null', (t) => {
    const analyticsAdapter = new AnalyticsAdapter(null);

    t.is(analyticsAdapter.record('some-event', {}), undefined);
});

ava('.record() treats an undefined transport as a disabled no-op', (t) => {
    const analyticsAdapter = new AnalyticsAdapter(undefined);

    t.is(analyticsAdapter.record('some-event', {}), undefined);
});
