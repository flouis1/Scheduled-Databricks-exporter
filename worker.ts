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

  // Validation basique pour éviter l'injection SQL
  private validateIdentifier(id: string): string {
    if (!id || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(id) || id.length > 64) {
      throw new Error(`Invalid identifier: ${id}`);
    }
    return id;
  }

  // Échappement sécurisé pour JSON
  private escapeJson(json: string): string {
    return json.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/"/g, '\\"');
  }

  // Exécution avec retry
  private async executeWithRetry(statement: string, axiosClient: any, retries = 2): Promise<any> {
    for (let i = 0; i <= retries; i++) {
      try {
        return await axiosClient.post(`${this.config.url}/api/2.0/sql/statements`, {
          statement, warehouse_id: this.config.warehouseId
        }, {
          headers: { 'Authorization': `Bearer ${this.config.token}`, 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        console.log(`Attempt ${i + 1}/${retries + 1} failed:`, error.message);
        if (i === retries) throw error;
        await new Promise(r => setTimeout(r, Math.pow(2, i + 1) * 1000));
      }
    }
  }

  async createTableIfNotExists(tableName: string, catalog: string, schema: string, axiosClient: any): Promise<void> {
    const safeTable = this.validateIdentifier(tableName);
    const safeCatalog = this.validateIdentifier(catalog);
    const safeSchema = this.validateIdentifier(schema);
    
    const fullName = `${safeCatalog}.${safeSchema}.${safeTable}`;
    const sql = `CREATE TABLE IF NOT EXISTS ${fullName} (timestamp STRING, data_json STRING, processed_at TIMESTAMP) USING DELTA`;
    
    await this.executeWithRetry(sql, axiosClient);
    console.log(`Table ${fullName} created/verified`);
  }

  async sendData(data: any[], tableName: string, timestamp: string, axiosClient: any, autoCreateTable: boolean = false, catalog: string = 'solengeu', schema: string = 'default', mode: string = 'append'): Promise<{ recordCount: number; statementId?: string }> {
    if (!data?.length) return { recordCount: 0 };

    const safeTable = this.validateIdentifier(tableName);
    const safeCatalog = this.validateIdentifier(catalog);
    const safeSchema = this.validateIdentifier(schema);
    const fullName = `${safeCatalog}.${safeSchema}.${safeTable}`;

    console.log(`Sending ${data.length} records to ${fullName} (mode: ${mode})`);

    if (autoCreateTable) {
      await this.createTableIfNotExists(tableName, catalog, schema, axiosClient);
    }

    if (mode === 'overwrite') {
      await this.executeWithRetry(`DELETE FROM ${fullName}`, axiosClient);
      console.log(`Table cleared for overwrite`);
    }

    // Insertion par batch pour éviter les requêtes trop longues
    const batchSize = 10;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const values = batch.map((item, idx) => {
        const jsonData = typeof item === 'string' ? item : JSON.stringify(item);
        const safeJson = this.escapeJson(jsonData);
        const ts = new Date(Date.now() + i + idx).toISOString();
        return `('${ts}', '${safeJson}', CURRENT_TIMESTAMP())`;
      }).join(', ');

      const sql = `INSERT INTO ${fullName} (timestamp, data_json, processed_at) VALUES ${values}`;
      await this.executeWithRetry(sql, axiosClient);
    }

    console.log(`Successfully inserted ${data.length} records`);
    return { recordCount: data.length };
  }
}

function extractDataFromResponse(response: any, dataProperty?: string): any[] {
  if (!dataProperty) return Array.isArray(response) ? response : [response];
  const keys = dataProperty.split('.');
  let data = response;
  for (const key of keys) {
    if (data?.[key]) data = data[key];
    else return [];
  }
  return Array.isArray(data) ? data : [data];
}

function parseJsonString(jsonStr: string): any {
  if (!jsonStr?.trim()) return {};
  try { return JSON.parse(jsonStr); } catch { return {}; }
}

export default async (context: PlatformContext, request: ScheduledEventRequest): Promise<ScheduledEventResponse> => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const ctx = context as any;
    const getProperty = (key: string, defaultValue = '') => {
      try {
        return String(ctx.properties?.get?.(key) || ctx.properties?.[key] || ctx.workerConfig?.properties?.[key] || ctx.config?.properties?.[key] || defaultValue);
      } catch { return defaultValue; }
    };
    
    const apiEndpoint = getProperty('apiEndpoint');
    const httpMethod = getProperty('httpMethod', 'GET');
    const databricksTableName = getProperty('databricksTableName');
    const dataProperty = getProperty('dataProperty');
    const autoCreateTable = getProperty('databricksAutoCreateTable', 'false') === 'true';
    const databricksCatalog = getProperty('databricksCatalog', 'solengeu').toLowerCase();
    const databricksSchema = getProperty('databricksSchema', 'default').toLowerCase();
    const databricksMode = getProperty('databricksMode', 'append').toLowerCase();
    
    console.log(`Worker started - Table: ${databricksTableName}, Catalog: ${databricksCatalog}`);
    
    if (!apiEndpoint) throw new Error('apiEndpoint required');

    const queryParams = parseJsonString(getProperty('queryParams'));
    const headers = parseJsonString(getProperty('headers'));
    const requestBody = parseJsonString(getProperty('requestBody'));
    
    let apiResponse;
    
    // Construire l'URL avec les paramètres de requête pour GET
    let finalEndpoint = apiEndpoint;
    if (httpMethod.toUpperCase() === 'GET' && Object.keys(queryParams).length > 0) {
      const urlParams = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        urlParams.append(key, String(value));
      }
      finalEndpoint = `${apiEndpoint}?${urlParams.toString()}`;
    }
    
    console.log(`Making ${httpMethod} request to: ${finalEndpoint}`);
    
    if (httpMethod.toUpperCase() === 'GET') {
      apiResponse = await context.clients.platformHttp.get(finalEndpoint, headers);
    } else if (httpMethod.toUpperCase() === 'POST') {
      apiResponse = await context.clients.platformHttp.post(apiEndpoint, requestBody, headers);
    } else if (httpMethod.toUpperCase() === 'PUT') {
      apiResponse = await context.clients.platformHttp.put(apiEndpoint, requestBody, headers);
    } else if (httpMethod.toUpperCase() === 'DELETE') {
      apiResponse = await context.clients.platformHttp.delete(apiEndpoint, headers);
    } else {
      throw new Error(`Unsupported HTTP method: ${httpMethod}`);
    }

    console.log(`API call successful, status: ${apiResponse.status}`);

    if (databricksTableName) {
      const databricksUrl = context.secrets.get('DATABRICKS_URL');
      const databricksToken = context.secrets.get('DATABRICKS_TOKEN');
      const databricksWarehouseId = context.secrets.get('DATABRICKS_WAREHOUSE_ID');

      if (!databricksUrl) {
        console.log('DATABRICKS_URL not configured, skipping Databricks integration');
      } else if (!databricksToken) {
        throw new Error('DATABRICKS_TOKEN required when DATABRICKS_URL configured');
      } else {
        console.log('Databricks configured, sending data...');
        
        const client = new DatabricksClient({ url: databricksUrl, token: databricksToken, warehouseId: databricksWarehouseId });
        const dataToSend = extractDataFromResponse(apiResponse.data, dataProperty);
        
        // Enrichir avec execution_id unique
        const executionId = Math.random().toString(36).substring(2, 15);
        const enrichedData = dataToSend.map((item, index) => ({ ...item, execution_id: executionId, execution_timestamp: timestamp, item_index: index }));

        const result = await client.sendData(enrichedData, databricksTableName, timestamp, context.clients.axios, autoCreateTable, databricksCatalog, databricksSchema, databricksMode);

        return { message: `Securely processed ${result.recordCount} records from ${apiEndpoint} to Databricks ${databricksTableName} in ${Date.now() - startTime}ms` };
      }
    }

    return { message: `Called ${apiEndpoint} in ${Date.now() - startTime}ms` };
  } catch (error: any) {
    console.error('Worker failed:', error.message);
    return { message: `SCHEDULED_EVENT failed after ${Date.now() - startTime}ms: ${error.message}` };
  }
};