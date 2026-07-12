Secret Messenger — Push Sender (Render)

This small Node.js service listens to your Firebase Realtime Database `chat` node and sends FCM push notifications to saved device tokens. Deploy on Render or any Node host so notifications continue when your PC is off.

Files:
- `index.js` — main server
- `package.json` — dependencies

Required environment variables (set these in Render -> Environment):
- `FIREBASE_SERVICE_ACCOUNT_BASE64` — base64-encoded contents of your Firebase service account JSON file.
- `FIREBASE_DATABASE_URL` — e.g. `https://your-project-default-rtdb.firebaseio.com`
- `ADMIN_API_KEY` — (optional) secret to protect `/send-test` endpoint.
- `NOTIFICATION_ICON_URL` — (optional) URL to notification icon image.
- `CHAT_DB_PATH` — (optional) DB path to chat messages (default `/chat`).

For local development, you can also use `FIREBASE_SERVICE_ACCOUNT_PATH` instead of `FIREBASE_SERVICE_ACCOUNT_BASE64` to point at a local JSON file.

How to create `FIREBASE_SERVICE_ACCOUNT_BASE64` on Windows PowerShell:

```powershell
$bytes = [System.IO.File]::ReadAllBytes('C:\path\to\service-account.json')
[Convert]::ToBase64String($bytes) | Out-File -Encoding ASCII base64.txt
# open base64.txt and copy the contents into Render env var value
```

Render deploy (recommended for closed-site notifications)

1. Create a GitHub repo containing the `push-server` folder.
2. In Render, choose New -> Web Service and connect that repo.
3. Build command: `cd push-server && npm install`
4. Start command: `cd push-server && npm start`
5. Add the environment variables listed above.
6. Visit `/health` after deploy to confirm the server is up.

On macOS / Linux:

```bash
base64 -w0 /path/to/service-account.json > base64.txt
# copy base64.txt contents
```

Local testing

1. Install dependencies:

```bash
cd push-server
npm install
```

2. Create a `.env` file from `.env.example` and set your values, or set environment variables directly.

Example using a local service account path on macOS/Linux:

```bash
export FIREBASE_SERVICE_ACCOUNT_PATH="/path/to/service-account.json"
export FIREBASE_DATABASE_URL="https://your-project-default-rtdb.firebaseio.com"
export NOTIFICATION_ICON_URL="https://your-site/bhavishya.jpg"
node index.js
```

Example using base64 values on macOS/Linux:

```bash
export FIREBASE_SERVICE_ACCOUNT_BASE64=$(base64 -w0 /path/to/service-account.json)
export FIREBASE_DATABASE_URL="https://your-project-default-rtdb.firebaseio.com"
export NOTIFICATION_ICON_URL="https://your-site/bhavishya.jpg"
node index.js
```

On Windows PowerShell using a local service account path:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\path\to\service-account.json'
$env:FIREBASE_DATABASE_URL = 'https://your-project-default-rtdb.firebaseio.com'
node index.js
```

On Windows PowerShell using base64:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\to\service-account.json'))
$env:FIREBASE_DATABASE_URL = 'https://your-project-default-rtdb.firebaseio.com'
node index.js
```

Test sending to a token (protected by `ADMIN_API_KEY` if set):

```bash
curl -X POST http://localhost:3000/send-test \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -d '{"token":"DEVICE_FCM_TOKEN","title":"Hi","body":"Hello from server"}'
```

Deploy to Render

1. Push this `push-server` folder to a Git repo (public or private).
2. In Render, create a new Web Service and connect the repo.
   - Build Command: `cd push-server && npm install`
   - Start Command: `cd push-server && npm start`
3. Add environment variables in Render as listed above.
4. Deploy and check logs.

Notes

- Do NOT commit your service account JSON to the repo. Use Render env vars.
- The service uses `admin.messaging().send()` and will attempt to remove invalid tokens from the `users/*/fcmToken` location.
- For production, consider filtering tokens by channel and respecting user notification preferences.
