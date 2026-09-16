import ava from 'ava';
import SimulationClock from '../../src/assets/scripts/client/simulation/SimulationClock';

ava('tick advances elapsed time by each explicit delta in order', (t) => {
    const clock = new SimulationClock();

    clock.tick(0.25);
    t.is(clock.deltaTime, 0.25);
    t.is(clock.elapsedTime, 0.25);

    clock.tick(1.5);
    t.is(clock.deltaTime, 1.5);
    t.is(clock.elapsedTime, 1.75);
});

ava('accumulatedDeltaTime exposes elapsed time for legacy consumer migration', (t) => {
    const clock = new SimulationClock();

    clock.tick(1.5);

    t.is(clock.accumulatedDeltaTime, 1.5);
});

ava('tick applies the simulation rate and returns the effective delta', (t) => {
    const clock = new SimulationClock();

    clock.updateSimulationRate(3);
    const result = clock.tick(0.5);

    t.is(result, 1.5);
    t.is(clock.deltaTime, 1.5);
    t.is(clock.elapsedTime, 1.5);
    t.is(clock.simulationRate, 3);
});

ava('updateSimulationRate ignores negative values but accepts zero', (t) => {
    const clock = new SimulationClock();

    clock.updateSimulationRate(3);
    clock.updateSimulationRate(-1);
    t.is(clock.simulationRate, 3);

    clock.updateSimulationRate(0);
    t.is(clock.simulationRate, 0);
    t.is(clock.tick(5), 0);
    t.is(clock.elapsedTime, 0);
});

ava('setPause freezes ticks and resume advances only by the next explicit delta', (t) => {
    const clock = new SimulationClock();

    clock.tick(1);
    clock.setPause(true);
    t.true(clock.isPaused);
    t.is(clock.tick(30), 0);
    t.is(clock.deltaTime, 0);
    t.is(clock.elapsedTime, 1);

    clock.setPause(false);
    t.false(clock.isPaused);
    t.is(clock.tick(0.25), 0.25);
    t.is(clock.elapsedTime, 1.25);
});

ava('tick caps the effective simulation delta at the inherited maximum', (t) => {
    const clock = new SimulationClock();

    clock.updateSimulationRate(50);

    t.is(clock.tick(3), 100);
    t.is(clock.deltaTime, 100);
    t.is(clock.elapsedTime, 100);
});
