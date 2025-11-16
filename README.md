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

### Basic Example

```typescript
import { ProxyApi, Proxy } from '@filipgorny/api-gateway';
import { express } from '@filipgorny/service-api';

// Create proxies for your services
const contentAnalyzer = new Proxy(
  'content-analyzer',
  'http://localhost:3001'
);

const llmService = new Proxy(
  'llm-service',
  'http://localhost:3003'
);

// Create API Gateway
const gateway = new ProxyApi(express(3000));

// Add proxies
gateway
  .addProxy(contentAnalyzer)
  .addProxy(llmService);

// Initialize (fetches schemas and generates routes)
await gateway.initialize();

// Start the gateway
gateway.run();
```

### With Custom Handler

```typescript
const contentAnalyzer = new Proxy(
  'content-analyzer',
  'http://localhost:3001'
);

// Override specific operation
contentAnalyzer.override('detect-tasks', async (input) => {
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
  new Proxy('service-a', 'http://localhost:3001'),
  new Proxy('service-b', 'http://localhost:3002'),
  new Proxy('service-c', 'http://localhost:3003'),
];

const gateway = new ProxyApi(express(3000));
gateway.addProxies(proxies);

await gateway.initialize();
gateway.run();
```

## API Reference

### `Proxy`

Represents a single backend service.

#### Constructor

```typescript
new Proxy(serviceName: string, serviceUrl: string)
```

#### Methods

- `initialize()`: Fetch schema and generate proxy methods
- `override(operationId: string, handler: ProxyHandler)`: Override specific operation
- `getMethods()`: Get all generated methods
- `getManifest()`: Get service manifest
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
2. **Route Generation**: Proxy methods are generated from service operations
3. **Request Routing**: Incoming requests are routed to `<serviceName>/<operationId>`
4. **Proxying**: Requests are forwarded to backend service's `/internal/invoke` endpoint

### Example Flow

```
Client Request:
  POST /content-analyzer/detect-tasks
  Body: { text: "..." }

Gateway:
  1. Receives request
  2. Finds Proxy for "content-analyzer"
  3. Calls backend: POST http://localhost:3001/internal/invoke
     Body: { operationId: "detect-tasks", input: { text: "..." } }
  4. Returns response to client
```

## Architecture

```
┌──────────────────────────────────────┐
│         API Gateway (Port 3000)       │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  ProxyApi                       │ │
│  │  ├─ Proxy: content-analyzer    │ │
│  │  ├─ Proxy: llm-service         │ │
│  │  └─ Proxy: users-service       │ │
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
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
