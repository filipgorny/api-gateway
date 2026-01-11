export { ApiGateway } from "./api-gateway";
export { ProxyApi } from "./proxy-api";
export { Proxy } from "./proxy";
export { WebSocketProxy } from "./websocket-proxy";
export type { ProxyHandler } from "./proxy-handler";

// Re-export types from service-api for convenience
export { Schema } from "@filipgorny/service-api";
export type {
  ServiceInfo,
  Operation,
  OperationType,
  SchemaReference,
  JsonSchema,
  PropertySchema,
  SchemaDefinition,
  ProtocolType,
  HttpMethod,
  WsEndpointSchema,
} from "@filipgorny/service-api";
