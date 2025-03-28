/**
 * Removes properties marked with `skipHydrate()` to avoid sending unused data to the client.
 */
declare const payloadPlugin: import("nuxt/app").Plugin<Record<string, unknown>> & import("nuxt/app").ObjectPlugin<Record<string, unknown>>;
export default payloadPlugin;
