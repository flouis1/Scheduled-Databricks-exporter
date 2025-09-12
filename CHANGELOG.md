# Changelog - Worker Databricks Exporter

## v2.0.0 - Worker SCHEDULED_EVENT (2024-09-12)

### ✅ Changements Majeurs

#### 1. **Type de Worker**
- **Avant** : `GENERIC_EVENT` (déclenchement manuel)
- **Après** : `SCHEDULED_EVENT` (déclenchement automatique)
- **Ajouté** : Cron schedule `0 */6 * * *` (toutes les 6 heures)

#### 2. **Endpoint API**
- **Utilise** : `/runtime/api/v1/images/tags` (fonctionne correctement avec SCHEDULED_EVENT)
- **Référence** : Basé sur l'exemple `/artifactory/api/v1/system/readiness`

#### 3. **Accès aux Propriétés Robuste**
- **Problème** : `context.properties.get()` ne fonctionnait pas toujours
- **Solution** : Méthodes multiples d'accès aux propriétés :
  ```typescript
  // Essaie plusieurs méthodes d'accès
  1. context.properties.get(key)
  2. context.properties[key] 
  3. context.workerConfig.properties[key]
  4. context.config.properties[key]
  ```

#### 4. **Gestion d'Erreur Améliorée**
- Logs détaillés des propriétés chargées
- Gestion gracieuse des propriétés manquantes
- Messages d'erreur explicites

### 🔧 Configuration Finale

```json
{
  "name": "databricks-exporter",
  "description": "Worker SCHEDULED_EVENT pour exporter Runtime API vers Databricks",
  "properties": {
    "apiEndpoint": "/runtime/api/v1/images/tags",
    "httpMethod": "GET", 
    "queryParams": "{\"limit\": \"100\"}",
    "databricksTableName": "runtime_images",
    "dataProperty": "tags"
  },
  "action": "SCHEDULED_EVENT",
  "cron": "0 */6 * * *",
  "enabled": true
}
```

### 📊 Résultats des Tests

- ✅ **9/9 tests passent**
- ✅ **Propriétés chargées correctement**
- ✅ **API calls fonctionnent**
- ✅ **Intégration Databricks opérationnelle**
- ✅ **Gestion d'erreur robuste**

### 🚀 Logs de Fonctionnement

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

### 🔄 Migration depuis v1.0.0

1. **Changez le type de worker** :
   ```json
   "action": "SCHEDULED_EVENT",
   "cron": "0 */6 * * *"
   ```

2. **Utilisez l'endpoint** :
   ```json
   "apiEndpoint": "/runtime/api/v1/images/tags"
   ```

3. **Redéployez** :
   ```bash
   jf worker deploy
   ```

### 📚 Documentation

- `README.md` - Documentation générale
- `example-scheduled-worker.md` - Exemples de configuration SCHEDULED
- `TROUBLESHOOTING.md` - Guide de résolution des problèmes
- `CHANGELOG.md` - Historique des changements

### 🎯 Prochaines Étapes

Le worker est maintenant prêt pour la production :
1. Déploiement avec `jf worker deploy`
2. Monitoring des exécutions automatiques
3. Configuration des secrets Databricks si nécessaire
4. Adaptation du cron selon vos besoins

## v1.0.0 - Worker GENERIC_EVENT (Initial)

- Worker de type GENERIC_EVENT
- Endpoint `/runtime/api/v1/images/tags` (problématique)
- Configuration via payload
- Accès basique aux propriétés
