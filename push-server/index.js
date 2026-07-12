require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

const SERVICE_ACCOUNT_BASE64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const CHAT_DB_PATH = process.env.CHAT_DB_PATH || '/chat';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const NOTIFICATION_ICON_URL = process.env.NOTIFICATION_ICON_URL || '';

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
    message: db ? 'Push sender ready' : 'Push sender waiting for Firebase credentials'
  });
});

// Listen for new chat messages and send notifications
if (db) {
  console.log('Listening for new messages at', CHAT_DB_PATH);
  db.ref(CHAT_DB_PATH).on('child_added', async (snap) => {
    const msg = snap.val();
    if (!msg) return;

    const notification = {
      title: 'Secret Messenger',
      body: msg.text ? String(msg.text).substring(0, 120) : 'New message'
    };
    const data = {
      channel: msg.channel || 'general',
      messageId: snap.key
    };

    const usersSnap = await db.ref('users').once('value');
    const tokens = [];
    usersSnap.forEach(u => {
      const token = u.child('fcmToken').val();
      if (token) tokens.push(token);
    });

    await sendNotificationsAndCleanup(tokens, notification, data);
  });
}

// Protected test endpoint to send to a single token
app.post('/send-test', async (req, res) => {
  const key = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;
  if (ADMIN_API_KEY && key !== ADMIN_API_KEY) return res.status(401).json({ error: 'unauthorized' });

  const { token, title, body } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  const notification = {
    title: title || 'Secret Messenger Test',
    body: body || 'Test notification'
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Push server listening on port', port));
