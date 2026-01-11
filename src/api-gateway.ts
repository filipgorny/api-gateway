import type { Schema, Strategy } from "@filipgorny/service-api";
import { MethodsCollection } from "@filipgorny/service-api";
import { createLogger, LogLevel } from "@filipgorny/logger";
import { ProxyApi } from "./proxy-api";
import { Proxy } from "./proxy";
import axios from "axios";

/**
 * ApiGateway - Main class for creating and managing ProxyApis
 *
 * ApiGateway uses Composite pattern to manage multiple ProxyApi instances.
 * Each ProxyApi can contain multiple proxy services.
 *
 * Example usage:
 * ```typescript
 * const gateway = new ApiGateway(express(3000));
 *
 * // Create proxy API from schema
 * const proxyApi1 = gateway.createProxyApi(schema1);QQ
 * const proxyApi2 = gateway.createProxyApi(schema2);
 *
 * // Or create empty ProxyApi and add proxies manually
 * const proxyApi3 = gateway.createProxyApi();
 * proxyApi3.addProxy(new Proxy("service1", "http://localhost:3001"));
 *
 * await gateway.initialize();
 * gateway.run();
 * ```
 */
export class ApiGateway {
  private proxyApis: ProxyApi[] = [];
  private logger = createLogger("ApiGateway", LogLevel.INFO);
  private mainProxyApi?: ProxyApi;
  private version = "1.0.0";

  constructor(
    private strategy: Strategy,
    private addDefaultMethods = true,
  ) {}

  /**
   * Create new ProxyApi instance from schema or empty
   *
   * @param schema - Optional schema from remote service
   * @param routePrefix - Optional custom route prefix for this proxy
   * @returns ProxyApi instance
   */
  createProxyApi(schema?: Schema, routePrefix?: string): ProxyApi {
    const proxyApi = new ProxyApi(this.strategy, this.addDefaultMethods);

    if (schema) {
      // Create Proxy from schema with optional custom prefix
      const proxy = Proxy.fromSchema(schema, routePrefix);
      proxyApi.addProxy(proxy);

      this.logger.debug(`Created ProxyApi from schema: ${schema.service.name}`);
    }

    this.proxyApis.push(proxyApi);
    this.logger.debug(
      `Created ProxyApi. Total ProxyApis: ${this.proxyApis.length}`,
    );

    return proxyApi;
  }

  /**
   * Fetch schema from remote service URL and create ProxyApi
   *
   * @param serviceUrl - URL to service (e.g., "http://localhost:3001")
   * @param routePrefix - Optional custom route prefix for this proxy
   * @returns ProxyApi instance with fetched schema
   */
  async fetchSchema(
    serviceUrl: string,
    routePrefix?: string,
  ): Promise<ProxyApi> {
    this.logger.info(`Fetching schema from: ${serviceUrl}`);

    try {
      const schemaUrl = `${serviceUrl}/schema`;
      const response = await axios.get<Schema>(schemaUrl);
      const schema = response.data;

      this.logger.info(
        `Schema fetched successfully from ${schema.service.name}`,
      );

      // Override schema baseUrl with actual serviceUrl used for fetching
      schema.service.baseUrl = serviceUrl;

      // Create ProxyApi with fetched schema and optional custom prefix
      return this.createProxyApi(schema, routePrefix);
    } catch (error) {
      this.logger.error(
        `Failed to fetch schema from ${serviceUrl}`,
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Get all ProxyApis (Composite pattern)
   *
   * @returns Array of ProxyApi instances
   */
  getApis(): ProxyApi[] {
    return this.proxyApis;
  }

  /**
   * Initialize all ProxyApis
   */
  async initialize(): Promise<void> {
    this.logger.info(
      `Initializing ApiGateway with ${this.proxyApis.length} ProxyApis`,
    );

    await Promise.all(
      this.proxyApis.map((proxyApi) =>
        proxyApi.initialize().catch((error) => {
          this.logger.error(`Failed to initialize ProxyApi`, error);
          throw error;
        }),
      ),
    );

    this.logger.info(`ApiGateway initialized successfully`);
  }

  /**
   * Run the gateway
   *
   * Since all ProxyApis share the same strategy, we only need to run once.
   * We merge all proxy methods into a single ProxyApi.
   */
  async run(): Promise<void> {
    await this.initialize();

    const allMethods = [];
    for (const proxyApi of this.proxyApis) {
      for (const proxy of proxyApi.getProxies()) {
        allMethods.push(...proxy.getMethods());
      }
    }

    const methodsCollection = new MethodsCollection();
    for (const method of allMethods) {
      methodsCollection.add(method);
    }

    this.strategy.configure(methodsCollection, this.version);
    this.strategy.onApiRun();

    this.logger.info("ApiGateway started");
  }

  /**
   * Create composite ProxyApi from all registered ProxyApis
   *
   * This merges all proxies from all ProxyApis into one
   */
  private createCompositeProxyApi(): ProxyApi {
    const compositeApi = new ProxyApi(this.strategy, this.addDefaultMethods);

    // Collect all proxies from all ProxyApis
    const allProxies = this.proxyApis.flatMap((proxyApi) =>
      proxyApi.getProxies(),
    );

    compositeApi.addProxies(allProxies);

    this.logger.info(
      `Created composite ProxyApi with ${allProxies.length} proxies from ${this.proxyApis.length} ProxyApis`,
    );

    return compositeApi;
  }

  /**
   * Get the main composite ProxyApi
   */
  getMainApi(): ProxyApi | undefined {
    return this.mainProxyApi;
  }

  /**
   * Shutdown the gateway
   */
  async shutdown(): Promise<void> {
    if (this.mainProxyApi) {
      await this.mainProxyApi.shutdown();
    }
  }
}
