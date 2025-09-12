# Worker SCHEDULED_EVENT - Configuration Finale

## ✅ Configuration Corrigée

Le worker a été mis à jour pour utiliser le type `SCHEDULED_EVENT` avec la structure correcte.

### Types (`types.ts`)
```typescript
export interface ScheduledEventRequest {
    /** The trigger ID of the event */
    triggerID: string;
}

export interface ScheduledEventResponse {
    /** Message to print to the log, in case of an error it will be printed as a warning */
    message: string;
}
```

### Manifest (`manifest.json`)
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

### Worker (`worker.ts`)
```typescript
export default async (
  context: PlatformContext,
  request: ScheduledEventRequest
): Promise<ScheduledEventResponse> => {
  // Worker implementation...
  
  return {
    message: `Successfully processed ${recordCount} records from ${apiEndpoint} in ${executionTime}ms`
  };
}
```

## 🔧 Changements Principaux

### 1. **Signature de Fonction**
- **Avant** : `(context, payload: WorkerPayload) => WorkerResponse`
- **Après** : `(context, request: ScheduledEventRequest) => ScheduledEventResponse`

### 2. **Structure de Réponse**
- **Avant** : Objet complexe avec `success`, `error`, `metadata`, etc.
- **Après** : Simple objet avec `message` string

### 3. **Gestion des Logs**
- Tous les détails dans les logs console
- Réponse simple avec message de succès/erreur

## 🚀 Messages de Réponse

### Succès Sans Databricks
```typescript
{
  message: "Successfully processed 15 records from /runtime/api/v1/images/tags in 120ms"
}
```

### Succès Avec Databricks
```typescript
{
  message: "Successfully processed 15 records from /runtime/api/v1/images/tags and sent to Databricks table runtime_images in 340ms"
}
```

### Erreur
```typescript
{
  message: "SCHEDULED_EVENT failed after 89ms: API request returned status 404: Not Found"
}
```

## ✅ Tests Mis à Jour

Les tests utilisent maintenant :
```typescript
const payload: ScheduledEventRequest = { triggerID: 'test-trigger-1' };
const result = await runWorker(context, payload);
// result.message contient le message de succès/erreur
```

## 🔄 Déploiement

```bash
# Le worker est maintenant prêt pour déploiement SCHEDULED_EVENT
jf worker deploy

# Il s'exécutera automatiquement selon le cron schedule
# et retournera des messages simples dans les logs
```

## 📊 Logs Attendus

```
SCHEDULED_EVENT triggered with ID: cron-12345
Worker properties loaded: { apiEndpoint: '/runtime/api/v1/images/tags', ... }
Starting API call to: /runtime/api/v1/images/tags
API call successful. Status: 200
DATABRICKS_URL not configured, skipping Databricks integration
```

Le worker SCHEDULED_EVENT est maintenant correctement configuré et prêt pour la production !
