import ava from 'ava';
import sinon from 'sinon';
import EventTracker from '../src/assets/scripts/client/EventTracker';
import { TRACKABLE_EVENT } from '../src/assets/scripts/client/constants/trackableEvents';

const DISABLED_MESSAGE = 'Event tracking is disabled because we couldn\'t find `gtag` on the window';

// Build an analytics adapter stub exposing only the `record(eventName, parameters)`
// contract used by `EventTracker`, so the analytics boundary is exercised without
// a real transport or any browser global.
const buildAnalyticsAdapter = (returnValue) => ({
    record: sinon.stub().returns(returnValue)
});

// EventTracker is an import-time singleton, so every test runs serially and the
// retained adapter is cleared after each one to prevent leakage between tests.
ava.afterEach.always(() => {
    EventTracker.initAnalytics();
    sinon.restore();
});

ava.serial('initAnalytics() retains the exact adapter identity', (t) => {
    const analyticsAdapter = buildAnalyticsAdapter();

    EventTracker.initAnalytics(analyticsAdapter);

    t.is(EventTracker._analyticsAdapter, analyticsAdapter);
});

ava.serial('initAnalytics() normalizes a missing adapter to null (disabled)', (t) => {
    EventTracker.initAnalytics(buildAnalyticsAdapter());
    EventTracker.initAnalytics();

    t.is(EventTracker._analyticsAdapter, null);
});

ava.serial('initAnalytics() normalizes an explicit null to null (disabled)', (t) => {
    EventTracker.initAnalytics(null);

    t.is(EventTracker._analyticsAdapter, null);
});

ava.serial('initAnalytics() normalizes an explicit undefined to null (disabled)', (t) => {
    EventTracker.initAnalytics(undefined);

    t.is(EventTracker._analyticsAdapter, null);
});

ava.serial('recordEvent() records through the adapter without reading any browser global', (t) => {
    // Make `window.gtag` throw if anything reads it, proving the tracker never touches it.
    const gtagDescriptor = Object.getOwnPropertyDescriptor(window, 'gtag');
    Object.defineProperty(window, 'gtag', {
        configurable: true,
        get() {
            throw new Error('window.gtag must not be read by EventTracker');
        }
    });
    t.teardown(() => {
        if (gtagDescriptor) {
            Object.defineProperty(window, 'gtag', gtagDescriptor);
        } else {
            delete window.gtag;
        }
    });

    const analyticsAdapter = buildAnalyticsAdapter();
    EventTracker.initAnalytics(analyticsAdapter);

    t.notThrows(() => EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'action', 'label'));
    t.true(analyticsAdapter.record.calledOnce);
});

ava.serial('recordEvent() builds the exact underscore payload and delegates with the category name', (t) => {
    const analyticsAdapter = buildAnalyticsAdapter();
    EventTracker.initAnalytics(analyticsAdapter);

    EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'action', 'label');

    t.true(analyticsAdapter.record.calledOnceWithExactly(TRACKABLE_EVENT.OPTIONS, {
        event_category: TRACKABLE_EVENT.OPTIONS,
        event_action: 'action',
        event_label: 'label'
    }));
});

ava.serial('recordEvent() includes a truthy value on the payload', (t) => {
    const analyticsAdapter = buildAnalyticsAdapter();
    EventTracker.initAnalytics(analyticsAdapter);

    EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'action', 'label', 'value');

    t.true(analyticsAdapter.record.calledOnceWithExactly(TRACKABLE_EVENT.OPTIONS, {
        event_category: TRACKABLE_EVENT.OPTIONS,
        event_action: 'action',
        event_label: 'label',
        value: 'value'
    }));
});

ava.serial('recordEvent() omits a falsy value from the payload', (t) => {
    const analyticsAdapter = buildAnalyticsAdapter();
    EventTracker.initAnalytics(analyticsAdapter);

    EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'action', 'label', 0);

    t.true(analyticsAdapter.record.calledOnceWithExactly(TRACKABLE_EVENT.OPTIONS, {
        event_category: TRACKABLE_EVENT.OPTIONS,
        event_action: 'action',
        event_label: 'label'
    }));
});

ava.serial('recordEvent() returns the adapter result verbatim', (t) => {
    const result = { forwarded: true };
    const analyticsAdapter = buildAnalyticsAdapter(result);
    EventTracker.initAnalytics(analyticsAdapter);

    t.is(EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'action', 'label'), result);
});

ava.serial('recordEvent() lets an adapter error propagate with the exact identity', (t) => {
    const failure = new Error('transport unavailable');
    const analyticsAdapter = { record: sinon.stub().throws(failure) };
    EventTracker.initAnalytics(analyticsAdapter);

    const thrown = t.throws(() => EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'action', 'label'));

    t.is(thrown, failure);
});

ava.serial('recordEvent() logs the exact disabled message and returns undefined when no adapter is configured', (t) => {
    const consoleErrorStub = sinon.stub(console, 'error');
    EventTracker.initAnalytics();

    const result = EventTracker.recordEvent(TRACKABLE_EVENT.OPTIONS, 'action', 'label');

    t.is(result, undefined);
    t.true(consoleErrorStub.calledOnceWithExactly(DISABLED_MESSAGE));
});

ava.serial('recordClickOnOutboundLink() builds the exact beacon payload and delegates with the "click" name', (t) => {
    const analyticsAdapter = buildAnalyticsAdapter();
    EventTracker.initAnalytics(analyticsAdapter);

    EventTracker.recordClickOnOutboundLink('https://example.com');

    t.true(analyticsAdapter.record.calledOnceWithExactly('click', {
        event_category: TRACKABLE_EVENT.OUTBOUND,
        event_label: 'https://example.com',
        transport_type: 'beacon'
    }));
});

ava.serial('recordClickOnOutboundLink() returns the adapter result verbatim', (t) => {
    const result = { forwarded: true };
    const analyticsAdapter = buildAnalyticsAdapter(result);
    EventTracker.initAnalytics(analyticsAdapter);

    t.is(EventTracker.recordClickOnOutboundLink('https://example.com'), result);
});

ava.serial('recordClickOnOutboundLink() lets an adapter error propagate with the exact identity', (t) => {
    const failure = new Error('transport unavailable');
    const analyticsAdapter = { record: sinon.stub().throws(failure) };
    EventTracker.initAnalytics(analyticsAdapter);

    const thrown = t.throws(() => EventTracker.recordClickOnOutboundLink('https://example.com'));

    t.is(thrown, failure);
});

ava.serial('recordClickOnOutboundLink() logs the exact disabled message and returns undefined when no adapter is configured', (t) => {
    const consoleErrorStub = sinon.stub(console, 'error');
    EventTracker.initAnalytics();

    const result = EventTracker.recordClickOnOutboundLink('https://example.com');

    t.is(result, undefined);
    t.true(consoleErrorStub.calledOnceWithExactly(DISABLED_MESSAGE));
});
