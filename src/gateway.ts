import axios from "axios";
import type {
  ApiManifest,
  Operation,
  OperationType,
} from "@filipgorny/service-api";

/**
 * Proxy method handler type
 */
export type ProxyHandler = (input: any) => Promise<any>;

/**
 * Gateway class - Creates proxy methods from remote service schema
 */
export class Gateway {
  private manifest?: ApiManifest;
  private proxyMethods: Map<string, ProxyHandler> = new Map();
  private customHandlers: Map<string, ProxyHandler> = new Map();

  constructor(private serviceUrl: string) {}

  /**
   * Fetch schema from remote service and generate proxy methods
   */
  async initialize(): Promise<void> {
    this.manifest = await this.fetchSchema();
    this.generateProxyMethods();
  }

  /**
   * Fetch schema manifest from remote service
   */
  private async fetchSchema(): Promise<ApiManifest> {
    const schemaUrl = `${this.serviceUrl}/schema`;
    const response = await axios.get<ApiManifest>(schemaUrl);
    return response.data;
  }

  /**
   * Generate proxy methods for all operations in the manifest
   */
  private generateProxyMethods(): void {
    if (!this.manifest) {
      throw new Error("Manifest not loaded. Call initialize() first.");
    }

    for (const operation of this.manifest.operations) {
      // Skip if custom handler already exists
      if (this.customHandlers.has(operation.id)) {
        continue;
      }

      // Create default proxy handler
      const handler = this.createDefaultProxyHandler(operation);
      this.proxyMethods.set(operation.id, handler);
    }
  }

  /**
   * Create default proxy handler for an operation
   * This handler simply forwards the request to the service
   */
  private createDefaultProxyHandler(operation: Operation): ProxyHandler {
    return async (input: any): Promise<any> => {
      // Default implementation: call service's internal invoke endpoint
      // (services would need to implement POST /internal/invoke endpoint)
      const invokeUrl = `${this.serviceUrl}/internal/invoke`;

      try {
        const response = await axios.post(invokeUrl, {
          operationId: operation.id,
          input,
        });
        return response.data;
      } catch (error) {
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
   * Override a generated proxy method with custom implementation
   */
  override(operationId: string, handler: ProxyHandler): this {
    this.customHandlers.set(operationId, handler);
    this.proxyMethods.set(operationId, handler);
    return this;
  }

  /**
   * Get proxy handler for an operation
   */
  getHandler(operationId: string): ProxyHandler | undefined {
    return this.proxyMethods.get(operationId);
  }

  /**
   * Get all operation IDs
   */
  getOperationIds(): string[] {
    return Array.from(this.proxyMethods.keys());
  }

  /**
   * Get manifest
   */
  getManifest(): ApiManifest | undefined {
    return this.manifest;
  }

  /**
   * Call a proxy method
   */
  async call(operationId: string, input?: any): Promise<any> {
    const handler = this.proxyMethods.get(operationId);

    if (!handler) {
      throw new Error(`Operation ${operationId} not found`);
    }

    return handler(input);
  }

  /**
   * Get operations by type
   */
  getOperationsByType(type: OperationType): Operation[] {
    if (!this.manifest) {
      return [];
    }

    return this.manifest.operations.filter((op) => op.operationType === type);
  }
}
