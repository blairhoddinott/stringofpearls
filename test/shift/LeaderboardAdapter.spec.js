import ava from 'ava';
import LeaderboardAdapter, { LeaderboardAdapterClass } from '../../src/assets/scripts/client/shift/LeaderboardAdapter';

ava('the default export is a LeaderboardAdapterClass instance', (t) => {
    t.true(LeaderboardAdapter instanceof LeaderboardAdapterClass);
});

ava('.submit() is a safe no-op that returns undefined and does not throw', (t) => {
    const adapter = new LeaderboardAdapterClass();
    const summary = Object.freeze({ finalScore: 100 });

    let result;
    t.notThrows(() => {
        result = adapter.submit(summary);
    });
    t.is(result, undefined);
});

ava('.submit() tolerates being called with no summary', (t) => {
    const adapter = new LeaderboardAdapterClass();

    t.notThrows(() => adapter.submit());
});
