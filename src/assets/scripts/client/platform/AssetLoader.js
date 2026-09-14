export const formatAssetLoadError = (error) => {
    if (error && error.status !== undefined) {
        return `${error.status}: ${error.statusText}`;
    }

    if (error && error.message) {
        return error.message;
    }

    return String(error);
};

export class AssetLoadError extends Error {
    constructor(request, textStatus, errorThrown) {
        super(errorThrown?.message || request?.statusText || textStatus || 'Asset load failed');

        this.name = 'AssetLoadError';
        this.request = request;
        this.status = request?.status;
        this.statusText = request?.statusText;
        this.textStatus = textStatus;
        this.errorThrown = errorThrown;
    }
}

export default class AssetLoader {
    constructor(loadJson) {
        this._loadJson = loadJson;
    }

    loadJson(url) {
        return Promise.resolve().then(() => {
            const request = this._loadJson(url);

            if (!request || typeof request.done !== 'function' || typeof request.fail !== 'function') {
                return request;
            }

            return new Promise((resolve, reject) => {
                request.done((data) => resolve(data));
                request.fail((jqXHR, textStatus, errorThrown) => {
                    reject(new AssetLoadError(jqXHR, textStatus, errorThrown));
                });
            });
        });
    }
}
