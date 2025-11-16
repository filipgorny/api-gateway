import { RestApi, Strategy } from "@filipgorny/service-api";
import { createLogger, LogLevel } from "@filipgorny/logger";
import { Proxy } from "./proxy";

/**
 * ProxyApi - Manages collection of Proxy instances and generates API Gateway
 *
 * ProxyApi accepts multiple Proxy instances (representing backend services)
 * and generates one unified API from all proxy methods.
 *
 * Example usage:
 * ```typescript
 * const contentAnalyzer = new Proxy("content-analyzer", "http://localhost:3001");
 * const llmService = new Proxy("llm-service", "http://localhost:3003");
 *
 * const api = new ProxyApi(express(3000));
 * api.addProxy(contentAnalyzer);
 * api.addProxy(llmService);
 *
 * await api.initialize();
 * api.run();
 * ```
 */
export class ProxyApi extends RestApi {
  private proxies: Proxy[] = [];
  private logger = createLogger("ProxyApi", LogLevel.INFO);

  constructor(strategy: Strategy, addDefaultMethods = true) {
    super(strategy, addDefaultMethods);
  }

  /**
   * Add Proxy to the collection
   *
   * @param proxy - Proxy instance representing a service
   */
  addProxy(proxy: Proxy): this {
    this.proxies.push(proxy);
    this.logger.debug(`Added proxy for service: ${proxy.getServiceName()}`);
    return this;
  }

  /**
   * Add multiple Proxies at once
   *
   * @param proxies - Array of Proxy instances
   */
  addProxies(proxies: Proxy[]): this {
    this.proxies.push(...proxies);
    this.logger.debug(`Added ${proxies.length} proxies`);
    return this;
  }

  /**
   * Initialize: initialize all proxies and register their methods
   *
   * For each Proxy:
   * 1. Call proxy.initialize() - fetches schema and generates methods
   * 2. Register all methods from the proxy in API Gateway
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing ProxyApi with ${this.proxies.length} services`);

    // Initialize all proxies in parallel
    await Promise.all(
      this.proxies.map((proxy) =>
        proxy.initialize().catch((error) => {
          this.logger.error(
            `Failed to initialize proxy for ${proxy.getServiceName()}`,
            error,
          );
          throw error;
        }),
      ),
    );

    // Register all methods from all proxies
    this.registerProxyMethods();

    this.logger.info(`ProxyApi initialized successfully`);
  }

  /**
   * Register methods from all proxies
   */
  private registerProxyMethods(): void {
    let totalMethods = 0;

    for (const proxy of this.proxies) {
      const methods = proxy.getMethods();

      for (const method of methods) {
        this.registerMethod(method);
      }

      totalMethods += methods.length;

      this.logger.info(
        `Registered ${methods.length} methods from ${proxy.getServiceName()}`,
      );
    }

    this.logger.info(
      `Total registered methods from ${this.proxies.length} services: ${totalMethods}`,
    );
  }

  /**
   * Get all proxies
   */
  getProxies(): Proxy[] {
    return this.proxies;
  }

  /**
   * Find proxy by service name
   *
   * @param serviceName - Service name
   */
  getProxy(serviceName: string): Proxy | undefined {
    return this.proxies.find((p) => p.getServiceName() === serviceName);
  }

  /**
   * Check if proxy for service exists
   */
  hasProxy(serviceName: string): boolean {
    return this.proxies.some((p) => p.getServiceName() === serviceName);
  }

  /**
   * Remove proxy for service
   *
   * WARNING: Does not remove already registered methods!
   * This method should be called BEFORE initialize()
   */
  removeProxy(serviceName: string): boolean {
    const index = this.proxies.findIndex(
      (p) => p.getServiceName() === serviceName,
    );

    if (index !== -1) {
      this.proxies.splice(index, 1);
      this.logger.debug(`Removed proxy for service: ${serviceName}`);
      return true;
    }

    this.logger.warn(`Proxy not found for service: ${serviceName}`);
    return false;
  }

  /**
   * Run proxy API (inherited from RestApi)
   * Ensures proxies are configured before starting
   */
  run(): void {
    if (this.proxies.length === 0) {
      this.logger.warn(
        "No proxies registered! Add proxies via addProxy() before run()",
      );
    }

    super.run();
  }

  /**
   * Get underlying strategy for testing purposes
   */
  getStrategy(): Strategy {
    return this.strategy;
  }
}
