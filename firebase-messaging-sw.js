importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAnRpupObYmukI2-VfsVmxL4UTfFF7xSCg",
  authDomain: "secret-notes-6c2ca.firebaseapp.com",
  databaseURL: "https://secret-notes-6c2ca-default-rtdb.firebaseio.com",
  projectId: "secret-notes-6c2ca",
  storageBucket: "secret-notes-6c2ca.appspot.com",
  messagingSenderId: "10438001798",
  appId: "1:10438001798:web:d4d8b607266f2502a2fd07"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'Secret Messenger';
  const notificationOptions = {
    body: payload.notification?.body || 'Update app for a better experience 🚀',
    icon: payload.notification?.icon || 'bhavishya.jpg',
    tag: payload.notification?.tag || 'secret-messenger-update',
    renotify: false
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
