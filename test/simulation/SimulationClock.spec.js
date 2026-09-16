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
