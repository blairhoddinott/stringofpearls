export const formatAssetLoadError = (error) => {
    if (error && error.status !== undefined) {
        return `${error.status}: ${error.statusText}`;
    }

    if (error && error.message) {
        return error.message;
    }

    return String(error);
};

export default class AssetLoader {
    constructor(loadJson) {
        this._loadJson = loadJson;
    }

    loadJson(url) {
        return Promise.resolve().then(() => this._loadJson(url));
    }
}
