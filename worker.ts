import { PlatformContext, ScheduledEventRequest, ScheduledEventResponse } from './types';

interface DatabricksConfig {
  url: string;
  token: string;
  warehouseId: string;
}

class DatabricksClient {
  private config: DatabricksConfig;

  constructor(config: DatabricksConfig) {
    this.config = config;
  }

  async createTableIfNotExists(tableName: string, catalog: string, schema: string, axiosClient: any): Promise<void> {
    try {
      // Construire le nom de table (complet ou simple selon la configuration)
      const useFullName = catalog && schema && catalog.trim() !== '' && schema.trim() !== '';
      const finalTableName = useFullName ? `${catalog}.${schema}.${tableName}` : tableName;
      
      const createTableStatement = `
        CREATE TABLE IF NOT EXISTS ${finalTableName} (
          timestamp STRING,
          data_json STRING,
          processed_at TIMESTAMP
        ) USING DELTA
        TBLPROPERTIES (
          'delta.autoOptimize.optimizeWrite' = 'true',
          'delta.autoOptimize.autoCompact' = 'true'
        )
      `;

      console.log(`Creating table if not exists: ${finalTableName}${useFullName ? ` (catalog: ${catalog}, schema: ${schema})` : ' (using default schema)'}`);
      
      const response = await axiosClient.post(`${this.config.url}/api/2.0/sql/statements`, {
        statement: createTableStatement,
        warehouse_id: this.config.warehouseId
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Table creation statement executed for ${finalTableName}`, {
        statementId: response.data.statement_id,
        useFullName,
        catalog: useFullName ? catalog : 'default',
        schema: useFullName ? schema : 'default',
        tableName
      });
    } catch (error) {
      const useFullName = catalog && schema && catalog.trim() !== '' && schema.trim() !== '';
      const finalTableName = useFullName ? `${catalog}.${schema}.${tableName}` : tableName;
      console.error(`Failed to create table ${finalTableName}:`, error);
      throw error;
    }
  }

  async sendData(data: any[], tableName: string, timestamp: string, axiosClient: any, autoCreateTable: boolean = false, catalog: string = 'main', schema: string = 'default'): Promise<{ recordCount: number; statementId?: string }> {
    if (!data || data.length === 0) {
      console.log('No data to send to Databricks');
      return { recordCount: 0 };
    }

    try {
      // Create table if auto-create is enabled
      if (autoCreateTable) {
        await this.createTableIfNotExists(tableName, catalog, schema, axiosClient);
      }
      
      const statement = this.buildInsertStatement(data, tableName, timestamp, catalog, schema);
      
      const response = await axiosClient.post(`${this.config.url}/api/2.0/sql/statements`, {
        statement,
        warehouse_id: this.config.warehouseId
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Data successfully sent to Databricks table ${tableName}`, {
        statementId: response.data.statement_id,
        recordCount: data.length
      });

      return {
        recordCount: data.length,
        statementId: response.data.statement_id
      };
    } catch (error) {
      console.error('Failed to send data to Databricks:', error);
      throw error;
    }
  }

  private buildInsertStatement(data: any[], tableName: string, timestamp: string, catalog: string = 'main', schema: string = 'default'): string {
    // Create a flexible insert statement that can handle any JSON structure
    const values = data.map(item => {
      const jsonData = typeof item === 'string' ? item : JSON.stringify(item);
      const escapedJson = jsonData.replace(/'/g, "''");
      return `('${timestamp}', '${escapedJson}', CURRENT_TIMESTAMP())`;
    }).join(', ');

    // Construire le nom de table (complet ou simple selon la configuration)
    const useFullName = catalog && schema && catalog.trim() !== '' && schema.trim() !== '';
    const finalTableName = useFullName ? `${catalog}.${schema}.${tableName}` : tableName;

    return `
      INSERT INTO ${finalTableName} (
        timestamp,
        data_json,
        processed_at
      ) VALUES ${values}
    `;
  }
}

function extractDataFromResponse(response: any, dataProperty?: string): any[] {
  if (!dataProperty) {
    // If no property specified, try to return the response as array or wrap it
    if (Array.isArray(response)) {
      return response;
    }
    return [response];
  }

  // Navigate to the specified property using dot notation
  const properties = dataProperty.split('.');
  let current = response;
  
  for (const prop of properties) {
    if (current && typeof current === 'object' && prop in current) {
      current = current[prop];
    } else {
      console.warn(`Property path '${dataProperty}' not found in response`);
      return [response];
    }
  }

  return Array.isArray(current) ? current : [current];
}

function parseJsonString(jsonStr?: string): any {
  if (!jsonStr || jsonStr.trim() === '') {
    return {};
  }
  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.warn(`Failed to parse JSON string: ${jsonStr}`, error);
    return {};
  }
}

export default async (
  context: PlatformContext,
  request: ScheduledEventRequest
): Promise<ScheduledEventResponse> => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    console.log(`SCHEDULED_EVENT triggered with ID: ${request.triggerID}`);

    // Get configuration from worker properties - try multiple access methods
    const contextWithProps = context as any;
    
    // Helper function to safely get properties - try different access patterns
    const getProperty = (key: string, defaultValue: string = ''): string => {
      try {
        // Try different ways to access properties for SCHEDULED_EVENT workers
        let value;
        
        // Method 1: context.properties.get()
        if (contextWithProps.properties?.get) {
          value = contextWithProps.properties.get(key);
        }
        
        // Method 2: Direct property access
        if ((value === null || value === undefined) && contextWithProps.properties) {
          value = contextWithProps.properties[key];
        }
        
        // Method 3: Worker config properties
        if ((value === null || value === undefined) && contextWithProps.workerConfig?.properties) {
          value = contextWithProps.workerConfig.properties[key];
        }
        
        // Method 4: Configuration properties
        if ((value === null || value === undefined) && contextWithProps.config?.properties) {
          value = contextWithProps.config.properties[key];
        }
        
        return value !== null && value !== undefined ? String(value) : defaultValue;
      } catch (error) {
        console.warn(`Failed to get property '${key}':`, error);
        return defaultValue;
      }
    };
    
    const apiEndpoint = getProperty('apiEndpoint');
    const httpMethod = getProperty('httpMethod', 'GET');
    const queryParamsStr = getProperty('queryParams', '');
    const headersStr = getProperty('headers', '');
    const requestBodyStr = getProperty('requestBody', '');
     const databricksTableName = getProperty('databricksTableName');
     const dataProperty = getProperty('dataProperty');
     const autoCreateTable = getProperty('databricksAutoCreateTable', 'false') === 'true';
     const databricksCatalog = getProperty('databricksCatalog', 'main');
     const databricksSchema = getProperty('databricksSchema', 'default');
    
    // Log loaded properties
    console.log('Worker properties loaded:', {
      apiEndpoint,
      httpMethod,
      queryParamsStr: queryParamsStr ? 'configured' : 'empty',
      databricksTableName,
      dataProperty,
      autoCreateTable,
      databricksCatalog,
      databricksSchema
    });
    
    if (!apiEndpoint) {
      throw new Error('apiEndpoint property is required in worker configuration');
    }

    console.log(`Starting API call to: ${apiEndpoint}`);

    // Prepare request configuration
    const method = httpMethod as 'GET' | 'POST' | 'PUT' | 'DELETE';
    const headers = parseJsonString(headersStr);
    
    // Build query string if provided
    let url = apiEndpoint;
    const queryParams = parseJsonString(queryParamsStr);
    if (queryParams && Object.keys(queryParams).length > 0) {
      const queryString = new URLSearchParams(queryParams).toString();
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    // Parse request body if provided
    const requestBody = requestBodyStr ? parseJsonString(requestBodyStr) : undefined;

    // Make API call using platform HTTP client
    let apiResponse;
    
    switch (method) {
      case 'GET':
        apiResponse = await context.clients.platformHttp.get(url, { headers });
        break;
      case 'POST':
        apiResponse = await context.clients.platformHttp.post(url, requestBody, { headers });
        break;
      case 'PUT':
        apiResponse = await context.clients.platformHttp.put(url, requestBody, { headers });
        break;
      case 'DELETE':
        apiResponse = await context.clients.platformHttp.delete(url, { headers });
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    if (apiResponse.status >= 200 && apiResponse.status < 300) {
      console.log(`API call successful. Status: ${apiResponse.status}`);

      // Send to Databricks if configured
      if (databricksTableName) {
        // Access secrets through official JFrog Workers API
        const databricksUrl = context.secrets.get('DATABRICKS_URL');
        const databricksToken = context.secrets.get('DATABRICKS_TOKEN');
        const databricksWarehouseId = context.secrets.get('DATABRICKS_WAREHOUSE_ID');

        if (!databricksUrl) {
          console.log('DATABRICKS_URL not configured, skipping Databricks integration');
        } else if (!databricksToken) {
          throw new Error('DATABRICKS_TOKEN is required when DATABRICKS_URL is configured');
        } else {
          console.log('Sending data to Databricks');
          
          const databricksClient = new DatabricksClient({
            url: databricksUrl,
            token: databricksToken,
            warehouseId: databricksWarehouseId
          });

          const dataToSend = extractDataFromResponse(
            apiResponse.data, 
            dataProperty
          );

          const result = await databricksClient.sendData(
            dataToSend,
            databricksTableName,
            timestamp,
            context.clients.axios,
            autoCreateTable,
            databricksCatalog,
            databricksSchema
          );

          const executionTime = Date.now() - startTime;
          return {
            message: `Successfully processed ${result.recordCount} records from ${apiEndpoint} and sent to Databricks table ${databricksTableName} in ${executionTime}ms`
          };
        }
      }

      const executionTime = Date.now() - startTime;
      const recordCount = Array.isArray(apiResponse.data) ? apiResponse.data.length : 1;
      
      return {
        message: `Successfully processed ${recordCount} records from ${apiEndpoint} in ${executionTime}ms`
      };
    } else {
      throw new Error(`API request returned status ${apiResponse.status}: ${apiResponse.statusText}`);
    }

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    const errorMessage = `SCHEDULED_EVENT failed after ${executionTime}ms: ${error.message}`;
    console.error(errorMessage, error);
    
    return {
      message: errorMessage
    };
  }
};
