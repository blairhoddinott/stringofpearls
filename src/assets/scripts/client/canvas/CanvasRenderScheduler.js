const DEEP_RENDER_PLAN = Object.freeze({
    renderStatic: true,
    renderDynamic: true
});
const SHALLOW_RENDER_PLAN = Object.freeze({
    renderStatic: false,
    renderDynamic: true
});

/**
 * Owns the render dirty-state and per-frame update policy for the canvas.
 *
 * This is the pure, browser-free extraction of the `_shouldShallowRender` /
 * `_shouldDeepRender` flags and the `TimeKeeper.shouldUpdate()` short-circuit
 * that previously lived inline in `CanvasController`. It references no browser
 * globals, imports no `TimeKeeper`, and performs no drawing; `CanvasController`
 * remains responsible for the actual draw calls and for supplying the
 * simulation-update predicate.
 *
 * Two independent dirty flags are tracked:
 *   - a _shallow_ (dynamic) flag, forcing a redraw of the dynamic canvas
 *   - a _deep_ (static) flag, forcing a redraw of the static canvas as well
 *
 * Both start dirty so the first frame always renders everything.
 *
 * @class CanvasRenderScheduler
 */
export default class CanvasRenderScheduler {
    /**
     * @constructor
     */
    constructor() {
        /**
         * Whether the dynamic canvas needs to be redrawn on the next frame.
         *
         * @property _shallowDirty
         * @type {boolean}
         * @default true
         * @private
         */
        this._shallowDirty = true;

        /**
         * Whether the static canvas needs to be redrawn on the next frame.
         *
         * When this is true the non-updating canvases (terrain, fix labels,
         * video map, etc.) are recalculated and re-drawn. This should only be
         * true when the view changes via zoom/pan or airport change.
         *
         * @property _deepDirty
         * @type {boolean}
         * @default true
         * @private
         */
        this._deepDirty = true;
    }

    /**
     * Decide what, if anything, should be rendered this frame.
     *
     * When the dynamic canvas is not already dirty, the supplied
     * simulation-update predicate is consulted to decide whether a frame is
     * needed. The shallow-dirty flag short-circuits the predicate exactly as
     * the original `!this._shouldShallowRender && !TimeKeeper.shouldUpdate()`
     * guard did, so a dirty dynamic canvas never calls the predicate. The
     * predicate's return value is used for its truthiness and any exception it
     * throws propagates unchanged.
     *
     * Obtaining a plan does NOT clear the dirty flags; the caller must invoke
     * `completeFrame()` once every draw has succeeded. This means a renderer
     * that throws before completion leaves the same plan pending.
     *
     * @for CanvasRenderScheduler
     * @method nextFrame
     * @param shouldUpdatePredicate {Function} returns a truthy value when the
     *                                          simulation has advanced
     * @return {object|null} `null` when nothing should render, otherwise a
     *                       frozen `{ renderStatic, renderDynamic }` plan
     */
    nextFrame(shouldUpdatePredicate) {
        if (!this._shallowDirty && !shouldUpdatePredicate()) {
            return null;
        }

        return this._deepDirty ? DEEP_RENDER_PLAN : SHALLOW_RENDER_PLAN;
    }

    /**
     * Clear the dirty flags after a frame's draws have all succeeded.
     *
     * @for CanvasRenderScheduler
     * @method completeFrame
     * @return undefined
     */
    completeFrame() {
        this._shallowDirty = false;
        this._deepDirty = false;
    }

    /**
     * Mark the dynamic canvas dirty, forcing a redraw on the next frame.
     *
     * @for CanvasRenderScheduler
     * @method markShallow
     * @return undefined
     */
    markShallow() {
        this._shallowDirty = true;
    }

    /**
     * Mark both the static and dynamic canvases dirty, forcing a full redraw on
     * the next frame.
     *
     * @for CanvasRenderScheduler
     * @method markDeep
     * @return undefined
     */
    markDeep() {
        this._deepDirty = true;
        this.markShallow();
    }

    /**
     * Restore the initial state where both canvases are dirty.
     *
     * @for CanvasRenderScheduler
     * @method reset
     * @return undefined
     */
    reset() {
        this._shallowDirty = true;
        this._deepDirty = true;
    }
}
