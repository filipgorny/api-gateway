# @filipgorny/api-gateway

API Gateway library for request proxying in microservices architecture.

Built on top of [@filipgorny/service-api](../service-api) - provides seamless integration with services using the service-api framework.

## Features

- 🎯 **Request Proxying**: Proxy requests to backend services
- 📡 **Schema Fetching**: Automatically fetch service schemas from `/schema` endpoint
- 📝 **Type-Safe**: Full TypeScript support
- 🔌 **Protocol-Agnostic**: Works with any service using @filipgorny/service-api
- 🎨 **Custom Handlers**: Override default proxying with custom logic

## Installation

```bash
pnpm add @filipgorny/api-gateway
```

## Usage

### Basic Example (New API - Recommended)

```typescript
import { ApiGateway } from "@filipgorny/api-gateway";
import { Proxy } from "@filipgorny/api-gateway";
import { express } from "@filipgorny/service-api";

// Create API Gateway
const gateway = new ApiGateway(express(3000));

// Create ProxyApi instances
const proxyApi1 = gateway.createProxyApi();
proxyApi1.addProxy(new Proxy("content-analyzer", "http://localhost:3001"));
proxyApi1.addProxy(new Proxy("llm-service", "http://localhost:3003"));

// Or create from Schema
const schema = await fetchSchemaFromSomewhere();
const proxyApi2 = gateway.createProxyApi(schema);

// Initialize (fetches schemas and generates routes)
await gateway.initialize();

// Start the gateway
gateway.run();
```

### Using ProxyApi Directly (Legacy)

```typescript
import { ProxyApi, Proxy } from "@filipgorny/api-gateway";
import { express } from "@filipgorny/service-api";

// Create proxies for your services
const contentAnalyzer = new Proxy("content-analyzer", "http://localhost:3001");

const llmService = new Proxy("llm-service", "http://localhost:3003");

// Create API Gateway
const gateway = new ProxyApi(express(3000));

// Add proxies
gateway.addProxy(contentAnalyzer).addProxy(llmService);

// Initialize (fetches schemas and generates routes)
await gateway.initialize();

// Start the gateway
gateway.run();
```

### With Custom Handler

```typescript
const contentAnalyzer = new Proxy("content-analyzer", "http://localhost:3001");

// Override specific operation
contentAnalyzer.override("detect-tasks", async (input) => {
  // Custom logic here
  // Use logger for logging instead of console.log

  // Call original service or implement custom logic
  return { tasks: [], confidence: 0.95 };
});

const gateway = new ProxyApi(express(3000));
gateway.addProxy(contentAnalyzer);

await gateway.initialize();
gateway.run();
```

### Multiple Proxies

```typescript
const proxies = [
  new Proxy("service-a", "http://localhost:3001"),
  new Proxy("service-b", "http://localhost:3002"),
  new Proxy("service-c", "http://localhost:3003"),
];

const gateway = new ProxyApi(express(3000));
gateway.addProxies(proxies);

await gateway.initialize();
gateway.run();
```

## API Reference

### `ApiGateway`

Main class for creating and managing ProxyApis (Composite pattern).

#### Constructor

```typescript
new ApiGateway(strategy: Strategy, addDefaultMethods?: boolean)
```

#### Methods

- `createProxyApi(schema?: Schema)`: Create new ProxyApi instance (optionally from Schema)
- `getApis()`: Get all ProxyApi instances
- `initialize()`: Initialize all ProxyApis
- `run()`: Start the gateway server
- `getMainApi()`: Get the main composite ProxyApi
- `shutdown()`: Shutdown the gateway

### `Proxy`

Represents a single backend service.

#### Constructor

```typescript
new Proxy(serviceName: string, serviceUrl: string)
```

#### Static Methods

- `Proxy.fromSchema(schema: Schema)`: Create Proxy from Schema object

#### Methods

- `initialize()`: Fetch schema and generate proxy methods
- `override(operationId: string, handler: ProxyHandler)`: Override specific operation
- `getMethods()`: Get all generated methods
- `getSchema()`: Get service schema
- `getServiceName()`: Get service name
- `getServiceUrl()`: Get service URL
- `isInitialized()`: Check if proxy is initialized

### `ProxyApi`

Manages collection of Proxy instances and generates unified API.

#### Constructor

```typescript
new ProxyApi(strategy: Strategy, addDefaultMethods?: boolean)
```

#### Methods

- `addProxy(proxy: Proxy)`: Add single proxy
- `addProxies(proxies: Proxy[])`: Add multiple proxies
- `initialize()`: Initialize all proxies and register routes
- `getProxies()`: Get all proxies
- `getProxy(serviceName: string)`: Get specific proxy
- `hasProxy(serviceName: string)`: Check if proxy exists
- `removeProxy(serviceName: string)`: Remove proxy
- `run()`: Start the gateway server

## How It Works

1. **Schema Fetching**: Each `Proxy` fetches the service's schema from `/schema` endpoint
2. **Protocol Detection**: Schema contains protocol info (REST, GraphQL, gRPC)
3. **Route Generation**: Proxy methods are generated from service operations with protocol-specific details
4. **Smart Proxying**: Requests are mapped to actual service endpoints based on protocol

### Example Flow (REST)

```
Client Request:
  POST /content-analyzer/detect-tasks
  Body: { emailContent: "..." }

Gateway:
  1. Receives request at /content-analyzer/detect-tasks
  2. Finds operation in schema: { id: "detect-tasks", rest: { method: "POST", path: "/detect-tasks" } }
  3. Maps to actual endpoint: POST http://localhost:3001/detect-tasks
     Body: { emailContent: "..." }
  4. Returns response to client
```

### Protocol Support

- **REST**: Maps HTTP methods (GET, POST, PUT, DELETE) to actual endpoints
- **GraphQL**: Translates to GraphQL queries (coming soon)
- **gRPC**: Direct gRPC calls (coming soon)

## Architecture

### New Architecture (Composite Pattern)

```
┌──────────────────────────────────────────────────┐
│         ApiGateway (Port 3000)                    │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  ProxyApi 1                                 │ │
│  │  ├─ Proxy: content-analyzer                │ │
│  │  └─ Proxy: llm-service                     │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  ProxyApi 2 (from Schema)                   │ │
│  │  └─ Proxy: users-service                    │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Composite ProxyApi (All proxies merged)    │ │
│  │  ├─ All methods from ProxyApi 1             │ │
│  │  └─ All methods from ProxyApi 2             │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
         │        │         │
         ▼        ▼         ▼
    ┌────────┐ ┌──────┐ ┌──────┐
    │Service │ │Service│ │Service│
    │  :3001 │ │ :3002 │ │ :3003 │
    └────────┘ └──────┘ └──────┘
```

## Requirements

- Node.js >= 20.0.0
- @filipgorny/service-api >= 0.0.1
- @filipgorny/logger >= 0.0.1

## License

MIT © Filip Gorny
