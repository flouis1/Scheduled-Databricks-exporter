import { PlatformContext, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker from './worker';
import { ScheduledEventRequest } from './types';

// Mock fetch globally
global.fetch = jest.fn();

describe("databricks-exporter tests", () => {
    let context: any;
    let mockFetch: jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
        mockFetch = fetch as jest.MockedFunction<typeof fetch>;
        mockFetch.mockClear();

        context = {
            clients: {
                platformHttp: {
                    get: jest.fn(),
                    post: jest.fn(),
                    put: jest.fn(),
                    delete: jest.fn(),
                }
            },
            properties: {
                get: jest.fn((key: string) => {
                    const props = {
                        apiEndpoint: "/runtime/api/v1/images/tags",
                        httpMethod: "GET",
                        queryParams: '{"limit": "100"}',
                        databricksTableName: "runtime_images",
                        dataProperty: "tags"
                    };
                    return props[key];
                })
            }
        };

        // Clear environment variables
        delete process.env.DATABRICKS_URL;
        delete process.env.DATABRICKS_TOKEN;
        delete process.env.DATABRICKS_WAREHOUSE_ID;
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe("API calls", () => {
        it('should make a successful GET request to Runtime API', async () => {
            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-1' };

            const mockApiResponse = {
                tags: [
                    { tag: "latest", digest: "sha256:abc123", lastModified: "2024-01-01T00:00:00Z", size: 1024 }
                ]
            };

            context.clients.platformHttp.get.mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            const result = await runWorker(context, payload);

            expect(result.success).toBe(true);
            expect(result.apiResponse).toEqual(mockApiResponse);
            expect(context.clients.platformHttp.get).toHaveBeenCalledWith(
                "/runtime/api/v1/images/tags?limit=100",
                { headers: {} }
            );
        });

        it('should make a successful GET request to workloads API', async () => {
            // Override properties for workloads API
            context.properties.get = jest.fn((key: string) => {
                const props = {
                    apiEndpoint: "/runtime/api/v1/workloads",
                    httpMethod: "GET",
                    queryParams: '{"namespace": "default"}',
                    databricksTableName: "runtime_workloads",
                    dataProperty: "workloads"
                };
                return props[key];
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            const mockApiResponse = {
                workloads: [
                    { name: "test-app", namespace: "default", kind: "Deployment", images: ["nginx:latest"] }
                ]
            };

            context.clients.platformHttp.get.mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            const result = await runWorker(context, payload);

            expect(result.success).toBe(true);
            expect(result.apiResponse).toEqual(mockApiResponse);
            expect(context.clients.platformHttp.get).toHaveBeenCalledWith(
                "/runtime/api/v1/workloads?namespace=default",
                { headers: {} }
            );
        });

        it('should handle API errors gracefully', async () => {
            context.properties.get = jest.fn((key: string) => {
                if (key === 'apiEndpoint') return "/invalid/endpoint";
                return undefined;
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 404,
                statusText: "Not Found"
            });

            const result = await runWorker(context, payload);

            expect(result.success).toBe(false);
            expect(result.error).toContain("API request returned status 404");
        });

        it('should handle missing apiEndpoint property', async () => {
            context.properties.get = jest.fn((key: string) => {
                return undefined;
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            await expect(runWorker(context, payload)).rejects.toThrow(
                'apiEndpoint property is required in worker configuration'
            );
        });
    });

    describe("Databricks integration", () => {
        beforeEach(() => {
            process.env.DATABRICKS_URL = "https://test.databricks.com";
            process.env.DATABRICKS_TOKEN = "test-token";
        });

        it('should send data to Databricks when configured', async () => {
            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            const mockApiResponse = {
                tags: [{ tag: "latest", digest: "sha256:abc123" }]
            };

            context.clients.platformHttp.get.mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ statement_id: "stmt-123" })
            } as Response);

            const result = await runWorker(context, payload);

            expect(result.success).toBe(true);
            expect(result.databricksResult).toEqual({
                recordCount: 1,
                statementId: "stmt-123"
            });
            expect(mockFetch).toHaveBeenCalledWith(
                "https://test.databricks.com/api/2.0/sql/statements",
                expect.objectContaining({
                    method: "POST",
                    headers: {
                        "Authorization": "Bearer test-token",
                        "Content-Type": "application/json"
                    }
                })
            );
        });

        it('should skip Databricks when not configured', async () => {
            delete process.env.DATABRICKS_URL;
            
            // Remove databricks config from properties
            context.properties.get = jest.fn((key: string) => {
                if (key === 'apiEndpoint') return "/test/api";
                return undefined;
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: [{ id: 1 }]
            });

            const result = await runWorker(context, payload);

            expect(result.success).toBe(true);
            expect(result.databricksResult).toBeUndefined();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should fail when Databricks URL is set but token is missing', async () => {
            delete process.env.DATABRICKS_TOKEN;

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: [{ id: 1 }]
            });

            const result = await runWorker(context, payload);

            expect(result.success).toBe(false);
            expect(result.error).toContain("DATABRICKS_TOKEN is required");
        });
    });

    describe("data extraction", () => {
        it('should extract nested data using dataProperty', async () => {
            context.properties.get = jest.fn((key: string) => {
                const props = {
                    apiEndpoint: "/test/api",
                    databricksTableName: "test_table",
                    dataProperty: "data.items"
                };
                return props[key];
            });

            const apiResponse = {
                data: {
                    items: [{ id: 1 }, { id: 2 }]
                }
            };

            process.env.DATABRICKS_URL = "https://test.databricks.com";
            process.env.DATABRICKS_TOKEN = "test-token";

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: apiResponse
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ statement_id: "stmt-123" })
            } as Response);

            const result = await runWorker(context, payload);

            expect(result.success).toBe(true);
            expect(result.databricksResult?.recordCount).toBe(2);
        });

        it('should handle invalid JSON in queryParams gracefully', async () => {
            context.properties.get = jest.fn((key: string) => {
                const props = {
                    apiEndpoint: "/test/api",
                    queryParams: "invalid json"
                };
                return props[key];
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: { result: "ok" }
            });

            const result = await runWorker(context, payload);

            expect(result.success).toBe(true);
            expect(context.clients.platformHttp.get).toHaveBeenCalledWith(
                "/test/api",
                { headers: {} }
            );
        });
    });
});