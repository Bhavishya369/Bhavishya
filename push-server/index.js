require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// Optional: comma-separated list of allowed origins (e.g. https://your-site.github.io)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

// Basic CORS handling to allow browser clients (GitHub Pages, Netlify) to call this API
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = !ALLOWED_ORIGINS.length || (origin && ALLOWED_ORIGINS.includes(origin));

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-API-KEY, Origin, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const SERVICE_ACCOUNT_BASE64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const CHAT_DB_PATH = process.env.CHAT_DB_PATH || '/chat';
const STATUS_DB_PATH = process.env.STATUS_DB_PATH || '/status';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const NOTIFICATION_ICON_URL = process.env.NOTIFICATION_ICON_URL || '';
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let adminApp = null;
let db = null;

if (!DATABASE_URL) {
  console.warn('Missing FIREBASE_DATABASE_URL environment variable. The server will start in health-only mode.');
}

if (DATABASE_URL) {
  let serviceAccount;
  try {
    if (SERVICE_ACCOUNT_BASE64) {
      serviceAccount = JSON.parse(Buffer.from(SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    } else if (SERVICE_ACCOUNT_PATH) {
      const fs = require('fs');
      const raw = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
      serviceAccount = JSON.parse(raw);
    } else {
      console.warn('Missing Firebase service account credentials. Set FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT_PATH to enable push sending.');
    }

    if (serviceAccount) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: DATABASE_URL
      });
      db = admin.database();
      console.log('Firebase Admin initialized successfully.');
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin:', err.message);
  }
}

async function cleanupInvalidTokens(tokensToRemove) {
  if (!tokensToRemove.length) return;
  console.log('Cleaning up invalid tokens:', tokensToRemove.length);
  const usersSnap = await db.ref('users').once('value');
  usersSnap.forEach(u => {
    const token = u.child('fcmToken').val();
    if (token && tokensToRemove.includes(token)) {
      db.ref(`users/${u.key}/fcmToken`).remove().catch(() => {});
    }
  });
}

async function cleanupInvalidOneSignalPlayerIds(playerIdsToRemove) {
  if (!playerIdsToRemove || !playerIdsToRemove.length || !db) return;

  const uniquePlayerIds = Array.from(new Set(playerIdsToRemove.filter(Boolean)));
  if (!uniquePlayerIds.length) return;

  console.log('Cleaning up invalid OneSignal player IDs:', uniquePlayerIds.length);
  const usersSnap = await db.ref('users').once('value');
  const cleanupPromises = [];

  usersSnap.forEach((u) => {
    const userKey = u.key;
    const devices = u.child('devices').val() || {};
    const deviceEntries = Object.entries(devices || {});

    deviceEntries.forEach(([deviceKey, device]) => {
      if (!device || !device.playerId) return;
      if (uniquePlayerIds.includes(device.playerId)) {
        cleanupPromises.push(db.ref(`users/${userKey}/devices/${deviceKey}`).remove().catch(() => {}));
      }
    });

    const fallbackPid = u.child('oneSignalPlayerId').val();
    if (fallbackPid && uniquePlayerIds.includes(fallbackPid)) {
      cleanupPromises.push(db.ref(`users/${userKey}/oneSignalPlayerId`).remove().catch(() => {}));
    }
  });

  await Promise.allSettled(cleanupPromises);
}

function buildFcmMessage(token, notification, data = {}) {
  const message = { token };

  if (notification) {
    const { title, body } = notification;
    message.notification = { title, body };
  }

  if (NOTIFICATION_ICON_URL) {
    message.webpush = {
      notification: {
        icon: NOTIFICATION_ICON_URL
      }
    };
  }

  if (data && Object.keys(data).length > 0) {
    message.data = data;
  }

  return message;
}

async function sendNotificationsAndCleanup(tokens, notification, data) {
  if (!tokens || tokens.length === 0) return;
  const uniqueTokens = Array.from(new Set(tokens));
  const results = await Promise.allSettled(uniqueTokens.map(async (token) => {
    try {
      await admin.messaging().send(buildFcmMessage(token, notification, data));
      return { token, success: true };
    } catch (err) {
      return { token, success: false, error: err };
    }
  }));

  const tokensToRemove = [];
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value.success) {
      successCount += 1;
      return;
    }

    failureCount += 1;
    const err = result.status === 'fulfilled' ? result.value.error : result.reason;
    const tokenValue = result.status === 'fulfilled' ? result.value.token : null;

    console.error('notification failure', {
      token: tokenValue,
      success: result.status === 'fulfilled' ? result.value.success : false,
      errorCode: err?.code,
      errorMessage: err?.message,
      errorInfo: err?.errorInfo || err,
    });

    if (err && err.code && (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token')) {
      tokensToRemove.push(tokenValue);
    }
  });

  await cleanupInvalidTokens(tokensToRemove.filter(Boolean));
  console.log('send result:', successCount, 'successes,', failureCount, 'failures');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    initialized: !!db,
    databaseUrl: DATABASE_URL || null,
    storageCleanup: {
      cloudinary: !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET),
      supabase: !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    },
    message: db ? 'Push sender ready' : 'Push sender waiting for Firebase credentials'
  });
});

function getCloudinaryAssetFromMessage(message) {
  const fileData = message?.fileData || {};
  const storage = fileData.storage || message?.storage;
  const url = fileData.url || message?.mediaUrl || message?.voiceMessage?.url || '';
  let publicId = fileData.publicId || message?.publicId || '';
  let resourceType = fileData.resourceType || message?.resourceType || '';

  if ((!publicId || !resourceType) && typeof url === 'string') {
    try {
      const parsedUrl = new URL(url);
      if (!parsedUrl.hostname.endsWith('res.cloudinary.com')) return null;
      const match = parsedUrl.pathname.match(/\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/);
      if (!match) return null;
      resourceType = resourceType || match[1];
      if (!publicId) {
        publicId = decodeURIComponent(match[2]);
        if (resourceType !== 'raw') publicId = publicId.replace(/\.[^.]+$/, '');
      }
    } catch (error) {
      console.warn('Unable to parse Cloudinary asset URL:', error.message);
      return null;
    }
  }

  if (storage && storage !== 'cloudinary') return null;
  if (!publicId || !['image', 'video', 'raw'].includes(resourceType)) return null;
  return { publicId, resourceType };
}

async function deleteCloudinaryAsset(message) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return;
  const asset = getCloudinaryAssetFromMessage(message);
  if (!asset) return;

  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = `invalidate=true&public_id=${asset.publicId}&timestamp=${timestamp}`;
  const signature = require('crypto')
    .createHash('sha1')
    .update(`${parameters}${CLOUDINARY_API_SECRET}`)
    .digest('hex');
  const body = new URLSearchParams({
    api_key: CLOUDINARY_API_KEY,
    timestamp: String(timestamp),
    public_id: asset.publicId,
    invalidate: 'true',
    signature
  });
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${asset.resourceType}/destroy`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  const result = await response.json();
  if (!response.ok || !['ok', 'not found'].includes(result.result)) {
    throw new Error(result.error?.message || `Cloudinary delete failed (HTTP ${response.status}).`);
  }
}

function getSupabaseStoragePath(message) {
  const fileData = message?.fileData || {};
  const storage = fileData.storage || message?.storage;
  if (storage && storage !== 'supabase') return null;
  const savedPath = fileData.storagePath || message?.storagePath;
  if (savedPath) return String(savedPath).split('/').filter(Boolean).map(encodeURIComponent).join('/');

  const url = fileData.url || '';
  if (!url || !SUPABASE_URL) return null;
  try {
    const parsedUrl = new URL(url);
    const base = new URL(SUPABASE_URL);
    if (parsedUrl.hostname !== base.hostname) return null;
    const marker = '/storage/v1/object/public/chat-files/';
    const index = parsedUrl.pathname.indexOf(marker);
    return index === -1 ? null : parsedUrl.pathname.slice(index + marker.length);
  } catch (error) {
    console.warn('Unable to parse Supabase storage URL:', error.message);
    return null;
  }
}

async function deleteSupabaseAsset(message) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const storagePath = getSupabaseStoragePath(message);
  if (!storagePath) return;
  const response = await fetch(
    `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/chat-files/${storagePath}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase delete failed (HTTP ${response.status}): ${errorText}`);
  }
}

async function cleanupDeletedChatAsset(snapshot) {
  const message = snapshot.val();
  if (!message) return;
  const fileData = message.fileData || {};
  const storage = fileData.storage || message.storage;
  if (storage === 'supabase') {
    await deleteSupabaseAsset(message);
  } else {
    await deleteCloudinaryAsset(message);
  }
}

// Listen for new chat messages and send notifications
const pendingOfflineNotifications = new Set();

if (db) {
  if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
    console.warn('Cloudinary deletion is disabled until CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are configured.');
  }
  if (!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) {
    console.warn('Supabase deletion is disabled until SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured.');
  }
  const listenerStartedAt = Date.now();
  console.log('Listening for new messages at', CHAT_DB_PATH);
  db.ref(CHAT_DB_PATH).on('child_added', async (snap) => {
    const msg = snap.val();
    if (!msg) return;

    const isGeneralMessage = !msg.channel || msg.channel === 'general';
    const msgTimestamp = Number(msg.timestamp || 0);
    if (!isGeneralMessage) {
      console.log(`⏭ Skip non-general channel message ${snap.key} in ${msg.channel || 'general'}`);
      return;
    }

    if (msgTimestamp && msgTimestamp < listenerStartedAt - 5000) {
      console.log(`⏭ Skip historical message ${snap.key} from ${msg.name || 'unknown'} with timestamp ${msgTimestamp}`);
      return;
    }

    const notification = {
      title: 'Bhavishya',
      body: 'Update app for a better experience 🚀'
    };
    const data = {
      channel: msg.channel || 'general',
      messageId: snap.key,
      messageText: msg.text ? String(msg.text).substring(0, 120) : 'New message',
      sender: msg.name || 'Someone'
    };
    console.log(`📨 New chat message detected - evaluating offline notifications. Message from ${msg.name} in channel ${msg.channel || 'general'}`);

    const usersSnap = await db.ref('users').once('value');
    const oneSignalRecipients = [];
    const offlineUserUpdates = [];
    const pendingUsers = [];

    usersSnap.forEach(u => {
      const userId = u.key;
      const notifyWhenOffline = u.child('notifyWhenOffline').val() === true;
      const settings = u.child('settings').val() || {};
      const notificationsEnabled = settings.notificationsEnabled !== false;
      const devices = u.child('devices').val() || {};
      const enabledDeviceIds = [];

      Object.keys(devices).forEach((deviceKey) => {
        const device = devices[deviceKey];
        if (device && device.playerId && device.enabled !== false) {
          enabledDeviceIds.push(device.playerId);
        }
      });

      const fallbackPid = u.child('oneSignalPlayerId').val();
      if (!enabledDeviceIds.length && fallbackPid) {
        enabledDeviceIds.push(fallbackPid);
      }

      const hasChatNotificationSent = u.child('chatNotificationSentSinceLastVisit').val() === true;
      const shouldNotify = enabledDeviceIds.length > 0 && notifyWhenOffline && notificationsEnabled && !hasChatNotificationSent;

      if (shouldNotify) {
        if (pendingOfflineNotifications.has(userId)) {
          console.log(`  ⏭ Skip ${userId}: already pending offline notification`);
          return;
        }

        enabledDeviceIds.forEach((pid) => {
          oneSignalRecipients.push(pid);
        });
        offlineUserUpdates.push(userId);
        pendingUsers.push(userId);
        pendingOfflineNotifications.add(userId);
        console.log(`  ✅ Will notify ${userId}: deviceCount=${enabledDeviceIds.length}, offline=${notifyWhenOffline}, enabled=${notificationsEnabled}`);
      } else {
        if (hasChatNotificationSent) console.log(`  ⏭ Skip ${userId}: already notified since last visit`);
        if (!enabledDeviceIds.length) console.log(`  ⚠️ Skip ${userId}: no enabled devices for notification`);
        if (!notifyWhenOffline || !notificationsEnabled) console.log(`  ⚠️ Skip ${userId}: offline=${notifyWhenOffline}, enabled=${notificationsEnabled}`);
      }
    });

    if (ONESIGNAL_REST_API_KEY && oneSignalRecipients.length > 0) {
      try {
        console.log(`🚀 Sending notification to ${oneSignalRecipients.length} device(s)...`);
        await sendOneSignalNotification(oneSignalRecipients, notification, data);
        console.log('✅ Notification sent successfully');
        
        console.log('🔄 Clearing offline flags for notified users...');
        await Promise.all(offlineUserUpdates.map((userId) => db.ref(`users/${userId}`).update({
          notifyWhenOffline: false,
          chatNotificationSentSinceLastVisit: true
        })));
      } catch (err) {
        console.error('❌ OneSignal send error', err);
      } finally {
        pendingUsers.forEach((userId) => pendingOfflineNotifications.delete(userId));
      }
    } else {
      if (!ONESIGNAL_REST_API_KEY) {
        console.warn('⚠️ OneSignal REST API key not configured');
      }
      if (oneSignalRecipients.length === 0) {
        console.log('⚠️ No users to notify (nobody offline with notifications enabled)');
      }
    }
  });

  db.ref(CHAT_DB_PATH).on('child_removed', (snap) => {
    cleanupDeletedChatAsset(snap).catch(error => {
      console.error(`Unable to remove storage asset for deleted chat message ${snap.key}:`, error);
    });
  });
}

async function sendOneSignalNotification(playerIds, notification, data = {}) {
  if (!playerIds || playerIds.length === 0) return;
  if (!ONESIGNAL_REST_API_KEY || !ONESIGNAL_APP_ID) {
    throw new Error('OneSignal app id or rest api key missing');
  }

  // Use global fetch if available (Node 18+), otherwise try node-fetch
  let fetchFn = global.fetch;
  if (!fetchFn) {
    try {
      // eslint-disable-next-line global-require
      fetchFn = require('node-fetch');
    } catch (e) {
      throw new Error('fetch is not available; install node-fetch or use Node 18+');
    }
  }

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_player_ids: Array.isArray(playerIds) ? playerIds : [playerIds],
    headings: { en: notification.title || 'Secret Messenger' },
    contents: { en: notification.body || 'New message' },
    data: data || {}
  };

  const res = await fetchFn('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneSignal error: ${res.status} - ${text}`);
  }

  const json = await res.json();
  console.log('OneSignal send result', json);

  if (json?.errors?.invalid_player_ids?.length) {
    await cleanupInvalidOneSignalPlayerIds(json.errors.invalid_player_ids);
  }

  return json;
}

// Protected test endpoint to send to a single token
app.post('/send-test', async (req, res) => {
  const key = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;
  // If ADMIN_API_KEY is set, only reject when an API key is provided but incorrect.
  if (ADMIN_API_KEY && key && key !== ADMIN_API_KEY) return res.status(401).json({ error: 'unauthorized' });

  const { token, title, body } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  const notification = {
    title: title || 'Bhavishya',
    body: body || 'Update app for a better experience 🚀'
  };
  const data = {};

  if (!adminApp) {
    return res.status(503).json({ error: 'Firebase Admin is not initialized. Set credentials first.' });
  }

  try {
    const r = await admin.messaging().send(buildFcmMessage(token, notification, data));
    res.json({ ok: true, result: r });
  } catch (err) {
    console.error('send-test error', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: Get Firebase-safe user key from username/email
function getFirebaseSafeUserKey(username) {
  if (!username || typeof username !== 'string') return 'unknown';
  return String(username)
    .trim()
    .toLowerCase()
    .replace(/\.+/g, '_')  // Replace . with _
    .replace(/[#$\[\]]/g, '_')  // Replace invalid Firebase chars with _
    .replace(/\s+/g, '_')  // Replace spaces with _
    .substring(0, 100);  // Limit length
}

function getFirebaseSafeDeviceKey(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return 'unknown_device';
  return deviceId
    .trim()
    .replace(/\.+/g, '_')
    .replace(/[#$\[\]]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

// Endpoint to save OneSignal player id for a user
app.post('/save-onesignal-id', async (req, res) => {
  const key = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;
  if (ADMIN_API_KEY && key && key !== ADMIN_API_KEY) return res.status(401).json({ error: 'unauthorized' });

  const { username, playerId, label } = req.body || {};
  if (!username || !playerId) return res.status(400).json({ error: 'username and playerId required' });

  if (!db) return res.status(503).json({ error: 'Firebase Admin is not initialized. Set credentials first.' });

  try {
    const safeKey = getFirebaseSafeUserKey(username);
    const safeDeviceKey = getFirebaseSafeDeviceKey(playerId);
    const deviceRef = db.ref(`users/${safeKey}/devices/${safeDeviceKey}`);
    await deviceRef.update({
      playerId,
      label: label || 'Device',
      enabled: true,
      lastUpdated: admin.database.ServerValue.TIMESTAMP
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('save-onesignal-id error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/mark-user-offline', async (req, res) => {
  const { username } = req.body || {};
  if (!username || !db) {
    return res.json({ ok: true, skipped: true });
  }

  try {
    const safeKey = getFirebaseSafeUserKey(username);
    await db.ref(`users/${safeKey}/notifyWhenOffline`).set(true);
    await db.ref(`users/${safeKey}/lastSeen`).set(Date.now());
    res.json({ ok: true });
  } catch (err) {
    console.error('mark-user-offline error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Debug helper: respond to GET so we can diagnose deployment mismatches from the browser
app.get('/summon-user', (req, res) => {
  res.json({ ok: false, method: 'GET', message: 'This endpoint expects POST with JSON { username }. If you see this, the server is reachable but the client may be sending the wrong method or path.' });
});

// Summon endpoint - send OneSignal notification to user's devices (requires ADMIN_API_KEY and OneSignal configured)
app.post('/summon-user', async (req, res) => {
  const key = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;
  if (ADMIN_API_KEY && key && key !== ADMIN_API_KEY) return res.status(401).json({ error: 'unauthorized' });
  const { username, fromUsername, reason } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  if (!db) return res.status(503).json({ error: 'Firebase Admin not initialized' });

  try {
    const safeKey = getFirebaseSafeUserKey(username);
    const userSnap = await db.ref(`users/${safeKey}`).once('value');
    const user = userSnap.val();
    if (!user) return res.status(404).json({ error: 'user not found' });

    let pids = [];
    const devices = user.devices || {};
    if (devices && typeof devices === 'object') {
      Object.values(devices).forEach((device) => {
        if (device && device.playerId && device.enabled !== false) {
          pids.push(device.playerId);
        }
      });
    }

    if (!pids.length) {
      if (Array.isArray(user.oneSignalPlayerId)) pids = user.oneSignalPlayerId;
      else if (typeof user.oneSignalPlayerId === 'string' && user.oneSignalPlayerId) pids = [user.oneSignalPlayerId];
      else if (user.oneSignalPlayerIds && Array.isArray(user.oneSignalPlayerIds)) pids = user.oneSignalPlayerIds;
    }

    if (!pids.length) {
      const fallbackPid = user.oneSignalPlayerId;
      if (fallbackPid) pids.push(fallbackPid);
      else if (Array.isArray(user.oneSignalPlayerIds)) pids.push(...user.oneSignalPlayerIds);
    }

    if (!pids || pids.length === 0) return res.status(404).json({ error: 'no player id for user' });

    const senderName = fromUsername || 'Someone';
    const reasonText = reason ? ` [ Reason : ${reason} ]` : '';
    const notification = {
      title: 'Bhavishya',
      body: `Update app for a better experience 🚀${reasonText}`
    };
    const data = {
      summon: true,
      fromUsername: senderName,
      reason: reason || ''
    };
    const result = await sendOneSignalNotification(pids, notification, data);
    return res.json({ ok: true, playerIds: pids, result });
  } catch (err) {
    console.error('summon-user error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Push server listening on port', port));


