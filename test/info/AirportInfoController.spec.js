import ava from 'ava';
import $ from 'jquery';
import sinon from 'sinon';
import AirportController from '../../src/assets/scripts/client/airport/AirportController';
import AirportInfoController from '../../src/assets/scripts/client/info/AirportInfoController';
import { EVENT } from '../../src/assets/scripts/client/constants/eventNames';
import { AIRPORT_INFO_TEMPLATE } from '../../src/assets/scripts/client/info/airportInfoTemplate';

ava('setup handlers binds a stable weather change handler', (t) => {
    const controller = Object.create(AirportInfoController.prototype);

    controller._setupHandlers();

    t.is(typeof controller._onWeatherChangeHandler, 'function');
});

ava('enable subscribes the weather change handler', (t) => {
    const calls = [];
    const controller = Object.create(AirportInfoController.prototype);
    controller._eventBus = { on: (...args) => calls.push(args) };
    controller._onAirportChangeHandler = () => {};
    controller._onWindChangeHandler = () => {};
    controller._onWeatherChangeHandler = () => {};

    controller.enable();

    t.deepEqual(calls[2], [EVENT.WEATHER_CHANGE, controller._onWeatherChangeHandler]);
});

ava('disable unsubscribes the weather change handler', (t) => {
    const calls = [];
    const controller = Object.create(AirportInfoController.prototype);
    controller._eventBus = { off: (...args) => calls.push(args) };
    controller._onAirportChangeHandler = () => {};
    controller._onWindChangeHandler = () => {};
    controller._onWeatherChangeHandler = () => {};

    controller.disable();

    t.deepEqual(calls[2], [EVENT.WEATHER_CHANGE, controller._onWeatherChangeHandler]);
});

ava('airport info template places METAR and RWYS rows after elevation', (t) => {
    const labels = $(AIRPORT_INFO_TEMPLATE)
        .find('.airportInfo-label')
        .toArray()
        .map((element) => $(element).text());

    t.deepEqual(labels, ['TIME', 'WIND', 'ALTIM', 'ELEV', 'METAR', 'RWYS']);
});

ava('active runway readout distinguishes arrival and departure', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    const readout = controller._buildRunwayReadout({
        arrivalRunwayModel: { name: '25L' },
        departureRunwayModel: { name: '25R' }
    });

    t.is(readout, 'ARR 25L / DEP 25R');
});

ava('wind readout displays the exact reported gust', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    controller._randomSource = { fraction: () => 1 };

    const readout = controller._buildWindAndGustReadout({
        angle: 270,
        speed: 12,
        gust: 19
    });

    t.is(readout, '270 12 G19');
});

ava('wind readout does not invent a gust when none was reported', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    controller._randomSource = { fraction: () => 1 };

    const readout = controller._buildWindAndGustReadout({
        angle: 270,
        speed: 12
    });

    t.is(readout, '270 12');
});

ava('altimeter readout converts reported hectopascals to inches of mercury', (t) => {
    const controller = Object.create(AirportInfoController.prototype);

    t.is(controller._buildAltimeterReadout(1017), '30.03');
});

ava('fallback altimeter is fixed standard pressure', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    controller._randomSource = { fraction: () => 1 };

    t.is(controller._generateHighAltimeterReading(20), '29.92');
});

ava('METAR readout shows loading before the first response', (t) => {
    const controller = Object.create(AirportInfoController.prototype);

    t.is(controller._buildMetarReadout({ status: 'loading', observation: null }), 'LOADING');
});

ava('METAR readout shows unavailable when no observation exists', (t) => {
    const controller = Object.create(AirportInfoController.prototype);

    t.is(controller._buildMetarReadout({ status: 'unavailable', observation: null }), 'UNAVAILABLE');
});

ava('METAR readout displays the complete current raw report', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    const raw = 'KLAS 251656Z 21012G19KT 10SM FEW120 32/08 A3003 RMK AO2';

    t.is(controller._buildMetarReadout({
        status: 'available',
        observation: { raw }
    }), raw);
});

ava('METAR readout prefixes retained stale reports explicitly', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    const raw = 'KLAS 251656Z 21012G19KT 10SM FEW120 32/08 A3003 RMK AO2';

    t.is(controller._buildMetarReadout({
        status: 'stale',
        observation: { raw }
    }), `STALE — ${raw}`);
});

ava('usable weather updates METAR wind gust and altimeter presentation', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    const raw = 'KLAS 251656Z 21012G19KT 10SM FEW120 32/08 A3003 RMK AO2';
    let renderCount = 0;
    controller.icao = 'KLAS';
    controller._render = () => { renderCount += 1; };

    controller.onWeatherChange({
        station: 'KLAS',
        status: 'available',
        usesLiveWeather: true,
        observation: {
            raw,
            altimeterHpa: 1017,
            wind: {
                directionDegreesTrue: 210,
                speedKnots: 12,
                gustKnots: 19
            }
        }
    });

    t.is(controller.metar, raw);
    t.is(controller.wind, '210 12 G19');
    t.is(controller.altimeter, '30.03');
    t.true(controller.usesLiveWeather);
    t.is(renderCount, 1);
});

ava('fallback weather presentation uses static wind and standard pressure', (t) => {
    const controller = Object.create(AirportInfoController.prototype);

    controller._applyFallbackWeather({
        wind: {
            angle: Math.PI,
            speed: 8
        }
    });

    t.is(controller.wind, '180 08');
    t.is(controller.altimeter, '29.92');
    t.false(controller.usesLiveWeather);
});

ava('unusable weather keeps raw METAR while applying static fallback presentation', (t) => {
    const raw = 'KLAS 251656Z VRB04KT 10SM CLR 32/08 A3003';
    const controller = Object.create(AirportInfoController.prototype);
    controller.icao = 'KLAS';
    controller._render = () => {};
    const airportStub = sinon.stub(AirportController, 'airport_get').returns({
        wind: { angle: Math.PI, speed: 8 }
    });

    try {
        controller.onWeatherChange({
            station: 'KLAS',
            status: 'available',
            usesLiveWeather: false,
            observation: { raw }
        });

        t.is(controller.metar, raw);
        t.is(controller.wind, '180 08');
        t.is(controller.altimeter, '29.92');
        t.false(controller.usesLiveWeather);
    } finally {
        airportStub.restore();
    }
});

ava('manual wind events do not alter the readout while live weather is active', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    controller.usesLiveWeather = true;
    controller.wind = '210 12 G19';
    controller._render = () => {};

    controller.onWindChange({ angle: 100, speed: 9 });

    t.is(controller.wind, '210 12 G19');
});

ava('airport change initializes loading weather and active runway presentation', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    controller._render = () => {};
    const airportStub = sinon.stub(AirportController, 'airport_get').returns({
        icao: 'klas',
        elevation: 2181,
        wind: { angle: Math.PI, speed: 8 },
        arrivalRunwayModel: { name: '26L' },
        departureRunwayModel: { name: '26R' }
    });

    try {
        controller.onAirportChange();

        t.is(controller.icao, 'KLAS');
        t.is(controller.wind, '180 08');
        t.is(controller.altimeter, '29.92');
        t.is(controller.metar, 'LOADING');
        t.is(controller.runways, 'ARR 26L / DEP 26R');
        t.false(controller.usesLiveWeather);
    } finally {
        airportStub.restore();
    }
});

ava('render writes METAR and runway values into their datablock rows', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    controller.icao = 'KLAS';
    controller.wind = '210 12 G19';
    controller.altimeter = '30.03';
    controller.elevation = '2181';
    controller.metar = 'KLAS 251656Z 21012G19KT 10SM CLR 32/08 A3003';
    controller.runways = 'ARR 26L / DEP 26R';
    controller.$windView = $('<span>');
    controller.$altimeterView = $('<span>');
    controller.$elevationView = $('<span>');
    controller.$metarView = $('<span>');
    controller.$runwaysView = $('<span>');

    controller._render();

    t.is(controller.$metarView.text(), controller.metar);
    t.is(controller.$runwaysView.text(), controller.runways);
});

ava('init captures weather views and initializes loading fallback state', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    controller._clockAdapter = null;

    controller.init();

    t.is(controller.$metarView.length, 1);
    t.is(controller.$runwaysView.length, 1);
    t.is(controller.metar, 'LOADING');
    t.is(controller.runways, '');
    t.false(controller.usesLiveWeather);
});

ava('reset clears weather views and state', (t) => {
    const controller = Object.create(AirportInfoController.prototype);
    controller.$metarView = $('<span>');
    controller.$runwaysView = $('<span>');
    controller.metar = 'raw';
    controller.runways = 'ARR 26L / DEP 26R';
    controller.usesLiveWeather = true;

    controller.reset();

    t.is(controller.$metarView, null);
    t.is(controller.$runwaysView, null);
    t.is(controller.metar, null);
    t.is(controller.runways, null);
    t.is(controller.usesLiveWeather, null);
});
