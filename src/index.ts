export { Gateway } from "./gateway";
export { ProxyApi } from "./proxy-api";
export { Proxy } from "./proxy";
export type { ProxyHandler } from "./gateway";

// Re-export types from service-api for convenience
export type {
  ApiManifest,
  ServiceInfo,
  Operation,
  OperationType,
  SchemaReference,
  JsonSchema,
  PropertySchema,
  SchemaDefinition,
} from "@filipgorny/service-api";
