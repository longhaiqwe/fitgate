// Compatibility adapter for the original, locally bundled workout modules.
const api = window.fitgate;
window.chrome = {
  runtime: {
    getURL: path => `fitgate://app/${path.replace(/^\//, '')}`,
    sendMessage(message, callback) {
      const result = api.message(message);
      result.then(value => callback?.(value)).catch(error => {
        console.error(error);
        callback?.({ success: false, error: error.message });
      });
      return result;
    }
  },
  storage: { local: {
    get(keys, callback) { api.storageGet(keys).then(callback); },
    set(values, callback) { api.storageSet(values).then(() => callback?.()); }
  } }
};
