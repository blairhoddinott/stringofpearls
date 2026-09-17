import ava from 'ava';
import NavigationLibrary, { NavigationLibraryClass } from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
import { FixCollectionClass } from '../../src/assets/scripts/client/navigationLibrary/FixCollection';
import { AIRPORT_JSON_KLAS_MOCK } from '../airport/_mocks/airportJsonMock';
import { PROCEDURE_TYPE } from '../../src/assets/scripts/client/constants/routeConstants';

ava.afterEach.always(() => {
    NavigationLibrary.reset();
    NavigationLibrary.initRandomSource();
});

ava('throws when attempting to create an instance', (t) => {
    t.throws(() => new NavigationLibrary());
    t.throws(() => new NavigationLibrary(AIRPORT_JSON_KLAS_MOCK));
});

ava('constructible libraries retain isolated injected fix collections', (t) => {
    const firstFixCollection = new FixCollectionClass();
    const secondFixCollection = new FixCollectionClass();
    const first = new NavigationLibraryClass(firstFixCollection);
    const second = new NavigationLibraryClass(secondFixCollection);

    first.init(AIRPORT_JSON_KLAS_MOCK);

    t.is(first.fixCollection, firstFixCollection);
    t.is(second.fixCollection, secondFixCollection);
    t.truthy(first.findFixByName('BAKRR'));
    t.is(second.findFixByName('BAKRR'), null);
});

ava('airway waypoints resolve positions through the owning navigation library', (t) => {
    const navigationLibrary = new NavigationLibraryClass();
    const [airwayId] = Object.keys(AIRPORT_JSON_KLAS_MOCK.airways);
    const [entryName, exitName] = AIRPORT_JSON_KLAS_MOCK.airways[airwayId];

    navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);

    const [entryWaypoint, exitWaypoint] = navigationLibrary
        .getAirway(airwayId)
        .getWaypointModelsForEntryAndExit(entryName, exitName);

    t.is(entryWaypoint.positionModel, navigationLibrary.findFixByName(entryName).positionModel);
    t.is(exitWaypoint.positionModel, navigationLibrary.findFixByName(exitName).positionModel);
});

ava('procedure waypoints resolve positions through the owning navigation library', (t) => {
    const navigationLibrary = new NavigationLibraryClass();

    navigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);

    const [procedure] = navigationLibrary.getProceduresByType(PROCEDURE_TYPE.SID);
    const [entryName] = Object.keys(procedure._entryPoints);
    const [exitName] = Object.keys(procedure._exitPoints);
    const waypoint = procedure
        .getWaypointModelsForEntryAndExit(entryName, exitName)
        .find((candidate) => candidate.positionModel != null);

    t.is(waypoint.positionModel, navigationLibrary.findFixByName(waypoint.name).positionModel);
});

ava('.getAllFixNamesInUse() returns list of all fix names used in all procedures and airways', (t) => {
    NavigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);

    const fixNameList = NavigationLibrary._getAllFixNamesInUse();

    t.true(fixNameList.length === 93);
});

ava('._holdCollection() is populated correctly', (t) => {
    NavigationLibrary.reset();
    NavigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    const bakkrHold = NavigationLibrary.findHoldParametersByFix('BAKRR');
    // "360|right|4nm|S230-"
    const expectedResult = {
        inboundHeading: Math.PI,
        turnDirection: 'right',
        legLength: '4nm',
        speedMaximum: 230
    };

    t.deepEqual(bakkrHold, expectedResult);
});

ava('.getFixSpokenName() returns input in lowercase if fix does not exist', (t) => {
    NavigationLibrary.reset();
    NavigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    const result = NavigationLibrary.getFixSpokenName('ASDFG');

    t.deepEqual(result, 'asdfg');
});

ava.serial('.init() threads the configured randomSource by identity to every ProcedureModel it builds', (t) => {
    const randomSourceStub = { integer: () => 0 };
    NavigationLibrary.initRandomSource(randomSourceStub);
    NavigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);

    const procedures = NavigationLibrary.getProceduresByType(PROCEDURE_TYPE.SID)
        .concat(NavigationLibrary.getProceduresByType(PROCEDURE_TYPE.STAR));

    t.true(procedures.length > 0);
    procedures.forEach((procedureModel) => {
        t.is(procedureModel._randomSource, randomSourceStub);
    });

});

ava.serial('.reset() retains the configured randomSource for subsequent airport rebuilds', (t) => {
    const randomSourceStub = { integer: () => 0 };
    NavigationLibrary.initRandomSource(randomSourceStub);
    NavigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);

    NavigationLibrary.reset();

    t.is(NavigationLibrary._randomSource, randomSourceStub);

    // rebuild without re-supplying the source
    NavigationLibrary.init(AIRPORT_JSON_KLAS_MOCK);
    const [procedureModel] = NavigationLibrary.getProceduresByType(PROCEDURE_TYPE.SID);

    t.is(procedureModel._randomSource, randomSourceStub);
});
