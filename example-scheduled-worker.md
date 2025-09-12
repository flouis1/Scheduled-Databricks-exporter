# Configuration Worker SCHEDULED

## Manifest pour Worker SCHEDULED

Le worker est maintenant configuré comme un worker SCHEDULED qui s'exécute automatiquement selon un cron.

```json
{
  "name": "databricks-exporter",
  "description": "Worker SCHEDULED pour exporter les données Runtime API vers Databricks",
  "secrets": {
    "DATABRICKS_URL": "URL de votre workspace Databricks (optionnel)",
    "DATABRICKS_TOKEN": "Token d'accès Databricks (requis si URL définie)",
    "DATABRICKS_WAREHOUSE_ID": "ID du warehouse SQL Databricks (optionnel)"
  },
  "properties": {
    "apiEndpoint": "/xray/api/v1/runtime/images/tags",
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

## Changements Principaux

### 1. Type de Worker
- **Avant** : `"action": "GENERIC_EVENT"`
- **Après** : `"action": "SCHEDULED_EVENT"`
- **Ajouté** : `"cron": "0 */6 * * *"` (toutes les 6 heures)

### 2. Endpoint API
- **Utilise** : `/runtime/api/v1/images/tags` (fonctionne maintenant avec SCHEDULED_EVENT)

### 3. Accès aux Propriétés
Le worker essaie maintenant plusieurs méthodes pour accéder aux propriétés :
1. `context.properties.get(key)`
2. `context.properties[key]`
3. `context.workerConfig.properties[key]`
4. `context.config.properties[key]`

## Exemples de Configuration

### Images Runtime
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

### Workloads Runtime
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
  "cron": "0 */4 * * *"
}
```

### API Artifactory (exemple de l'utilisateur)
```json
{
  "properties": {
    "apiEndpoint": "/artifactory/api/v1/system/readiness",
    "httpMethod": "GET",
    "databricksTableName": "system_health"
  },
  "cron": "*/15 * * * *"
}
```

## Cron Schedule

| Expression | Description |
|------------|-------------|
| `0 */6 * * *` | Toutes les 6 heures |
| `0 */4 * * *` | Toutes les 4 heures |
| `*/15 * * * *` | Toutes les 15 minutes |
| `0 9 * * *` | Tous les jours à 9h |
| `0 9 * * 1` | Tous les lundis à 9h |

## Déploiement

```bash
# Déployer le worker SCHEDULED
jf worker deploy

# Vérifier le statut
jf worker status

# Voir les logs d'exécution
jf worker logs databricks-exporter
```

## Différences avec GENERIC_EVENT

| Aspect | GENERIC_EVENT | SCHEDULED_EVENT |
|--------|---------------|-----------------|
| Déclenchement | Manuel ou événement | Automatique (cron) |
| Payload | Peut recevoir des données | Payload vide |
| Configuration | Via payload | Via propriétés du manifest |
| Fréquence | À la demande | Planifiée |

Le worker SCHEDULED_EVENT est idéal pour la collecte régulière de données comme les métriques Runtime API.
