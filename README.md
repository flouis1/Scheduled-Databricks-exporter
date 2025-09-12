# Generic SCHEDULED_EVENT API to Databricks Exporter Worker

A flexible JFrog SCHEDULED_EVENT Worker that automatically runs on a cron schedule, makes configurable API calls to any JFrog Platform endpoint, and optionally exports the data to Databricks.

## Overview

This worker provides a scheduled automation solution for:
- Automated HTTP calls to any JFrog Platform API endpoint (Runtime API, Artifactory API, Xray API, etc.)
- Configuration through worker properties (no manual triggering required)
- Optional data export to Databricks with flexible data extraction
- Comprehensive error handling and logging
- Automatic execution based on cron schedule

## Features

- **SCHEDULED_EVENT Type**: Automatically triggers based on cron schedule
- **Property-Based Configuration**: All settings defined in worker manifest properties
- **Flexible API Calls**: Configure any endpoint, method, headers, and query parameters
- **Data Extraction**: Use dot notation to extract specific data from API responses
- **Databricks Integration**: Optional export to Databricks with automatic table creation
- **Error Resilience**: Graceful error handling for both API calls and Databricks operations
- **No Authentication Required**: Uses JFrog Worker's built-in platform authentication
- **Automated Scheduling**: Runs automatically every 6 hours (configurable)

## Configuration

### Worker Manifest (manifest.json)

```json
{
  "name": "databricks-exporter",
  "description": "Generic worker that makes configurable API calls and optionally exports data to Databricks",
  "secrets": {
    "DATABRICKS_URL": "Optional Databricks workspace URL",
    "DATABRICKS_TOKEN": "Databricks personal access token (required if DATABRICKS_URL is set)",
    "DATABRICKS_WAREHOUSE_ID": "Databricks SQL warehouse ID (optional, defaults to 'default')"
  },
  "properties": {
    "apiEndpoint": "/runtime/api/v1/images/tags",
    "httpMethod": "GET",
    "queryParams": "{\"limit\": \"100\"}",
    "databricksTableName": "runtime_images",
    "dataProperty": "tags"
  },
  "sourceCodePath": "./worker.ts",
  "action": "SCHEDULED_EVENT",
  "cron": "0 */6 * * *",
  "enabled": true,
  "debug": false,
  "projectKey": "",
  "application": "worker"
}
```

### Worker Properties

| Property | Required | Description | Example |
|----------|----------|-------------|---------|
| `apiEndpoint` | Yes | API endpoint path | `/runtime/api/v1/images/tags` |
| `httpMethod` | No | HTTP method (default: GET) | `GET`, `POST`, `PUT`, `DELETE` |
| `queryParams` | No | JSON string of query parameters | `'{"limit": "100", "namespace": "default"}'` |
| `headers` | No | JSON string of additional headers | `'{"Content-Type": "application/json"}'` |
| `requestBody` | No | JSON string of request body for POST/PUT | `'{"query": "items.find()"}'` |
| `databricksTableName` | No | Databricks table name for data export | `runtime_images` |
| `dataProperty` | No | Data extraction path (dot notation) | `tags`, `data.items` |
| `databricksAutoCreateTable` | No | Auto-create table if not exists (`"true"` or `"false"`) | `"false"` |
| `databricksCatalog` | No | Databricks catalog name | `"main"` |
| `databricksSchema` | No | Databricks schema/database name | `"default"` |

### Environment Variables (Secrets)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABRICKS_URL` | No | Databricks workspace URL (e.g., `https://your-workspace.databricks.com`) |
| `DATABRICKS_TOKEN` | Conditional | Databricks personal access token (required if `DATABRICKS_URL` is set) |
| `DATABRICKS_WAREHOUSE_ID` | No | Databricks SQL warehouse ID (defaults to 'default') |

### Cron Schedule

The worker uses standard cron expressions:
- `"0 */6 * * *"` - Every 6 hours
- `"0 0 * * *"` - Daily at midnight
- `"0 9 * * 1"` - Every Monday at 9 AM

## Usage

### Configuration Examples

#### Basic Runtime API Call (Images) - Every 6 Hours
```json
{
  "properties": {
    "apiEndpoint": "/runtime/api/v1/images/tags",
    "httpMethod": "GET",
    "queryParams": "{\"limit\": \"100\"}",
    "databricksTableName": "runtime_images",
    "dataProperty": "tags"
  },
  "action": "SCHEDULED_EVENT",
  "cron": "0 */6 * * *"
}
```

#### Workloads API Call - Daily
```json
{
  "properties": {
    "apiEndpoint": "/runtime/api/v1/workloads",
    "httpMethod": "GET", 
    "queryParams": "{\"namespace\": \"production\"}",
    "databricksTableName": "runtime_workloads",
    "dataProperty": "workloads"
  },
  "action": "SCHEDULED_EVENT",
  "cron": "0 0 * * *"
}
```

#### POST Request Example - Weekly
```json
{
  "properties": {
    "apiEndpoint": "/artifactory/api/search/aql",
    "httpMethod": "POST",
    "headers": "{\"Content-Type\": \"text/plain\"}",
    "requestBody": "\"items.find({\\\"repo\\\":\\\"docker-local\\\"})\"",
    "databricksTableName": "search_results"
  },
  "action": "SCHEDULED_EVENT",
  "cron": "0 9 * * 1"
}
```

## Worker Types

### SCHEDULED_EVENT Request
```typescript
interface ScheduledEventRequest {
  /** The trigger ID of the event */
  triggerID: string;
}
```

### SCHEDULED_EVENT Response
```typescript
interface ScheduledEventResponse {
  /** Message to print to the log, in case of an error it will be printed as a warning */
  message: string;
}
```

## Worker Implementation

The worker uses the standard JFrog Workers API to access properties:

```typescript
export default async (
  context: PlatformContext,
  request: ScheduledEventRequest
): Promise<ScheduledEventResponse> => {
  console.log(`SCHEDULED_EVENT triggered with ID: ${request.triggerID}`);
  
  // Get configuration from worker properties
  const apiEndpoint = getProperty('apiEndpoint');
  const httpMethod = getProperty('httpMethod', 'GET');
  const queryParams = getProperty('queryParams', '');
  
  // Make API call and optionally send to Databricks
  
  return {
    message: `Successfully processed ${recordCount} records from ${apiEndpoint} in ${executionTime}ms`
  };
}
```

## Data Extraction

Use the `dataProperty` field to extract specific data from API responses using dot notation:

### Examples

**API Response:**
```json
{
  "status": "success",
  "tags": [
    {"name": "latest", "digest": "sha256:abc123"},
    {"name": "v1.0", "digest": "sha256:def456"}
  ],
  "total": 2
}
```

**Extraction Configurations:**
- `"dataProperty": "tags"` → Extracts the tags array
- `"dataProperty": "total"` → Extracts just the total number
- No `dataProperty` → Uses the entire response

## Databricks Table Schema

The worker creates tables with this flexible schema:

| Column | Type | Description |
|--------|------|-------------|
| `timestamp` | STRING | ISO timestamp of data collection |
| `data_json` | STRING | JSON string of the extracted data |

This allows storing any JSON structure and querying it using Databricks SQL JSON functions.

## Common Use Cases

### 1. Runtime API Data Collection (Every 6 Hours)

```json
{
  "properties": {
    "apiEndpoint": "/runtime/api/v1/images/tags",
    "queryParams": "{\"limit\": \"1000\"}",
    "databricksTableName": "runtime_image_tags",
    "dataProperty": "tags"
  },
  "cron": "0 */6 * * *"
}
```

### 2. Workloads Monitoring (Daily)

```json
{
  "properties": {
    "apiEndpoint": "/runtime/api/v1/workloads",
    "queryParams": "{\"namespace\": \"production\"}",
    "databricksTableName": "runtime_workloads",
    "dataProperty": "workloads"
  },
  "cron": "0 0 * * *"
}
```

### 3. Repository Information (Weekly)

```json
{
  "properties": {
    "apiEndpoint": "/artifactory/api/repositories",
    "databricksTableName": "artifactory_repositories"
  },
  "cron": "0 9 * * 1"
}
```

### 4. Security Scans (Twice Daily)

```json
{
  "properties": {
    "apiEndpoint": "/xray/api/v1/scans",
    "queryParams": "{\"limit\": \"500\"}",
    "databricksTableName": "xray_scans",
    "dataProperty": "scans"
  },
  "cron": "0 */12 * * *"
}
```

## Response Messages

### Success Messages

**Without Databricks:**
```
Successfully processed 15 records from /runtime/api/v1/images/tags in 120ms
```

**With Databricks:**
```
Successfully processed 15 records from /runtime/api/v1/images/tags and sent to Databricks table runtime_images in 340ms
```

### Error Messages

```
SCHEDULED_EVENT failed after 89ms: API request returned status 404: Not Found
```

## Error Handling

The worker implements robust error handling:

- **API Failures**: Returns error message in response
- **Missing Configuration**: Clear error messages for invalid setups
- **Databricks Issues**: API call succeeds even if Databricks export fails
- **Data Extraction**: Falls back to full response if extraction path is invalid
- **Property Access**: Multiple fallback methods for accessing worker properties

## Logging

The worker provides comprehensive logging:

```
SCHEDULED_EVENT triggered with ID: cron-12345
Worker properties loaded: { apiEndpoint: '/runtime/api/v1/images/tags', ... }
Starting API call to: /runtime/api/v1/images/tags
API call successful. Status: 200
DATABRICKS_URL not configured, skipping Databricks integration
```

## Testing

Run the test suite:

```bash
npm test
```

The tests cover:
- Various API call scenarios with SCHEDULED_EVENT types
- Databricks integration (with and without configuration)
- Data extraction logic
- Error handling cases
- Property access methods

## Deployment

1. Configure secrets in JFrog Platform (if using Databricks)
2. Deploy the worker using JFrog CLI
3. Worker will automatically start based on cron schedule

```bash
jf worker deploy
```

## Monitoring

Monitor worker execution through JFrog Platform logs. Each execution will show:
- Trigger ID from the scheduled event
- API call success/failure
- Data processing results
- Databricks export status (if configured)
- Execution time

## Examples for Different APIs

### Runtime API Examples

**Get Image Tags (Every 4 Hours):**
```json
{
  "properties": {
    "apiEndpoint": "/runtime/api/v1/images/tags", 
    "queryParams": "{\"limit\": \"100\"}"
  },
  "cron": "0 */4 * * *"
}
```

**Get Workloads (Daily):**
```json
{
  "properties": {
    "apiEndpoint": "/runtime/api/v1/workloads", 
    "queryParams": "{\"namespace\": \"default\"}"
  },
  "cron": "0 0 * * *"
}
```

### Artifactory API Examples

**List Repositories (Weekly):**
```json
{
  "properties": {
    "apiEndpoint": "/artifactory/api/repositories"
  },
  "cron": "0 9 * * 1"
}
```

**Search Artifacts (Daily):**
```json
{
  "properties": {
    "apiEndpoint": "/artifactory/api/search/artifact", 
    "queryParams": "{\"name\": \"*.jar\", \"repos\": \"libs-release-local\"}"
  },
  "cron": "0 2 * * *"
}
```

### Xray API Examples

**Get Violations (Every 2 Hours):**
```json
{
  "properties": {
    "apiEndpoint": "/xray/api/v1/violations", 
    "queryParams": "{\"limit\": \"100\"}"
  },
  "cron": "0 */2 * * *"
}
```

## 🔧 Automatic Table Creation

When `databricksAutoCreateTable` is set to `"true"`, the worker automatically creates tables with this optimized schema:

```sql
CREATE TABLE IF NOT EXISTS {catalog}.{schema}.{tableName} (
  timestamp STRING,
  data_json STRING,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
) USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
)
```

**Benefits:**
- ✅ **No manual table creation** required
- ✅ **Delta Lake format** for ACID transactions  
- ✅ **Auto-optimization** for better performance
- ✅ **Consistent schema** across all tables

**Usage:**
```json
{
  "properties": {
    "databricksTableName": "jfrog_runtime_data",
    "databricksAutoCreateTable": "true",
    "databricksCatalog": "main",
    "databricksSchema": "bronze_layer"
  }
}
```

This will create the table `main.bronze_layer.jfrog_runtime_data` in your Databricks workspace.

---

This SCHEDULED_EVENT worker provides maximum flexibility for automatically integrating any JFrog Platform API with your data analytics pipeline on a scheduled basis.