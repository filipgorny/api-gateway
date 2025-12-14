import type { Schema, Operation, OperationType } from "@filipgorny/service-api";
import { Method, MethodType } from "@filipgorny/service-api";
import { createLogger, LogLevel } from "@filipgorny/logger";
import axios from "axios";
import type { ProxyHandler } from "./proxy-handler";

/**
 * Proxy - Represents a single backend service
 *
 * Proxy fetches schema from the service and generates proxy methods for all operations.
 * Each operation from the service becomes a method in the API Gateway.
 */
export class Proxy {
  private schema?: Schema;
  private customHandlers: Map<string, ProxyHandler> = new Map();
  private methods: Method[] = [];
  private logger;

  constructor(
    private serviceName: string,
    private serviceUrl: string,
    private routePrefix?: string, // Optional custom route prefix
  ) {
    this.logger = createLogger(`Proxy:${serviceName}`, LogLevel.INFO);
  }

  /**
   * Create Proxy instance from Schema
   *
   * @param schema - Schema from remote service
   * @param routePrefix - Optional custom route prefix (overrides service name)
   * @returns Proxy instance (already initialized)
   */
  static fromSchema(schema: Schema, routePrefix?: string): Proxy {
    const proxy = new Proxy(
      schema.service.name,
      schema.service.baseUrl,
      routePrefix,
    );
    proxy.schema = schema;
    proxy.generateProxyMethods();
    proxy.logger.info(
      `Proxy created from schema with ${proxy.methods.length} methods`,
    );
    return proxy;
  }

  /**
   * Initialize: fetch schema and generate proxy methods
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing proxy for service: ${this.serviceUrl}`);
    this.schema = await this.fetchSchema();
    this.generateProxyMethods();
    this.logger.info(`Proxy initialized with ${this.methods.length} methods`);
  }

  /**
   * Fetch schema from remote service
   */
  private async fetchSchema(): Promise<Schema> {
    const schemaUrl = `${this.serviceUrl}/schema`;
    this.logger.debug(`Fetching schema from: ${schemaUrl}`);

    try {
      const response = await axios.get<Schema>(schemaUrl);
      this.logger.info(`Schema fetched successfully from ${this.serviceName}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch schema from ${schemaUrl}`,
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Generate proxy methods for all operations
   */
  private generateProxyMethods(): void {
    if (!this.schema) {
      const errorMsg = `Schema not loaded. Call initialize() first.`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    this.methods = [];

    for (const operation of this.schema.operations) {
      // Check if custom handler exists
      const customHandler = this.customHandlers.get(operation.id);

      // Create handler (custom or default)
      const handler =
        customHandler || this.createDefaultProxyHandler(operation);

      // Map operation to MethodType
      const methodType = this.mapOperationToMethodType(operation.operationType);

      // Create Method instance
      const method = new Method(
        methodType,
        this.buildRouteName(operation),
        handler,
        operation.description ||
          `Proxy to ${this.serviceName}: ${operation.id}`,
      );

      this.methods.push(method);

      const handlerType = customHandler ? "custom" : "default";
      this.logger.debug(
        `Generated ${handlerType} proxy method: ${method.name} (${operation.operationType})`,
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
   * Uses operation.rest.path directly for REST APIs
   * Falls back to operation.id for other protocols
   */
  private buildRouteName(operation: Operation): string {
    // Use custom route prefix if provided, otherwise use service name
    const prefix = this.routePrefix || this.serviceName;

    // For REST APIs, use the path directly from the operation
    if (operation.rest?.path) {
      // Remove leading slash to avoid double slashes
      const path = operation.rest.path.replace(/^\//, "");
      return `${prefix}/${path}`;
    }

    // Fallback: convert operation ID to route
    const routePath = operation.id.replace(".", "/");
    return `${prefix}/${routePath}`;
  }

  /**
   * Create default proxy handler
   *
   * Maps to actual service endpoint based on protocol
   */
  private createDefaultProxyHandler(operation: Operation): ProxyHandler {
    return async (input: any): Promise<any> => {
      try {
        this.logger.debug(
          `Proxying request to ${this.serviceName}: ${operation.id}`,
        );

        // Handle based on protocol
        if (operation.rest) {
          return await this.callRestEndpoint(operation, input);
        } else if (operation.graphql) {
          return await this.callGraphQLEndpoint(operation, input);
        } else if (operation.grpc) {
          throw new Error("gRPC not yet implemented");
        } else {
          throw new Error(`Unknown protocol for operation ${operation.id}`);
        }
      } catch (error) {
        this.logger.error(
          `Proxy call failed for ${operation.id}`,
          error as Error,
        );

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
   * Call REST endpoint
   */
  private async callRestEndpoint(
    operation: Operation,
    input: any,
  ): Promise<any> {
    if (!operation.rest) {
      throw new Error("REST details missing");
    }

    const url = `${this.serviceUrl}${operation.rest.path}`;
    const method = operation.rest.method.toLowerCase() as
      | "get"
      | "post"
      | "put"
      | "delete"
      | "patch";

    this.logger.debug(`Calling REST: ${operation.rest.method} ${url}`);

    const config: any = {
      method,
      url,
      headers: {
        "Content-Type": "application/json",
      },
    };

    // GET requests use query params, others use body
    if (method === "get") {
      config.params = input;
    } else {
      config.data = input;
    }

    const response = await axios(config);
    return response.data;
  }

  /**
   * Call GraphQL endpoint
   */
  private async callGraphQLEndpoint(
    operation: Operation,
    input: any,
  ): Promise<any> {
    if (!operation.graphql) {
      throw new Error("GraphQL details missing");
    }

    const url = `${this.serviceUrl}/graphql`;

    this.logger.debug(`Calling GraphQL: ${operation.graphql.query}`);

    const response = await axios.post(url, {
      query: operation.graphql.query,
      variables: input,
    });

    return response.data;
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
    this.logger.debug(
      `Registered custom handler for operation: ${operationId}`,
    );
    return this;
  }

  /**
   * Get all generated methods
   */
  getMethods(): Method[] {
    return this.methods;
  }

  /**
   * Get schema
   */
  getSchema(): Schema | undefined {
    return this.schema;
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
    return this.schema !== undefined && this.methods.length > 0;
  }
}
