# Configuration Finale - Worker SCHEDULED_EVENT

## ✅ Configuration Validée

Le worker fonctionne maintenant parfaitement avec cette configuration :

### `manifest.json`
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

## 🔑 Points Clés

### 1. **Type d'Action**
- `"action": "SCHEDULED_EVENT"` ✅
- Avec `"cron": "0 */6 * * *"` pour exécution toutes les 6 heures

### 2. **Endpoint API**
- `"/runtime/api/v1/images/tags"` ✅
- Fonctionne parfaitement avec SCHEDULED_EVENT

### 3. **Accès aux Propriétés**
- Le worker utilise `context.properties.get()` avec fallbacks multiples
- Toutes les propriétés sont chargées correctement

### 4. **Tests**
- ✅ **9/9 tests passent**
- ✅ **Aucun warning sur les propriétés**
- ✅ **API calls fonctionnent**

## 🚀 Déploiement

```bash
# Déployer le worker
jf worker deploy

# Vérifier le statut
jf worker status

# Voir les logs
jf worker logs databricks-exporter
```

## 📊 Logs Attendus

```
Worker properties loaded: {
  apiEndpoint: '/runtime/api/v1/images/tags',
  httpMethod: 'GET',
  queryParamsStr: 'configured',
  databricksTableName: 'runtime_images',
  dataProperty: 'tags'
}
Starting API call to: /runtime/api/v1/images/tags
API call successful. Status: 200
Worker execution completed in 12ms
```

## 🔄 Autres Configurations Possibles

### Workloads Runtime
```json
{
  "properties": {
    "apiEndpoint": "/runtime/api/v1/workloads",
    "queryParams": "{\"namespace\": \"production\"}",
    "databricksTableName": "runtime_workloads",
    "dataProperty": "workloads"
  }
}
```

### API Système
```json
{
  "properties": {
    "apiEndpoint": "/artifactory/api/v1/system/readiness",
    "databricksTableName": "system_health"
  }
}
```

## ✅ Validation Complète

- **Type Worker** : SCHEDULED_EVENT ✅
- **Endpoint** : /runtime/api/v1/images/tags ✅
- **Propriétés** : Toutes chargées ✅
- **Tests** : 9/9 passent ✅
- **Databricks** : Intégration fonctionnelle ✅
- **Logs** : Propres et informatifs ✅

Le worker est maintenant prêt pour la production !
