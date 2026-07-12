const fs = require('fs');
const admin = require('firebase-admin');

const serviceAccountPath = '../secret-notes-6c2ca-firebase-adminsdk-fbsvc-2c6ecc4dab.json';
const databaseURL = 'https://secret-notes-6c2ca-default-rtdb.firebaseio.com';

const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL,
});

const db = admin.database();

(async () => {
  try {
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};
    const tokens = [];
    for (const key of Object.keys(users)) {
      const user = users[key];
      if (user && user.fcmToken) {
        tokens.push({ key, username: user.username, token: user.fcmToken });
      }
      if (tokens.length >= 10) break;
    }
    console.log('foundTokens', tokens.length);
    console.log(JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error('failed', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
