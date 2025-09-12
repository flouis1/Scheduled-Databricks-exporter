import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker from './worker';
import { PlatformContext, ScheduledEventRequest } from './types';

describe("databricks-exporter tests", () => {
    let context: any;

    beforeEach(() => {
        context = {
            clients: {
                platformHttp: {
                    get: jest.fn(),
                    post: jest.fn(),
                    put: jest.fn(),
                    delete: jest.fn(),
                },
                axios: {
                    post: jest.fn()
                }
            },
            properties: {
                get: jest.fn((key: string) => {
                    const props: Record<string, string> = {
                   apiEndpoint: "/runtime/api/v1/images/tags",
                   httpMethod: "GET",
                   queryParams: '{"limit": "100"}',
                   databricksTableName: "runtime_images",
                   dataProperty: "tags",
                   databricksAutoCreateTable: "true",
                   databricksCatalog: "main",
                   databricksSchema: "default"
                    };
                    return props[key];
                })
            },
            secrets: {
                get: jest.fn(() => undefined)
            }
        };
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

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            const result = await runWorker(context, payload);

            expect(result.message).toContain('Successfully processed');
            expect(result.message).toContain('/runtime/api/v1/images/tags');
            expect(context.clients.platformHttp.get).toHaveBeenCalledWith(
                "/runtime/api/v1/images/tags?limit=100",
                { headers: {} }
            );
        });

        it('should make a successful GET request to workloads API', async () => {
            // Override properties for workloads API
            context.properties.get = jest.fn((key: string) => {
                const props: Record<string, string> = {
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

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            const result = await runWorker(context, payload);

            expect(result.message).toContain('Successfully processed');
            expect(result.message).toContain('/runtime/api/v1/workloads');
            expect(context.clients.platformHttp.get).toHaveBeenCalledWith(
                "/runtime/api/v1/workloads?namespace=default",
                { headers: {} }
            );
        });

        it('should handle API errors gracefully', async () => {
            context.properties.get = jest.fn((key: string) => {
                const props: Record<string, string> = {
                    apiEndpoint: "/invalid/endpoint",
                    httpMethod: "GET",
                    queryParams: '',
                    databricksTableName: "",
                    dataProperty: ""
                };
                return props[key];
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 404,
                statusText: "Not Found",
                data: {}
            });

            const result = await runWorker(context, payload);

            expect(result.message).toContain('SCHEDULED_EVENT failed');
            expect(result.message).toContain('API request returned status 404');
        });

        it('should handle missing apiEndpoint property', async () => {
            context.properties.get = jest.fn((key: string) => {
                const props: Record<string, string> = {
                    httpMethod: "GET",
                    queryParams: '',
                    databricksTableName: "",
                    dataProperty: ""
                };
                return props[key] || '';
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            const result = await runWorker(context, payload);

            expect(result.message).toContain('SCHEDULED_EVENT failed');
            expect(result.message).toContain('apiEndpoint property is required');
        });
    });

    describe("Databricks integration", () => {
        it('should send data to Databricks when configured', async () => {
            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            const mockApiResponse = {
                tags: [
                    { tag: "latest", digest: "sha256:abc123" }
                ]
            };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            // Set Databricks secrets via context.secrets.get()
            (context.secrets.get as jest.Mock).mockImplementation((key: string) => {
                const secrets: Record<string, string> = {
                    DATABRICKS_URL: "https://test.databricks.com",
                    DATABRICKS_TOKEN: "test-token",
                    DATABRICKS_WAREHOUSE_ID: "test-warehouse"
                };
                return secrets[key];
            });

            // Mock successful Databricks response
            (context.clients.axios.post as jest.Mock).mockResolvedValue({
                data: {
                    statement_id: "stmt-123"
                }
            });

            const result = await runWorker(context, payload);

            expect(result.message).toContain('Successfully processed');
            expect(result.message).toContain('sent to Databricks table runtime_images');
            expect(context.clients.axios.post).toHaveBeenCalledWith(
                "https://test.databricks.com/api/2.0/sql/statements",
                expect.objectContaining({
                    statement: expect.any(String),
                    warehouse_id: "test-warehouse"
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        "Authorization": "Bearer test-token"
                    })
                })
            );
        });

        it('should skip Databricks when not configured', async () => {
            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            const mockApiResponse = {
                tags: [{ tag: "latest" }]
            };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            const result = await runWorker(context, payload);

            expect(result.message).toContain('Successfully processed');
            expect(result.message).not.toContain('sent to Databricks');
            expect(context.clients.axios.post).not.toHaveBeenCalled();
        });

        it('should fail when Databricks URL is set but token is missing', async () => {
            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: { tags: [] }
            });

            // Set URL but not token via context.secrets.get()
            (context.secrets.get as jest.Mock).mockImplementation((key: string) => {
                if (key === 'DATABRICKS_URL') return "https://test.databricks.com";
                return undefined; // No DATABRICKS_TOKEN
            });

            const result = await runWorker(context, payload);

            expect(result.message).toContain('SCHEDULED_EVENT failed');
            expect(result.message).toContain('DATABRICKS_TOKEN is required');
        });
    });

    describe("data extraction", () => {
        it('should extract nested data using dataProperty', async () => {
            context.properties.get = jest.fn((key: string) => {
                const props: Record<string, string> = {
                    apiEndpoint: "/test/api",
                    httpMethod: "GET",
                    queryParams: '',
                    databricksTableName: "test_table",
                    dataProperty: "data.items"
                };
                return props[key];
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            const mockApiResponse = {
                status: "success",
                data: {
                    items: [
                        { id: 1, name: "item1" },
                        { id: 2, name: "item2" }
                    ]
                }
            };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            // Set Databricks secrets via context.secrets.get()
            (context.secrets.get as jest.Mock).mockImplementation((key: string) => {
                const secrets: Record<string, string> = {
                    DATABRICKS_URL: "https://test.databricks.com",
                    DATABRICKS_TOKEN: "test-token"
                };
                return secrets[key];
            });

            (context.clients.axios.post as jest.Mock).mockResolvedValue({
                data: {
                    statement_id: "stmt-123"
                }
            });

            const result = await runWorker(context, payload);

            expect(result.message).toContain('Successfully processed');
            expect(result.message).toContain('sent to Databricks table test_table');
        });

        it("should create table automatically when enabled", async () => {
            const payload: ScheduledEventRequest = { triggerID: "test-trigger-auto-create" };
            const mockApiResponse = { tags: [{ name: "latest", digest: "sha256:test" }] };

            // Mock successful API response
            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: mockApiResponse
            });

            // Set Databricks secrets with auto-create enabled
            (context.secrets.get as jest.Mock).mockImplementation((key: string) => {
                const secrets: Record<string, string> = {
                    DATABRICKS_URL: "https://test.databricks.com",
                    DATABRICKS_TOKEN: "test-token",
                    DATABRICKS_WAREHOUSE_ID: "test-warehouse"
                };
                return secrets[key];
            });

            // Mock successful table creation and data insertion
            (context.clients.axios.post as jest.Mock)
                .mockResolvedValueOnce({ data: { statement_id: "create-stmt-123" } }) // Table creation
                .mockResolvedValueOnce({ data: { statement_id: "insert-stmt-456" } }); // Data insertion

            const result = await runWorker(context, payload);

            expect(result.message).toContain('Successfully processed 1 records');
            expect(context.clients.axios.post).toHaveBeenCalledTimes(2); // Table creation + data insertion
            
            // Verify table creation call
            expect(context.clients.axios.post).toHaveBeenNthCalledWith(1,
                "https://test.databricks.com/api/2.0/sql/statements",
                expect.objectContaining({
                    statement: expect.stringContaining("CREATE TABLE IF NOT EXISTS main.default.runtime_images"),
                    warehouse_id: "test-warehouse"
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-token'
                    })
                })
            );
        });

        it('should handle invalid JSON in queryParams gracefully', async () => {
            context.properties.get = jest.fn((key: string) => {
                const props: Record<string, string> = {
                    apiEndpoint: "/test/api",
                    httpMethod: "GET",
                    queryParams: 'invalid json',
                    databricksTableName: "",
                    dataProperty: ""
                };
                return props[key];
            });

            const payload: ScheduledEventRequest = { triggerID: 'test-trigger-2' };

            (context.clients.platformHttp.get as jest.Mock).mockResolvedValue({
                status: 200,
                data: { result: "success" }
            });

            const result = await runWorker(context, payload);

            expect(result.message).toContain('Successfully processed');
            expect(context.clients.platformHttp.get).toHaveBeenCalledWith(
                "/test/api",
                { headers: {} }
            );
        });
    });
});