import { ApiGateway, Schema, Proxy } from "../src";
import { RestApi, express, SchemaBuilder } from "@filipgorny/service-api";
import supertest from "supertest";

describe("ApiGateway", () => {
  describe("Schema fetching and proxy creation", () => {
    it("should create ProxyApi from Schema", () => {
      const gateway = new ApiGateway(express(4000));

      // Create mock schema
      const schema = new Schema(
        {
          name: "test-service",
          version: "1.0.0",
          baseUrl: "http://localhost:3001",
          protocol: "REST",
        },
        [
          {
            id: "test.create",
            operationType: "mutation",
            description: "Test endpoint",
            input: { schema: { type: "object", properties: {} } },
            output: { schema: { type: "object", properties: {} } },
            rest: {
              method: "POST",
              path: "/test",
            },
          },
        ],
        {},
      );

      const proxyApi = gateway.createProxyApi(schema);

      expect(proxyApi).toBeDefined();
      expect(proxyApi.getProxies().length).toBe(1);

      const proxy = proxyApi.getProxies()[0];
      expect(proxy.getServiceName()).toBe("test-service");
      expect(proxy.isInitialized()).toBe(true);
    });

    it("should manage multiple ProxyApis", () => {
      const gateway = new ApiGateway(express(4001));

      const schema1 = new Schema(
        {
          name: "service-1",
          version: "1.0.0",
          baseUrl: "http://localhost:3001",
          protocol: "REST",
        },
        [],
        {},
      );

      const schema2 = new Schema(
        {
          name: "service-2",
          version: "1.0.0",
          baseUrl: "http://localhost:3002",
          protocol: "REST",
        },
        [],
        {},
      );

      gateway.createProxyApi(schema1);
      gateway.createProxyApi(schema2);

      const apis = gateway.getApis();
      expect(apis.length).toBe(2);
    });
  });

  describe("Proxy from Schema", () => {
    it("should create initialized Proxy from Schema", () => {
      const schema = new Schema(
        {
          name: "test-service",
          version: "1.0.0",
          baseUrl: "http://localhost:3001",
          protocol: "REST",
        },
        [
          {
            id: "users.get",
            operationType: "query",
            description: "Get users",
            input: { schema: { type: "object" } },
            output: { schema: { type: "object" } },
            rest: {
              method: "GET",
              path: "/users",
            },
          },
        ],
        {},
      );

      const proxy = Proxy.fromSchema(schema);

      expect(proxy.isInitialized()).toBe(true);
      expect(proxy.getServiceName()).toBe("test-service");
      expect(proxy.getMethods().length).toBeGreaterThan(0);
    });
  });

  describe("Integration with RestApi Schema", () => {
    it("should add Schema from RestApi to ApiGateway and call method", async () => {
      // Create a RestApi with a test method
      const api = new RestApi(express(4002));
      api.create("test", async (input) => {
        return { message: "Yes, it is working correctly" };
      });

      // Run the RestApi to start the server
      api.run();

      // Get schema from the RestApi using SchemaBuilder
      const doc = (api as any).documentationRegistry.getDocumentation();
      const schema = SchemaBuilder.buildRestSchema(
        "test-api",
        "1.0.0",
        "http://localhost:4002",
        doc.methods,
        doc.types,
        "Test API",
      );

      // Create ApiGateway
      const gateway = new ApiGateway(express(4003));

      // Add schema to gateway
      gateway.createProxyApi(schema, "test-api");

      // Run the gateway
      await gateway.run();

      // Get the app from the strategy
      const app = (gateway as any).strategy.app;

      // Test the proxied endpoint
      const response = await supertest(app)
        .post("/test-api/test")
        .send({})
        .expect(200);

      expect(response.body).toEqual({
        message: "Yes, it is working correctly",
      });
    });
  });
});
