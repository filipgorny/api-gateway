/**
 * Proxy method handler type
 *
 * Handler function that processes input and returns a promise with the result
 */
export type ProxyHandler = (input: any) => Promise<any>;
