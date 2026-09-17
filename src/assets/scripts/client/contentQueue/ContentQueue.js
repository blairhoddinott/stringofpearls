/**
 * Asynchronous JSON asset loading framework.
 *
 * Allows queueing assets to be loaded, assets may queued at a higher
 * priority by specifying the `immediate` option.  All assets with the
 * `immediate` option will be loaded before other assets.
 *
 * Events:
 *   startLoading - When an asset start being loaded, asset url as data
 *   stopLoading - When the last asset in the queue is downloaded
 *
 * Example:
 *  const promise = contentQueue.addPromise({ url: 'assets/aircraft/b747.json' });
 *
 * @module ContentQueue
 */
/**
* Implementation of the queueing
*/
export default class ContentQueueClass {
    constructor(loadingView, assetLoader = null) {
        this.loadingView = loadingView;
        this._assetLoader = assetLoader == null ? null : assetLoader;
        this.isLoading = false;
        this.lowPriorityQueue = [];
        this.highPriorityQueue = [];
        this.queuedContent = {};
    }

    /**
     * Adds or updates a queued piece of content, returning a native Promise
     * that settles with the loaded asset.
     *
     * Requests for a url already in flight share the same Promise and issue a
     * single transport request. A duplicate request may upgrade a pending
     * low-priority url to `immediate`, promoting it into the high-priority
     * queue exactly once while retaining the original Promise.
     *
     * @for ContentQueue
     * @method addPromise
     * @param options {object}
     * @return {Promise}
     */
    addPromise(options) {
        const { url } = options;
        const immediate = Boolean(options.immediate);

        if (this._assetLoader === null) {
            return Promise.reject(new Error('ContentQueue requires an asset loader'));
        }

        if (url in this.queuedContent) {
            const existing = this.queuedContent[url];

            if (immediate && !existing.immediate) {
                const idx = this.lowPriorityQueue.indexOf(url);

                if (idx > -1) {
                    this.lowPriorityQueue.splice(idx, 1);
                    this.highPriorityQueue.push(url);
                }

                existing.immediate = true;
            }

            return existing.promise;
        }

        let resolveEntry;
        let rejectEntry;
        const promise = new Promise((resolve, reject) => {
            resolveEntry = resolve;
            rejectEntry = reject;
        });

        this.queuedContent[url] = {
            url,
            immediate,
            promise,
            resolve: resolveEntry,
            reject: rejectEntry
        };

        if (immediate) {
            this.highPriorityQueue.push(url);
        } else {
            this.lowPriorityQueue.push(url);
        }

        if (!this.isLoading) {
            this.startLoad();
        }

        return promise;
    }

    /**
     * @for ContentQueue
     * @method startLoad
     * @return {boolean}
     */
    startLoad() {
        if (this.highPriorityQueue.length) {
            this.load(this.highPriorityQueue.shift());

            return true;
        } else if (this.lowPriorityQueue.length) {
            this.load(this.lowPriorityQueue.shift());

            return true;
        }

        return false;
    }

    /**
     * @for contentQueue
     * @method load
     * @param url {string}
     * @return {Promise}
     */
    load(url) {
        const entry = this.queuedContent[url];

        return this._assetLoader.loadJson(entry.url).then(
            (data) => {
                delete this.queuedContent[entry.url];
                entry.resolve(data);
            },
            (error) => {
                delete this.queuedContent[entry.url];
                entry.reject(error);
            }
        );
    }
}
