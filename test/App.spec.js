import ava from 'ava';
import sinon from 'sinon';
import App from '../src/assets/scripts/client/App';

ava('setupChildren() forwards loaded schedules into the runtime composition root', (t) => {
    const airportLoadList = [{ icao: 'ksea' }];
    const initialAirportData = { icao: 'KSEA' };
    const airlineList = [{ icao: 'asa' }];
    const aircraftTypeDefinitionList = [{ icao: 'B739' }];
    const airportGuides = { ksea: {} };
    const schedulesByAirport = { ksea: { airportIcao: 'KSEA' } };
    const appController = { setupChildren: sinon.stub() };
    const app = {
        _appController: appController,
        enable: sinon.stub()
    };

    App.prototype.setupChildren.call(
        app,
        airportLoadList,
        'ksea',
        initialAirportData,
        airlineList,
        aircraftTypeDefinitionList,
        airportGuides,
        schedulesByAirport
    );

    t.true(appController.setupChildren.calledOnceWithExactly(
        airportLoadList,
        'ksea',
        initialAirportData,
        airlineList,
        aircraftTypeDefinitionList,
        airportGuides,
        schedulesByAirport
    ));
    t.true(app.enable.calledOnce);
    t.true(appController.setupChildren.calledBefore(app.enable));
});
