import ava from 'ava';
import sinon from 'sinon';
import PageVisibilityAdapter from '../../src/assets/scripts/client/platform/PageVisibilityAdapter';

const buildCapabilities = ({ visibilityState = 'visible' } = {}) => ({
    addWindowListener: sinon.stub(),
    addDocumentListener: sinon.stub(),
    readVisibilityState: sinon.stub().returns(visibilityState)
});

const buildAdapter = (capabilities) => new PageVisibilityAdapter(
    capabilities.addWindowListener,
    capabilities.addDocumentListener,
    capabilities.readVisibilityState
);

ava('.subscribe() registers blur, focus, then visibilitychange with the exact event names and in order', (t) => {
    const capabilities = buildCapabilities();
    const adapter = buildAdapter(capabilities);
    const onHidden = sinon.stub();
    const onVisible = sinon.stub();

    adapter.subscribe(onHidden, onVisible);

    t.is(capabilities.addWindowListener.firstCall.args[0], 'blur');
    t.is(capabilities.addWindowListener.secondCall.args[0], 'focus');
    t.true(capabilities.addDocumentListener.calledOnceWith('visibilitychange'));
    t.true(capabilities.addWindowListener.firstCall.calledBefore(capabilities.addWindowListener.secondCall));
    t.true(capabilities.addWindowListener.secondCall.calledBefore(capabilities.addDocumentListener.firstCall));
});

ava('.subscribe() registers the blur/focus listeners with the original callback identities', (t) => {
    const capabilities = buildCapabilities();
    const adapter = buildAdapter(capabilities);
    const onHidden = sinon.stub();
    const onVisible = sinon.stub();

    adapter.subscribe(onHidden, onVisible);

    t.is(capabilities.addWindowListener.firstCall.args[1], onHidden);
    t.is(capabilities.addWindowListener.secondCall.args[1], onVisible);
});

ava('.subscribe() visibility handler reads state once and invokes onHidden() with no args when hidden', (t) => {
    const capabilities = buildCapabilities({ visibilityState: 'hidden' });
    const adapter = buildAdapter(capabilities);
    const onHidden = sinon.stub().returns('hidden-result');
    const onVisible = sinon.stub();

    adapter.subscribe(onHidden, onVisible);
    const visibilityHandler = capabilities.addDocumentListener.firstCall.args[1];
    const result = visibilityHandler();

    t.true(capabilities.readVisibilityState.calledOnce);
    t.true(onHidden.calledOnceWithExactly());
    t.false(onVisible.called);
    t.is(result, 'hidden-result');
});

ava('.subscribe() visibility handler reads state once and invokes onVisible() with no args when not hidden', (t) => {
    const capabilities = buildCapabilities({ visibilityState: 'visible' });
    const adapter = buildAdapter(capabilities);
    const onHidden = sinon.stub();
    const onVisible = sinon.stub().returns('visible-result');

    adapter.subscribe(onHidden, onVisible);
    const visibilityHandler = capabilities.addDocumentListener.firstCall.args[1];
    const result = visibilityHandler();

    t.true(capabilities.readVisibilityState.calledOnce);
    t.true(onVisible.calledOnceWithExactly());
    t.false(onHidden.called);
    t.is(result, 'visible-result');
});

ava('.subscribe() treats any non-"hidden" state as visible', (t) => {
    const capabilities = buildCapabilities({ visibilityState: 'prerender' });
    const adapter = buildAdapter(capabilities);
    const onHidden = sinon.stub();
    const onVisible = sinon.stub();

    adapter.subscribe(onHidden, onVisible);
    capabilities.addDocumentListener.firstCall.args[1]();

    t.true(onVisible.calledOnceWithExactly());
    t.false(onHidden.called);
});

ava('.subscribe() returns undefined', (t) => {
    const capabilities = buildCapabilities();
    const adapter = buildAdapter(capabilities);

    t.is(adapter.subscribe(sinon.stub(), sinon.stub()), undefined);
});

ava('.subscribe() performs no partial registration when the window listener capability is omitted', (t) => {
    const capabilities = buildCapabilities();
    const adapter = new PageVisibilityAdapter(null, capabilities.addDocumentListener, capabilities.readVisibilityState);

    const result = adapter.subscribe(sinon.stub(), sinon.stub());

    t.is(result, undefined);
    t.false(capabilities.addDocumentListener.called);
    t.false(capabilities.readVisibilityState.called);
});

ava('.subscribe() performs no partial registration when the document listener capability is omitted', (t) => {
    const capabilities = buildCapabilities();
    const adapter = new PageVisibilityAdapter(capabilities.addWindowListener, null, capabilities.readVisibilityState);

    const result = adapter.subscribe(sinon.stub(), sinon.stub());

    t.is(result, undefined);
    t.false(capabilities.addWindowListener.called);
    t.false(capabilities.readVisibilityState.called);
});

ava('.subscribe() performs no partial registration when the visibility-state capability is omitted', (t) => {
    const capabilities = buildCapabilities();
    const adapter = new PageVisibilityAdapter(capabilities.addWindowListener, capabilities.addDocumentListener, null);

    const result = adapter.subscribe(sinon.stub(), sinon.stub());

    t.is(result, undefined);
    t.false(capabilities.addWindowListener.called);
    t.false(capabilities.addDocumentListener.called);
});

ava('.subscribe() is a safe no-op when all capabilities are omitted (no args)', (t) => {
    const adapter = new PageVisibilityAdapter();

    t.is(adapter.subscribe(sinon.stub(), sinon.stub()), undefined);
});
