/**
 * Boundary/seam for a future leaderboard integration.
 *
 * A shift, when it ends, hands its immutable summary DTO to a leaderboard
 * adapter exactly once. This default implementation is a deliberate no-op: it
 * performs no network request, no persistence, requires no credentials, and
 * talks to no backend. A real implementation can be injected into the
 * `ShiftController` in its place without any other change to the shift domain.
 *
 * @class LeaderboardAdapterClass
 */
export class LeaderboardAdapterClass {
    /**
     * Receive the summary of a finished shift.
     *
     * Intentionally does nothing so the default build never leaks shift data.
     *
     * @for LeaderboardAdapterClass
     * @method submit
     * @param summary {object} immutable shift summary DTO
     */
    // eslint-disable-next-line no-unused-vars
    submit(summary) {}
}

export default new LeaderboardAdapterClass();
