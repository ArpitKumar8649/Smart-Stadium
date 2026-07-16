# Azure backend deployment

The backend deploys directly to a Linux Node.js Azure Web App. GitHub Actions
installs dependencies, compiles `shared` and `backend`, runs tests, then uploads
a small production package containing only `backend/dist`, `shared/dist`,
runtime `node_modules`, and `data`.

Docker and Azure Container Registry are not part of this deployment path. The
existing Dockerfile remains available for local or future container use, but the
GitHub workflow does not build or push an image.

## 1. Create the Azure resources

In the Azure portal, create these resources in the same region:

1. A resource group, for example `rg-concourse-prod`.
2. A Linux App Service plan. Basic B1 is suitable for a hackathon demo; choose
   a larger tier only after load testing.
3. A Web App on that plan:
   - Publish: **Code** (not Docker Container)
   - Runtime stack: **Node 22 LTS**
   - Operating system: **Linux**
   - Name: a globally unique API name, for example `concourse-api-yourname`

The project supports Node 22 through 24 (`>=22 <25`). Select Node 22 LTS for
Azure so the runtime matches the GitHub Actions build.

## 2. Configure Web App environment variables

In the Web App, open **Settings → Environment variables** and add production
values from `backend/.env.example`. At minimum:

```text
NODE_ENV=production
LOG_LEVEL=info
DASHSCOPE_API_KEY=<secret>
ADMIN_DEMO_TOKEN=<random secret with at least 32 characters>
CROWD_SIM_ENABLED=true
```

Add these when the feature is used:

```text
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
GOOGLE_ROUTES_API_KEY=<secret>
```

`ADMIN_DEMO_TOKEN` currently protects the demo operations console. Generate a
long random value for production and store it only in Azure. Firebase Admin
SDK authentication is not part of this implementation, so do not add Firebase
service-account or UID settings to this backend.

If Google outdoor routing is enabled, restrict its key to the **Routes API**
and to this Web App's outbound IP addresses. It is a server-side key, so HTTP
referrer restrictions are not appropriate.

After Firebase Hosting is deployed, set `ALLOWED_ORIGINS` to a comma-separated
list containing both Firebase hosting domains, for example:

```text
ALLOWED_ORIGINS=https://your-project.web.app,https://your-project.firebaseapp.com,http://localhost:5173
```

Do not set `WEBSITES_PORT`; that setting is for custom containers. App Service
provides `PORT` to this Node.js application, and the backend already listens to
it. Keep runtime secrets in Azure App Service settings, never in this repository
or GitHub workflow.

The workflow configures the startup command (`node backend/dist/server.js`),
`NODE_ENV=production`, and disables App Service build automation because the
artifact is already built in GitHub Actions. The current App Service plan does
not support Always On; the API can cold-start after an idle period.

### Enable WebSockets for live captions

Live captions use `/api/audio/asr` over WebSockets. In Azure Portal, open the
Web App's **Settings → Configuration → General settings**, set **Web sockets**
to **On**, and save. The deployment workflow performs the same setting in its
own Azure CLI step; it intentionally does **not** combine it with Always On,
which the current plan does not support. After deploying the frontend, test the
Live captions control from an allowed Firebase or localhost origin.

## 3. Create GitHub-to-Azure OpenID Connect access

In Microsoft Entra ID:

1. Open **App registrations**, then **New registration** and create
   `github-concourse-deployer`.
2. Copy its **Application (client) ID** and **Directory (tenant) ID**.
3. Open **Certificates & secrets**, then **Federated credentials**, then **Add
   credential**.
4. Choose **GitHub Actions deploying Azure resources** and configure:
   - Organization: `ArpitKumar8649`
   - Repository: `Smart-Stadium`
   - Entity type: **Branch**
   - Branch: `main`
5. In the Web App's **Access control (IAM)**, assign the app registration's
   service principal the **Website Contributor** role, scoped to this Web App.

No Azure Container Registry role or registry credential is required.

In Azure, copy the subscription ID from **Subscriptions**.

## 4. Add GitHub Actions configuration

In GitHub → repository **Settings → Secrets and variables → Actions**:

Create these repository secrets:

```text
AZURE_CLIENT_ID=<Application client ID>
AZURE_TENANT_ID=<Directory tenant ID>
AZURE_SUBSCRIPTION_ID=<Azure subscription ID>
```

Create these repository variables:

```text
AZURE_RESOURCE_GROUP=rg-concourse-prod
AZURE_WEBAPP_NAME=<your-web-app-name>
ALLOWED_ORIGINS=http://localhost:5173,https://concourse-stadium.web.app,https://concourse-stadium.firebaseapp.com
```

The workflow deliberately skips its jobs until all three non-secret variables
exist. `ALLOWED_ORIGINS` is required so a backend deployment cannot accidentally
leave the live Firebase fan app blocked by CORS. Once they do, every push to
`main` that changes backend, shared, data, package, or deployment files builds
and deploys the backend. You can also run it manually from the **Actions** tab.

## 5. Verify the deployment

After the first successful run, open:

```text
https://<your-web-app-name>.azurewebsites.net/api/health
https://<your-web-app-name>.azurewebsites.net/api/version
```

Use **Monitoring → Log stream** in the Web App if startup fails. The app must
be a Linux Node.js Code Web App; a Docker Container Web App needs to be changed
to the Node.js runtime or recreated with the settings in step 1.
