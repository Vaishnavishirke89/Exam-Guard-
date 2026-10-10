# Deploying Exam Guard AI to Azure

Architecture: one **Azure App Service (Linux, Node 20)** serves the API (`/api/*`) and the built React app,
backed by **Azure Database for MySQL – Flexible Server**. Deployment is automated by
`.github/workflows/azure-deploy.yml` (repo root; `backend/` and `frontend/` also live at the repo root) on every push to `main`.

Replace names in `<angle brackets>` (web app name must be globally unique).

## 1. Create resources (Azure Portal or Cloud Shell)

```bash
az login
az group create -n examguard-rg -l centralindia

# MySQL
az mysql flexible-server create -g examguard-rg -n <mysql-server-name> -l centralindia \
  --admin-user examadmin --admin-password '<StrongPassword!>' \
  --sku-name Standard_B1ms --tier Burstable --version 8.0.21 \
  --public-access 0.0.0.0        # allows Azure services
az mysql flexible-server db create -g examguard-rg -s <mysql-server-name> -d exam_guard_ai

# Web app
az appservice plan create -g examguard-rg -n examguard-plan --is-linux --sku B1
az webapp create -g examguard-rg -p examguard-plan -n <webapp-name> --runtime "NODE:20-lts"
az webapp config set -g examguard-rg -n <webapp-name> --startup-file "node backend/src/server.js"
```

## 2. App settings (web app > Settings > Environment variables)

| Name | Value |
|---|---|
| `DB_HOST` | `<mysql-server-name>.mysql.database.azure.com` |
| `DB_PORT` | `3306` |
| `DB_USER` | `examadmin` |
| `DB_PASSWORD` | the admin password |
| `DB_NAME` | `exam_guard_ai` |
| `DB_SSL` | `true` |
| `JWT_SECRET` | long random string (e.g. `openssl rand -hex 48`) |
| `FRONTEND_URL` | `https://<webapp-name>.azurewebsites.net` |
| `WEBSITE_RUN_FROM_PACKAGE` | `1` (optional) |

Do **not** set `PORT`; App Service provides it.

## 3. Create tables and demo data (one time, from your PC)

1. In the MySQL server > Networking, add your current client IP to the firewall.
2. Import the schema (the DB already exists; the `CREATE DATABASE`/`USE` lines are harmless):
   ```bash
   mysql -h <mysql-server-name>.mysql.database.azure.com -u examadmin -p --ssl-mode=REQUIRED < database/schema.sql
   ```
3. Seed demo users (optional, needs a local `backend/.env` pointing at Azure with `DB_SSL=true`):
   ```bash
   cd backend && npm install && npm run seed
   ```
   Demo password `Demo@123` – **change or remove the demo accounts before real use.**
4. Remove your IP from the firewall again.

## 4. Connect GitHub for deployment

1. Web app > Overview > **Download publish profile**.
2. GitHub repo > Settings > Secrets and variables > Actions > add:
   - `AZURE_WEBAPP_NAME` = `<webapp-name>`
   - `AZURE_WEBAPP_PUBLISH_PROFILE` = full contents of the downloaded file
3. Push to `main` (or run the workflow manually from the Actions tab).

## 5. Verify

- `https://<webapp-name>.azurewebsites.net/api/health` returns `{"success":true,...}`
- `https://<webapp-name>.azurewebsites.net/` shows the login page.
- Troubleshooting: web app > Log stream.
