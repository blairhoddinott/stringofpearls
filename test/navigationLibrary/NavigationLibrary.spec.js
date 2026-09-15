import ava from 'ava';
import NavigationLibrary from '../../src/assets/scripts/client/navigationLibrary/NavigationLibrary';
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
