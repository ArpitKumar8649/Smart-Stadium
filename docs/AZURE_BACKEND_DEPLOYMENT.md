# Azure backend deployment

The backend deploys as a Docker image to Azure App Service (Linux). The
workflow in .github/workflows/deploy-backend-azure.yml builds the existing
multi-stage Dockerfile in Azure Container Registry (ACR), tags it with the Git
commit SHA, then points App Service at that immutable image.

## 1. Create the Azure resources

In the Azure portal, create these resources in the same region:

1. A resource group, for example rg-concourse-prod.
2. An Azure Container Registry (Basic is sufficient for a hackathon).
   Its name must be globally unique, lowercase, and becomes
   <registry-name>.azurecr.io.
   Use the standard **RBAC Registry Permissions** authorization mode, not the
   optional RBAC + ABAC repository-permissions mode, so the `AcrPull` and
   `AcrPush` roles below apply directly.
3. An App Service plan on Linux. Use at least a Basic plan for a reliable
   demo; choose a larger tier only if load testing shows it is necessary.
4. A Web App on that Linux plan:
   - Publish: Docker Container
   - Name: a globally unique API name, for example concourse-api-yourname
   - Region: the same region as the plan and registry

## 2. Allow App Service to pull from ACR

Do not enable the registry's admin account. Instead:

1. In the Web App, open Identity and turn System assigned identity on.
   Save, then copy its principal ID.
2. In the Container Registry, open Access control (IAM), then Add role
   assignment.
3. Assign AcrPull to the Web App's managed identity.

This allows the deployed Web App to pull private images without storing a
registry password.

## 3. Configure Web App environment variables

In the Web App, open Settings → Environment variables and add the production
values from backend/.env.example. At minimum:

```text
NODE_ENV=production
LOG_LEVEL=info
WEBSITES_PORT=8080
DASHSCOPE_API_KEY=<secret>
ADMIN_DEMO_TOKEN=<secret with at least 12 characters>
CROWD_SIM_ENABLED=true
```

Add these when the feature is used:

```text
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
GOOGLE_ROUTES_API_KEY=<secret>
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_SERVICE_ACCOUNT_JSON=<single-line service-account JSON>
ADMIN_UIDS=<space-separated Firebase UIDs>
```

After Firebase Hosting is deployed, set ALLOWED_ORIGINS to a comma-separated
list containing both Firebase hosting domains, for example:

```text
ALLOWED_ORIGINS=https://your-project.web.app,https://your-project.firebaseapp.com,http://localhost:5173
```

Keep all runtime secrets in Azure App Service settings, never in this
repository or GitHub workflow.

## 4. Create GitHub-to-Azure OpenID Connect access

In Microsoft Entra ID:

1. Open App registrations, then New registration and create
   github-concourse-deployer.
2. Copy its Application (client) ID and Directory (tenant) ID.
3. Open Certificates & secrets, then Federated credentials, then Add
   credential.
4. Choose GitHub Actions deploying Azure resources and configure:
   - Organization: ArpitKumar8649
   - Repository: Smart-Stadium
   - Entity type: Branch
   - Branch: main
5. In the Web App's Access control (IAM), assign the app registration's
   service principal the Website Contributor role, scoped to this Web App.
6. In the Container Registry's Access control (IAM), assign it both the
   Reader and AcrPush roles, scoped to this registry. Reader lets the workflow
   read the registry login server; AcrPush lets `az acr build` create and push
   the image.

In Azure, copy the subscription ID from Subscriptions.

## 5. Add GitHub Actions configuration

In GitHub → repository Settings → Secrets and variables → Actions:

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
AZURE_ACR_NAME=<your-registry-name-without-.azurecr.io>
```

The workflow deliberately skips its deploy job until all three variables exist.
Once they do, every push to main that changes backend, shared, data, Docker,
or deployment files builds and deploys the backend. You can also run it
manually from the Actions tab.

## 6. Verify the deployment

After the first successful run, open:

```text
https://<your-web-app-name>.azurewebsites.net/api/health
https://<your-web-app-name>.azurewebsites.net/api/version
```

Use Monitoring → Log stream in the Web App if startup fails. The image listens
on port 8080, and WEBSITES_PORT=8080 tells App Service where to route traffic.
