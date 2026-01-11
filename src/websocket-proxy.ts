import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { createLogger, LogLevel } from '@filipgorny/logger';
import type { Schema } from '@filipgorny/service-api';

/**
 * WebSocket Proxy - Handles WebSocket connection proxying
 * 
 * Routes WebSocket connections from clients to backend services
 * based on URL path matching from service schemas.
 */
export class WebSocketProxy {
  private logger = createLogger('WebSocketProxy', LogLevel.INFO);
  private routes: Map<string, string> = new Map(); // path -> serviceUrl

  constructor() {}

  /**
   * Register WebSocket routes from a service schema
   * 
   * @param schema - Service schema containing WebSocket endpoints
   * @param routePrefix - Optional custom route prefix (overrides service name)
   */
  registerSchema(schema: Schema, routePrefix?: string): void {
    if (!schema.websocket) {
      this.logger.debug(`No WebSocket endpoints in schema: ${schema.service.name}`);
      return;
    }

    const prefix = routePrefix || schema.service.name;
    const wsEndpoints = schema.websocket;

    for (const [path, endpoint] of Object.entries(wsEndpoints)) {
      // Build full route path
      const fullPath = `/${prefix}${path}`;
      
      // Store mapping: route -> backend service URL
      this.routes.set(fullPath, schema.service.baseUrl);
      
      this.logger.info(`Registered WebSocket route: ${fullPath} -> ${schema.service.baseUrl}`);
    }
  }

  /**
   * Handle incoming WebSocket connection
   * 
   * Matches URL path against registered routes and proxies to backend
   * 
   * @param clientWs - Client WebSocket connection
   * @param request - HTTP upgrade request
   */
  handleConnection(clientWs: WebSocket, request: IncomingMessage): void {
    const url = request.url || '/';
    
    this.logger.debug(`WebSocket connection attempt: ${url}`);

    // Find matching route
    const backendUrl = this.findMatchingRoute(url);
    
    if (!backendUrl) {
      this.logger.warn(`No route found for WebSocket path: ${url}`);
      clientWs.close(1008, 'Route not found');
      return;
    }

    // Create WebSocket URL for backend
    const wsUrl = this.buildBackendWsUrl(backendUrl, url);
    
    this.logger.info(`Proxying WebSocket: ${url} -> ${wsUrl}`);

    // Connect to backend
    const backendWs = new WebSocket(wsUrl);

    // Handle backend connection open
    backendWs.on('open', () => {
      this.logger.debug(`Backend WebSocket connected: ${wsUrl}`);
    });

    // Proxy messages from client to backend
    clientWs.on('message', (data, isBinary) => {
      if (backendWs.readyState === WebSocket.OPEN) {
        backendWs.send(data, { binary: isBinary });
      }
    });

    // Proxy messages from backend to client
    backendWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    // Handle client disconnect
    clientWs.on('close', (code, reason) => {
      this.logger.debug(`Client WebSocket closed: ${code} ${reason}`);
      if (backendWs.readyState === WebSocket.OPEN) {
        backendWs.close();
      }
    });

    // Handle backend disconnect
    backendWs.on('close', (code, reason) => {
      this.logger.debug(`Backend WebSocket closed: ${code} ${reason}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(code, reason.toString());
      }
    });

    // Handle client errors
    clientWs.on('error', (error) => {
      this.logger.error('Client WebSocket error', error);
      backendWs.close();
    });

    // Handle backend errors
    backendWs.on('error', (error) => {
      this.logger.error('Backend WebSocket error', error);
      clientWs.close(1011, 'Backend error');
    });
  }

  /**
   * Find matching route for URL path
   * 
   * Supports both exact matches and parameterized routes (e.g., /api/jobs/:id/logs)
   */
  private findMatchingRoute(url: string): string | undefined {
    // Try exact match first
    if (this.routes.has(url)) {
      return this.routes.get(url);
    }

    // Try pattern matching for parameterized routes
    for (const [routePath, backendUrl] of this.routes.entries()) {
      if (this.matchesPattern(url, routePath)) {
        return backendUrl;
      }
    }

    return undefined;
  }

  /**
   * Check if URL matches route pattern
   * 
   * Supports :param syntax (e.g., /api/jobs/:id/logs matches /api/jobs/123/logs)
   */
  private matchesPattern(url: string, pattern: string): boolean {
    const urlParts = url.split('/').filter(Boolean);
    const patternParts = pattern.split('/').filter(Boolean);

    if (urlParts.length !== patternParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const urlPart = urlParts[i];

      // :param matches any value
      if (patternPart.startsWith(':')) {
        continue;
      }

      // Exact match required for non-param parts
      if (patternPart !== urlPart) {
        return false;
      }
    }

    return true;
  }

  /**
   * Build backend WebSocket URL
   * 
   * Converts http:// to ws:// and https:// to wss://
   * Strips gateway prefix from path
   */
  private buildBackendWsUrl(backendUrl: string, requestPath: string): string {
    // Convert HTTP to WS protocol
    const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
    const baseUrl = backendUrl.replace(/^https?/, wsProtocol);

    // Extract path after service prefix
    // For example: /content-collecting/api/jobs/123/logs -> /api/jobs/123/logs
    const pathParts = requestPath.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      // Remove first part (service name prefix)
      pathParts.shift();
    }
    const backendPath = '/' + pathParts.join('/');

    return `${baseUrl}${backendPath}`;
  }

  /**
   * Get all registered routes (for debugging)
   */
  getRoutes(): Map<string, string> {
    return new Map(this.routes);
  }
}
