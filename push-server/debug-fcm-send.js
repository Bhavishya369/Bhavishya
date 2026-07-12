const fs = require('fs');
const admin = require('firebase-admin');

const serviceAccountPath = '../secret-notes-6c2ca-firebase-adminsdk-fbsvc-2c6ecc4dab.json';
const databaseURL = 'https://secret-notes-6c2ca-default-rtdb.firebaseio.com';

const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL,
});

const token = 'e-QsQUEAZc0MNOUEFAf2sL:APA91bEjmWy4nNexc6LCHOQPAod1JIGlebiFEBB0eEaIas7lIuS5XAxdQEfpCt17YT9dYl4zg4DAi_LMtOSZcwfkZXTfem-xBATAxraWLBxYKpN8a8txAVw';

(async () => {
  try {
    const response = await admin.messaging().send({
      token,
      notification: {
        title: 'Debug Push',
        body: 'This is a direct FCM test from debug-fcm-send.js',
      },
    });
    console.log('send response', response);
  } catch (err) {
    console.error('send error', err);
    if (err && err.errorInfo) {
      console.error('errorInfo', err.errorInfo);
    }
    process.exit(1);
  }
})();
