import type {
  ApiManifest,
  Operation,
  OperationType,
} from "@filipgorny/service-api";
import { Method, MethodType } from "@filipgorny/service-api";
import { createLogger, LogLevel } from "@filipgorny/logger";
import axios from "axios";
import type { ProxyHandler } from "./gateway";

/**
 * Proxy - Represents a single backend service
 *
 * Proxy fetches schema from the service and generates proxy methods for all operations.
 * Each operation from the service becomes a method in the API Gateway.
 */
export class Proxy {
  private manifest?: ApiManifest;
  private customHandlers: Map<string, ProxyHandler> = new Map();
  private methods: Method[] = [];
  private logger;

  constructor(
    private serviceName: string,
    private serviceUrl: string,
  ) {
    this.logger = createLogger(`Proxy:${serviceName}`, LogLevel.INFO);
  }

  /**
   * Initialize: fetch schema and generate proxy methods
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing proxy for service: ${this.serviceUrl}`);
    this.manifest = await this.fetchSchema();
    this.generateProxyMethods();
    this.logger.info(`Proxy initialized with ${this.methods.length} methods`);
  }

  /**
   * Fetch schema from remote service
   */
  private async fetchSchema(): Promise<ApiManifest> {
    const schemaUrl = `${this.serviceUrl}/schema`;
    this.logger.debug(`Fetching schema from: ${schemaUrl}`);

    try {
      const response = await axios.get<ApiManifest>(schemaUrl);
      this.logger.info(`Schema fetched successfully from ${this.serviceName}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch schema from ${schemaUrl}`, error as Error);
      throw error;
    }
  }

  /**
   * Generate proxy methods for all operations
   */
  private generateProxyMethods(): void {
    if (!this.manifest) {
      const errorMsg = `Manifest not loaded. Call initialize() first.`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    this.methods = [];

    for (const operation of this.manifest.operations) {
      // Check if custom handler exists
      const customHandler = this.customHandlers.get(operation.id);

      // Create handler (custom or default)
      const handler = customHandler || this.createDefaultProxyHandler(operation);

      // Map operation to MethodType
      const methodType = this.mapOperationToMethodType(operation.operationType);

      // Create Method instance
      const method = new Method(
        methodType,
        this.buildRouteName(operation),
        handler,
        operation.description || `Proxy to ${this.serviceName}: ${operation.id}`,
      );

      this.methods.push(method);

      const handlerType = customHandler ? 'custom' : 'default';
      this.logger.debug(
        `Generated ${handlerType} proxy method: ${method.name} (${operation.operationType})`
      );
    }
  }

  /**
   * Map OperationType to MethodType
   */
  private mapOperationToMethodType(operationType: OperationType): MethodType {
    switch (operationType) {
      case "query":
        return MethodType.GET;
      case "mutation":
        // For mutations, we use CREATE by default
        // In a more sophisticated implementation, you could parse operation.id
        // to determine if it's create/update/delete
        return MethodType.CREATE;
      case "subscription":
        // Subscriptions would require WebSocket support
        // For now, treat as GET
        return MethodType.GET;
      default:
        return MethodType.GET;
    }
  }

  /**
   * Build route name from operation
   *
   * Example: "books.list" -> "books/list"
   * Adds service name prefix: "content-analyzer/detect-tasks"
   */
  private buildRouteName(operation: Operation): string {
    // Convert operation ID to route
    // "books.list" -> "books/list"
    const routePath = operation.id.replace(".", "/");

    // Add service prefix
    // "content-analyzer/detect-tasks"
    return `${this.serviceName}/${routePath}`;
  }

  /**
   * Create default proxy handler
   *
   * Sends request to the backend service
   */
  private createDefaultProxyHandler(operation: Operation): ProxyHandler {
    return async (input: any): Promise<any> => {
      const invokeUrl = `${this.serviceUrl}/internal/invoke`;

      try {
        this.logger.debug(`Proxying request to ${this.serviceName}: ${operation.id}`);

        const response = await axios.post(invokeUrl, {
          operationId: operation.id,
          input,
        });

        return response.data;
      } catch (error) {
        this.logger.error(`Proxy call failed for ${operation.id}`, error as Error);

        if (axios.isAxiosError(error)) {
          throw new Error(
            `Proxy call failed for ${operation.id}: ${error.message}`,
          );
        }
        throw error;
      }
    };
  }

  /**
   * Override proxy method with custom implementation
   *
   * Must be called BEFORE initialize()
   *
   * @param operationId - ID of operation to override (e.g. "detect-tasks")
   * @param handler - Custom handler
   */
  override(operationId: string, handler: ProxyHandler): this {
    this.customHandlers.set(operationId, handler);
    this.logger.debug(`Registered custom handler for operation: ${operationId}`);
    return this;
  }

  /**
   * Get all generated methods
   */
  getMethods(): Method[] {
    return this.methods;
  }

  /**
   * Get manifest
   */
  getManifest(): ApiManifest | undefined {
    return this.manifest;
  }

  /**
   * Get service name
   */
  getServiceName(): string {
    return this.serviceName;
  }

  /**
   * Get service URL
   */
  getServiceUrl(): string {
    return this.serviceUrl;
  }

  /**
   * Check if proxy has been initialized
   */
  isInitialized(): boolean {
    return this.manifest !== undefined && this.methods.length > 0;
  }
}
