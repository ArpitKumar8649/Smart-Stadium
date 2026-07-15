# Firebase frontend deployment

The React/Vite frontend deploys to Firebase Hosting. The backend remains the
existing Azure Web App. GitHub Actions builds `frontend/dist` on pushes to
`main`, then deploys that static output to Firebase Hosting's live channel.

The workflow is `.github/workflows/deploy-frontend-firebase.yml`; `firebase.json`
defines the Vite output directory, SPA route fallback, and cache rules.

## 1. Create or select a Firebase project

1. Open the [Firebase console](https://console.firebase.google.com/).
2. Create a project, or select the Firebase project already used by this app.
3. Open **Build → Hosting** and click **Get started**. Complete the Hosting
   setup for the default site.
4. Copy the Firebase **project ID** from Project settings → General. It is
   usually the first part of the final `https://<project-id>.web.app` URL.

No Firebase Web SDK configuration is required for this deployment: Firebase
Hosting serves the built static files while the browser calls the Azure API.

## 2. Create the GitHub deployment service account

In Google Cloud Console, with the same Firebase project selected:

1. Open **IAM & Admin → Service Accounts** and create a service account, for
   example `github-smart-stadium-deployer`.
2. Grant it these project roles:
   - **Firebase Hosting Admin** (`roles/firebasehosting.admin`)
   - **Service Usage API Keys Viewer** (`roles/serviceusage.apiKeysViewer`)
3. Open the new service account → **Keys** → **Add key** → **Create new key**
   → **JSON**, then download it once.
4. In GitHub, open this repository's **Settings → Secrets and variables →
   Actions → Secrets** and add:

   ```text
   FIREBASE_SERVICE_ACCOUNT=<the entire downloaded JSON file>
   ```

Keep that JSON only in the GitHub secret. Never commit it, put it in a Vite
environment variable, or send it in chat. The Firebase Hosting action uses it
to authenticate the deployment. Firebase's action documentation describes the
same service-account flow and role requirements.

## 3. Configure GitHub Actions variables

In GitHub → **Settings → Secrets and variables → Actions → Variables**, add:

```text
FIREBASE_PROJECT_ID=<your Firebase project ID>
VITE_API_BASE=https://concourse-api-arpit-b3eha5agdcfgg9hp.centralindia-01.azurewebsites.net
```

`VITE_API_BASE` must have no trailing `/api`: the frontend adds `/api/...`
itself. It is intentionally a variable rather than a secret because the
browser must know the API's public URL.

These are optional browser-visible variables:

```text
VITE_CESIUM_ION_TOKEN=<your Cesium browser token>
VITE_ADMIN_DEMO_TOKEN=<the same demo-only value as Azure ADMIN_DEMO_TOKEN>
```

Every `VITE_*` value is embedded into the frontend JavaScript during the build.
Never put DashScope, Google Routes, Firebase service-account, or any other
server secret in one. `VITE_ADMIN_DEMO_TOKEN` is only appropriate for this
hackathon's client-side demo passcode; it is not real production security.

## 4. Allow the Firebase site to call Azure

In Azure Portal → **concourse-api-arpit** → **Settings → Environment
variables**, update `ALLOWED_ORIGINS` after Firebase Hosting has created the
site URLs:

```text
http://localhost:5173,https://<project-id>.web.app,https://<project-id>.firebaseapp.com
```

Include a custom domain there too if one is connected later. Save the setting;
App Service restarts the backend with the new CORS allowlist. Without this
step, the frontend loads but its browser API requests are blocked by CORS.

`GOOGLE_ROUTES_API_KEY` remains an Azure backend environment variable. Do not
put that key in Firebase or a `VITE_*` value.

## 5. Deploy

Once the GitHub secret and the two required variables are present, the next
push to `main` that changes frontend, shared, public assets, or Firebase
configuration automatically runs **Deploy frontend to Firebase Hosting**.

You can also start it manually in GitHub → **Actions** → **Deploy frontend to
Firebase Hosting** → **Run workflow**. The action:

1. installs dependencies with Node 22;
2. builds `shared` and the Vite frontend;
3. deploys only `frontend/dist` to Firebase Hosting's `live` channel.

The deployed site is available at:

```text
https://<project-id>.web.app
https://<project-id>.firebaseapp.com
```

`firebase.json` rewrites unknown paths to `index.html`, so direct visits to
`/navigate`, `/concierge`, and `/admin` continue to work with React Router.

## 6. Verify and roll back

After the Action succeeds:

1. Open the `.web.app` URL in a private/incognito window.
2. Visit `/navigate`, calculate a route, and confirm the browser requests go
   to the Azure Web App URL rather than the Firebase domain.
3. Check browser DevTools → Console/Network for CORS errors.
4. Open the Firebase console → Hosting → Release history. Select an earlier
   release and use **Rollback** if you need to revert the frontend.

Firebase Hosting serves static files through its CDN and supplies HTTPS for
the Hosting domains. For a custom domain, add it in Firebase Hosting first,
then add that exact `https://` origin to Azure `ALLOWED_ORIGINS`.
