const path = require('path');
const admin = require('firebase-admin');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const APPLY_FLAG = '--apply';
const USERS_PER_BATCH = 250;

function getCredential() {
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (serviceAccountBase64) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf8')
      );
    } catch (error) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_BASE64 must contain valid base64-encoded service-account JSON.'
      );
    }
    return admin.credential.cert(serviceAccount);
  }

  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath) {
    let serviceAccount;
    try {
      serviceAccount = require(path.resolve(serviceAccountPath));
    } catch (error) {
      throw new Error(`Could not load Firebase service account file: ${error.message}`);
    }
    return admin.credential.cert(serviceAccount);
  }

  return admin.credential.applicationDefault();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/set-all-user-themes-light.js [--apply]');
    console.log('Without --apply, the program only reports how many users would change.');
    return;
  }
  if (args.some(arg => arg !== APPLY_FLAG)) {
    throw new Error('Only the optional --apply flag is supported. Use --help for usage.');
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error('Set FIREBASE_DATABASE_URL before running this migration.');
  }

  const applyChanges = args.includes(APPLY_FLAG);
  const app = admin.initializeApp({
    credential: getCredential(),
    databaseURL
  });

  try {
    const rootRef = admin.database().ref();
    const usersSnapshot = await rootRef.child('users').once('value');
    let userCount = 0;
    const keysNeedingChange = [];

    usersSnapshot.forEach(userSnapshot => {
      userCount += 1;
      if (userSnapshot.child('settings').child('theme').val() !== 'light') {
        keysNeedingChange.push(userSnapshot.key);
      }
    });

    console.log(`Users found: ${userCount}`);
    console.log(`Users not already set to light: ${keysNeedingChange.length}`);

    if (!applyChanges) {
      console.log('Dry run only; no Firebase data was changed. Pass --apply to write updates.');
      return;
    }

    const updateTimestamp = admin.database.ServerValue.TIMESTAMP;
    for (let offset = 0; offset < keysNeedingChange.length; offset += USERS_PER_BATCH) {
      const batch = keysNeedingChange.slice(offset, offset + USERS_PER_BATCH);
      const updates = {};
      for (const userKey of batch) {
        updates[`users/${userKey}/settings/theme`] = 'light';
        updates[`users/${userKey}/settings/lastUpdated`] = updateTimestamp;
      }
      await rootRef.update(updates);
      console.log(
        `Updated ${Math.min(offset + batch.length, keysNeedingChange.length)} of ${keysNeedingChange.length} users.`
      );
    }

    console.log('All existing users are set to light theme.');
  } finally {
    await app.delete();
  }
}

main().catch(error => {
  console.error(`Theme migration failed: ${error.message}`);
  process.exitCode = 1;
});
