import ava from 'ava';
import sinon from 'sinon';
import TrafficModeStartup from '../../src/assets/scripts/client/trafficGenerator/TrafficModeStartup';

ava('.start() waits for a choice, then selects the mode before starting aircraft generation', (t) => {
    const calls = [];
    let selectTrafficMode;
    const view = {
        show: sinon.stub().callsFake((onSelect) => {
            selectTrafficMode = onSelect;

            return 'shown';
        })
    };
    const scheduler = {
        init: sinon.stub().callsFake(() => calls.push('init')),
        selectTrafficMode: sinon.stub().callsFake((mode) => calls.push(['select', mode]))
    };
    const aircraftController = { id: 'aircraft-controller' };
    const startup = new TrafficModeStartup(view, scheduler);

    const result = startup.start(aircraftController);

    t.is(result, 'shown');
    t.true(view.show.calledOnce);
    t.true(scheduler.selectTrafficMode.notCalled);
    t.true(scheduler.init.notCalled);

    const selectionResult = selectTrafficMode('departures');

    t.is(selectionResult, 'departures');
    t.deepEqual(calls, [['select', 'departures'], 'init']);
    t.true(scheduler.init.calledOnceWithExactly(aircraftController));
});

ava('.start() applies strip visibility after mode validation and before generation starts', (t) => {
    const calls = [];
    let selectTrafficMode;
    const view = {
        show: (onSelect) => {
            selectTrafficMode = onSelect;
        }
    };
    const scheduler = {
        selectTrafficMode: (mode) => calls.push(['select', mode]),
        init: () => calls.push('init')
    };
    const stripView = {
        apply: (mode) => calls.push(['strips', mode])
    };
    const startup = new TrafficModeStartup(view, scheduler, stripView);

    startup.start({});
    selectTrafficMode('arrivals');

    t.deepEqual(calls, [
        ['select', 'arrivals'],
        ['strips', 'arrivals'],
        'init'
    ]);
});

ava('.destroy() hides the choice and releases its collaborators', (t) => {
    const view = { hide: sinon.stub() };
    const scheduler = {};
    const stripView = {};
    const startup = new TrafficModeStartup(view, scheduler, stripView);

    const result = startup.destroy();

    t.is(result, startup);
    t.true(view.hide.calledOnceWithExactly());
    t.is(startup._view, null);
    t.is(startup._scheduler, null);
    t.is(startup._stripView, null);
});
