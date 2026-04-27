export default typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch;
export const Headers = typeof window !== 'undefined' ? window.Headers : globalThis.Headers;
export const Request = typeof window !== 'undefined' ? window.Request : globalThis.Request;
export const Response = typeof window !== 'undefined' ? window.Response : globalThis.Response;
