// Allow Developer Tools for debugging
// Uncomment below to disable developer tools (not recommended)
/*
document.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("keydown", function (e) {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) ||
    (e.ctrlKey && e.key === "U")
  ) {
    e.preventDefault();
    showNotification("Inspecting is disabled 🚫", true);
  }
});
*/

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAnRpupObYmukI2-VfsVmxL4UTfFF7xSCg",
  authDomain: "secret-notes-6c2ca.firebaseapp.com",
  databaseURL: "https://secret-notes-6c2ca-default-rtdb.firebaseio.com",
  projectId: "secret-notes-6c2ca",
  storageBucket: "secret-notes-6c2ca.appspot.com",
  messagingSenderId: "10438001798",
  appId: "1:10438001798:web:d4d8b607266f2502a2fd07"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
let messaging = null;
// Web Push (VAPID) public key from Firebase console
const VAPID_PUBLIC_KEY = 'BBP0WkAMgKGgVKHzEp-zU4G_tfr6kgo5G6H-fMyil-05h7JRF0PGzjchut41Wo5OG_Dd4umoaVRlEcIwvUSXrh8';

// Supabase configuration
const supabaseUrl = 'https://aouzfetjvfmvqrnswseq.supabase.co';
const supabaseKey = 'sb_publishable_p8Bp4oomauG6Sszp5cvY5Q_88wJrPyt';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let username = '';
let userId = '';
let userChannel = 'general'; // Default channel
let isTyping = false;
let typingTimeout = null;
let onlineUsers = {};
let recentChatUsers = {};
const seenMessagesMarked = new Set();
let currentMessages = {};
let isAdmin = false;

// URL of your push server (Render, Heroku, etc.).
// Replace with your deployed push-server URL, e.g. 'https://my-push-server.example.com'
const PUSH_SERVER_URL = window.PUSH_SERVER_URL || 'https://REPLACE_WITH_PUSH_SERVER_URL';
let replyToMessage = null;
let messageListener = null;
let isSending = false;
let lastDateSeparator = '';
let messagesDiv = null;
let recentChatsList = null;
let chatDiv = null;

// Voice recording variables
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let isRecording = false;
let audioContext = null;
let analyser = null;
let dataArray = null;

// Image editor variables
let isDrawing = false;
let isEraserActive = false;
let currentBrushColor = '#4dff00';
let currentBrushSize = 5;
let currentEditingImage = null;
let currentEditingImageFormat = 'png';
let editHistory = [];
let cropMode = false;
let cropStart = null;
let cropRect = null;

// Video editor variables
let currentEditingVideo = null;
let videoDuration = 0;

// Search variables
let searchResults = [];
let currentSearchIndex = -1;

// Emoji / sticker / GIF picker state
let emojiMode = 'Emoji';
let activeEmojiGroup = 'Smileys & Emotion';
let emojiData = [];
let emojiSearchTimeout = null;
let giphyCurrentQuery = '';
let giphyOffset = 0;
let giphyIsLoading = false;

// Video edit state
let selectedVideoFile = null;
let currentEditingVideoUrl = null;
let currentEditingMessageKey = null;
let ffmpegInstance = null;
let ffmpegLoading = false;

// Link preview variables
let linkPreviewData = null;
let linkPreviewTimer = null;

// Image editor brush functions (HTML5 Canvas)
function activateBrushTool() {
  isEraserActive = false;
  
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  
  if (ctx) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = currentBrushColor;
    ctx.lineWidth = currentBrushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  
  const brushBtn = document.getElementById('brushTool');
  const textBtn = document.getElementById('textTool');
  const eraserBtn = document.getElementById('eraserTool');
  const textControls = document.getElementById('textControls');
  if (brushBtn) brushBtn.classList.add('active');
  if (textBtn) textBtn.classList.remove('active');
  if (eraserBtn) eraserBtn.classList.remove('active');
  if (textControls) textControls.style.display = 'none';
}

function activateTextTool() {
  isEraserActive = false;
  
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  
  if (ctx) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = currentBrushSize;
    ctx.strokeStyle = currentBrushColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  
  const brushBtn = document.getElementById('brushTool');
  const textBtn = document.getElementById('textTool');
  const eraserBtn = document.getElementById('eraserTool');
  const textControls = document.getElementById('textControls');
  if (brushBtn) brushBtn.classList.remove('active');
  if (textBtn) textBtn.classList.add('active');
  if (eraserBtn) eraserBtn.classList.remove('active');
  if (textControls) textControls.style.display = 'flex';
}

function activateEraserTool() {
  isEraserActive = true;
  
  const canvas = document.getElementById('drawingCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = currentBrushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  
  const brushBtn = document.getElementById('brushTool');
  const textBtn = document.getElementById('textTool');
  const eraserBtn = document.getElementById('eraserTool');
  const textControls = document.getElementById('textControls');
  if (brushBtn) brushBtn.classList.remove('active');
  if (textBtn) textBtn.classList.remove('active');
  if (eraserBtn) eraserBtn.classList.add('active');
  if (textControls) textControls.style.display = 'none';
}

function updateBrush() {
  currentBrushSize = parseInt(document.getElementById('brushSize')?.value || 5, 10);
  currentBrushColor = document.getElementById('brushColor')?.value || '#ff0000';
  
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  
  if (ctx) {
    ctx.lineWidth = currentBrushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isEraserActive) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentBrushColor;
    }
  }
}

async function saveOneSignalPlayerId(playerId) {
  if (!playerId) return;
  if (!username) {
    // If user not identified yet, store locally and attempt to send later
    localStorage.setItem('onesignal_player_id_pending', playerId);
    return;
  }
  try {
    await fetch(`${PUSH_SERVER_URL}/save-onesignal-id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username: username, playerId })
    });
  } catch (err) {
    console.error('Failed to save OneSignal player id:', err);
  }
}

function getOneSignalBasePath() {
  const path = window.location.pathname;
  const directory = path.substring(0, path.lastIndexOf('/') + 1);
  return `${window.location.origin}${directory}`;
}

function getOneSignalWorkerPath() {
  return `${getOneSignalBasePath()}OneSignalSDKWorker.js`;
}

function getOneSignalUpdaterPath() {
  return `${getOneSignalBasePath()}OneSignalSDKUpdaterWorker.js`;
}

async function initOneSignalSdk() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  if (window.__oneSignalInitPromise) return window.__oneSignalInitPromise;

  async function urlExists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
      return r && r.ok;
    } catch (e) {
      return false;
    }
  }

  window.__oneSignalInitPromise = new Promise((resolve, reject) => {
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        if (window.__oneSignalInitialized) {
          return resolve(OneSignal);
        }

        // Determine service worker paths — try page directory first, fall back to site root
        let workerPath = getOneSignalWorkerPath();
        let updaterPath = getOneSignalUpdaterPath();
        if (!(await urlExists(workerPath))) {
          const rootWorker = `${window.location.origin}/OneSignalSDKWorker.js`;
          if (await urlExists(rootWorker)) workerPath = rootWorker;
        }
        if (!(await urlExists(updaterPath))) {
          const rootUpdater = `${window.location.origin}/OneSignalSDKUpdaterWorker.js`;
          if (await urlExists(rootUpdater)) updaterPath = rootUpdater;
        }

        console.log('OneSignal: using serviceWorkerPath=', workerPath, 'updaterPath=', updaterPath);
        await OneSignal.init({
          appId: '453e37ab-e655-4aee-a716-1234072cf2a8',
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerPath: workerPath,
          serviceWorkerUpdaterPath: updaterPath
        });

        window.__oneSignalInitialized = true;
        resolve(OneSignal);
      } catch (err) {
        if (err && err.message && err.message.includes('SDK already initialized')) {
          window.__oneSignalInitialized = true;
          return resolve(OneSignal);
        }
        reject(err);
      }
    });
  });

  return window.__oneSignalInitPromise;
}

async function setupOneSignal() {
  try {
    const OneSignal = await initOneSignalSdk();

    if (OneSignal && typeof OneSignal.on === 'function') {
      OneSignal.on('subscriptionChange', async function(isSubscribed) {
        console.log('OneSignal subscriptionChange', isSubscribed);
        if (isSubscribed) {
          try {
            if (typeof OneSignal.getUserId === 'function') {
              const playerId = await OneSignal.getUserId();
              if (playerId) saveOneSignalPlayerId(playerId);
            }
          } catch (err) {
            console.error('OneSignal getUserId failed:', err);
          }
        }
      });
    } else {
      console.warn('OneSignal SDK initialized but expected event methods are missing');
    }

    const enabled = (OneSignal && typeof OneSignal.isPushNotificationsEnabled === 'function') ? await OneSignal.isPushNotificationsEnabled() : false;
    console.log('OneSignal enabled?', enabled);
    if (enabled) {
      if (typeof OneSignal.getUserId === 'function') {
        const playerId = await OneSignal.getUserId();
        if (playerId) saveOneSignalPlayerId(playerId);
      }
    }

    return OneSignal;
  } catch (e) {
    console.warn('OneSignal init error', e);
    throw e;
  }
}

async function subscribeOneSignal() {
  try {
    const OneSignal = await setupOneSignal();
    const enabled = await OneSignal.isPushNotificationsEnabled();
    if (!enabled) {
      if (Notification.permission === 'denied') {
        showNotification('Notifications are blocked in your browser settings.', true);
        return;
      }
      try {
        await OneSignal.showNativePrompt();
      } catch (err) {
        console.warn('OneSignal showNativePrompt failed', err);
      }
      await OneSignal.setSubscription(true);
    }
    const playerId = await OneSignal.getUserId();
    if (playerId) saveOneSignalPlayerId(playerId);
  } catch (err) {
    console.error('subscribeOneSignal failed', err);
  }
}

async function unsubscribeOneSignal() {
  try {
    const OneSignal = await initOneSignalSdk();
    if (typeof OneSignal.setSubscription === 'function') {
      await OneSignal.setSubscription(false);
    }
  } catch (err) {
    console.warn('unsubscribeOneSignal failed', err);
  }
}

// Settings variables
let notificationsEnabled = false;
let betterUiEnabled = false;
let secretNotificationSent = false;
let userProfileImage = null;
let chatBackground = 'default';
let notificationPermission = false;

// Navigation history variables
let navigationHistory = []; // Track navigation history [{ type: 'login' | 'admin' | 'channel', channel?: string }]
let previousPage = 'login'; // Default to login as the previous page

// ========== CROSS-DEVICE SETTINGS SYNCHRONIZATION ==========
// Save user settings to Firebase for cross-device sync
async function saveSettingsToFirebase() {
  if (!username) return;
  
  try {
    const settingsRef = db.ref(`users/${username}/settings`);
    const settings = {
      profileImage: userProfileImage || '',
      chatBackground: chatBackground,
      chatBackgroundCustom: localStorage.getItem('chat_background_custom') || '',
      notificationsEnabled: notificationsEnabled,
      betterUiEnabled: betterUiEnabled,
      theme: localStorage.getItem('theme') || 'dark',
      lastUpdated: firebase.database.ServerValue.TIMESTAMP
    };
    
    await settingsRef.set(settings);
  } catch (error) {
    console.error('Error saving settings to Firebase:', error);
  }
}

// Load user settings from Firebase
async function loadSettingsFromFirebase() {
  if (!username) return false;
  
  try {
    const settingsRef = db.ref(`users/${username}/settings`);
    const snapshot = await settingsRef.once('value');
    const settings = snapshot.val();
    
    if (settings) {
      // Load profile image
      if (settings.profileImage) {
        userProfileImage = settings.profileImage;
        localStorage.setItem(`profile_image_${username}`, settings.profileImage);
        const userAvatar = document.getElementById('userAvatar');
        if (userAvatar) {
          userAvatar.style.backgroundImage = `url(${settings.profileImage})`;
          userAvatar.style.backgroundSize = 'cover';
          userAvatar.style.backgroundPosition = 'center';
          userAvatar.textContent = '';
        }
      }
      
      // Load chat background
      if (settings.chatBackground) {
        chatBackground = settings.chatBackground;
        localStorage.setItem('chat_background', settings.chatBackground);
        
        if (settings.chatBackground === 'custom' && settings.chatBackgroundCustom) {
          localStorage.setItem('chat_background_custom', settings.chatBackgroundCustom);
          applyCustomBackground(settings.chatBackgroundCustom);
        } else {
          applyChatBackground(settings.chatBackground);
        }
      }
      
      // Load notifications setting
      if (settings.hasOwnProperty('notificationsEnabled')) {
        notificationsEnabled = settings.notificationsEnabled;
        localStorage.setItem('notifications_enabled', notificationsEnabled.toString());
        const menuNotificationToggle = document.getElementById('menuNotificationToggle');
        const notificationToggle = document.getElementById('notificationToggle');
        if (menuNotificationToggle) {
          menuNotificationToggle.checked = notificationsEnabled;
        }
        if (notificationToggle) {
          notificationToggle.checked = notificationsEnabled;
        }
        if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
          requestNotificationPermissionIfNeeded();
        } else if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
          await subscribeOneSignal();
        }
      }

      // Load Better UI setting
      if (settings.hasOwnProperty('betterUiEnabled')) {
        betterUiEnabled = settings.betterUiEnabled;
        localStorage.setItem('better_ui_enabled', betterUiEnabled.toString());
        const menuBetterUiToggle = document.getElementById('menuBetterUiToggle');
        if (menuBetterUiToggle) {
          menuBetterUiToggle.checked = betterUiEnabled;
        }
        applyBetterUi(betterUiEnabled);
      } else {
        const storedBetterUi = localStorage.getItem('better_ui_enabled');
        if (storedBetterUi !== null) {
          betterUiEnabled = storedBetterUi === 'true';
          applyBetterUi(betterUiEnabled);
        }
      }
      
      // Load theme
      if (settings.theme) {
        localStorage.setItem('theme', settings.theme);
        document.documentElement.classList.remove('--dark-theme', '--light-theme');
        document.documentElement.classList.add(`--${settings.theme}-theme`);
        if (betterUiEnabled) {
          document.documentElement.classList.add('better-ui');
        }
        const themeSwitch = document.getElementById('themeSwitch');
        if (themeSwitch) {
          themeSwitch.checked = settings.theme === 'dark';
        }
      }
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error loading settings from Firebase:', error);
    return false;
  }
}

// Listen for real-time settings changes from other devices
function setupSettingsSyncListener() {
  if (!username) return;
  
  try {
    const settingsRef = db.ref(`users/${username}/settings`);
    settingsRef.on('value', (snapshot) => {
      const settings = snapshot.val();
      if (settings && settings.lastUpdated) {
        // Only apply if settings are from a different source (not just saved locally)
        const timeSinceUpdate = Date.now() - settings.lastUpdated;
        if (timeSinceUpdate > 2000) { // Give 2 second window for local save
          // Profile Image
          if (settings.profileImage && settings.profileImage !== userProfileImage) {
            userProfileImage = settings.profileImage;
            localStorage.setItem(`profile_image_${username}`, settings.profileImage);
            const userAvatar = document.getElementById('userAvatar');
            if (userAvatar) {
              userAvatar.style.backgroundImage = `url(${settings.profileImage})`;
              userAvatar.style.backgroundSize = 'cover';
              userAvatar.style.backgroundPosition = 'center';
              userAvatar.textContent = '';
            }
          }
          
          // Chat Background
          if (settings.chatBackground && settings.chatBackground !== chatBackground) {
            chatBackground = settings.chatBackground;
            localStorage.setItem('chat_background', settings.chatBackground);
            if (settings.chatBackground === 'custom' && settings.chatBackgroundCustom) {
              localStorage.setItem('chat_background_custom', settings.chatBackgroundCustom);
              applyCustomBackground(settings.chatBackgroundCustom);
            } else {
              applyChatBackground(settings.chatBackground);
            }
          }
          
          // Notifications
          if (settings.hasOwnProperty('notificationsEnabled') && settings.notificationsEnabled !== notificationsEnabled) {
            notificationsEnabled = settings.notificationsEnabled;
            localStorage.setItem('notifications_enabled', notificationsEnabled.toString());
            const menuNotificationToggle = document.getElementById('menuNotificationToggle');
            if (menuNotificationToggle) {
              menuNotificationToggle.checked = notificationsEnabled;
            }
          }
          
          // Theme
          if (settings.theme && settings.theme !== localStorage.getItem('theme')) {
            localStorage.setItem('theme', settings.theme);
            document.documentElement.classList.remove('--dark-theme', '--light-theme');
            document.documentElement.classList.add(`--${settings.theme}-theme`);
            if (betterUiEnabled) {
              document.documentElement.classList.add('better-ui');
            }
            const themeSwitch = document.getElementById('themeSwitch');
            if (themeSwitch) {
              themeSwitch.checked = settings.theme === 'dark';
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error setting up settings sync listener:', error);
  }
}

// Apply chat background styling
function applyChatBackground(bgType) {
  const messagesDiv = document.getElementById('messages');
  const chatDiv = document.getElementById('chat');
  
  if (!messagesDiv || !chatDiv) return;
  
  messagesDiv.className = 'chat__messages';
  chatDiv.className = '';
  
  if (bgType !== 'default') {
    messagesDiv.classList.add(`bg-${bgType}`);
    chatDiv.classList.add(`bg-${bgType}`);
  } else {
    chatDiv.classList.add('bg-default');
  }
}

// Apply custom background image
function applyCustomBackground(imageUrl) {
  const messagesDiv = document.getElementById('messages');
  const chatDiv = document.getElementById('chat');
  
  if (!messagesDiv || !chatDiv) return;
  
  messagesDiv.className = 'chat__messages bg-custom';
  messagesDiv.style.backgroundImage = `url('${imageUrl}')`;
  chatDiv.className = 'bg-custom';
  chatDiv.style.backgroundImage = `url('${imageUrl}')`;
}

// Get user profile image from Firebase settings
async function getUserProfileImage(userName) {
  try {
    const settingsRef = db.ref(`users/${userName}/settings`);
    const snapshot = await settingsRef.once('value');
    const settings = snapshot.val();
    return settings && settings.profileImage ? settings.profileImage : null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

// Create user avatar element with profile image or initial
function createUserAvatarElement(userName, profileImage = null) {
  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'user-avatar';
  
  if (profileImage) {
    avatarDiv.style.backgroundImage = `url(${profileImage})`;
    avatarDiv.style.backgroundSize = 'cover';
    avatarDiv.style.backgroundPosition = 'center';
  } else {
    avatarDiv.textContent = userName.charAt(0).toUpperCase();
  }
  
  return avatarDiv;
}

// Function to safely escape HTML special characters
function escapeHTML(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>\"']/g, function(char) {
    return map[char] || char;
  });
}

// Normalize a user/display name for comparison (remove control/chars, collapse spaces)
function normalizeName(name) {
  if (typeof name !== 'string') return '';
  try {
    return name
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\s\-_.@]/gu, ' ')
      .replace(/[\p{C}\p{Z}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  } catch (e) {
    return String(name).replace(/\s+/g, ' ').trim().toLowerCase();
  }
}

// Extract channel from Robo ID
function extractChannel(roboId) {
  if (!roboId) return 'general';
  
  // Check for ch-admin (admin access)
  if (roboId.toLowerCase() === 'ch-admin') {
    return 'admin'; // Special channel for admin
  }
  
  // Check for ch-XXX format where XXX is 3 digits
  const channelMatch = roboId.match(/^ch-(\d{3})$/i);
  if (channelMatch && channelMatch[1]) {
    return channelMatch[1]; // Returns the 3-digit number
  }
  
  return 'general'; // Default to general chat
}

// Date formatting function (like WhatsApp)
function formatDateSeparator(timestamp) {
  const messageDate = new Date(Number(timestamp) || Date.now());
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Reset hours for accurate comparison
  const msgDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  
  if (msgDateOnly.getTime() === todayOnly.getTime()) {
    return "Today";
  } else if (msgDateOnly.getTime() === yesterdayOnly.getTime()) {
    return "Yesterday";
  } else {
    // Check if within the last 6 days (to show day name)
    const diffDays = Math.floor((todayOnly - msgDateOnly) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return messageDate.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      // Check if same year
      if (messageDate.getFullYear() === today.getFullYear()) {
        return messageDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      } else {
        return messageDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    }
  }
}

function formatMessageTime(timestamp) {
  const messageTime = new Date(Number(timestamp) || Date.now());
  return messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function refreshDateSeparators() {
  if (!messagesDiv) return;
  const existingSeparators = Array.from(messagesDiv.querySelectorAll('.date-separator'));
  existingSeparators.forEach(separator => separator.remove());

  const messages = Array.from(messagesDiv.querySelectorAll('.message'))
    .filter((el) => !el.classList.contains('welcome'));

  let lastDate = '';
  messages.forEach((msgEl) => {
    const timestamp = Number(msgEl.dataset.timestamp || 0);
    const messageDate = msgEl.dataset.date || formatDateSeparator(timestamp);

    if (messageDate !== lastDate) {
      const separator = document.createElement('div');
      separator.className = 'date-separator';
      separator.innerHTML = `<span>${messageDate}</span>`;
      messagesDiv.insertBefore(separator, msgEl);
      lastDate = messageDate;
    }
  });
}

function refreshMessageGroups() {
  if (!messagesDiv) return;
  const children = Array.from(messagesDiv.children)
    .filter(el => el.classList.contains('message') || el.classList.contains('date-separator'));

  let prevSender = null;
  let prevType = null;
  let prevWasMessage = false;

  children.forEach((child) => {
    if (child.classList.contains('date-separator')) {
      prevSender = null;
      prevType = null;
      prevWasMessage = false;
      return;
    }

    const msgEl = child;
    const sender = msgEl.dataset.sender || '';
    const type = msgEl.dataset.type || '';
    const sameSenderAsPrev = prevWasMessage && prevSender && normalizeName(prevSender) === normalizeName(sender) && prevType === type;
    const avatarWrapper = msgEl.querySelector('.message__avatar-wrapper');
    const senderEl = msgEl.querySelector('.message__sender');

    if (sameSenderAsPrev) {
      msgEl.classList.remove('message--first-in-group');
      msgEl.classList.add('message--continued');
      if (avatarWrapper) {
        avatarWrapper.style.display = 'none';
      }
      if (senderEl) senderEl.style.display = 'none';
    } else {
      msgEl.classList.remove('message--continued');
      msgEl.classList.add('message--first-in-group');
      if (avatarWrapper) {
        avatarWrapper.style.display = type === 'sent' ? 'none' : 'flex';
      }
      if (senderEl) senderEl.style.display = 'inline';
    }

    prevSender = sender;
    prevType = type;
    prevWasMessage = true;
  });
}

function getNodeDateLabel(node) {
  if (!node) return null;
  if (node.classList.contains('date-separator')) {
    return node.textContent.trim();
  }
  return node.dataset?.date || null;
}

function insertMessageByFirebaseOrder(messageDiv, msg, prevChildKey) {
  const timestamp = Number(msg.timestamp || Date.now());
  const messageDate = formatDateSeparator(timestamp);

  messageDiv.dataset.timestamp = timestamp;
  messageDiv.dataset.date = messageDate;

  const existingMessages = Array.from(messagesDiv.querySelectorAll('.message'))
    .filter(el => !el.classList.contains('welcome'));

  if (prevChildKey == null) {
    // If this is the very first message in order, insert before the first message
    const firstMessage = existingMessages[0];
    if (firstMessage) {
      messagesDiv.insertBefore(messageDiv, firstMessage);
    } else {
      messagesDiv.appendChild(messageDiv);
    }
  } else {
    const previousNode = document.querySelector(`[data-key="${prevChildKey}"]`);
    if (previousNode && previousNode.parentNode === messagesDiv) {
      if (previousNode.nextSibling) {
        messagesDiv.insertBefore(messageDiv, previousNode.nextSibling);
      } else {
        messagesDiv.appendChild(messageDiv);
      }
    } else {
      // If previous node is not found, fall back to inserting by timestamp ordering
      let insertBefore = null;
      for (const existing of existingMessages) {
        const existingTimestamp = Number(existing.dataset.timestamp || 0);
        if (existingTimestamp > timestamp) {
          insertBefore = existing;
          break;
        }
      }
      if (insertBefore) {
        messagesDiv.insertBefore(messageDiv, insertBefore);
      } else {
        messagesDiv.appendChild(messageDiv);
      }
    }
  }

  refreshDateSeparators();
  refreshMessageGroups();
  
  // Setup reactions for this message
  setupReactionOnMessage(messageDiv);
  loadMessageReactions(messageDiv.dataset.key);
}

// Format time in MM:SS format
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Show copy notification
function showCopyNotification() {
  const copyNotification = document.getElementById('copyNotification');
  copyNotification.style.display = 'flex';
  setTimeout(() => {
    copyNotification.style.display = 'none';
  }, 2000);
}

// Copy text to clipboard
function copyToClipboard(text) {
  // Ensure text is a string
  if (typeof text !== 'string') {
    text = String(text);
  }
  
  // Try modern clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showCopyNotification();
    }).catch(err => {
      console.error('Clipboard API failed: ', err);
      // Fallback for when clipboard API fails
      fallbackCopyToClipboard(text);
    });
  } else {
    // Fallback for older browsers or non-secure context
    fallbackCopyToClipboard(text);
  }
}

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      showCopyNotification();
    } else {
      console.error('execCommand copy failed');
      showNotification('Failed to copy message', true);
    }
  } catch (err) {
    console.error('Fallback copy failed: ', err);
    showNotification('Failed to copy message', true);
  }
}

// Show notification
function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.borderLeftColor = isError ? 'var(--danger-color)' : 'var(--accent-color)';
  notification.innerHTML = `
    <div class="notification-icon">
      <i class="fas fa-${isError ? 'exclamation-circle' : 'check-circle'}"></i>
    </div>
    <div class="notification-content">
      <p>${message}</p>
    </div>
  `;
  document.getElementById('chat-app').appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Show download link notification with copy button
function showDownloadLinkNotification(url, filename) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.borderLeftColor = 'var(--accent-color)';

  const safeText = filename ? `${filename} — ` : '';
  notification.innerHTML = `
    <div class="notification-icon"><i class="fas fa-download"></i></div>
    <div class="notification-content">
      <p>Download blocked by browser. <a class="download-link" href="${url}" target="_blank" rel="noopener">Open ${safeText}in new tab</a></p>
    </div>
    <div class="notification-actions">
      <button class="copy-link-btn">Copy link</button>
    </div>
  `;

  const container = document.getElementById('chat-app');
  container.appendChild(notification);

  const copyBtn = notification.querySelector('.copy-link-btn');
  const linkEl = notification.querySelector('.download-link');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(url).then(() => {
      showNotification('Download link copied to clipboard');
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showNotification('Download link copied to clipboard'); } catch (e) { showNotification('Copy failed', true); }
      document.body.removeChild(ta);
    });
  });

  setTimeout(() => notification.remove(), 12000);
}

// Show confirmation dialog (theme-matched)
function showConfirmation(title, message, onConfirm, onCancel) {
  const modal = document.getElementById('confirmationModal');
  const titleEl = document.getElementById('confirmationTitle');
  const messageEl = document.getElementById('confirmationMessage');
  const confirmBtn = document.getElementById('confirmationConfirmBtn');
  const cancelBtn = document.getElementById('confirmationCancelBtn');
  
  titleEl.textContent = title;
  messageEl.textContent = message;
  
  // Show modal
  modal.style.display = 'flex';
  
  // Handle confirm
  const handleConfirm = () => {
    modal.style.display = 'none';
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', handleCancel);
    if (onConfirm) onConfirm();
  };
  
  // Handle cancel
  const handleCancel = () => {
    modal.style.display = 'none';
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', handleCancel);
    if (onCancel) onCancel();
  };
  
  confirmBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', handleCancel);
  
  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      handleCancel();
    }
  });
}

// Check if file is an image
function isImageFile(filename) {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename);
}

// Check if file is a video
function isVideoFile(filename) {
  // Include mkv and other less-common extensions
  return /\.(mp4|webm|ogg|ogv|mov|avi|wmv|mkv|flv)$/i.test(filename);
}

// Check if file is audio
function isAudioFile(filename) {
  return /\.(mp3|wav|ogg|m4a|flac)$/i.test(filename);
}

// Get file icon based on type
function getFileIcon(filename) {
  if (isImageFile(filename)) return 'fas fa-image';
  if (isVideoFile(filename)) return 'fas fa-video';
  if (isAudioFile(filename)) return 'fas fa-music';
  if (/\.(pdf)$/i.test(filename)) return 'fas fa-file-pdf';
  if (/\.(doc|docx)$/i.test(filename)) return 'fas fa-file-word';
  if (/\.(xls|xlsx)$/i.test(filename)) return 'fas fa-file-excel';
  if (/\.(ppt|pptx)$/i.test(filename)) return 'fas fa-file-powerpoint';
  if (/\.(zip|rar|7z)$/i.test(filename)) return 'fas fa-file-archive';
  return 'fas fa-file';
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to force download
function forceDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank'; // Open in new tab for Cloudinary URLs
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function isCloudinaryUrl(url) {
  return typeof url === 'string' && /res\.cloudinary\.com/.test(url);
}

function getCloudinaryUploadUrl(url) {
  const match = String(url || '').match(/^(.+\/(?:image|video|raw)\/upload\/)(.+)$/);
  return match ? { base: match[1], remainder: match[2] } : null;
}

function getCloudinaryTransformedUrl(url, transformation) {
  const parts = getCloudinaryUploadUrl(url);
  if (!parts) return url;
  return `${parts.base}${transformation}/${parts.remainder}`;
}

function getCloudinaryDownloadUrl(url, filename) {
  if (!isCloudinaryUrl(url)) return url;
  const parts = getCloudinaryUploadUrl(url);
  if (!parts) return url;

  const ext = (filename || '').split('.').pop().toLowerCase();
  const docExts = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip','rar','7z'];

  // For common document types, prefer the image/video upload path with
  // `fl_attachment` but without embedding a filename — this avoids 400
  // errors caused by special characters in the filename. The code will
  // still try raw and filename variants as fallbacks.
  if (docExts.includes(ext)) {
    return getCloudinaryTransformedUrl(url, 'fl_attachment');
  }

  // For images/videos, include the desired filename in the attachment transform.
  const safeName = encodeURIComponent(String(filename || '').replace(/\s+/g, '_'));
  const transform = `fl_attachment:${safeName}`;
  return getCloudinaryTransformedUrl(url, transform);
}

// Generate alternative Cloudinary URL variants to work around 400/DNS issues
function getCloudinaryVariants(url, filename) {
  const variants = [];
  if (!isCloudinaryUrl(url)) return [url];

  try {
    // 1) Prefer the simple transform without a filename (avoid 400s)
    variants.push(getCloudinaryTransformedUrl(url, 'fl_attachment'));

    // 2) Filename embedded (encoded) variant
    variants.push(getCloudinaryDownloadUrl(url, filename));

    // 3) Underscored filename (unencoded)
    const underscored = (filename || '').replace(/\s+/g, '_');
    if (underscored) variants.push(getCloudinaryTransformedUrl(url, `fl_attachment:${underscored}`));

    // 4) If resource path is under image/video, try raw resource path variants
    const parts = getCloudinaryUploadUrl(url);
    if (parts) {
      const base = parts.base;
      const remainder = parts.remainder;
      const rawBase = base.replace(/\/(image|video)\/upload\/$/, '/raw/upload/');
      if (rawBase !== base) {
        variants.push(`${rawBase}fl_attachment/${remainder}`);
        variants.push(`${rawBase}fl_attachment:${encodeURIComponent((filename||'').replace(/\s+/g,'_'))}/${remainder}`);
      }
    }
  } catch (e) {
    console.warn('Error building Cloudinary variants', e);
  }

  // Ensure uniqueness and filter falsy
  return Array.from(new Set(variants.filter(Boolean)));
}

function getCloudinaryPlayableUrl(url) {
  if (!isCloudinaryUrl(url)) return url;
  if (/\.mkv(?:\?|$)/i.test(url)) {
    return getCloudinaryTransformedUrl(url, 'f_mp4');
  }
  if (/\.mov(?:\?|$)/i.test(url)) {
    return getCloudinaryTransformedUrl(url, 'f_mp4');
  }
  return url;
}

// Dedicated PDF download flow: tries proxy, then synchronous open, then fetch->blob,
// and falls back to the general downloadFile() logic.
function downloadPdf(url, filename) {
  const originalUrl = url;
  let downloadUrl = url;

  try {
    if (isCloudinaryUrl(url)) {
      downloadUrl = getCloudinaryDownloadUrl(url, filename);
    }
  } catch (error) {
    console.error('Failed to build Cloudinary PDF download URL:', error);
    downloadUrl = originalUrl;
  }

  // If a proxy is configured, use it to avoid CORS and authenticated delivery issues.
  if (typeof window !== 'undefined' && window.CLOUDINARY_DOWNLOAD_PROXY) {
    try {
      const proxyUrl = `${window.CLOUDINARY_DOWNLOAD_PROXY}?url=${encodeURIComponent(downloadUrl)}&name=${encodeURIComponent(filename || '')}`;
      window.open(proxyUrl, '_blank');
      return;
    } catch (e) {
      console.warn('Proxy open failed, falling back:', e);
    }
  }

  // Force an immediate download by clicking a hidden anchor.
  try {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || 'download.pdf';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  } catch (err) {
    console.warn('Immediate PDF download failed, showing direct link notification:', err);
    try { showDownloadLinkNotification(downloadUrl, filename); } catch (e) { console.error(e); }
  }
}

// Dedicated image download function - optimized for speed
function downloadImage(url, filename) {
  const originalUrl = url;
  let downloadUrl = url;

  try {
    if (isCloudinaryUrl(url)) {
      downloadUrl = getCloudinaryDownloadUrl(url, filename);
    }
  } catch (error) {
    console.error('Failed to build Cloudinary image download URL:', error);
    downloadUrl = originalUrl;
  }

  // Try 1: Direct anchor download (fastest, works for same-origin or CORS-enabled)
  // Build try list early so we can prefer safe Cloudinary variants for anchor
  const tried = new Set();
  let tryUrls = [downloadUrl].concat(getCloudinaryVariants(url, filename), [originalUrl]);
  if (typeof window !== 'undefined' && window.CLOUDINARY_DOWNLOAD_PROXY) {
    tryUrls = tryUrls.map(u => {
      if (!u) return u;
      return `${window.CLOUDINARY_DOWNLOAD_PROXY}?url=${encodeURIComponent(u)}&name=${encodeURIComponent(filename || '')}`;
    });
  }

  // Try 1: Direct anchor download on the preferred variant (fastest).
  try {
    const preferred = tryUrls.find(u => u && !( /res\.cloudinary\.com/.test(u) && /fl_attachment:[^/]+/.test(u) ));
    // preferred will skip Cloudinary variants that embed a filename (these can cause 400s)
    if (preferred) {
      const a = document.createElement('a');
      a.href = preferred;
      a.download = filename || 'download.jpg';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  } catch (err) {
    console.debug('Anchor download failed (preferred), trying fetch...');
  }

  // Try 2: Fetch + blob (slower but more reliable)
  const fetchAndDownload = (fetchUrl) => {
    return fetch(fetchUrl, { mode: 'cors' })
      .then(response => {
        if (!response.ok) throw new Error('Download failed: ' + response.status);
        return response.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        forceDownload(blobUrl, filename);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      });
  };

  let sequence = Promise.reject();
  tryUrls.forEach(u => {
    if (!u || tried.has(u)) return;
    tried.add(u);
    sequence = sequence.catch(() => {
      console.debug('Attempting image download URL:', u);
      return fetchAndDownload(u);
    });
  });

  sequence.catch(error => {
    console.error('All image download attempts failed:', error);
    try { showDownloadLinkNotification(originalUrl, filename); } catch (e) {}
  });
}

// Dedicated video download function - optimized for speed
function downloadVideo(url, filename) {
  const originalUrl = url;
  let downloadUrl = url;

  try {
    if (isCloudinaryUrl(url)) {
      downloadUrl = getCloudinaryDownloadUrl(url, filename);
    }
  } catch (error) {
    console.error('Failed to build Cloudinary video download URL:', error);
    downloadUrl = originalUrl;
  }

  // Try 1: Direct anchor download (fastest)
  // Build try list early so we can prefer safe Cloudinary variants for anchor
  const tried = new Set();
  let tryUrls = [downloadUrl].concat(getCloudinaryVariants(url, filename), [originalUrl]);
  if (typeof window !== 'undefined' && window.CLOUDINARY_DOWNLOAD_PROXY) {
    tryUrls = tryUrls.map(u => {
      if (!u) return u;
      return `${window.CLOUDINARY_DOWNLOAD_PROXY}?url=${encodeURIComponent(u)}&name=${encodeURIComponent(filename || '')}`;
    });
  }

  // Try 1: Direct anchor download on the preferred variant (fastest).
  try {
    const preferred = tryUrls.find(u => u && !( /res\.cloudinary\.com/.test(u) && /fl_attachment:[^/]+/.test(u) ));
    // preferred will skip Cloudinary variants that embed a filename (these can cause 400s)
    if (preferred) {
      const a = document.createElement('a');
      a.href = preferred;
      a.download = filename || 'download.mp4';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  } catch (err) {
    console.debug('Anchor download failed (preferred), trying fetch...');
  }

  // Try 2: Fetch + blob (slower but more reliable)
  const fetchAndDownload = (fetchUrl) => {
    return fetch(fetchUrl, { mode: 'cors' })
      .then(response => {
        if (!response.ok) throw new Error('Download failed: ' + response.status);
        return response.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        forceDownload(blobUrl, filename);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      });
  };

  let sequence = Promise.reject();
  tryUrls.forEach(u => {
    if (!u || tried.has(u)) return;
    tried.add(u);
    sequence = sequence.catch(() => {
      console.debug('Attempting video download URL:', u);
      return fetchAndDownload(u);
    });
  });

  sequence.catch(error => {
    console.error('All video download attempts failed:', error);
    try { showDownloadLinkNotification(originalUrl, filename); } catch (e) {}
  });
}

// Dedicated audio download function - optimized for speed
function downloadAudio(url, filename) {
  const originalUrl = url;
  let downloadUrl = url;

  try {
    if (isCloudinaryUrl(url)) {
      downloadUrl = getCloudinaryDownloadUrl(url, filename);
    }
  } catch (error) {
    console.error('Failed to build Cloudinary audio download URL:', error);
    downloadUrl = originalUrl;
  }

  // Try 1: Direct anchor download (fastest)
  // Build try list early so we can prefer safe Cloudinary variants for anchor
  const tried = new Set();
  let tryUrls = [downloadUrl].concat(getCloudinaryVariants(url, filename), [originalUrl]);
  if (typeof window !== 'undefined' && window.CLOUDINARY_DOWNLOAD_PROXY) {
    tryUrls = tryUrls.map(u => {
      if (!u) return u;
      return `${window.CLOUDINARY_DOWNLOAD_PROXY}?url=${encodeURIComponent(u)}&name=${encodeURIComponent(filename || '')}`;
    });
  }

  // Try 1: Direct anchor download on the preferred variant (fastest).
  try {
    const preferred = tryUrls.find(u => u && !( /res\.cloudinary\.com/.test(u) && /fl_attachment:[^/]+/.test(u) ));
    // preferred will skip Cloudinary variants that embed a filename (these can cause 400s)
    if (preferred) {
      const a = document.createElement('a');
      a.href = preferred;
      a.download = filename || 'download.mp3';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  } catch (err) {
    console.debug('Anchor download failed (preferred), trying fetch...');
  }

  // Try 2: Fetch + blob (slower but more reliable)
  const fetchAndDownload = (fetchUrl) => {
    return fetch(fetchUrl, { mode: 'cors' })
      .then(response => {
        if (!response.ok) throw new Error('Download failed: ' + response.status);
        return response.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        forceDownload(blobUrl, filename);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      });
  };

  let sequence = Promise.reject();
  tryUrls.forEach(u => {
    if (!u || tried.has(u)) return;
    tried.add(u);
    sequence = sequence.catch(() => {
      console.debug('Attempting audio download URL:', u);
      return fetchAndDownload(u);
    });
  });

  sequence.catch(error => {
    console.error('All audio download attempts failed:', error);
    try { showDownloadLinkNotification(originalUrl, filename); } catch (e) {}
  });
}

// Download profile function - downloads profile picture or profile info
function downloadProfile(userName, profileImage) {
  if (profileImage) {
    // Download profile picture
    const ext = profileImage.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] || 'jpg';
    downloadImage(profileImage, `profile_${userName}.${ext}`);
    showNotification(`Downloading profile picture for ${userName}...`);
  } else {
    // Download profile info as JSON if no image
    const profileData = {
      username: userName,
      downloadedAt: new Date().toISOString(),
      source: 'Chat Application'
    };
    const dataStr = JSON.stringify(profileData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const blobUrl = window.URL.createObjectURL(blob);
    forceDownload(blobUrl, `profile_${userName}.json`);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
    showNotification(`Downloaded profile info for ${userName}`);
  }
}

async function requestNotificationPermissionIfNeeded() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showNotification('Notifications enabled for general chat!');
      await subscribeOneSignal();
    } else if (permission === 'denied') {
      showNotification('Notifications blocked. You can change this in browser settings.', true);
    }
  } catch (error) {
    console.error('Notification permission request failed:', error);
  }
}

async function saveFcmTokenToFirebase(token) {
  if (!username || !token) return;
  try {
    await db.ref(`users/${username}/fcmToken`).set(token);
    localStorage.setItem('fcm_token', token);
  } catch (error) {
    console.error('Error saving FCM token to Firebase:', error);
  }
}

async function setupFirebaseMessaging() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (typeof firebase.messaging !== 'function') return;

  try {
    // Register service worker from site root to ensure scope is correct
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('Service worker registered:', registration.scope);
    messaging = firebase.messaging();
    if (typeof messaging.useServiceWorker === 'function') {
      messaging.useServiceWorker(registration);
    }

    messaging.onMessage((payload) => {
      if (payload?.notification) {
        new Notification(payload.notification.title || 'Secret Messenger', {
          body: payload.notification.body || 'Experience a smoother app performance with our latest update. Get it now! 🚀',
          icon: payload.notification.icon || 'bhavishya.jpg',
          tag: payload.notification.tag || 'secret-messenger-update'
        });
      }
    });

    // Request an FCM token. Pass the service worker registration explicitly
    // to avoid scope/auth issues in some environments.
    let currentToken;
    try {
      currentToken = await messaging.getToken({ vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: registration });
    } catch (err) {
      console.error('messaging.getToken failed:', err.code || err.name, err.message || err);
      throw err;
    }
    if (currentToken) {
      await saveFcmTokenToFirebase(currentToken);
    }
  } catch (error) {
    console.error('Firebase messaging setup failed:', error);
    // Provide actionable guidance to the user when subscription fails
    const msg = error && error.message ? String(error.message) : 'Unknown error while subscribing to FCM.';
    if (msg.includes('Request is missing required authentication credential')) {
      showNotification('FCM subscription failed: enable Cloud Messaging API (Legacy) in Google Cloud Console or ensure your origin is https:// or http://localhost', true);
    } else {
      showNotification('Firebase messaging setup failed: ' + msg, true);
    }
  }
}

// Enhanced download function for Cloudinary URLs
function downloadFile(url, filename) {
  let downloadUrl = url;
  const originalUrl = url;
  try {
    if (isCloudinaryUrl(url)) {
      downloadUrl = getCloudinaryDownloadUrl(url, filename);
    }
  } catch (error) {
    console.error('Error constructing Cloudinary download URL:', error);
    downloadUrl = originalUrl;
  }

  // Try to open a popup synchronously so subsequent navigations are allowed
  // (browsers often block navigation triggered inside async promise chains).
  let popup = null;
  try {
    popup = window.open(downloadUrl, '_blank');
  } catch (e) {
    popup = null;
  }

  if (popup) {
    // If the popup opened, we're done — the browser will handle the download.
    return;
  }
  // Popup couldn't be opened (likely blocked). Show a notification with a direct link.
  try {
    showDownloadLinkNotification(downloadUrl, filename);
  } catch (e) {
    // ignore notification errors
  }

  const fetchAndDownload = (fetchUrl) => {
    return fetch(fetchUrl, { mode: 'cors' })
      .then(response => {
        if (!response.ok) throw new Error('Download failed: ' + response.status);
        return response.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        forceDownload(blobUrl, filename);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      });
  };

  // Try initial download, then iterate through Cloudinary variants, then original URL
  const tried = new Set();
  let tryUrls = [downloadUrl].concat(getCloudinaryVariants(url, filename), [originalUrl]);

  // If a local proxy is configured on the page, route all attempts through it.
  // Set it in the console before clicking, e.g.:
  // window.CLOUDINARY_DOWNLOAD_PROXY = 'http://localhost:3000/download'
  if (typeof window !== 'undefined' && window.CLOUDINARY_DOWNLOAD_PROXY) {
    tryUrls = tryUrls.map(u => {
      if (!u) return u;
      return `${window.CLOUDINARY_DOWNLOAD_PROXY}?url=${encodeURIComponent(u)}&name=${encodeURIComponent(filename || '')}`;
    });
  }

  // sequentially attempt each URL until one succeeds
  let sequence = Promise.reject();
  tryUrls.forEach(u => {
    if (!u || tried.has(u)) return;
    tried.add(u);
    sequence = sequence.catch(() => {
      console.debug('Attempting download URL:', u);
      return fetchAndDownload(u);
    });
  });

  sequence.catch(error => {
    console.error('All download attempts failed:', error);
    try { showDownloadLinkNotification(originalUrl, filename); } catch (e) {}
  });
}

function getPlayableVideoUrl(url) {
  const videoUrl = String(url || '');
  if (!isCloudinaryUrl(videoUrl)) return videoUrl;

  return getCloudinaryPlayableUrl(videoUrl);
}

function getVideoMimeType(url) {
  const videoUrl = String(url || '');
  if (/\.mp4(?:\?|$)/i.test(videoUrl)) return 'video/mp4';
  if (/\.webm(?:\?|$)/i.test(videoUrl)) return 'video/webm';
  if (/\.ogg(?:\?|$)/i.test(videoUrl) || /\.ogv(?:\?|$)/i.test(videoUrl)) return 'video/ogg';
  return 'video/mp4';
}

// Generate waveform for voice message
function generateWaveform(audioData, width, height) {
  const barCount = 40;
  const barWidth = 3;
  const barSpacing = 2;
  const waveform = [];
  
  // Simple waveform generation
  for (let i = 0; i < barCount; i++) {
    const value = Math.random() * 0.8 + 0.2; // Random height for demo
    const barHeight = value * height;
    waveform.push({
      x: i * (barWidth + barSpacing),
      height: barHeight
    });
  }
  
  return waveform;
}

// Create voice message HTML
function createVoiceMessage(audioUrl, duration) {
  const waveform = generateWaveform(null, 200, 36);
  const waveformHTML = waveform.map(bar => 
    `<div class="waveform-bar" style="left: ${bar.x}px; height: ${bar.height}px;"></div>`
  ).join('');
  
  return `
    <div class="voice-message" data-audio-url="${audioUrl}">
      <button class="voice-play-btn">
        <i class="fas fa-play"></i>
      </button>
      <div class="voice-waveform">
        ${waveformHTML}
      </div>
      <div class="voice-duration">${formatTime(duration)}</div>
    </div>
  `;
}

// Upload file to Cloudinary
function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    uploadProgress.style.display = 'flex';
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading file...';
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'chat_upload');
    formData.append('cloud_name', 'dbjmbf92h');
    const rawExtensions = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z)$/i;
    const uploadResourceType = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/') || file.type.startsWith('audio/')
        ? 'video'
        : rawExtensions.test(file.name)
          ? 'raw'
          : 'raw';
    formData.append('resource_type', uploadResourceType);
    
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = percentComplete + '%';
        progressText.textContent = `Uploading: ${percentComplete}%`;
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        progressFill.style.width = '100%';
        progressText.textContent = 'Upload complete!';
        
        setTimeout(() => {
          uploadProgress.style.display = 'none';
        }, 1000);
        
        resolve(response);
      } else {
        uploadProgress.style.display = 'none';
        reject(new Error('Upload failed'));
      }
    });
    
    xhr.addEventListener('error', () => {
      uploadProgress.style.display = 'none';
      reject(new Error('Upload failed'));
    });
    
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/dbjmbf92h/upload');
    xhr.send(formData);
  });
}

// Start voice recording
async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    // Setup audio visualization
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = async () => {
      // Just store the audio chunks, don't send automatically
      // User will click send button to send
    };
    
    mediaRecorder.start();
    isRecording = true;
    recordingStartTime = Date.now();
    
    // Update recording time
    updateRecordingTime();
    recordingTimer = setInterval(updateRecordingTime, 1000);
    
    // Show recording UI
    document.getElementById('voiceRecording').style.display = 'block';
    document.getElementById('voiceBtn').classList.add('recording');
    
  } catch (error) {
    showNotification('Microphone access denied or not available', true);
  }
}

// Update recording time display
function updateRecordingTime() {
  if (!recordingStartTime) return;
  
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  document.getElementById('recordingTime').textContent = formatTime(elapsed);
  
  // Update waveform visualization
  if (analyser && dataArray) {
    analyser.getByteFrequencyData(dataArray);
    // Update waveform bars here if needed
  }
}

// Stop voice recording (pause, don't send)
function stopVoiceRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingTimer);
    document.getElementById('voiceBtn').classList.remove('recording');
    
    // Show send button but keep recording UI visible
  }
}

// Send the recorded voice message
function sendVoiceRecording() {
  // If still recording, stop it first
  if (isRecording && mediaRecorder) {
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingTimer);
  }
  
  // Wait for chunks to be populated, then send
  const checkAndSend = async () => {
    let attempts = 0;
    const maxAttempts = 30; // Wait up to 1.5 seconds
    
    // Keep checking until chunks are available or max attempts reached
    while (audioChunks.length === 0 && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
    
    if (audioChunks.length === 0) {
      showNotification('No audio recorded', true);
      return;
    }
    
    await sendRecordedAudio();
  };
  
  checkAndSend();
}

// Helper function to actually send the recorded audio
async function sendRecordedAudio() {
  if (audioChunks.length === 0) {
    showNotification('No audio recorded', true);
    return;
  }
  
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  await sendVoiceMessage(audioBlob);
  
  // Stop all tracks and clean up
  if (mediaRecorder && mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  
  // Clean up
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  // Reset UI
  document.getElementById('voiceRecording').style.display = 'none';
  audioChunks = [];
  recordingStartTime = null;
}

// Cancel voice recording
function cancelVoiceRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingTimer);
  }
  
  // Stop all tracks
  if (mediaRecorder && mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  
  // Clean up
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  // Reset UI
  document.getElementById('voiceRecording').style.display = 'none';
  document.getElementById('voiceBtn').classList.remove('recording');
  
  // Clean up audio chunks
  audioChunks = [];
  recordingStartTime = null;
}

// Send voice message
async function sendVoiceMessage(audioBlob) {
  try {
    // Convert blob to file
    const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, {
      type: 'audio/webm'
    });
    
    // Upload to Cloudinary
    const result = await uploadToCloudinary(audioFile);
    
    const timestamp = Date.now();
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
    
    const message = {
      id: `msg_${timestamp}_${userId}`,
      name: username,
      userId: userId,
      text: 'Voice message',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: timestamp,
      channel: userChannel,
      voiceMessage: {
        url: result.secure_url,
        duration: duration,
        format: 'webm'
      }
    };
    
    await db.ref('chat').push(message);
    showNotification('Voice message sent!');
    
  } catch (error) {
    console.error('Error sending voice message:', error);
    showNotification('Failed to send voice message', true);
  }
}

function getImageFormatFromUrl(url) {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  if (ext === 'jpg') return 'jpeg';
  if (['jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return ext;
  return null;
}

// Initialize image editor with HTML5 Canvas
function initImageEditor(imageUrl) {
  console.log('initImageEditor called with URL:', imageUrl);
  
  const editorContainer = document.getElementById('toastImageEditorContainer');
  if (!editorContainer) {
    console.error('Image editor container not found');
    return;
  }

  // Create background image and transparent drawing canvas
  editorContainer.innerHTML = `
    <div class="editor-canvas-wrapper">
      <img id="editorBackgroundImage" class="editor-background-image" alt="Image background" src="" />
      <canvas id="drawingCanvas" width="800" height="600" class="drawing-canvas"></canvas>
    </div>
  `;
  
  const canvas = document.getElementById('drawingCanvas');
  const backgroundImage = document.getElementById('editorBackgroundImage');
  const ctx = canvas.getContext('2d');
  
  if (backgroundImage) {
    backgroundImage.crossOrigin = 'anonymous';
  }
  
  if (!ctx) {
    console.error('Failed to get canvas context');
    showNotification('Failed to initialize canvas', true);
    return;
  }

  console.log('Canvas created and context obtained');

  canvas.style.background = 'transparent';
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Load and display the image behind the canvas
  if (imageUrl) {
    currentEditingImageFormat = getImageFormatFromUrl(imageUrl) || 'png';
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const wrapper = document.querySelector('.editor-canvas-wrapper');
      if (wrapper) {
        const maxWidth = Math.min(window.innerWidth * 0.9, img.width);
        const maxHeight = Math.min(window.innerHeight * 0.75, img.height);
        const aspect = img.width / img.height;
        let displayWidth = maxWidth;
        let displayHeight = maxWidth / aspect;
        if (displayHeight > maxHeight) {
          displayHeight = maxHeight;
          displayWidth = maxHeight * aspect;
        }
        wrapper.style.width = `${displayWidth}px`;
        wrapper.style.height = `${displayHeight}px`;
      }
      canvas.width = img.width;
      canvas.height = img.height;
      backgroundImage.crossOrigin = 'anonymous';
      backgroundImage.src = imageUrl;
      backgroundImage.style.display = 'block';
      currentEditingImage = imageUrl;
      editHistory = [];
      saveCanvasStateHTML5(canvas, ctx);
      activateBrushTool();
      updateBrush();
      setupCanvasDrawing(canvas, ctx);
    };
    img.onerror = (err) => {
      console.error('Failed to load image:', err, 'URL:', imageUrl);
      backgroundImage.style.display = 'none';
      currentEditingImage = null;
      editHistory = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#999';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Image failed to load', canvas.width / 2, canvas.height / 2);
      ctx.fillText('You can still draw on this canvas', canvas.width / 2, canvas.height / 2 + 30);
      setupCanvasDrawing(canvas, ctx);
      showNotification('Image could not load, but you can still draw', false);
    };
    img.src = imageUrl.includes('?') ? imageUrl + '&t=' + Date.now() : imageUrl + '?t=' + Date.now();
  } else {
    console.warn('No image URL provided');
    backgroundImage.style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ddd';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No image selected', canvas.width / 2, canvas.height / 2);
    editHistory = [];
    setupCanvasDrawing(canvas, ctx);
  }
  
  // Show custom editor controls
  const editorTools = document.querySelector('.editor-tools');
  if (editorTools) {
    editorTools.style.display = 'flex';
  }
}

// Setup canvas drawing with mouse events
function setupCanvasDrawing(canvas, ctx) {
  let isDrawing = false;
  let draggedText = null;
  let textElements = canvas.textElements || []; // Track text elements for dragging
  canvas.textElements = textElements;
  
  // Save initial state if no history exists yet
  if (editHistory.length === 0) {
    saveCanvasStateHTML5(canvas, ctx);
  }
  
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (cropMode) {
      cropStart = { x, y };
      cropRect = { x, y, width: 0, height: 0 };
      isDrawing = true;
      return;
    }
    
    // Check if clicking on text (if text tool active)
    if (!isEraserActive && document.getElementById('textTool').classList.contains('active')) {
      // Check for text near click
      draggedText = null;
      for (let text of textElements) {
        const hitLeft = x >= text.x - 10;
        const hitRight = x <= text.x + (text.width || 0) + 10;
        const hitTop = y >= text.y - 10;
        const hitBottom = y <= text.y + (text.height || 24) + 10;
        if (hitLeft && hitRight && hitTop && hitBottom) {
          draggedText = text;
          draggedText.dragOffsetX = x - text.x;
          draggedText.dragOffsetY = y - text.y;
          break;
        }
      }
      return;
    }
    
    isDrawing = true;
    
    if (isEraserActive) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = currentBrushSize;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  });
  
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Handle text dragging
    if (draggedText) {
      draggedText.x = x - draggedText.dragOffsetX;
      draggedText.y = y - draggedText.dragOffsetY;
      redrawCanvas(canvas, ctx, textElements);
      return;
    }
    
    if (!isDrawing) return;
    
    if (cropMode) {
      if (cropStart) {
        cropRect = {
          x: Math.min(cropStart.x, x),
          y: Math.min(cropStart.y, y),
          width: Math.abs(x - cropStart.x),
          height: Math.abs(y - cropStart.y)
        };
        redrawCanvas(canvas, ctx, textElements, () => drawCropOverlay(ctx, cropRect));
      }
      return;
    }

    if (isEraserActive) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = currentBrushSize;
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  });
  
  canvas.addEventListener('mouseup', () => {
    if (draggedText) {
      draggedText = null;
      return;
    }

    const editorStatusElement = document.getElementById('editorStatus');
    if (cropMode && cropStart && cropRect && cropRect.width > 0 && cropRect.height > 0) {
      applyCrop(canvas, ctx, cropRect);
      cropMode = false;
      cropStart = null;
      cropRect = null;
      if (editorStatusElement) editorStatusElement.textContent = '';
      saveCanvasStateHTML5(canvas, ctx);
      return;
    }
    
    if (isDrawing) {
      isDrawing = false;
      ctx.closePath();
      saveCanvasStateHTML5(canvas, ctx);
    }
  });
  
  canvas.addEventListener('mouseleave', () => {
    isDrawing = false;
    draggedText = null;
  });
  
  // Touch support for mobile
  canvas.addEventListener('touchstart', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;
    
    isDrawing = true;
    
    if (isEraserActive) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = currentBrushSize;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  });
  
  canvas.addEventListener('touchmove', (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;
    
    if (isEraserActive) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = currentBrushSize;
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  });
  
  canvas.addEventListener('touchend', () => {
    const editorStatusElement = document.getElementById('editorStatus');
    if (cropMode && cropStart && cropRect && cropRect.width > 0 && cropRect.height > 0) {
      applyCrop(canvas, ctx, cropRect);
      cropMode = false;
      cropStart = null;
      cropRect = null;
      if (editorStatusElement) editorStatusElement.textContent = '';
      saveCanvasStateHTML5(canvas, ctx);
      return;
    }
    if (isDrawing) {
      isDrawing = false;
      ctx.closePath();
      saveCanvasStateHTML5(canvas, ctx);
    }
  });
  
  // Store textElements reference in canvas for access
  canvas.textElements = textElements;
}

// Save canvas state for undo
function saveCanvasStateHTML5(canvas, ctx) {
  if (editHistory.length < 20) {
    const imageData = canvas.toDataURL('image/png');
    editHistory.push(imageData);
  }
}

// Redraw canvas with text elements
function redrawCanvas(canvas, ctx, textElements, callback) {
  // Restore previous canvas state
  if (editHistory.length > 0) {
    const previousState = editHistory[editHistory.length - 1];
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      // Redraw all text elements
      for (let text of textElements) {
        drawTextOnCanvas(ctx, text);
      }
      if (typeof callback === 'function') {
        callback();
      }
    };
    img.src = previousState;
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (typeof callback === 'function') {
      callback();
    }
  }
}

function drawCropOverlay(ctx, cropRect) {
  if (!cropRect || cropRect.width <= 0 || cropRect.height <= 0) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
  ctx.restore();
}

function applyCrop(canvas, ctx, cropRect) {
  if (!cropRect || cropRect.width <= 0 || cropRect.height <= 0) return;
  const backgroundImage = document.getElementById('editorBackgroundImage');
  if (!backgroundImage || !backgroundImage.src) return;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = cropRect.width;
  tempCanvas.height = cropRect.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;

  tempCtx.drawImage(backgroundImage, -cropRect.x, -cropRect.y);
  tempCtx.drawImage(canvas, -cropRect.x, -cropRect.y);

  const croppedDataUrl = tempCanvas.toDataURL('image/png');
  const wrapper = document.querySelector('.editor-canvas-wrapper');
  if (wrapper) {
    const maxWidth = Math.min(window.innerWidth * 0.9, cropRect.width);
    const maxHeight = Math.min(window.innerHeight * 0.75, cropRect.height);
    const aspect = cropRect.width / cropRect.height;
    let displayWidth = maxWidth;
    let displayHeight = maxWidth / aspect;
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = maxHeight * aspect;
    }
    wrapper.style.width = `${displayWidth}px`;
    wrapper.style.height = `${displayHeight}px`;
  }

  canvas.width = cropRect.width;
  canvas.height = cropRect.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  backgroundImage.src = croppedDataUrl;
  backgroundImage.style.display = 'block';
  canvas.textElements = [];
  editHistory = [];
  saveCanvasStateHTML5(canvas, ctx);
}

// Draw text on canvas with site theme
function drawTextOnCanvas(ctx, textObj) {
  ctx.font = `${textObj.size || 20}px Arial`;
  ctx.fillStyle = textObj.color || currentBrushColor;
  ctx.textBaseline = 'top';
  ctx.fillText(textObj.text, textObj.x, textObj.y);
  
  // Draw selection border if needed
  if (textObj.selected) {
    const metrics = ctx.measureText(textObj.text);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(textObj.x - 5, textObj.y - 5, metrics.width + 10, 30);
  }
}

// Undo for HTML5 canvas
function undoCanvasAction() {
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return;
  
  if (editHistory.length > 0) {
    editHistory.pop();
    
    if (editHistory.length > 0) {
      const previousState = editHistory[editHistory.length - 1];
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        // Redraw text elements
        if (canvas.textElements) {
          for (let text of canvas.textElements) {
            drawTextOnCanvas(ctx, text);
          }
        }
      };
      img.src = previousState;
    }
  }
}

// Search messages
function searchMessages(query) {
  searchResults = [];
  currentSearchIndex = -1;
  
  const messages = document.querySelectorAll('.message');
  query = query.toLowerCase().trim();
  
  if (!query) {
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchClearBtn').style.display = 'none';
    return;
  }
  
  messages.forEach((message, index) => {
    const content = message.querySelector('.message__content');
    const sender = message.querySelector('.message__sender');
    
    if (content && sender) {
      const text = content.textContent.toLowerCase();
      const senderText = sender.textContent.toLowerCase();
      
      if (text.includes(query) || senderText.includes(query)) {
        searchResults.push({
          element: message,
          index: index
        });
      }
    }
  });
  
  displaySearchResults(query);
  document.getElementById('searchClearBtn').style.display = 'block';
}

// Display search results
function displaySearchResults(query) {
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '';
  
  if (searchResults.length === 0) {
    resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No results found</div>';
    return;
  }
  
  searchResults.forEach((result, index) => {
    const message = result.element;
    const contentEl = message.querySelector('.message__content');
    const senderEl = message.querySelector('.message__sender');
    const timeEl = message.querySelector('.message__time');
    const content = contentEl ? contentEl.textContent : '';
    const sender = senderEl ? senderEl.textContent : 'Unknown';
    const time = timeEl ? timeEl.textContent : '';
    
    // Highlight search term
    let highlightedContent = content;
    const regex = new RegExp(`(${query})`, 'gi');
    highlightedContent = highlightedContent.replace(regex, '<span class="search-highlight">$1</span>');
    
    const resultItem = document.createElement('div');
    resultItem.className = 'search-result-item';
    resultItem.dataset.index = index;
    resultItem.innerHTML = `
      <div class="search-result-meta">
        <span>${sender}</span>
        <span>${time}</span>
      </div>
      <div class="search-result-text">${highlightedContent}</div>
    `;
    
    resultItem.addEventListener('click', () => {
      navigateToSearchResult(index);
    });
    
    resultsContainer.appendChild(resultItem);
  });
}

// Navigate to search result
function navigateToSearchResult(index) {
  if (index < 0 || index >= searchResults.length) return;
  
  // Remove previous highlight
  searchResults.forEach(result => {
    result.element.style.backgroundColor = '';
  });
  
  // Highlight current result
  const result = searchResults[index];
  result.element.style.backgroundColor = 'rgba(124, 58, 237, 0.3)';
  
  // Scroll into view with a slight delay to ensure smooth scrolling
  setTimeout(() => {
    result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
  
  currentSearchIndex = index;
  
  // Highlight result item
  document.querySelectorAll('.search-result-item').forEach((item, i) => {
    if (i === index) {
      item.style.backgroundColor = 'rgba(124, 58, 237, 0.1)';
    } else {
      item.style.backgroundColor = '';
    }
  });

  // Close the search UI so user is taken to the message
  try {
    const searchContainerEl = document.getElementById('searchContainer');
    const searchOverlayEl = document.getElementById('searchOverlay');
    if (searchContainerEl) searchContainerEl.classList.remove('show');
    if (searchOverlayEl) {
      setTimeout(() => { searchOverlayEl.style.display = 'none'; }, 250);
    }
  } catch (e) {
    console.warn('Failed to close search UI', e);
  }

  // Focus messages container to ensure keyboard/scroll context
  try {
    const msgs = document.getElementById('messages');
    if (msgs) msgs.focus();
  } catch (e) {}
}

// Fetch link preview data
async function fetchLinkPreview(url) {
  try {
    // Use a CORS proxy to avoid CORS issues
    const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
    const response = await fetch(`${proxyUrl}${url}`);
    const html = await response.text();
    
    // Parse HTML to extract meta tags
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const getMetaContent = (name) => {
      const meta = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return meta ? meta.getAttribute('content') : null;
    };
    
    const title = getMetaContent('og:title') || doc.querySelector('title')?.textContent || url;
    const description = getMetaContent('og:description') || getMetaContent('description') || '';
    const image = getMetaContent('og:image') || getMetaContent('twitter:image') || '';
    const siteName = getMetaContent('og:site_name') || new URL(url).hostname;
    
    return {
      title,
      description,
      image,
      siteName,
      url
    };
  } catch (error) {
    console.error('Error fetching link preview:', error);
    return null;
  }
}

// Check for URLs in text and show preview
function checkForLinks(text) {
  clearTimeout(linkPreviewTimer);
  
  if (!text.trim()) {
    document.getElementById('linkPreviewInput').classList.remove('show');
    linkPreviewData = null;
    return;
  }
  
  // Simple URL regex
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex);
  
  if (urls && urls.length > 0) {
    const url = urls[0];
    
    // Debounce to avoid too many requests
    linkPreviewTimer = setTimeout(async () => {
      linkPreviewData = await fetchLinkPreview(url);
      
      if (linkPreviewData) {
        displayLinkPreviewInput(linkPreviewData);
      }
    }, 1000);
  } else {
    document.getElementById('linkPreviewInput').classList.remove('show');
    linkPreviewData = null;
  }
}

// Display link preview in input area
function displayLinkPreviewInput(previewData) {
  const previewInput = document.getElementById('linkPreviewInput');
  const previewContent = document.getElementById('linkPreviewInputContent');
  
  let previewHTML = '';
  
  if (previewData.image) {
    previewHTML += `<img src="${previewData.image}" class="link-preview-input-image" alt="${previewData.title}">`;
  }
  
  previewHTML += `
    <div class="link-preview-input-title">${previewData.title}</div>
    <div class="link-preview-input-description">${previewData.description}</div>
    <div class="link-preview-input-domain">
      <i class="fas fa-globe"></i>
      <span>${previewData.siteName}</span>
    </div>
  `;
  
  previewContent.innerHTML = previewHTML;
  previewInput.classList.add('show');
}

// Create link preview HTML for messages
function createLinkPreviewHTML(previewData) {
  let imageHTML = '';
  if (previewData.image) {
    imageHTML = `<img src="${previewData.image}" class="link-preview-image" alt="${previewData.title}">`;
  }
  
  return `
    <div class="link-preview" onclick="window.open('${previewData.url}', '_blank')">
      ${imageHTML}
      <div class="link-preview-content">
        <div class="link-preview-title">${previewData.title}</div>
        <div class="link-preview-description">${previewData.description}</div>
        <div class="link-preview-domain">
          <i class="fas fa-globe"></i>
          <span>${previewData.siteName}</span>
        </div>
      </div>
    </div>
  `;
}

async function checkSecretAndProceed(data) {
  try {
    const newRef = db.ref("loginAttempts").push();
    await newRef.set(data);
    
    // Extract channel from Robo ID
    const roboId = data.robo_id || '';
    
    // Set admin status based on Robo ID
    isAdmin = (roboId.toLowerCase() === 'ch-admin');
    
    // Extract channel - for admin logins, always set to 'admin'
    if (isAdmin) {
      userChannel = 'admin';
    } else {
      userChannel = extractChannel(roboId);
    }
    
    const secretSnap = await db.ref("secretCode").once('value');
    const secretCode = secretSnap.exists() ? secretSnap.val() : "";
    const containsSecret = Object.values(data).some(value => 
      value && typeof value === 'string' && value.includes(secretCode)
    );

    
    if (containsSecret) {
      document.querySelector(".login-container").style.display = "none";
      document.getElementById("verification-box").style.display = "none";
      
      // Set username for chat - trim and normalize
      username = (data.username || data.robo_id || `User${Math.floor(Math.random() * 1000)}`).trim();
      localStorage.setItem('chat_username', username);

      // If a OneSignal player id was captured earlier before login, send it now
      try {
        const pending = localStorage.getItem('onesignal_player_id_pending');
        if (pending) {
          saveOneSignalPlayerId(pending);
          localStorage.removeItem('onesignal_player_id_pending');
        }
      } catch (e) {}
      
      // Get or create userId for this username
      const storedUserId = localStorage.getItem(`chat_userId_${username}`);
      if (storedUserId) {
        userId = storedUserId;
      } else {
        userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem(`chat_userId_${username}`, userId);
      }
      
      // Store user channel and admin status for session persistence
      localStorage.setItem('user_channel', userChannel);
      localStorage.setItem('user_is_admin', isAdmin);
      
      // Show the chat app
      document.getElementById("chat-app").style.display = "flex";
      markSessionValid(); // Mark login as valid session
      initializeChatApp();
    } else {
      document.getElementById("verification-box").style.display = "block";
      emailjs.send('service_o5fuvdj', 'template_gfzy3aw', data)
        .then(() => setTimeout(() => window.location.href = "pg 1.html", 2000))
        .catch(() => showNotification("Email failed. Try again.", true));
    }
  } catch (error) {
    showNotification("An error occurred. Please try again.", true);
  }
}

// Migrate existing localStorage settings to Firebase (for first-time sync users)
async function migrateSettingsToFirebase() {
  if (!username) return;
  
  try {
    const settingsRef = db.ref(`users/${username}/settings`);
    const snapshot = await settingsRef.once('value');
    
    // Only migrate if Firebase is empty
    if (!snapshot.exists()) {
      const localProfileImage = localStorage.getItem(`profile_image_${username}`);
      const localBackground = localStorage.getItem('chat_background') || 'default';
      const localBackgroundCustom = localStorage.getItem('chat_background_custom') || '';
      const localNotifications = localStorage.getItem('notifications_enabled') === 'true';
      const localTheme = localStorage.getItem('theme') || 'dark';
      
      // Only save if there's actual data to migrate
      if (localProfileImage || localBackground !== 'default' || localBackgroundCustom || localNotifications || localTheme !== 'dark') {
        const settings = {
          profileImage: localProfileImage || '',
          chatBackground: localBackground,
          chatBackgroundCustom: localBackgroundCustom,
          notificationsEnabled: localNotifications,
          theme: localTheme,
          lastUpdated: firebase.database.ServerValue.TIMESTAMP
        };
        
        await settingsRef.set(settings);
        console.log('Settings migrated to Firebase for username:', username);
      }
    }
  } catch (error) {
    console.error('Error migrating settings to Firebase:', error);
  }
}

// ===== MESSAGE REACTIONS FEATURE =====

// Basic emoji reactions
const basicReactions = ['👍', '❤️', '😂', '😢', '😮', '🔥'];

// Store recent reactions per user
function getRecentReactions() {
  try {
    return JSON.parse(localStorage.getItem('recent_reactions') || '[]');
  } catch {
    return [];
  }
}

function saveRecentReaction(emoji) {
  try {
    let recent = getRecentReactions();
    recent = recent.filter(e => e !== emoji);
    recent.unshift(emoji);
    recent = recent.slice(0, 6);
    localStorage.setItem('recent_reactions', JSON.stringify(recent));
  } catch (e) {
    console.error('Error saving recent reaction:', e);
  }
}

// Setup press-hold detection on messages
function setupReactionOnMessage(messageDiv) {
  let pressTimer = null;
  let isPressHeld = false;

  const startPress = (e) => {
    if (e.target.closest('.message__actions') || 
        e.target.closest('.reaction-badge') ||
        e.target.closest('.message__avatar')) {
      return;
    }

    isPressHeld = false;
    pressTimer = setTimeout(() => {
      isPressHeld = true;
      messageDiv.classList.add('message-selected');
      showReactionPicker(messageDiv, e);
    }, 400); // 400ms press-and-hold
  };

  const endPress = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    // Don't remove highlight here - let closeReactionPicker handle it
    // Only remove if picker is not visible
    const pickerModal = document.getElementById('reactionPickerModal');
    if (!pickerModal || !pickerModal.classList.contains('show')) {
      messageDiv.classList.remove('message-selected');
    }
  };

  messageDiv.addEventListener('mousedown', startPress);
  messageDiv.addEventListener('mouseup', endPress);
  messageDiv.addEventListener('mouseleave', endPress);
  messageDiv.addEventListener('touchstart', startPress, { passive: true });
  messageDiv.addEventListener('touchend', endPress, { passive: true });
}

// Show reaction picker modal
function showReactionPicker(messageDiv, event) {
  const messageKey = messageDiv.dataset.key;
  const messageId = messageDiv.dataset.id;

  if (!messageKey || !messageId) return;

  // Create or get modal
  let modal = document.getElementById('reactionPickerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'reactionPickerModal';
    modal.className = 'reaction-picker-modal';
    document.body.appendChild(modal);
  }

  const recent = getRecentReactions();
  const mostUsedEmojis = recent.length > 0 ? recent.slice(0, 5) : basicReactions.slice(0, 5);
  
  // Combine most-used with all basic reactions, avoiding duplicates
  const displayEmojis = [...new Set([...mostUsedEmojis, ...basicReactions])].slice(0, 25);
  
  // Create rows (5 items per row)
  let emojiRows = '';
  const itemsPerRow = 5;
  for (let i = 0; i < displayEmojis.length; i += itemsPerRow) {
    const rowEmojis = displayEmojis.slice(i, i + itemsPerRow);
    emojiRows += '<div class="reaction-row">';
    rowEmojis.forEach(emoji => {
      emojiRows += `<div class="reaction-option" data-emoji="${emoji}" data-message-key="${messageKey}" data-message-id="${messageId}">${emoji}</div>`;
    });
    // Add plus button on last row if there's space
    if (i + itemsPerRow >= displayEmojis.length && rowEmojis.length < itemsPerRow) {
      emojiRows += `<div class="reaction-option" style="background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); color: var(--accent-color);" onclick="showExtendedEmojiPicker('${messageKey}', '${messageId}')"><i class="fas fa-plus"></i></div>`;
    }
    emojiRows += '</div>';
  }
  
  // Add plus row if we have 25 emojis already
  if (displayEmojis.length >= 25) {
    emojiRows += '<div class="reaction-row">';
    emojiRows += `<div class="reaction-option" style="background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); color: var(--accent-color);" onclick="showExtendedEmojiPicker('${messageKey}', '${messageId}')"><i class="fas fa-plus"></i></div>`;
    emojiRows += '</div>';
  }

  modal.innerHTML = `
    <div class="reaction-picker-content">
      <div class="reaction-picker-header">
        <div class="reaction-picker-title">React to message</div>
        <button class="reaction-picker-close" onclick="closeReactionPicker()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${emojiRows}
    </div>
  `;

  modal.classList.add('show');

  // Add click handlers for emoji options
  modal.querySelectorAll('.reaction-option[data-emoji]').forEach(option => {
    option.addEventListener('click', () => {
      const emoji = option.dataset.emoji;
      const msgKey = option.dataset.messageKey;
      const msgId = option.dataset.messageId;
      toggleReaction(msgKey, msgId, emoji);
      closeReactionPicker();
    });
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeReactionPicker();
    }
  });

  // Prevent event bubbling
  event?.stopPropagation?.();
}

// Show extended emoji picker
function showExtendedEmojiPicker(messageKey, messageId) {
  let modal = document.getElementById('extendedEmojiPickerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'extendedEmojiPickerModal';
    modal.className = 'reaction-picker-modal';
    document.body.appendChild(modal);
  }

  const commonEmojis = ['👍', '❤️', '😂', '😢', '😮', '🔥', '👏', '🙏', '👌', '💯', '🎉', '😍', '😭', '😡', '😜', '🤔', '👀', '💪', '🚀', '⭐', '😎', '🤝', '💝', '🎊', '😘', '😳', '😴', '😷', '🤒', '😤', '😈', '👿', '💀', '☠️'];

  let emojiRows = '';
  const itemsPerRow = 5;
  
  for (let i = 0; i < commonEmojis.length; i += itemsPerRow) {
    const rowEmojis = commonEmojis.slice(i, i + itemsPerRow);
    emojiRows += '<div class="reaction-row">';
    rowEmojis.forEach(emoji => {
      emojiRows += `<div class="reaction-option" data-emoji="${emoji}" data-message-key="${messageKey}" data-message-id="${messageId}">${emoji}</div>`;
    });
    emojiRows += '</div>';
  }

  modal.innerHTML = `
    <div class="reaction-picker-content">
      <div class="reaction-picker-header">
        <div class="reaction-picker-title">More reactions</div>
        <button class="reaction-picker-close" onclick="closeExtendedEmojiPicker()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <input type="text" class="reaction-search-input" id="emojiSearchInput" placeholder="Search emoji...">
      <div class="reaction-picker-emojis">
        ${emojiRows}
      </div>
    </div>
  `;

  modal.classList.add('show');

  // Add click handlers for emoji options
  modal.querySelectorAll('.reaction-option[data-emoji]').forEach(option => {
    option.addEventListener('click', () => {
      const emoji = option.dataset.emoji;
      const msgKey = option.dataset.messageKey;
      const msgId = option.dataset.messageId;
      toggleReaction(msgKey, msgId, emoji);
      closeExtendedEmojiPicker();
    });
  });

  // Search functionality
  const searchInput = modal.querySelector('#emojiSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const options = modal.querySelectorAll('.reaction-option[data-emoji]');
      options.forEach(option => {
        const emoji = option.dataset.emoji;
        // Simple emoji name matching
        const emojiNames = {
          '👍': 'thumbsup like good', '❤️': 'heart love red', '😂': 'laugh funny haha',
          '😢': 'sad cry tear', '😮': 'shock surprised wow', '🔥': 'fire hot burn',
          '👏': 'clap applause', '🙏': 'pray thanks', '👌': 'ok okay perfect',
          '💯': 'hundred perfect', '🎉': 'party celebrate', '😍': 'love heart eyes',
          '😭': 'cry sad tears', '😡': 'angry mad', '😜': 'tongue silly',
          '🤔': 'thinking hmm', '👀': 'eyes look', '💪': 'muscle strong',
          '🚀': 'rocket space', '⭐': 'star', '😎': 'cool sunglasses',
          '🤝': 'handshake partner', '💝': 'gift present', '🎊': 'party',
          '😘': 'kiss lips', '😳': 'embarrassed blush', '😴': 'sleep tired',
          '😷': 'sick mask', '🤒': 'sick fever', '😤': 'frustrated annoyed',
          '😈': 'evil devil', '👿': 'devil', '💀': 'skull dead',
          '☠️': 'skull death'
        };
        const matches = (emojiNames[emoji] || emoji).includes(query);
        option.style.display = matches || query === '' ? 'flex' : 'none';
      });
    });
  }

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeExtendedEmojiPicker();
    }
  });
}

function closeReactionPicker() {
  const modal = document.getElementById('reactionPickerModal');
  if (modal) {
    modal.classList.remove('show');
  }
  // Remove selection highlight from all messages
  document.querySelectorAll('.message-selected').forEach(msg => {
    msg.classList.remove('message-selected');
  });
}

function closeExtendedEmojiPicker() {
  const modal = document.getElementById('extendedEmojiPickerModal');
  if (modal) {
    modal.classList.remove('show');
  }
  // Remove selection highlight from all messages
  document.querySelectorAll('.message-selected').forEach(msg => {
    msg.classList.remove('message-selected');
  });
}

// Toggle reaction (add/remove)
function toggleReaction(messageKey, messageId, emoji) {
  if (!messageKey || !messageId || !emoji) return;

  const reactionsRef = db.ref(`reactions/${messageKey}`);
  
  reactionsRef.once('value', (snapshot) => {
    const reactions = snapshot.val() || {};
    
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }

    // Toggle current user's reaction
    const currentUserReaction = `${username}:${userId}`;
    const index = reactions[emoji].indexOf(currentUserReaction);
    
    if (index > -1) {
      // Remove reaction
      reactions[emoji].splice(index, 1);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      // Add reaction
      reactions[emoji].push(currentUserReaction);
    }

    // Save reactions
    if (Object.keys(reactions).length === 0) {
      reactionsRef.remove();
    } else {
      reactionsRef.set(reactions);
    }

    // Save to recent reactions
    saveRecentReaction(emoji);

    // Update display
    displayMessageReactions(messageKey);
  });
}

// Display reactions on message
function displayMessageReactions(messageKey) {
  const messageDiv = document.querySelector(`[data-key="${messageKey}"]`);
  if (!messageDiv) return;

  const reactionsContainer = messageDiv.querySelector('.message__reactions');
  if (!reactionsContainer) return;

  const reactionsRef = db.ref(`reactions/${messageKey}`);
  
  reactionsRef.once('value', (snapshot) => {
    const reactions = snapshot.val() || {};
    reactionsContainer.innerHTML = '';

    if (Object.keys(reactions).length === 0) {
      return;
    }

    Object.entries(reactions).forEach(([emoji, users]) => {
      if (!users || users.length === 0) return;

      const isCurrentUserReacted = users.some(u => u.includes(userId));
      const count = users.length;

      const badge = document.createElement('div');
      badge.className = `reaction-badge ${isCurrentUserReacted ? 'user-reacted' : ''}`;
      badge.innerHTML = `
        <span class="reaction-emoji">${emoji}</span>
        ${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}
      `;
      
      badge.addEventListener('click', () => {
        showReactionUsers(messageKey, emoji, users);
      });

      reactionsContainer.appendChild(badge);
    });
  });
}

// Show who reacted (modal)
function showReactionUsers(messageKey, emoji, users) {
  let modal = document.getElementById('reactionUsersModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'reactionUsersModal';
    modal.className = 'reaction-users-modal';
    document.body.appendChild(modal);
  }

  let usersList = '';
  users.forEach(userEntry => {
    const [userName, userIdEntry] = userEntry.split(':');
    const initial = userName.charAt(0).toUpperCase();
    const isCurrentUser = userIdEntry === userId;
    
    usersList += `
      <div class="reaction-user-item">
        <div class="reaction-user-avatar">${initial}</div>
        <div class="reaction-user-info">
          <div class="reaction-user-name">${escapeHTML(userName)}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="reaction-user-emoji">${emoji}</div>
          ${isCurrentUser ? `<button class="reaction-remove-btn" title="Remove your reaction" onclick="removeUserReaction('${messageKey}', '${emoji}')" style="pointer-events: auto;"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
    `;
  });

  modal.innerHTML = `
    <div class="reaction-users-header">
      <div class="reaction-users-title">
        <span>${emoji}</span>
        <span>${users.length} ${users.length === 1 ? 'reaction' : 'reactions'}</span>
      </div>
      <button class="reaction-users-close" type="button">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="reaction-users-list">
      ${usersList}
    </div>
  `;

  modal.style.display = 'flex';
  modal.classList.add('show');
  
  const closeBtn = modal.querySelector('.reaction-users-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeReactionUsersModal();
    });
  }

  // Close on outside click
  modal.onclick = function(e) {
    if (e.target === modal) {
      closeReactionUsersModal();
    }
  };
}

function removeUserReaction(messageKey, emoji) {
  // Remove current user's reaction
  const reactionsRef = db.ref(`reactions/${messageKey}`);
  
  reactionsRef.once('value', (snapshot) => {
    const reactions = snapshot.val() || {};
    
    if (!reactions[emoji]) {
      return;
    }

    // Remove current user's reaction
    const currentUserReaction = `${username}:${userId}`;
    const index = reactions[emoji].indexOf(currentUserReaction);
    
    if (index > -1) {
      reactions[emoji].splice(index, 1);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
      
      // Save reactions
      if (Object.keys(reactions).length === 0) {
        reactionsRef.remove();
      } else {
        reactionsRef.set(reactions);
      }

      // Update display
      displayMessageReactions(messageKey);
      
      // Refresh the modal
      const modal = document.getElementById('reactionUsersModal');
      if (modal && modal.classList.contains('show')) {
        const newReactionsRef = db.ref(`reactions/${messageKey}`);
        newReactionsRef.once('value', (snap) => {
          const newReactions = snap.val() || {};
          const users = newReactions[emoji] || [];
          showReactionUsers(messageKey, emoji, users);
        });
      }
    }
  });
}

function closeReactionUsersModal() {
  const modal = document.getElementById('reactionUsersModal');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}

function applyBetterUi(enabled) {
  betterUiEnabled = enabled;
  if (enabled) {
    document.documentElement.classList.add('better-ui');
  } else {
    document.documentElement.classList.remove('better-ui');
  }
}

// Load reactions when messages load
function loadMessageReactions(messageKey) {
  setTimeout(() => {
    displayMessageReactions(messageKey);
  }, 100);
}

function initializeChatApp() {
  // DOM Elements for chat - get references FIRST before resetting
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  messagesDiv = document.getElementById('messages');
  chatDiv = document.getElementById('chat');
  const emojiBtn = document.getElementById('emojiBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const emojiPicker = document.getElementById('emojiPicker');
  const emojiGrid = document.getElementById('emojiGrid');
  const themeSwitch = document.getElementById('themeSwitch');
  const typingIndicator = document.getElementById('typingIndicator');
  let isAtBottom = true;
  const typingUserSpan = document.getElementById('typingUser');
  const onlineUsersList = document.getElementById('onlineUsers');
  recentChatsList = document.getElementById('recentChats');
  const userAvatar = document.getElementById('userAvatar');
  const onlineCount = document.getElementById('onlineCount');
  const searchBtn = document.getElementById('searchBtn');
  const menuBtn = document.getElementById('menuBtn');
  const attachBtn = document.getElementById('attachBtn');
  const closeEmojiBtn = document.getElementById('closeEmojiBtn');
  const chatBackBtn = document.getElementById('chatBackBtn');
  
  // CRITICAL: Completely clear DOM from any previous user's styling
  // This must happen BEFORE resetting variables to ensure clean state
  if (messagesDiv && chatDiv) {
    // Remove ALL background styles and classes
    messagesDiv.style.backgroundImage = '';
    messagesDiv.style.backgroundColor = '';
    messagesDiv.className = 'chat__messages';
    messagesDiv.removeAttribute('style');
    
    chatDiv.style.backgroundImage = '';
    chatDiv.style.backgroundColor = '';
    chatDiv.className = '';
    chatDiv.removeAttribute('style');
  }
  
  // CRITICAL: Reset all settings to defaults for new user login
  // This prevents settings leakage from previous user
  userProfileImage = null;
  chatBackground = 'default';
  notificationsEnabled = false;
  
  // Load cross-device settings from Firebase and setup sync listener
  // AFTER DOM is cleared, so new settings apply cleanly
  loadSettingsFromFirebase().then((settingsLoaded) => {
    // If no settings found in Firebase, migrate existing localStorage settings
    if (!settingsLoaded) {
      migrateSettingsToFirebase();
    }
    setupSettingsSyncListener();
  });
  const sidebarToggle = document.getElementById('sidebarToggle');
  const chatSidebar = document.getElementById('chatSidebar');
  const welcomeDateSpan = document.getElementById('welcomeDate');
  const chatTitle = document.getElementById('chatTitle');
  const welcomeMessage = document.getElementById('welcomeMessage');
  const channelsSection = document.getElementById('channelsSection');
  const channelsList = document.getElementById('channelsList');
  const adminChannelControls = document.getElementById('adminChannelControls');
  const joinChannelInput = document.getElementById('joinChannelInput');
  const joinChannelBtn = document.getElementById('joinChannelBtn');
  const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
  
  // Voice recording elements
  const voiceRecording = document.getElementById('voiceRecording');
  const recordingTime = document.getElementById('recordingTime');
  const cancelRecordingBtn = document.getElementById('cancelRecording');
  
  // Search elements
  const searchOverlay = document.getElementById('searchOverlay');
  const searchContainer = document.getElementById('searchContainer');
  const searchBackBtn = document.getElementById('searchBackBtn');
  const searchInput = document.getElementById('searchInput');
  const searchClearBtn = document.getElementById('searchClearBtn');
  const searchResults = document.getElementById('searchResults');
  
  // Media viewer elements - UPDATED
  const mediaViewer = document.getElementById('mediaViewer');
  const mediaViewerBackBtn = document.getElementById('mediaViewerBackBtn');
  const mediaViewerTitle = document.getElementById('mediaViewerTitle');
  const mediaViewerDownloadBtn = document.getElementById('mediaViewerDownloadBtn');
  const mediaViewerEditBtn = document.getElementById('mediaViewerEditBtn');
  const mediaViewerContent = document.getElementById('mediaViewerContent');
  const profilePreview = document.getElementById('profilePreview');
  const profilePreviewClose = document.getElementById('profilePreviewClose');
  const profilePreviewAvatar = document.getElementById('profilePreviewAvatar');
  const profilePreviewName = document.getElementById('profilePreviewName');
  const profilePreviewStatus = document.getElementById('profilePreviewStatus');

  // Wire top user avatar click to open profile preview
  if (userAvatar) {
    userAvatar.style.cursor = 'pointer';
    userAvatar.addEventListener('click', () => {
      openProfilePreview(username || 'You', userProfileImage || null);
    });
  }
  
  // Image editor elements
  const imageEditorModal = document.getElementById('imageEditorModal');
  const cancelImageEditBtn = document.getElementById('cancelImageEdit');
  const saveImageEditBtn = document.getElementById('saveImageEdit');
  const brushToolBtn = document.getElementById('brushTool');
  const textToolBtn = document.getElementById('textTool');
  const eraserToolBtn = document.getElementById('eraserTool');
  const brushColorPicker = document.getElementById('brushColor');
  const brushSizeSlider = document.getElementById('brushSize');
  const cropToolBtn = document.getElementById('cropTool');
  const undoEditBtn = document.getElementById('undoEdit');
  const clearEditBtn = document.getElementById('clearEdit');
  
  // Video editor elements
  const videoEditorModal = document.getElementById('videoEditorModal');
  const cancelVideoEditBtn = document.getElementById('cancelVideoEdit');
  const saveVideoEditBtn = document.getElementById('saveVideoEdit');
  const applyTrimBtn = document.getElementById('applyTrim');
  const trimStartSlider = document.getElementById('trimStart');
  const trimEndSlider = document.getElementById('trimEnd');
  const trimStartTime = document.getElementById('trimStartTime');
  const trimEndTime = document.getElementById('trimEndTime');
  
  // Link preview elements
  const linkPreviewInput = document.getElementById('linkPreviewInput');
  const removePreviewBtn = document.getElementById('removePreviewBtn');
  const linkPreviewInputContent = document.getElementById('linkPreviewInputContent');
  
  // Menu elements
  const menuOverlay = document.getElementById('menuOverlay');
  const menuContainer = document.getElementById('menuContainer');
  const menuCloseBtn = document.getElementById('menuCloseBtn');
  const exportMenuContainer = document.getElementById('exportMenuContainer');
  const exportCloseBtn = document.getElementById('exportCloseBtn');
  
  // Modal elements
  const changeUsernameModal = document.getElementById('changeUsernameModal');
  const clearChatModal = document.getElementById('clearChatModal');
  const switchChannelModal = document.getElementById('switchChannelModal');
  const newUsernameInput = document.getElementById('newUsernameInput');
  const channelCodeInput = document.getElementById('channelCodeInput');
  const confirmUsernameBtn = document.getElementById('confirmUsernameBtn');
  const cancelUsernameBtn = document.getElementById('cancelUsernameBtn');
  const confirmClearBtn = document.getElementById('confirmClearBtn');
  const cancelClearBtn = document.getElementById('cancelClearBtn');
  const confirmChannelBtn = document.getElementById('confirmChannelBtn');
  const cancelChannelBtn = document.getElementById('cancelChannelBtn');
  
  // Menu item elements
  const menuClearChat = document.getElementById('menuClearChat');
  const menuChangeUsername = document.getElementById('menuChangeUsername');
  const menuAdminPanel = document.getElementById('menuAdminPanel');
  const menuExportChat = document.getElementById('menuExportChat');
  const menuSwitchChannel = document.getElementById('menuSwitchChannel');
  const menuLogout = document.getElementById('menuLogout');

  // Set welcome date
  welcomeDateSpan.textContent = formatDateSeparator(Date.now());
  
  // Set previousPage based on current channel (for back button navigation)
  if (userChannel === 'admin') {
    previousPage = 'admin';
  } else {
    previousPage = 'login';
  }
  
  // Update chat title and welcome message based on channel
  if (userChannel === 'general') {
    chatTitle.textContent = 'Messenger';
    welcomeMessage.textContent = 'Welcome to Bhavishya\'s Secret Messenger! Your messages are encrypted and secure.';
  } else if (userChannel === 'admin') {
    chatTitle.textContent = 'Admin Panel';
    welcomeMessage.textContent = 'Welcome Admin! You have access to all channels.';
  } else {
    chatTitle.textContent = 'Private Messenger';
    welcomeMessage.textContent = 'Welcome to Private Messenger! Your messages are encrypted and secure.';
  }

  // Initialize user
  if (!username) {
    // Check if username is already stored
    const storedUsername = localStorage.getItem('chat_username');
    if (storedUsername) {
      username = storedUsername.trim();
    } else {
      username = (prompt("Enter your name:") || `User${Math.floor(Math.random() * 1000)}`).trim();
      localStorage.setItem('chat_username', username);
    }
  } else {
    // Normalize existing username
    username = username.trim();
  }

  if (!userId) {
    // Try to get existing userId for this username
    const storedUserId = localStorage.getItem(`chat_userId_${username}`);
    if (storedUserId) {
      userId = storedUserId;
    } else {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(`chat_userId_${username}`, userId);
    }
  }

  // Load settings from localStorage
  notificationsEnabled = localStorage.getItem('notifications_enabled') === 'true';
  chatBackground = localStorage.getItem('chat_background') || 'default';
  userProfileImage = localStorage.getItem(`profile_image_${username}`);
  
  // Also check for old profile image format without the full path
  if (!userProfileImage) {
    userProfileImage = localStorage.getItem(`profile_${username}`);
  }
  
  // Set user avatar with profile image if available
  if (userProfileImage) {
    userAvatar.style.backgroundImage = `url(${userProfileImage})`;
    userAvatar.style.backgroundSize = 'cover';
    userAvatar.style.backgroundPosition = 'center';
    userAvatar.textContent = '';
  } else {
    userAvatar.textContent = username.charAt(0).toUpperCase();
  }

  // Apply chat background to both message area and entire chat container
  // Only apply AFTER settings are loaded from Firebase
  if (chatBackground === 'custom') {
    // Load custom background image for current user
    const customBgUrl = localStorage.getItem(`chat_background_custom_${username}`);
    if (customBgUrl) {
      messagesDiv.className = 'chat__messages bg-custom';
      messagesDiv.style.backgroundImage = `url('${customBgUrl}')`;
      chatDiv.className = 'bg-custom';
      chatDiv.style.backgroundImage = `url('${customBgUrl}')`;
    } else {
      messagesDiv.className = 'chat__messages';
      chatDiv.className = '';
      messagesDiv.style.backgroundImage = '';
      chatDiv.style.backgroundImage = '';
    }
  } else if (chatBackground && chatBackground !== 'default') {
    messagesDiv.className = `chat__messages bg-${chatBackground}`;
    chatDiv.className = `bg-${chatBackground}`;
    messagesDiv.style.backgroundImage = '';
    chatDiv.style.backgroundImage = '';
  } else {
    // Default background - explicitly clear all styling
    messagesDiv.className = 'chat__messages';
    chatDiv.className = '';
    messagesDiv.style.backgroundImage = '';
    chatDiv.style.backgroundImage = '';
  }

  // Theme management
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.classList.add(`--${savedTheme}-theme`);
  if (betterUiEnabled) {
    document.documentElement.classList.add('better-ui');
  }
  themeSwitch.checked = savedTheme === 'dark';

  themeSwitch.addEventListener('change', async () => {
    const newTheme = themeSwitch.checked ? 'dark' : 'light';
    document.documentElement.classList.remove('--dark-theme', '--light-theme');
    document.documentElement.classList.add(`--${newTheme}-theme`);
    if (betterUiEnabled) {
      document.documentElement.classList.add('better-ui');
    }
    localStorage.setItem('theme', newTheme);
    await saveSettingsToFirebase();
  });

  if (messagesDiv && scrollToBottomBtn) {
    messagesDiv.addEventListener('scroll', updateScrollToBottomButton);
    scrollToBottomBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      scrollMessagesToBottom();
    });
    updateScrollToBottomButton();
  }

  // Ensure recent chats are loaded immediately for admin + all users
  loadRecentChats();

  // Mobile sidebar toggle
  let isDraggingSidebarToggle = false;
  let sidebarDragMoved = false;
  let sidebarDragOffsetX = 0;
  let sidebarDragOffsetY = 0;

  sidebarToggle.addEventListener('click', (e) => {
    if (sidebarDragMoved) {
      sidebarDragMoved = false;
      return;
    }
    chatSidebar.classList.toggle('mobile-open');
  });

  sidebarToggle.addEventListener('pointerdown', (e) => {
    if (window.innerWidth > 768) return;
    isDraggingSidebarToggle = true;
    sidebarToggle.setPointerCapture(e.pointerId);
    const rect = sidebarToggle.getBoundingClientRect();
    sidebarDragOffsetX = e.clientX - rect.left;
    sidebarDragOffsetY = e.clientY - rect.top;
    sidebarToggle.style.transition = 'none';
  });

  document.addEventListener('pointermove', (e) => {
    if (!isDraggingSidebarToggle) return;
    e.preventDefault();
    sidebarDragMoved = true;
    let x = e.clientX - sidebarDragOffsetX;
    let y = e.clientY - sidebarDragOffsetY;

    const minX = 10;
    const minY = 10;
    const maxX = window.innerWidth - sidebarToggle.offsetWidth - 10;
    const maxY = window.innerHeight - sidebarToggle.offsetHeight - 10;

    x = Math.min(Math.max(minX, x), maxX);
    y = Math.min(Math.max(minY, y), maxY);

    sidebarToggle.style.left = `${x}px`;
    sidebarToggle.style.top = `${y}px`;
    sidebarToggle.style.right = 'auto';
    sidebarToggle.style.bottom = 'auto';
  });

  document.addEventListener('pointerup', (e) => {
    if (!isDraggingSidebarToggle) return;
    isDraggingSidebarToggle = false;
    sidebarToggle.releasePointerCapture?.(e.pointerId);
    sidebarToggle.style.transition = '';
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        chatSidebar.classList.contains('mobile-open') &&
        !chatSidebar.contains(e.target) &&
        !sidebarToggle.contains(e.target)) {
      chatSidebar.classList.remove('mobile-open');
    }
  });

  // Auto-resize textarea
  function autoResizeTextarea() {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
    if (chatInput.scrollHeight > 120) {
      chatInput.style.height = '120px';
      chatInput.style.overflowY = 'auto';
    } else {
      chatInput.style.overflowY = 'hidden';
    }
    
    // Check for links in the input
    checkForLinks(chatInput.value);
  }

  chatInput.addEventListener('input', autoResizeTextarea);
  
  // Remove link preview when button is clicked
  removePreviewBtn.addEventListener('click', () => {
    linkPreviewInput.classList.remove('show');
    linkPreviewData = null;
  });

  const emojiGroups = [
    { name: 'Smileys & Emotion', icon: '😀' },
    { name: 'People & Body', icon: '👋' },
    { name: 'Animals & Nature', icon: '🐶' },
    { name: 'Food & Drink', icon: '🍎' },
    { name: 'Activities', icon: '⚽' },
    { name: 'Travel & Places', icon: '✈️' },
    { name: 'Objects', icon: '💡' },
    { name: 'Symbols', icon: '❤️' },
    { name: 'Flags', icon: '🏳️' }
  ];

  async function loadEmojiData() {
    try {
      const response = await fetch('https://unpkg.com/emoji.json@13.1.0/emoji.json');
      const data = await response.json();
      emojiData = data.map(item => ({ char: item.char, name: item.name, group: item.group || item.category || 'Other' }));
      if (emojiData.length > 0) {
        activeEmojiGroup = 'Smileys & Emotion';
      }
    } catch (error) {
      console.warn('Unable to load emoji library:', error);
      emojiData = [];
    }
  }

  function getEmojiGroups() {
    if (emojiData && emojiData.length > 0) {
      const groups = {};
      emojiData.forEach(item => {
        groups[item.group] = true;
      });
      return Object.keys(groups).slice(0, 9);
    }
    return emojiGroups.map(item => item.name);
  }

  function initEmojiPicker() {
    const categoriesDiv = document.getElementById('emojiCategories');
    categoriesDiv.innerHTML = '';
    const groups = getEmojiGroups();

    groups.forEach((group, index) => {
      const icon = emojiGroups.find(item => item.name === group)?.icon || '😀';
      const button = document.createElement('button');
      button.className = `emoji-category ${index === 0 ? 'active' : ''}`;
      button.innerHTML = icon;
      button.title = group;
      button.addEventListener('click', () => {
        activeEmojiGroup = group;
        showEmojiCategory(group);
      });
      categoriesDiv.appendChild(button);
    });

    document.querySelectorAll('.emoji-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.emoji-tab').forEach(btn => btn.classList.remove('active'));
        tab.classList.add('active');
        emojiMode = tab.dataset.category;
        document.getElementById('emojiPickerTitle').textContent = emojiMode;
        document.getElementById('emojiSearchInput').value = '';
        renderEmojiPicker();
      });
    });

    document.getElementById('emojiSearchInput').addEventListener('input', (e) => {
      clearTimeout(emojiSearchTimeout);
      emojiSearchTimeout = setTimeout(() => {
        renderEmojiPicker(e.target.value.trim());
      }, 250);
    });

    renderEmojiPicker();
  }

  function renderEmojiPicker(searchTerm = '') {
    const emojiGridEl = document.getElementById('emojiGrid');
    emojiGridEl.innerHTML = '';

    if (emojiMode === 'Emoji') {
      const filtered = getEmojiDataForGroup(activeEmojiGroup, searchTerm);
      filtered.slice(0, 200).forEach(({ char, name }) => {
        const emojiItem = document.createElement('div');
        emojiItem.className = 'emoji-item';
        emojiItem.textContent = char;
        emojiItem.title = name;
        emojiItem.addEventListener('click', () => {
          chatInput.value += char;
          chatInput.focus();
          autoResizeTextarea();
        });
        emojiGridEl.appendChild(emojiItem);
      });
    } else {
      giphyCurrentQuery = searchTerm;
      giphyOffset = 0;
      emojiGridEl.innerHTML = '<div class="emoji-loading">Loading...</div>';
      removeEmojiLoadMoreButton();
      fetchGiphyContent(searchTerm, emojiMode, 0).then(({ items, nextOffset }) => {
        giphyOffset = nextOffset;
        emojiGridEl.innerHTML = '';
        if (!items.length) {
          emojiGridEl.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);">No results found. Try another search.</div>';
          return;
        }
        items.forEach(({ url }) => {
          const item = document.createElement('div');
          item.className = 'emoji-item media-item';
          const img = document.createElement('img');
          img.src = url;
          img.alt = emojiMode === 'GIF' ? 'GIF' : 'Sticker';
          img.loading = 'lazy';
          item.appendChild(img);
          item.addEventListener('click', () => {
            if (emojiMode === 'GIF') {
              sendGifMessage(url, 'image');
            } else {
              sendStickerMessage(url, 'image');
            }
          });
          emojiGridEl.appendChild(item);
        });
        if (giphyOffset !== null) {
          createEmojiLoadMoreButton();
        }
      }).catch((error) => {
        console.error('Giphy fetch failed:', error);
        emojiGridEl.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);">Unable to load GIFs or stickers.</div>';
      });
    }
  }

  function getEmojiDataForGroup(group, searchTerm) {
    if (emojiData && emojiData.length > 0) {
      const matches = emojiData.filter(item => item.group === group);
      if (!searchTerm) return matches;
      const query = searchTerm.toLowerCase();
      return matches.filter(item => item.name.toLowerCase().includes(query) || item.char === searchTerm);
    }
    return [];
  }

  function createEmojiLoadMoreButton() {
    let loadMore = document.getElementById('emojiLoadMoreButton');
    if (!loadMore) {
      loadMore = document.createElement('button');
      loadMore.id = 'emojiLoadMoreButton';
      loadMore.className = 'emoji-load-more';
      loadMore.textContent = 'Load more';
      loadMore.addEventListener('click', loadMoreGiphyResults);
      document.getElementById('emojiGrid').after(loadMore);
    }
  }

  function removeEmojiLoadMoreButton() {
    const loadMore = document.getElementById('emojiLoadMoreButton');
    if (loadMore) {
      loadMore.remove();
    }
  }

  async function loadMoreGiphyResults() {
    if (giphyOffset === null || giphyIsLoading) return;
    giphyIsLoading = true;
    const emojiGridEl = document.getElementById('emojiGrid');
    const loadMore = document.getElementById('emojiLoadMoreButton');
    if (loadMore) {
      loadMore.textContent = 'Loading...';
    }

    try {
      const { items, nextOffset } = await fetchGiphyContent(giphyCurrentQuery, emojiMode, giphyOffset);
      giphyOffset = nextOffset;
      items.forEach(({ url }) => {
        const item = document.createElement('div');
        item.className = 'emoji-item media-item';
        const img = document.createElement('img');
        img.src = url;
        img.alt = emojiMode === 'GIF' ? 'GIF' : 'Sticker';
        img.loading = 'lazy';
        item.appendChild(img);
        item.addEventListener('click', () => {
          if (emojiMode === 'GIF') {
            sendGifMessage(url, 'image');
          } else {
            sendStickerMessage(url, 'image');
          }
        });
        emojiGridEl.appendChild(item);
      });
      if (giphyOffset === null) {
        removeEmojiLoadMoreButton();
      }
    } catch (error) {
      console.error('Failed to load more Giphy results:', error);
    } finally {
      giphyIsLoading = false;
      if (loadMore) {
        loadMore.textContent = giphyOffset !== null ? 'Load more' : 'No more results';
      }
    }
  }

  function showEmojiCategory(group) {
    activeEmojiGroup = group;
    document.querySelectorAll('.emoji-category').forEach((btn) => {
      btn.classList.toggle('active', btn.title === group);
    });
    giphyCurrentQuery = '';
    giphyOffset = 0;
    renderEmojiPicker(document.getElementById('emojiSearchInput').value.trim());
  }

  async function fetchGiphyContent(query, mode, offset = 0) {
    const apiKey = 'vOZ9DUETgO57IEWcNxTNjpDVMrZC4G4I';
    const isGifMode = mode === 'GIF';
    const hasQuery = query && query.trim().length > 0;
    const baseUrl = isGifMode ? 'https://api.giphy.com/v1/gifs' : 'https://api.giphy.com/v1/stickers';
    const endpoint = hasQuery ? 'search' : 'trending';
    let url = `${baseUrl}/${endpoint}?api_key=${apiKey}&limit=24&offset=${offset}&rating=pg-13`;
    if (hasQuery) {
      url += `&q=${encodeURIComponent(query.trim())}&lang=en`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Giphy API error: ${response.status}`);
    }
    const data = await response.json();
    const results = Array.isArray(data.data) ? data.data : [];
    const pagination = data.pagination || {};
    const nextOffset = typeof pagination.total_count === 'number' && typeof pagination.count === 'number'
      ? offset + pagination.count
      : null;
    const hasMore = typeof pagination.total_count === 'number'
      ? nextOffset < pagination.total_count
      : results.length === 24;

    const items = results.map(item => {
      const images = item.images || {};
      const urlToUse = images.fixed_width?.url
        || images.fixed_width_downsampled?.url
        || images.downsized_medium?.url
        || images.downsized?.url
        || images.original?.url
        || images.preview_gif?.url;
      if (!urlToUse) return null;
      return { url: urlToUse, type: 'image' };
    }).filter(entry => entry && entry.url);

    return { items, nextOffset: hasMore ? nextOffset : null };
  }

  function sendGifMessage(url, type = 'image') {
    const timestamp = Date.now();
    const message = {
      id: `msg_${timestamp}_${userId}`,
      name: username,
      userId,
      text: '',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp,
      channel: userChannel,
      mediaType: 'image',
      mediaUrl: url,
      replyTo: replyToMessage ? {
        id: replyToMessage.id,
        sender: replyToMessage.name,
        text: replyToMessage.text
      } : null
    };

    db.ref('chat').push(message).then(() => {
      showNotification('GIF sent!');
      if (replyToMessage) {
        hideReplyPreview();
      }
    }).catch(error => {
      console.error('Error sending GIF:', error);
      showNotification('Failed to send GIF.', true);
    });
  }

  function sendStickerMessage(url) {
    const timestamp = Date.now();
    const message = {
      id: `msg_${timestamp}_${userId}`,
      name: username,
      userId,
      text: '',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp,
      channel: userChannel,
      mediaType: 'image',
      mediaUrl: url,
      replyTo: replyToMessage ? {
        id: replyToMessage.id,
        sender: replyToMessage.name,
        text: replyToMessage.text
      } : null
    };

    db.ref('chat').push(message).then(() => {
      showNotification('Sticker sent!');
      if (replyToMessage) {
        hideReplyPreview();
      }
    }).catch(error => {
      console.error('Error sending sticker:', error);
      showNotification('Failed to send sticker.', true);
    });
  }

  // Toggle emoji picker
  emojiBtn.addEventListener('click', () => {
    emojiPicker.classList.toggle('show');
  });

  closeEmojiBtn.addEventListener('click', () => {
    emojiPicker.classList.remove('show');
  });

  document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
      emojiPicker.classList.remove('show');
    }
  });

  // Voice recording handlers
  voiceBtn.addEventListener('mousedown', () => {
    startVoiceRecording();
  });
  
  voiceBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startVoiceRecording();
  });
  
  document.addEventListener('mouseup', () => {
    if (isRecording) {
      stopVoiceRecording();
    }
  });
  
  document.addEventListener('touchend', () => {
    if (isRecording) {
      stopVoiceRecording();
    }
  });
  
  cancelRecordingBtn.addEventListener('click', cancelVoiceRecording);
  
  const sendRecordingBtn = document.getElementById('sendRecording');
  sendRecordingBtn.addEventListener('click', sendVoiceRecording);

  // Typing indicator
  function updateTypingStatus(isUserTyping) {
    if (isUserTyping !== isTyping) {
      isTyping = isUserTyping;
      db.ref(`typing/${userId}_${userChannel}`).set(isTyping ? username : null);
    }
  }

  chatInput.addEventListener('input', () => {
    updateTypingStatus(true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      updateTypingStatus(false);
    }, 1500);
  });

  // Listen for reactions changes in real-time
  db.ref('reactions').on('value', (snapshot) => {
    const allReactions = snapshot.val() || {};
    Object.keys(allReactions).forEach(messageKey => {
      const messageDiv = document.querySelector(`[data-key="${messageKey}"]`);
      if (messageDiv) {
        displayMessageReactions(messageKey);
      }
    });
  });

  // Listen for other users typing in the same channel
  db.ref('typing').on('value', (snapshot) => {
    const typingData = snapshot.val() || {};
    const typingUsers = [];
    
    Object.keys(typingData).forEach(key => {
      if (key.includes(`_${userChannel}`) && typingData[key] && typingData[key] !== username) {
        typingUsers.push(typingData[key]);
      }
    });
    
    if (typingUsers.length > 0) {
      typingUserSpan.textContent = `${typingUsers[0]}${typingUsers.length > 1 ? ` and ${typingUsers.length - 1} others` : ''}`;
      typingIndicator.style.display = 'flex';
    } else {
      typingIndicator.style.display = 'none';
    }
  });

  // User presence (online/offline) with channel support
  function updateUserPresence(isOnline) {
    const userRef = db.ref(`users/${userId}`);
    const userStatusRef = db.ref(`status/${userId}`);
    
    if (isOnline) {
      // Mark user online and preserve existing user data.
      userRef.update({ 
        username: username, 
        lastSeen: null, 
        online: true,
        isAdmin: isAdmin,
        channel: userChannel,
        notifyWhenOffline: false
      });
      
      userStatusRef.set({ 
        username: username, 
        online: true, 
        lastActive: Date.now(),
        isAdmin: isAdmin,
        channel: userChannel
      });
      
      // Setup disconnect handler to mark the user offline and enable one notification on next new message.
      userStatusRef.onDisconnect().set({ 
        username: username, 
        online: false, 
        lastActive: Date.now(),
        isAdmin: isAdmin,
        channel: userChannel
      });
      userRef.onDisconnect().update({
        online: false,
        lastSeen: Date.now(),
        notifyWhenOffline: true
      });
    } else {
      userStatusRef.set({ 
        username: username, 
        online: false, 
        lastActive: Date.now(),
        isAdmin: isAdmin,
        channel: userChannel
      });
      userRef.update({
        online: false,
        lastSeen: Date.now(),
        notifyWhenOffline: true
      });
    }
  }

  // Listen for online users in the same channel
  db.ref('status').on('value', (snapshot) => {
    const users = snapshot.val() || {};
    onlineUsers = {};
    onlineUsersList.innerHTML = '';
    
    // Count users in current channel
    let usersInChannel = 0;
    
    // Add current user first
    const currentUser = {
      username: username,
      online: true,
      userId: userId,
      isAdmin: isAdmin,
      channel: userChannel
    };
    onlineUsers[userId] = currentUser;
    
    // Add current user to the list
    const currentUserLi = document.createElement('li');
    currentUserLi.className = `user-item ${isAdmin ? 'admin' : ''} current-user`;
    
    // Add profile picture for current user
    const currentAvatarDiv = createUserAvatarElement(username, userProfileImage);
    
    const currentInfoDiv = document.createElement('div');
    currentInfoDiv.className = 'user-info';
    currentInfoDiv.innerHTML = `
      <h4>${username} (you)</h4>
      <p>Online now</p>
    `;
    
    currentUserLi.appendChild(currentAvatarDiv);
    currentUserLi.appendChild(currentInfoDiv);
    
    if (isAdmin) {
      const adminBadge = document.createElement('span');
      adminBadge.className = 'admin-badge';
      adminBadge.textContent = 'Admin';
      currentUserLi.appendChild(adminBadge);
    }
    
    onlineUsersList.appendChild(currentUserLi);
    
    // Add other users from the same channel (or all channels for admin)
    Object.keys(users).forEach(async (id) => {
      const user = users[id];
      if (user && user.online && id !== userId) {
        // Show user if: admin OR same channel
        if (isAdmin || user.channel === userChannel) {
          onlineUsers[id] = user;
          
          if (user.channel === userChannel) {
            usersInChannel++;
          }
          
          // Add to online users list
          const li = document.createElement('li');
          li.className = `user-item ${user.isAdmin ? 'admin' : ''}`;
          
          // Load user profile image
          const userProfileImg = await getUserProfileImage(user.username);
          const avatarDiv = createUserAvatarElement(user.username, userProfileImg);
          
          // Hide channel info from normal users
          const statusText = user.online ? 'Online now' : 'Offline';
          
          const infoDiv = document.createElement('div');
          infoDiv.className = 'user-info';
          infoDiv.innerHTML = `
            <h4>${user.username}</h4>
            <p>${statusText}</p>
          `;
          
          li.appendChild(avatarDiv);
          li.appendChild(infoDiv);
          
          if (user.isAdmin) {
            const adminBadge = document.createElement('span');
            adminBadge.className = 'admin-badge';
            adminBadge.textContent = 'Admin';
            li.appendChild(adminBadge);
          }
          
          if (isAdmin && id !== userId) {
            li.classList.add('admin-visible');
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-delete-btn';
            deleteBtn.title = 'Remove User';
            deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
            li.appendChild(deleteBtn);
            
            deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (confirm(`Remove ${user.username} from chat?`)) {
                // Remove all messages from this user
                db.ref('chat').orderByChild('userId').equalTo(id).once('value', (snap) => {
                  const messages = snap.val();
                  if (messages) {
                    Object.keys(messages).forEach(key => {
                      db.ref(`chat/${key}`).remove();
                    });
                  }
                });
                
                // Remove user from status
                db.ref(`status/${id}`).remove();
              }
            });
          }
          
          onlineUsersList.appendChild(li);
        }
      }
    });
    
    // Update online count
    if (userChannel === 'general') {
      onlineCount.textContent = `${Object.keys(onlineUsers).length} online`;
    } else if (userChannel === 'admin') {
      onlineCount.textContent = `${Object.keys(onlineUsers).length} online (Admin)`;
    } else {
      onlineCount.textContent = `${usersInChannel} online`;
    }

    if (isAdmin) {
      loadRecentChats();
    }
  });

  function shouldIncludeRecentChatUser(userData) {
    if (!userData || (!userData.name && !userData.username && !userData.userName && !userData.sender && !userData.user)) return false;
    if (userChannel === 'admin') return true;
    if (userChannel === 'general') {
      return !userData.channel || userData.channel === 'general';
    }
    return userData.channel === userChannel;
  }

  function getRecentChatVisits() {
    try {
      const rawVisits = JSON.parse(localStorage.getItem('recentChatVisits') || '{}');
      const normalizedVisits = {};

      Object.values(rawVisits).forEach((visit) => {
        if (!visit || !visit.name) return;
        const key = getRecentChatKey(visit);
        if (!key) return;

        const normalizedVisit = {
          name: String(visit.name).trim(),
          channel: visit.channel || 'general',
          timestamp: Number(visit.timestamp) || 0,
          userId: visit.userId || null
        };

        const existing = normalizedVisits[key];
        if (!existing || normalizedVisit.timestamp > existing.timestamp) {
          normalizedVisits[key] = normalizedVisit;
        }
      });

      const shouldSave = JSON.stringify(normalizedVisits) !== JSON.stringify(rawVisits);
      if (shouldSave) {
        saveRecentChatVisits(normalizedVisits);
      }

      return normalizedVisits;
    } catch (error) {
      console.error('Error reading recent chat visits:', error);
      return {};
    }
  }

  function saveRecentChatVisits(visits) {
    try {
      localStorage.setItem('recentChatVisits', JSON.stringify(visits));
    } catch (error) {
      console.error('Error saving recent chat visits:', error);
    }
  }

  function cleanRecentChatVisits() {
    const visits = getRecentChatVisits();
    saveRecentChatVisits(visits);
    return visits;
  }

  // `normalizeName` is declared earlier at file top-level to be used by global helpers

  function markRecentChatVisited(user) {
    if (!user || !user.name) return;
    const visits = getRecentChatVisits();
    const channel = user.channel || 'general';
    const key = normalizeRecentChatKey(user);
    if (!key) return;
    visits[key] = {
      name: user.name.trim(),
      channel,
      timestamp: Date.now(),
      userId: user.userId || null
    };
    saveRecentChatVisits(visits);
    loadRecentChats();
  }

  function getRecentChatKey(item) {
    if (!item || !item.name) return null;
    const normalizedName = normalizeName(item.name);
    const userId = item.userId ? String(item.userId).trim() : null;
    return userId ? `id:${userId}` : `name:${normalizedName}`;
  }

  function normalizeRecentChatKey(item) {
    return getRecentChatKey(item);
  }

  function findRecentChatKey(map, item) {
    if (!item || !item.name) return null;
    const normalizedName = normalizeName(item.name);
    const userId = item.userId ? String(item.userId).trim() : null;
    if (userId) return `id:${userId}`;

    for (const [key, value] of map.entries()) {
      if (value && value.name && normalizeName(value.name) === normalizedName) {
        return key;
      }
    }

    return `name:${normalizedName}`;
  }

  function addRecentChatEntryToMap(map, item) {
    if (!item || !item.name) return;
    const key = findRecentChatKey(map, item);
    if (!key) return;
    const timestamp = Number(item.timestamp) || 0;
    const entry = {
      name: String(item.name).trim(),
      channel: item.channel || 'general',
      timestamp,
      userId: item.userId || null
    };
    const existing = map.get(key);

    if (!existing || timestamp > Number(existing.timestamp || 0)) {
      map.set(key, {
        ...entry,
        userId: entry.userId || existing?.userId || null
      });
    }
  }

  function buildRecentChatUsers(messages, visits) {
    const recentChatMap = new Map();

    function extractName(item) {
      if (!item) return null;
      return item.name || item.username || item.userName || item.sender || item.user || null;
    }

    Object.values(messages || {}).forEach((msg) => {
      const name = extractName(msg);
      if (!msg || !name) return;
      // Normalize to expected shape for other helpers
      const shaped = { ...msg, name };
      if (!shouldIncludeRecentChatUser(shaped)) return;
      addRecentChatEntryToMap(recentChatMap, shaped);
    });

    Object.values(visits || {}).forEach((visit) => {
      const name = extractName(visit);
      if (!visit || !name) return;
      const shaped = { ...visit, name };
      if (!shouldIncludeRecentChatUser(shaped)) return;
      addRecentChatEntryToMap(recentChatMap, shaped);
    });

    return Object.fromEntries(recentChatMap.entries());
  }

// Load recent chats from the same channel
function loadRecentChats() {
  const visits = getRecentChatVisits();

  const query = db.ref('chat').orderByChild('timestamp').limitToLast(1000);

  query.once('value', (snapshot) => {
    const allMessages = snapshot.val() || {};
    const filteredMessages = {};

    Object.entries(allMessages).forEach(([key, msg]) => {
      if (!msg) return;
      if (userChannel === 'general') {
        if (msg.channel && msg.channel !== 'general') return;
      } else if (userChannel === 'admin') {
        // Admin sees everything
      } else {
        if (msg.channel !== userChannel) return;
      }
      filteredMessages[key] = msg;
    });

    recentChatUsers = buildRecentChatUsers(filteredMessages, visits);
    populateRecentChatsList();
  });
}

async function populateRecentChatsList() {
  if (!recentChatsList) return;
  recentChatsList.innerHTML = '';

  const uniqueChats = new Map();
  Object.values(recentChatUsers).forEach((user) => {
    if (!user || !user.name) return;
    const key = getRecentChatKey(user);
    if (!key) return;
    const existing = uniqueChats.get(key);
    const timestamp = Number(user.timestamp) || 0;
    if (!existing || timestamp > Number(existing.timestamp || 0)) {
      uniqueChats.set(key, {
        name: user.name.trim(),
        channel: user.channel || 'general',
        timestamp,
        userId: user.userId || existing?.userId || null
      });
    }
  });

  if (isAdmin) {
    Object.values(onlineUsers).forEach((onlineUser) => {
      const key = getRecentChatKey(onlineUser);
      if (!key) return;
      if (!uniqueChats.has(key)) {
        uniqueChats.set(key, {
          name: onlineUser.name || onlineUser.username || onlineUser.userName || onlineUser.sender || onlineUser.user || 'Unknown',
          channel: onlineUser.channel || 'general',
          timestamp: Date.now(),
          userId: onlineUser.userId || null
        });
      }
    });
  }

  const sortedUsers = Array.from(uniqueChats.values()).sort((a, b) => {
    const timeA = a.timestamp || 0;
    const timeB = b.timestamp || 0;
    return timeB - timeA; // Descending order (most recent first)
  });

  if (sortedUsers.length === 0) {
    if (isAdmin && Object.keys(onlineUsers).length > 0) {
      for (const onlineUser of Object.values(onlineUsers)) {
        const displayName = onlineUser.name || onlineUser.username || onlineUser.userName || onlineUser.sender || onlineUser.user || 'Unknown';
        const li = document.createElement('li');
        li.className = 'user-item';

        const userProfileImg = await getUserProfileImage(displayName);
        const avatarDiv = createUserAvatarElement(displayName, userProfileImg);

        const lastOnlineText = onlineUser.online ? 'Online now' : 'Last active';
        const infoDiv = document.createElement('div');
        infoDiv.className = 'user-info';
        infoDiv.innerHTML = `
          <h4>${displayName}</h4>
          <p>${lastOnlineText}</p>
        `;

        li.appendChild(avatarDiv);
        li.appendChild(infoDiv);
        li.addEventListener('click', () => {
          markRecentChatVisited({
            name: displayName,
            channel: onlineUser.channel || 'general',
            userId: onlineUser.userId || null
          });
        });

        if (isAdmin) {
          li.classList.add('admin-visible');
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'admin-delete-btn';
          deleteBtn.title = 'Delete User Chat';
          deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
          li.appendChild(deleteBtn);

          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete all messages from ${displayName}?`)) {
              if (onlineUser.userId) {
                db.ref('chat').orderByChild('userId').equalTo(onlineUser.userId).once('value', (snap) => {
                  const messages = snap.val();
                  if (messages) {
                    Object.keys(messages).forEach((key) => {
                      db.ref(`chat/${key}`).remove();
                    });
                  }
                });
              }
            }
          });
        }

        recentChatsList.appendChild(li);
      }
      return;
    }

    const emptyMessage = document.createElement('li');
    emptyMessage.className = 'user-item empty';
    emptyMessage.textContent = 'No recent chats yet.';
    recentChatsList.appendChild(emptyMessage);
    return;
  }

  for (const user of sortedUsers) {
    const displayName = user.name || user.username || user.userName || user.sender || user.user || 'Unknown';
    const li = document.createElement('li');
    li.className = 'user-item';

    const userProfileImg = await getUserProfileImage(displayName);
    const avatarDiv = createUserAvatarElement(displayName, userProfileImg);

    let lastOnlineText = 'Recently';
    if (user.timestamp) {
      const timeDiff = Date.now() - user.timestamp;
      const minutes = Math.floor(timeDiff / 60000);
      const hours = Math.floor(timeDiff / 3600000);
      const days = Math.floor(timeDiff / 86400000);

      if (minutes < 1) lastOnlineText = 'Just now';
      else if (minutes < 60) lastOnlineText = `${minutes}m ago`;
      else if (hours < 24) lastOnlineText = `${hours}h ago`;
      else if (days < 7) lastOnlineText = `${days}d ago`;
      else lastOnlineText = new Date(user.timestamp).toLocaleDateString();
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'user-info';
    infoDiv.innerHTML = `
      <h4>${displayName}</h4>
      <p>Last online: ${lastOnlineText}</p>
    `;

    li.appendChild(avatarDiv);
    li.appendChild(infoDiv);

    // Summon button (send notification to user's devices)
    const summonBtn = document.createElement('button');
    summonBtn.className = 'summon-btn';
    summonBtn.title = 'Summon user (send notification)';
    summonBtn.innerHTML = '<i class="fas fa-bell"></i>';
    summonBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
          await fetch(`${PUSH_SERVER_URL}/summon-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: displayName, channel: user.channel || 'general' })
          });
        showNotification('Summon sent');
      } catch (err) {
        console.error('Summon failed', err);
        showNotification('Summon failed', true);
      }
    });
    li.appendChild(summonBtn);

    li.addEventListener('click', () => {
      markRecentChatVisited(user);
    });

    if (isAdmin) {
      li.classList.add('admin-visible');
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'admin-delete-btn';
      deleteBtn.title = 'Delete User Chat';
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      li.appendChild(deleteBtn);

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete all messages from ${user.name}?`)) {
          db.ref('chat').orderByChild('userId').equalTo(user.userId).once('value', (snap) => {
            const messages = snap.val();
            if (messages) {
              Object.keys(messages).forEach((key) => {
                db.ref(`chat/${key}`).remove();
              });
            }
          });
        }
      });
    }

    recentChatsList.appendChild(li);
  }
}

// Load channels list for admin only
  function loadChannelsList() {
    if (!isAdmin) return;
    
    // Show channels section for admin
    channelsSection.style.display = 'block';
    adminChannelControls.style.display = 'block';
    document.querySelector('.channel-list').style.display = 'block';
    
    // Get all users to see what channels exist
    db.ref('status').once('value', (snapshot) => {
      const users = snapshot.val() || {};
      const channels = {};
      
      // Count users per channel
      Object.values(users).forEach(user => {
        if (user && user.channel) {
          if (!channels[user.channel]) {
            channels[user.channel] = 0;
          }
          if (user.online) {
            channels[user.channel]++;
          }
        }
      });
      
      // Also check messages to find existing channels
      db.ref('chat').once('value', (snapshot) => {
        const messages = snapshot.val() || {};
        Object.values(messages).forEach(msg => {
          if (msg && msg.channel && msg.channel !== 'general' && msg.channel !== 'admin') {
            if (!channels[msg.channel]) {
              channels[msg.channel] = 0;
            }
          }
        });
        
        // Populate channels list
        channelsList.innerHTML = '';
        
        // Add general channel
        const generalLi = document.createElement('li');
        generalLi.className = `channel-item ${userChannel === 'general' ? 'active' : ''}`;
        generalLi.innerHTML = `
          <span>General Chat</span>
          <span class="channel-user-count">${channels['general'] || 0} users</span>
        `;
        generalLi.addEventListener('click', () => {
          if (userChannel !== 'general') {
            if (confirm('Switch to General Chat?')) {
              userChannel = 'general';
              localStorage.setItem('user_channel', 'general');
              markPageReload();
              window.location.reload();
            }
          }
        });
        channelsList.appendChild(generalLi);
        
        // Add private channels
        Object.keys(channels).forEach(channel => {
          if (channel !== 'general' && channel !== 'admin' && channel) {
            const channelLi = document.createElement('li');
            channelLi.className = `channel-item ${userChannel === channel ? 'active' : ''}`;
            channelLi.innerHTML = `
              <span>Channel CH-${channel}</span>
              <span class="channel-user-count">${channels[channel] || 0} users</span>
            `;
            channelLi.addEventListener('click', () => {
              if (userChannel !== channel) {
                if (confirm(`Switch to Channel CH-${channel}?`)) {
                  userChannel = channel;
                  localStorage.setItem('user_channel', channel);
                  markPageReload();
                  window.location.reload();
                }
              }
            });
            channelsList.appendChild(channelLi);
          }
        });
        
        // Add admin channel option always for admins
        const adminLi = document.createElement('li');
        adminLi.className = `channel-item ${userChannel === 'admin' ? 'active' : ''}`;
        adminLi.innerHTML = `
          <span>Admin Panel</span>
          <span class="channel-user-count">${channels['admin'] || 0} users</span>
        `;
        adminLi.addEventListener('click', () => {
          if (userChannel !== 'admin') {
            if (confirm('Switch to Admin Panel?')) {
              userChannel = 'admin';
              localStorage.setItem('user_channel', 'admin');
              markPageReload();
              window.location.reload();
            }
          }
        });
        channelsList.appendChild(adminLi);
      });
    });
  }

  // Join channel as admin
  joinChannelBtn.addEventListener('click', () => {
    const channelCode = joinChannelInput.value.trim();
    if (channelCode && /^\d{3}$/.test(channelCode)) {
      if (confirm(`Join Channel CH-${channelCode}?`)) {
        userChannel = channelCode;
        localStorage.setItem('user_channel', channelCode);
        markPageReload();
        window.location.reload();
      }
    } else {
      showNotification('Please enter a valid 3-digit channel code (e.g., 100)', true);
    }
  });

  // Send message
  async function sendMessage() {
    if (isSending) return;
    isSending = true;
    
    let text = chatInput.value.trim();
    
    // Handle /clear chat command
    if (text === '/clear chat') {
      clearChatModal.style.display = 'flex';
      chatInput.value = '';
      autoResizeTextarea();
      isSending = false;
      return;
    }
    
    // Admin command to clear all channels
    if (text === '/clear all channels' && isAdmin) {
      clearChatModal.style.display = 'flex';
      document.querySelector('#clearChatModal .modal-header').textContent = 'Clear All Channels';
      document.querySelector('#clearChatModal .modal-body p').textContent = 'Are you sure you want to clear ALL messages from ALL channels? This action cannot be undone.';
      chatInput.value = '';
      autoResizeTextarea();
      isSending = false;
      return;
    }
    
    if (!text) {
      isSending = false;
      return;
    }
    
    const timestamp = Date.now();
    
    const message = {
      id: `msg_${timestamp}_${userId}`,
      name: username,
      userId: userId,
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: timestamp,
      edited: false,
      channel: userChannel,
      replyTo: replyToMessage ? {
        id: replyToMessage.id,
        sender: replyToMessage.name,
        text: replyToMessage.text
      } : null
    };
    
    // Add link preview if available
    if (linkPreviewData) {
      message.linkPreview = linkPreviewData;
    }
    
    db.ref('chat').push(message)
      .then(() => {
        chatInput.value = '';
        replyToMessage = null;
        hideReplyPreview();
        linkPreviewData = null;
        linkPreviewInput.classList.remove('show');
        autoResizeTextarea();
        updateTypingStatus(false);
        
        // Scroll to bottom
        setTimeout(() => {
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, 100);
        
        isSending = false;
      })
      .catch(error => {
        console.error("Error sending message:", error);
        showNotification("Failed to send message. Please try again.", true);
        isSending = false;
      });
  }

  // Remove previous message listener if exists to prevent duplicates
  if (messageListener) {
    messageListener.off();
  }

  // Listen for new messages in the current channel
  // For general chat, we need to show all messages (including those without channel field)
  // For private channels, only show messages with matching channel
  let query;
  if (userChannel === 'general') {
    // For general chat, preserve Firebase storage order and filter client-side
    query = db.ref('chat').orderByKey().limitToLast(1000);
  } else if (userChannel === 'admin') {
    // Admin in admin panel can see all messages in Firebase storage order
    query = db.ref('chat').orderByKey().limitToLast(1000);
  } else {
    // For private channels, use Firebase storage order and filter client-side
    query = db.ref('chat').orderByKey().limitToLast(1000);
  }
  
  messageListener = query;
  
  // Scroll to bottom after initial messages load
  let initialLoadComplete = false;
  let expectedInitialMessages = 0;
  let initialMessagesAdded = 0;
  let recentChatsRefreshTimer = null;

  function setMenuOpenState(enabled) {
    if (enabled) {
      document.body.classList.add('menu-open');
    } else {
      document.body.classList.remove('menu-open');
    }
  }

  function hideScrollToBottomButton() {
    if (!scrollToBottomBtn) return;
    scrollToBottomBtn.classList.remove('show');
    scrollToBottomBtn.classList.add('hidden');
  }

  function closeOpenMenus() {
    if (menuOverlay) {
      menuOverlay.style.display = 'none';
    }
    if (menuContainer) {
      menuContainer.classList.remove('show');
      menuContainer.style.display = 'none';
    }
    if (exportMenuContainer) {
      exportMenuContainer.classList.remove('show');
      exportMenuContainer.style.display = 'none';
    }
    setMenuOpenState(false);
    hideScrollToBottomButton();
  }

  function scrollMessagesToBottom() {
    closeOpenMenus();
    if (scrollToBottomBtn) {
      hideScrollToBottomButton();
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (messagesDiv) {
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
      });
    });
  }

  function updateScrollToBottomButton() {
    if (!messagesDiv || !scrollToBottomBtn) return;
    if ((menuOverlay && menuOverlay.style.display === 'block') ||
        (menuContainer && menuContainer.classList.contains('show')) ||
        (exportMenuContainer && exportMenuContainer.classList.contains('show'))) {
      closeOpenMenus();
      hideScrollToBottomButton();
      return;
    }
    const nearBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight <= 10;
    isAtBottom = nearBottom;
    if (!nearBottom) {
      scrollToBottomBtn.classList.add('show');
      scrollToBottomBtn.classList.remove('hidden');
    } else {
      hideScrollToBottomButton();
    }
  }

  function scheduleRecentChatsReload() {
    if (recentChatsRefreshTimer) {
      clearTimeout(recentChatsRefreshTimer);
    }
    recentChatsRefreshTimer = setTimeout(() => {
      loadRecentChats();
      recentChatsRefreshTimer = null;
    }, 100);
  }

  query.once('value', (snapshot) => {
    if (!initialLoadComplete) {
      const allMessages = snapshot.val() || {};
      expectedInitialMessages = Object.values(allMessages).filter((m) => {
        if (userChannel === 'general') {
          return !m.channel || m.channel === 'general';
        }
        if (userChannel === 'admin') {
          return true;
        }
        return m.channel === userChannel;
      }).length;

      if (expectedInitialMessages === 0) {
        initialLoadComplete = true;
        lastDateSeparator = '';
        scrollMessagesToBottom();
        loadRecentChats();
      }
    }
  });
  
  messageListener.on('child_added', async (snapshot, prevChildKey) => {
    const msg = snapshot.val();
    const key = snapshot.key;
    
    if (!msg) return;
    
    // Handle message filtering based on channel
    if (userChannel === 'general') {
      // For general chat, show messages without channel or with channel='general'
      if (msg.channel && msg.channel !== 'general') {
        return; // Skip messages from private channels
      }
    } else if (userChannel === 'admin') {
      // Admin sees all messages
    } else {
      // For private channels, only show messages from the same channel
      if (msg.channel !== userChannel) {
        return;
      }
    }
    
    // Check if message already exists
    if (document.querySelector(`[data-id="${msg.id}"]`)) return;
    
    const isOwnMessage = normalizeName(msg.name) === normalizeName(username);
    const canEditDelete = isOwnMessage || isAdmin;

    const previousMessage = Array.from(messagesDiv.querySelectorAll('.message')).reverse().find((el) => {
      return el.classList.contains('message') && !el.classList.contains('welcome');
    });
    const previousSender = previousMessage?.dataset.sender || previousMessage?.querySelector('.message__sender')?.textContent;
    const previousType = previousMessage?.dataset.type || (previousMessage?.classList.contains('sent') ? 'sent' : previousMessage?.classList.contains('received') ? 'received' : null);
    const sameSenderAsPrev = previousSender && normalizeName(previousSender) === normalizeName(msg.name) && previousType === (isOwnMessage ? 'sent' : 'received');
    const showAvatar = !sameSenderAsPrev && !isOwnMessage;

      const profileImage = msg.name === username && userProfileImage
      ? userProfileImage
      : await getUserProfileImage(msg.name);

    const renderedTime = msg.timestamp
      ? formatMessageTime(msg.timestamp)
      : msg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwnMessage ? 'sent' : 'received'} ${showAvatar ? 'message--first-in-group' : 'message--continued'}`;
    messageDiv.dataset.id = msg.id;
    messageDiv.dataset.key = key;
    messageDiv.dataset.sender = msg.name;
    messageDiv.dataset.type = isOwnMessage ? 'sent' : 'received';
    messageDiv.dataset.profileImage = profileImage || '';
    
    // Add channel indicator for admin viewing all channels
    const channelIndicator = isAdmin && userChannel === 'admin' && msg.channel && msg.channel !== 'general' ? 
      `<div style="font-size: 10px; opacity: 0.7; margin-bottom: 2px;">CH-${msg.channel}</div>` : '';
    
    const editedText = msg.edited ? ' (edited)' : '';
    
    let replyHtml = '';
    if (msg.replyTo) {
      replyHtml = `
        <div class="reply-indicator" onclick="scrollToMessage('${msg.replyTo.id}')">
          <div class="reply-sender">↩ ${escapeHTML(msg.replyTo.sender)}</div>
          <div class="reply-text"></div>
        </div>
      `;
      // Will be set after innerHTML to safely handle the reply text
    }
    
    // Handle link preview
    let linkPreviewHtml = '';
    if (msg.linkPreview) {
      linkPreviewHtml = createLinkPreviewHTML(msg.linkPreview);
    }
    
    // Handle voice messages
    let voiceHtml = '';
    if (msg.voiceMessage) {
      voiceHtml = createVoiceMessage(msg.voiceMessage.url, msg.voiceMessage.duration);
    }
    
    // UPDATED: File message HTML with proper download handling
    let fileHtml = '';
    if (msg.fileData) {
      const fileData = msg.fileData;
      const escapedFileName = escapeHTML(fileData.name);
      fileHtml = `
        <div class="file-message" data-file-url="${escapeHTML(fileData.url)}" data-file-name="${escapedFileName}">
          <div class="file-icon">
            <i class="${getFileIcon(fileData.name)}"></i>
          </div>
          <div class="file-info">
            <div class="file-name"></div>
            <div class="file-size">${formatFileSize(fileData.size)}</div>
          </div>
          <button class="download-btn" title="Download" onclick="(function(url, name){ if (/\.pdf$/i.test(name)) { downloadPdf(url, name); } else { downloadFile(url, name); } })('${escapeHTML(fileData.url)}', '${escapedFileName}'); event.stopPropagation();">
            <i class="fas fa-download"></i>
          </button>
        </div>
      `;
    }
    
    // Handle media messages with download functionality
    let mediaHtml = '';
    if (msg.mediaType === 'image') {
      mediaHtml = `
        <div class="media-message" data-media-url="${escapeHTML(msg.mediaUrl)}" data-media-type="image" data-file-name="image_${msg.timestamp}.jpg">
          <img src="${escapeHTML(msg.mediaUrl)}" alt="Image" loading="lazy">
          <div class="media-play-btn" style="display: none;">
            <i class="fas fa-play"></i>
          </div>
          <div class="media-duration" style="display: none;">0:00</div>
        </div>
      `;
    } else if (msg.mediaType === 'video') {
      // Guess extension from URL for proper download filename and type checks
      const extMatch = String(msg.mediaUrl || '').match(/\.([a-z0-9]+)(?:\?|$)/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';
      const previewUrl = getPlayableVideoUrl(msg.mediaUrl);
      mediaHtml = `
        <div class="media-message" data-media-url="${escapeHTML(msg.mediaUrl)}" data-media-type="video" data-file-name="video_${msg.timestamp}.${ext}">
          <video controls muted playsinline preload="metadata" src="${escapeHTML(previewUrl)}"></video>
          <div class="media-play-btn">
            <i class="fas fa-play"></i>
          </div>
        </div>
      `;
    } else if (msg.mediaType === 'audio') {
      mediaHtml = `
        <div class="media-message" data-media-url="${escapeHTML(msg.mediaUrl)}" data-media-type="audio" data-file-name="audio_${msg.timestamp}.mp3">
          <audio controls preload="metadata">
            <source src="${escapeHTML(msg.mediaUrl)}" type="audio/mpeg">
          </audio>
        </div>
      `;
    }
    
    // Always show react, reply and copy buttons for all messages
    let messageActionsHTML = `
      <button class="message-action react-btn" title="React">
        <i class="fas fa-smile"></i>
      </button>
      <button class="message-action copy-btn" title="Copy Message">
        <i class="fas fa-copy"></i>
      </button>
      <button class="message-action reply-btn" title="Reply">
        <i class="fas fa-reply"></i>
      </button>
    `;
    if (isOwnMessage) {
      messageActionsHTML += `
        <button class="message-action seen-by-btn" title="Seen by">
          <i class="fas fa-eye"></i>
        </button>
      `;
    }
    
    // Show edit/delete buttons based on permissions
    if (canEditDelete) {
      messageActionsHTML += `
        <button class="message-action edit-btn" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="message-action delete-btn" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      `;
    } else if (isAdmin) {
      // Admin can delete any message
      messageActionsHTML += `
        <button class="message-action delete-btn" title="Delete (Admin)">
          <i class="fas fa-trash"></i>
        </button>
      `;
    }
    
    messageDiv.innerHTML = `
      ${channelIndicator}
      ${replyHtml}
      <div class="message__header">
        <div class="message__avatar-wrapper"></div>
        <div class="message__meta">
          <span class="message__sender">${escapeHTML(msg.name)}</span>
        </div>
      </div>
      <div class="message__content"></div>
      <span class="message__time">${renderedTime}</span>
      ${linkPreviewHtml}
      ${voiceHtml}
      ${fileHtml}
      ${mediaHtml}
      <div class="message__actions">
        ${messageActionsHTML}
      </div>
      <div class="message__reactions"></div>
    `;

    const avatarWrapper = messageDiv.querySelector('.message__avatar-wrapper');
    if (avatarWrapper) {
      avatarWrapper.innerHTML = '';
      if (showAvatar && !isOwnMessage) {
        const avatarElement = createUserAvatarElement(msg.name, profileImage);
        avatarElement.classList.add('message__avatar', 'clickable-profile');
        avatarElement.dataset.username = msg.name;
        avatarElement.dataset.profileImage = profileImage || '';
        avatarWrapper.appendChild(avatarElement);
        avatarWrapper.style.display = 'flex';
      } else {
        avatarWrapper.style.display = 'none';
      }
    }
    
    // Set message content safely using textContent to prevent HTML injection
    const contentDiv = messageDiv.querySelector('.message__content');
    const messageText = msg.text || '';
    contentDiv.textContent = messageText + editedText;
    
    // Set reply text safely if it exists
    if (msg.replyTo) {
      const replyTextDiv = messageDiv.querySelector('.reply-text');
      if (replyTextDiv) {
        replyTextDiv.textContent = msg.replyTo.text;
      }
    }
    
    // Set file name safely
    if (msg.fileData) {
      const fileNameDiv = messageDiv.querySelector('.file-name');
      if (fileNameDiv) {
        fileNameDiv.textContent = msg.fileData.name;
      }
    }
    
    insertMessageByFirebaseOrder(messageDiv, msg, prevChildKey);
    if (!isOwnMessage) {
      markMessageAsSeen(key, msg.name);
    }

    if (!initialLoadComplete) {
      const shouldCount = userChannel === 'admin' || userChannel === 'general' ? (!msg.channel || msg.channel === 'general') : msg.channel === userChannel;
      if (shouldCount) {
        initialMessagesAdded += 1;
      }
      scrollMessagesToBottom();
      if (initialMessagesAdded >= expectedInitialMessages && expectedInitialMessages > 0) {
        initialLoadComplete = true;
        setTimeout(() => {
          scrollMessagesToBottom();
          loadRecentChats();
          setTimeout(scrollMessagesToBottom, 80);
        }, 60);
      }
    }
    
    // Store message reference
    currentMessages[key] = messageDiv;
    
    // Attach direct event listeners to action buttons
    const reactBtn = messageDiv.querySelector('.react-btn');
    if (reactBtn) {
      reactBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        messageDiv.classList.add('message-selected');
        showReactionPicker(messageDiv, e);
      });
    }
    
    const copyBtn = messageDiv.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyMessage(messageDiv);
      });
    }
    
    const replyBtn = messageDiv.querySelector('.reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        replyToMessageFunc(key, messageDiv);
      });
    }
    
    const editBtn = messageDiv.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editMessage(key, messageDiv);
      });
    }
    
    const deleteBtn = messageDiv.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteMessage(key);
      });
    }
    
    // Set up media duration for video/audio
    if (msg.mediaType === 'video' || msg.mediaType === 'audio') {
      const mediaElement = messageDiv.querySelector(msg.mediaType === 'video' ? 'video' : 'audio');
      if (mediaElement) {
        mediaElement.src = msg.mediaUrl;
        mediaElement.addEventListener('loadedmetadata', function() {
          const durationElement = messageDiv.querySelector('.media-duration');
          if (durationElement) {
            durationElement.textContent = formatTime(this.duration);
          }
        });
      }
    }
    
    // Scroll to bottom if new message is from current user or if at bottom
    if (isOwnMessage || isAtBottom) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    updateScrollToBottomButton();
    
    // Send one secret notification for new messages in general chat until the page is refreshed
    if (!isOwnMessage && userChannel === 'general' && notificationsEnabled && 'Notification' in window && Notification.permission === 'granted' && !secretNotificationSent) {
      new Notification('Secret Messenger', {
        body: 'Experience a smoother app performance with our latest update. Get it now! 🚀',
        icon: 'bhavishya.jpg',
        tag: 'secret-messenger-update',
        requireInteraction: false
      });
      secretNotificationSent = true;
    }
    
    // Load recent chats when new message arrives
    if (initialLoadComplete) {
      scheduleRecentChatsReload();
    }
  });

  // Listen for message updates (for editing)
  db.ref('chat').on('child_changed', (snapshot) => {
    const msg = snapshot.val();
    const key = snapshot.key;
    
    if (!msg) return;
    
    // Skip if message is not from current channel
    if (userChannel === 'general') {
      // For general chat, show messages without channel or with channel='general'
      if (msg.channel && msg.channel !== 'general') {
        return;
      }
    } else if (userChannel === 'admin') {
      // Admin sees all messages
    } else {
      // For private channels, only show messages from the same channel
      if (msg.channel !== userChannel) {
        return;
      }
    }
    
    const messageDiv = document.querySelector(`[data-key="${key}"]`);
    if (messageDiv) {
      const contentDiv = messageDiv.querySelector('.message__content');
      const editedText = msg.edited ? ' (edited)' : '';
      contentDiv.textContent = msg.text + editedText;
      
      const timeSpan = messageDiv.querySelector('.message__time');
      if (timeSpan) {
        timeSpan.textContent = msg.time;
      }
    }
  });

  // Listen for message deletions
  db.ref('chat').on('child_removed', (snapshot) => {
    const key = snapshot.key;
    const messageDiv = document.querySelector(`[data-key="${key}"]`);
    if (messageDiv) {
      messageDiv.remove();
      delete currentMessages[key];
    }
  });

  // Edit message
  function editMessage(key, messageDiv) {
    const contentDiv = messageDiv.querySelector('.message__content');
    // Remove "(edited)" text if present
    let originalText = contentDiv.textContent;
    if (originalText.includes(' (edited)')) {
      originalText = originalText.replace(' (edited)', '');
    }
    
    const newText = prompt('Edit your message:', originalText.trim());
    if (newText && newText !== originalText.trim()) {
      const updates = {
        text: newText,
        edited: true,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      // Update the message in Firebase
      db.ref(`chat/${key}`).update(updates)
        .then(() => {
          console.log("Message edited successfully");
        })
        .catch(error => {
          console.error("Error editing message:", error);
          showNotification("Failed to edit message. Please try again.", true);
        });
    }
  }

  // Delete message
  function deleteMessage(key) {
    showConfirmation(
      'Delete Message',
      'Are you sure you want to delete this message?',
      () => {
        db.ref(`chat/${key}`).remove()
          .then(() => {
            showNotification('Message deleted successfully');
          })
          .catch(error => {
            showNotification("Failed to delete message. Please try again.", true);
          });
      }
    );
  }

  // Reply to message
  function replyToMessageFunc(key, messageDiv) {
    const sender = messageDiv.querySelector('.message__sender').textContent;
    const content = messageDiv.querySelector('.message__content').textContent;
    
    // Find the original message data
    db.ref(`chat/${key}`).once('value').then((snapshot) => {
      const msg = snapshot.val();
      if (msg) {
        const previewText = msg.text ||
          (msg.mediaType === 'image' ? 'Photo' :
           msg.mediaType === 'video' ? 'Video' :
           msg.mediaType === 'audio' ? 'Audio' :
           msg.fileData ? msg.fileData.name :
           content || 'Replying...');

        replyToMessage = {
          id: msg.id,
          name: msg.name,
          text: previewText
        };
        
        setActiveMessage(messageDiv);
        showReplyPreview(replyToMessage);
        chatInput.focus();
        autoResizeTextarea();
        showNotification(`Replying to ${sender}`);
      }
    });
  }

  function showReplyPreview(message) {
    const replyPreview = document.getElementById('replyPreview');
    const replyPreviewSender = document.getElementById('replyPreviewSender');
    const replyPreviewText = document.getElementById('replyPreviewText');
    if (!replyPreview || !replyPreviewSender || !replyPreviewText) return;

    replyPreviewSender.textContent = message.name || 'Unknown';
    replyPreviewText.textContent = message.text || '';
    replyPreview.style.display = 'flex';
  }

  function hideReplyPreview() {
    const replyPreview = document.getElementById('replyPreview');
    if (replyPreview) {
      replyPreview.style.display = 'none';
    }
    replyToMessage = null;
  }

  function markMessageAsSeen(messageKey, senderName) {
    if (!messageKey || !senderName) return;
    if (seenMessagesMarked.has(messageKey)) return;
    seenMessagesMarked.add(messageKey);
    const seenPath = `chat/${messageKey}/seenBy/${normalizeName(username)}`;
    db.ref(seenPath).set({
      name: username,
      seenAt: Date.now()
    }).catch((err) => {
      console.warn('Failed to mark message as seen:', err);
    });
  }

  function formatSeenTime(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(Number(timestamp));
    return date.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
  }

  async function showSeenByModal(messageKey, messageDiv) {
    if (!messageKey) return;
    try {
      const snapshot = await db.ref(`chat/${messageKey}/seenBy`).once('value');
      const seenData = snapshot.val() || {};
      const entries = Object.values(seenData).filter(item => item && item.name);
      const modalItems = entries.length > 0
        ? entries.map(item => `<div class="seen-by-row"><span>${escapeHTML(item.name)}</span><span>${escapeHTML(formatSeenTime(item.seenAt))}</span></div>`).join('')
        : '<div class="seen-by-empty">No one has seen this yet.</div>';
      showCustomModal('Seen by', `
        <div class="seen-by-list">
          ${modalItems}
        </div>
      `);
    } catch (err) {
      console.error('Failed to load seen-by data', err);
      showNotification('Failed to load seen-by list', true);
    }
  }

  // Generic modal helper matching site theme (uses existing modal styles if present)
  function showCustomModal(title, htmlContent) {
    // Reuse global modal container if exists
    let modal = document.getElementById('customModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'customModal';
      modal.className = 'modal custom-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="customModalTitle"></h3>
            <button id="customModalClose" class="modal-close">×</button>
          </div>
          <div id="customModalBody" class="modal-body"></div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('customModalClose').addEventListener('click', () => {
        modal.style.display = 'none';
      });
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    document.getElementById('customModalTitle').textContent = title || '';
    document.getElementById('customModalBody').innerHTML = htmlContent || '';
    modal.style.display = 'flex';
  }

  // Copy message
  function copyMessage(messageDiv) {
    try {
      const contentDiv = messageDiv.querySelector('.message__content');
      if (!contentDiv) {
        console.error('Content div not found');
        return;
      }
      
      let text = contentDiv.textContent;
      if (!text) {
        console.error('No text content found');
        return;
      }
      
      // Remove "(edited)" text if present
      if (text.includes(' (edited)')) {
        text = text.replace(' (edited)', '');
      }
      
      copyToClipboard(text);
    } catch (error) {
      console.error('Error in copyMessage:', error);
      showNotification('Failed to copy message', true);
    }
  }

  // Message action handlers
  messagesDiv.addEventListener('click', (e) => {
    const actionButton = e.target.closest('.message-action');
    if (actionButton) {
      e.stopPropagation();
      const messageDiv = actionButton.closest('.message');
      if (actionButton.classList.contains('copy-btn')) {
        copyMessage(messageDiv);
      } else if (actionButton.classList.contains('reply-btn')) {
        const key = messageDiv.dataset.key;
        replyToMessageFunc(key, messageDiv);
      } else if (actionButton.classList.contains('seen-by-btn')) {
        const key = messageDiv.dataset.key;
        showSeenByModal(key, messageDiv);
      } else if (actionButton.classList.contains('edit-btn')) {
        const key = messageDiv.dataset.key;
        editMessage(key, messageDiv);
      } else if (actionButton.classList.contains('delete-btn')) {
        const key = messageDiv.dataset.key;
        deleteMessage(key);
      }
      hideSelectedMessageActionsAfterDelay();
      return;
    }

    const messageDiv = e.target.closest('.message');
    if (messageDiv && !e.target.closest('.message-action')) {
      setActiveMessage(messageDiv);
    }
  });

  let messageActionHideTimeout = null;
  function clearSelectedMessage() {
    document.querySelectorAll('.message.active').forEach((msg) => {
      msg.classList.remove('active');
    });
    if (messageActionHideTimeout) {
      clearTimeout(messageActionHideTimeout);
      messageActionHideTimeout = null;
    }
  }

  function setActiveMessage(messageDiv) {
    if (!messageDiv) return;
    clearSelectedMessage();
    messageDiv.classList.add('active');
    hideSelectedMessageActionsAfterDelay();
  }

  function hideSelectedMessageActionsAfterDelay() {
    if (messageActionHideTimeout) {
      clearTimeout(messageActionHideTimeout);
    }
    messageActionHideTimeout = setTimeout(() => {
      clearSelectedMessage();
    }, 2000);
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.message') && !e.target.closest('.message-action')) {
      clearSelectedMessage();
    }
  });

  // Swipe right on a message to trigger reply
  let touchStartX = 0;
  let touchCurrentMessage = null;

  messagesDiv.addEventListener('touchstart', (e) => {
    const targetMessage = e.target.closest('.message');
    if (!targetMessage) return;
    touchStartX = e.touches[0].clientX;
    touchCurrentMessage = targetMessage;
  });

  messagesDiv.addEventListener('touchmove', (e) => {
    if (!touchCurrentMessage) return;
    const diffX = e.touches[0].clientX - touchStartX;
    if (diffX > 60) {
      // Mark as reply intent while swiping
      touchCurrentMessage.classList.add('swipe-reply');
    }
  });

  messagesDiv.addEventListener('touchend', (e) => {
    if (!touchCurrentMessage) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchEndX - touchStartX;
    if (diffX > 80) {
      // Swipe to right detected: trigger reply on this message
      setActiveMessage(touchCurrentMessage);
      const key = touchCurrentMessage.dataset.key;
      replyToMessageFunc(key, touchCurrentMessage);
    }
    touchCurrentMessage.classList.remove('swipe-reply');
    touchCurrentMessage = null;
  });

  // Voice message playback
  messagesDiv.addEventListener('click', (e) => {
    if (e.target.closest('.voice-play-btn')) {
      e.stopPropagation();
      const voiceMessage = e.target.closest('.voice-message');
      const audioUrl = voiceMessage.dataset.audioUrl;
      const playBtn = voiceMessage.querySelector('.voice-play-btn i');
      
      const audio = new Audio(audioUrl);
      
      if (playBtn.classList.contains('fa-play')) {
        playBtn.classList.remove('fa-play');
        playBtn.classList.add('fa-pause');
        audio.play();
        
        audio.onended = () => {
          playBtn.classList.remove('fa-pause');
          playBtn.classList.add('fa-play');
        };
      } else {
        playBtn.classList.remove('fa-pause');
        playBtn.classList.add('fa-play');
        audio.pause();
      }
    }
  });

  // Media viewer with back button - UPDATED
  messagesDiv.addEventListener('click', (e) => {
    // Handle media click
    const avatarEl = e.target.closest('.clickable-profile');
    if (avatarEl) {
      e.stopPropagation();
      const userName = avatarEl.dataset.username;
      const profileImage = avatarEl.dataset.profileImage;
      openProfilePreview(userName, profileImage);
      return;
    }

    const mediaMessage = e.target.closest('.media-message');
    if (mediaMessage) {
      e.stopPropagation();
      const mediaUrl = mediaMessage.dataset.mediaUrl;
      const mediaType = mediaMessage.dataset.mediaType;
      
      openMediaViewer(mediaUrl, mediaType);
    }
    
    // Handle file click
    const fileMessage = e.target.closest('.file-message');
    if (fileMessage && !e.target.closest('.download-btn')) {
      e.stopPropagation();
      const fileUrl = fileMessage.dataset.fileUrl;
      const fileName = fileMessage.dataset.fileName;
      const fileType = fileMessage.dataset.fileType || '';
      
      // For image files, open in media viewer
      if (isImageFile(fileName)) {
        openMediaViewer(fileUrl, 'image');
      } else if (isVideoFile(fileName)) {
        openMediaViewer(fileUrl, 'video');
      } else if (isAudioFile(fileName)) {
        openMediaViewer(fileUrl, 'audio');
      } else if (/\.pdf$/i.test(fileName)) {
        downloadPdf(fileUrl, fileName);
      } else if (/\.(docx?|xlsx?|pptx?|txt|csv)$/i.test(fileName)) {
        downloadFile(fileUrl, fileName);
      } else {
        // For other unsupported files, still download
        downloadFile(fileUrl, fileName);
      }
    }
    
    // Handle link preview click
    const linkPreview = e.target.closest('.link-preview');
    if (linkPreview) {
      e.stopPropagation();
      // Link preview already has onclick handler to open in new tab
    }
  });

  // Open media viewer - UPDATED WITH BACK BUTTON
  function openMediaViewer(url, type) {
    mediaViewerContent.innerHTML = '';
    mediaViewerEditBtn.style.display = 'none';

    if (type === 'image') {
      const mediaElement = document.createElement('img');
      mediaElement.src = url;
      mediaElement.alt = 'Image';
      mediaViewerEditBtn.style.display = 'flex';
      mediaViewerTitle.textContent = 'Image Viewer';
      mediaViewerContent.appendChild(mediaElement);
    } else if (type === 'video') {
      const previewUrl = getPlayableVideoUrl(url);
      const mediaElement = document.createElement('video');
      mediaElement.controls = true;
      mediaElement.playsInline = true;
      mediaElement.preload = 'metadata';
      mediaElement.alt = 'Video';
      mediaViewerEditBtn.style.display = 'flex';
      mediaViewerTitle.textContent = 'Video Viewer';

      const source = document.createElement('source');
      source.src = previewUrl;
      source.type = getVideoMimeType(previewUrl);
      mediaElement.appendChild(source);

      // If MKV or unsupported format, add an alert and fallback link
      if (/\.mkv(?:\?|$)/i.test(previewUrl)) {
        const mkvInfo = document.createElement('div');
        mkvInfo.className = 'mkv-info';
        mkvInfo.style.margin = '12px 0';
        mkvInfo.style.padding = '10px';
        mkvInfo.style.background = 'rgba(255,255,255,0.08)';
        mkvInfo.style.borderRadius = '12px';
        mkvInfo.innerHTML = `
          <p style="margin:0 0 8px;color:var(--text-secondary);">
            MKV playback may not be supported by your browser. The player will try to play it, otherwise use the fallback buttons below.
          </p>
        `;
        mediaViewerContent.appendChild(mkvInfo);
      }

      const fallback = document.createElement('div');
      fallback.className = 'media-fallback';
      fallback.style.display = 'none';
      fallback.innerHTML = `
        <p>Playback may not be supported by your browser.</p>
        <div style="display:flex;gap:8px;">
          <button class="media-download-fallback">Download</button>
          <button class="media-open-tab">Open in new tab</button>
        </div>
      `;
      fallback.querySelector('.media-download-fallback').addEventListener('click', () => {
        const extMatch = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';
        downloadVideo(url, `video_${Date.now()}.${ext}`);
      });
      fallback.querySelector('.media-open-tab').addEventListener('click', () => {
        window.open(url, '_blank');
      });

      const showFallback = () => {
        fallback.style.display = 'block';
        mediaViewerEditBtn.style.display = 'none';
      };

      mediaElement.addEventListener('error', () => {
        console.warn('Video element error, showing fallback for', url);
        showFallback();
      });

      const tryPlayTest = async () => {
        try {
          await mediaElement.play();
          mediaElement.pause();
        } catch (err) {
          showFallback();
        }
      };

      mediaViewerContent.appendChild(mediaElement);
      mediaViewerContent.appendChild(fallback);
      setTimeout(tryPlayTest, 200);
    } else if (type === 'audio') {
      const mediaElement = document.createElement('audio');
      mediaElement.controls = true;
      mediaElement.src = url;
      mediaViewerTitle.textContent = 'Audio Viewer';
      mediaViewerContent.appendChild(mediaElement);
    } else {
      const mediaElement = document.createElement('img');
      mediaElement.src = url;
      mediaElement.alt = 'Media';
      mediaViewerContent.appendChild(mediaElement);
    }

    mediaViewer.style.display = 'flex';

    currentEditingImage = type === 'image' ? url : null;
    currentEditingVideo = type === 'video' ? url : null;
  }

  function openProfilePreview(userName, profileImage) {
    if (!profilePreview) return;
    if (profileImage) {
      profilePreviewAvatar.style.backgroundImage = `url(${profileImage})`;
      profilePreviewAvatar.textContent = '';
    } else {
      profilePreviewAvatar.style.backgroundImage = '';
      profilePreviewAvatar.textContent = (userName || 'U').charAt(0).toUpperCase();
    }
    profilePreviewName.textContent = userName || 'Unknown User';
    profilePreviewStatus.textContent = profileImage
      ? 'Profile image available'
      : 'No profile image available';
    
    // Store profile data for download button
    const downloadBtn = document.getElementById('profileDownloadBtn');
    if (downloadBtn) {
      downloadBtn.onclick = () => downloadProfile(userName, profileImage);
    }
    
    profilePreview.style.display = 'flex';
  }

  if (profilePreviewClose) {
    profilePreviewClose.addEventListener('click', () => {
      if (profilePreview) profilePreview.style.display = 'none';
    });
  }

  if (profilePreview) {
    profilePreview.addEventListener('click', (e) => {
      if (e.target === profilePreview) {
        profilePreview.style.display = 'none';
      }
    });
  }

  // Close media viewer with back button
  mediaViewerBackBtn.addEventListener('click', () => {
    mediaViewer.style.display = 'none';
  });

  // UPDATED: Media viewer download button with proper Cloudinary download
  mediaViewerDownloadBtn.addEventListener('click', () => {
    const mediaElement = mediaViewerContent.querySelector('img, video, audio');
    if (mediaElement) {
      const url = mediaElement.src;
      const mediaType = mediaElement.tagName.toLowerCase();
      const timestamp = Date.now();
      
      let filename = '';
      let extension = '';
      
      if (mediaType === 'img') {
        extension = 'jpg';
        filename = `image_${timestamp}.${extension}`;
        downloadImage(url, filename);
      } else if (mediaType === 'video') {
        extension = 'mp4';
        filename = `video_${timestamp}.${extension}`;
        downloadVideo(url, filename);
      } else if (mediaType === 'audio') {
        extension = 'mp3';
        filename = `audio_${timestamp}.${extension}`;
        downloadAudio(url, filename);
      }
      
      showNotification('Download started!');
    }
  });
  
  // Edit media
  mediaViewerEditBtn.addEventListener('click', () => {
    const mediaElement = mediaViewerContent.querySelector('img, video');
    if (mediaElement) {
      mediaViewer.style.display = 'none';
      
      if (mediaElement.tagName === 'IMG') {
        imageEditorModal.style.display = 'flex';
        requestAnimationFrame(() => initImageEditor(mediaElement.src));
      } else if (mediaElement.tagName === 'VIDEO') {
        videoEditorModal.style.display = 'flex';
        requestAnimationFrame(() => initVideoEditor(mediaElement.src));
      }
    }
  });

  // Image editor handlers - HTML5 Canvas
  cancelImageEditBtn.addEventListener('click', () => {
    imageEditorModal.style.display = 'none';
    currentEditingImage = null;
    const canvas = document.getElementById('drawingCanvas');
    if (canvas) {
      canvas.remove();
    }
  });

  saveImageEditBtn.addEventListener('click', async () => {
    const canvas = document.getElementById('drawingCanvas');
    const backgroundImage = document.getElementById('editorBackgroundImage');
    const statusElement = document.getElementById('editorStatus');

    if (!canvas) {
      showNotification('Image editor is still loading, please wait.', true);
      return;
    }

    if (statusElement) {
      statusElement.textContent = 'Saving image...';
    }
    saveImageEditBtn.disabled = true;

    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportCtx = exportCanvas.getContext('2d');

      if (backgroundImage && backgroundImage.src) {
        exportCtx.drawImage(backgroundImage, 0, 0, exportCanvas.width, exportCanvas.height);
      }
      exportCtx.drawImage(canvas, 0, 0);

      const outputMime = ['jpeg', 'png', 'webp'].includes(currentEditingImageFormat) ? `image/${currentEditingImageFormat}` : 'image/png';
      const quality = outputMime === 'image/jpeg' ? 0.92 : 1;
      const dataURL = exportCanvas.toDataURL(outputMime, quality);
      const response = await fetch(dataURL);
      const blob = await response.blob();
      const extension = outputMime === 'image/jpeg' ? 'jpg' : outputMime === 'image/webp' ? 'webp' : 'png';
      const file = new File([blob], `edited_image_${Date.now()}.${extension}`, { type: outputMime });
      
      const result = await uploadToCloudinary(file);
      const imageUrl = result.secure_url || result.url || '';
      if (!imageUrl) {
        throw new Error('No image URL returned from upload');
      }

      const timestamp = Date.now();
      const message = {
        id: `msg_${timestamp}_${userId}`,
        name: username,
        userId: userId,
        text: 'Edited image',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: timestamp,
        channel: userChannel,
        mediaType: 'image',
        mediaUrl: imageUrl
      };
      
      await db.ref('chat').push(message);
      showNotification('Edited image sent!');
      
      if (statusElement) {
        statusElement.textContent = 'Saved successfully';
      }
      imageEditorModal.style.display = 'none';
      canvas.remove();
    } catch (error) {
      console.error('Error saving edited image:', error);
      if (statusElement) {
        statusElement.textContent = 'Save failed';
      }
      showNotification('Failed to save image: ' + error.message, true);
    } finally {
      saveImageEditBtn.disabled = false;
    }
  });

  brushToolBtn.addEventListener('click', () => {
    activateBrushTool();
  });

  textToolBtn.addEventListener('click', () => {
    activateTextTool();
  });

  eraserToolBtn.addEventListener('click', () => {
    activateEraserTool();
    cropMode = false;
    if (editorStatus) editorStatus.textContent = '';
  });

  const editorStatus = document.getElementById('editorStatus');
  const textInput = document.getElementById('textInput');
  const addTextBtn = document.getElementById('addTextBtn');

  if (cropToolBtn) {
    cropToolBtn.addEventListener('click', () => {
      cropMode = !cropMode;
      activateBrushTool();
      if (editorStatus) {
        editorStatus.textContent = cropMode ? 'Crop mode active: drag to select area' : '';
      }
      if (cropMode) {
        isEraserActive = false;
      }
    });
  }

  if (addTextBtn && textInput) {
    addTextBtn.addEventListener('click', () => {
      const canvas = document.getElementById('drawingCanvas');
      const ctx = canvas ? canvas.getContext('2d') : null;
      const text = textInput.value.trim();

      if (!ctx || !text) {
        return;
      }

      const isDarkTheme = document.body.classList.contains('dark-theme');
      const textColor = currentBrushColor || (isDarkTheme ? '#ffffff' : '#000000');
      const size = Math.max(16, Math.min(48, currentBrushSize * 3));
      ctx.font = `${size}px Arial`;
      const metrics = ctx.measureText(text);
      const textObj = {
        text: text,
        x: 120,
        y: 120,
        color: textColor,
        size: size,
        width: metrics.width,
        height: size,
        dragOffsetX: 0,
        dragOffsetY: 0,
        selected: false
      };

      if (!canvas.textElements) canvas.textElements = [];
      canvas.textElements.push(textObj);
      ctx.globalCompositeOperation = 'source-over';
      redrawCanvas(canvas, ctx, canvas.textElements);
      textInput.value = '';
    });
  }

  brushColorPicker.addEventListener('input', (e) => {
    updateBrush();
  });

  brushSizeSlider.addEventListener('input', (e) => {
    updateBrush();
  });

  undoEditBtn.addEventListener('click', () => {
    undoCanvasAction();
  });

  clearEditBtn.addEventListener('click', () => {
    if (confirm('Clear all drawings?')) {
      const canvas = document.getElementById('drawingCanvas');
      const ctx = canvas ? canvas.getContext('2d') : null;
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.textElements = [];
        editHistory = [];
        // Reload the image
        if (currentEditingImage) {
          initImageEditor(currentEditingImage);
        }
      }
    }
  });

  // Video editor handlers - FFMPEG integration for trimming and muting
  cancelVideoEditBtn.addEventListener('click', () => {
    videoEditorModal.style.display = 'none';
  });

  saveVideoEditBtn.addEventListener('click', async () => {
    if (!selectedVideoFile) {
      showNotification('No video selected', true);
      return;
    }

    const startTime = parseInt(trimStartSlider.value);
    const endTime = parseInt(trimEndSlider.value);

    if (endTime <= startTime) {
      showNotification('End time must be after start time', true);
      return;
    }

    showNotification('Processing video with FFmpeg...');
    
    try {
      // Check if FFmpeg is loaded
      if (!window.FFmpeg || !window.FFmpeg.FFmpeg) {
        showNotification('Video processing library not loaded yet. Please try again in a moment.', true);
        return;
      }

      // Initialize FFmpeg if not already done
      if (!ffmpegInstance) {
        const { FFmpeg, fetchFile } = window.FFmpeg;
        ffmpegInstance = new FFmpeg.FFmpeg();
        
        if (!ffmpegLoading) {
          ffmpegLoading = true;
          try {
            await ffmpegInstance.load();
          } catch (loadError) {
            console.error('Failed to load FFmpeg:', loadError);
            showNotification('Failed to load video processor. Please refresh and try again.', true);
            ffmpegLoading = false;
            ffmpegInstance = null;
            return;
          }
        }
      }

      // Write the video file to FFmpeg virtual filesystem
      const arrayBuffer = await selectedVideoFile.arrayBuffer();
      ffmpegInstance.FS('writeFile', 'input.mp4', new Uint8Array(arrayBuffer));

      // Trim and remove audio: -ss (start), -to (end), -an (no audio)
      await ffmpegInstance.run('-i', 'input.mp4', '-ss', `${startTime}`, '-to', `${endTime}`, '-an', '-c:v', 'copy', 'output.mp4');

      // Read the processed video
      const data = ffmpegInstance.FS('readFile', 'output.mp4');
      const processedVideoBlob = new Blob([data.buffer], { type: 'video/mp4' });

      // Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', processedVideoBlob, 'trimmed_video.mp4');
      formData.append('upload_preset', 'messenger_media');

      const uploadResult = await fetch('https://api.cloudinary.com/v1_1/dqtx23jyq/video/upload', {
        method: 'POST',
        body: formData
      });

      const result = await uploadResult.json();
      const videoUrl = result.secure_url || result.url || '';

      if (!videoUrl) {
        throw new Error('No video URL returned from upload');
      }

      // Send video message
      const timestamp = Date.now();
      const message = {
        id: `msg_${timestamp}_${userId}`,
        name: username,
        userId: userId,
        text: 'Trimmed & muted video',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: timestamp,
        channel: userChannel,
        mediaType: 'video',
        mediaUrl: videoUrl
      };

      await db.ref('chat').push(message);
      showNotification('Trimmed video sent!');
      videoEditorModal.style.display = 'none';
      
      // Clear FFmpeg files
      ffmpegInstance.FS('unlink', 'input.mp4');
      ffmpegInstance.FS('unlink', 'output.mp4');

    } catch (error) {
      console.error('Error processing video:', error);
      showNotification('Failed to process video', true);
    }
  });

  applyTrimBtn.addEventListener('click', () => {
    const startTime = parseInt(trimStartSlider.value);
    const endTime = parseInt(trimEndSlider.value);
    const videoDuration = parseInt(trimEndSlider.max);
    
    if (endTime > startTime) {
      const startFormatted = formatTime(startTime);
      const endFormatted = formatTime(endTime);
      showNotification(`Trim set: ${startFormatted} to ${endFormatted} (${formatTime(endTime - startTime)} total)`);
    } else {
      showNotification('End time must be after start time', true);
    }
  });

  // Search GUI
  searchBtn.addEventListener('click', () => {
    searchOverlay.style.display = 'block';
    searchContainer.classList.add('show');
    searchInput.focus();
  });

  searchBackBtn.addEventListener('click', () => {
    searchContainer.classList.remove('show');
    setTimeout(() => {
      searchOverlay.style.display = 'none';
    }, 300);
    
    // Clear highlights
    searchResults.forEach(result => {
      result.element.style.backgroundColor = '';
    });
  });

  searchInput.addEventListener('input', () => {
    searchMessages(searchInput.value);
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (searchResults.length > 0) {
        if (currentSearchIndex < 0) {
          navigateToSearchResult(0);
        } else if (currentSearchIndex < searchResults.length - 1) {
          navigateToSearchResult(currentSearchIndex + 1);
        } else {
          navigateToSearchResult(0);
        }
      }
      e.preventDefault();
    }
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchMessages('');
  });

  // Keyboard navigation for search
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (searchResults.length > 0) {
        if (currentSearchIndex < searchResults.length - 1) {
          navigateToSearchResult(currentSearchIndex + 1);
        } else {
          navigateToSearchResult(0);
        }
      }
    } else if (e.key === 'Escape') {
      searchBackBtn.click();
    }
  });

  // Send message on Enter key (Shift+Enter for new line)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  const clipboardImagePreviewBox = document.getElementById('clipboardImagePreviewBox');
  const clipboardImagePreviewImage = document.getElementById('clipboardImagePreviewImage');
  const clipboardImagePreviewClose = document.getElementById('clipboardImagePreviewClose');
  let currentClipboardPreviewUrl = null;

  function hideClipboardImagePreview() {
    if (clipboardImagePreviewBox) {
      clipboardImagePreviewBox.style.display = 'none';
    }
    if (clipboardImagePreviewImage) {
      clipboardImagePreviewImage.src = '';
    }
    if (currentClipboardPreviewUrl) {
      URL.revokeObjectURL(currentClipboardPreviewUrl);
      currentClipboardPreviewUrl = null;
    }
  }

  function showClipboardImagePreview(url) {
    hideClipboardImagePreview();
    currentClipboardPreviewUrl = url;
    if (clipboardImagePreviewImage) {
      clipboardImagePreviewImage.src = url;
    }
    if (clipboardImagePreviewBox) {
      clipboardImagePreviewBox.style.display = 'flex';
    }
  }

  if (clipboardImagePreviewClose) {
    clipboardImagePreviewClose.addEventListener('click', (e) => {
      e.stopPropagation();
      hideClipboardImagePreview();
    });
  }

  if (clipboardImagePreviewBox) {
    clipboardImagePreviewBox.addEventListener('click', (e) => {
      if (e.target.closest('.clipboard-image-preview-close')) return;
      if (currentClipboardPreviewUrl) {
        window.open(currentClipboardPreviewUrl, '_blank');
      }
    });
  }

  chatInput.addEventListener('paste', handleClipboardPaste);

  // Send message on button click
  sendBtn.addEventListener('click', sendMessage);

  async function handleClipboardPaste(event) {
    if (!event.clipboardData) return;

    const items = Array.from(event.clipboardData.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;

    event.preventDefault();

    const blob = imageItem.getAsFile();
    if (!blob) return;

    const previewUrl = URL.createObjectURL(blob);
    hideClipboardImagePreview();
    showClipboardImagePreview(previewUrl);

    const linkPreviewInput = document.getElementById('linkPreviewInput');
    if (linkPreviewInput) {
      linkPreviewInput.classList.remove('show');
    }

    chatInput.focus();
    showNotification('Image pasted. Click preview to open or tap × to cancel.');
  }

  // Menu button functionality (WhatsApp-style)
  menuBtn.addEventListener('click', () => {
    // Show admin options if user is admin
    if (isAdmin) {
      menuAdminPanel.style.display = 'flex';
      menuSwitchChannel.style.display = 'flex';
    } else {
      menuAdminPanel.style.display = 'none';
      menuSwitchChannel.style.display = 'none';
    }
    
    // Update notification toggle state
    const menuNotificationToggle = document.getElementById('menuNotificationToggle');
    menuNotificationToggle.checked = notificationsEnabled;
    
    hideScrollToBottomButton();
    setMenuOpenState(true);
    if (menuOverlay) {
      menuOverlay.style.display = 'block';
    }
    if (menuContainer) {
      menuContainer.style.display = 'block';
      menuContainer.classList.add('show');
    }
  });

  // Close menu
  menuCloseBtn.addEventListener('click', () => {
    closeOpenMenus();
  });

  menuOverlay.addEventListener('click', () => {
    closeOpenMenus();
  });

  // Export close button
  exportCloseBtn.addEventListener('click', () => {
    closeOpenMenus();
  });

  // Menu item handlers
  menuClearChat.addEventListener('click', () => {
    closeOpenMenus();
    clearChatModal.style.display = 'flex';
  });

  menuChangeUsername.addEventListener('click', () => {
    closeOpenMenus();
    newUsernameInput.value = username;
    changeUsernameModal.style.display = 'flex';
  });

  menuAdminPanel.addEventListener('click', () => {
    closeOpenMenus();
    if (userChannel === 'admin') {
      showNotification('You are already in Admin Panel.');
    } else {
      if (confirm('Switch to Admin Panel?')) {
        userChannel = 'admin';
        localStorage.setItem('user_channel', 'admin');
        markPageReload();
        window.location.reload();
      }
    }
  });

  menuExportChat.addEventListener('click', () => {
    hideScrollToBottomButton();
    setMenuOpenState(true);
    if (menuContainer) {
      menuContainer.classList.remove('show');
      menuContainer.style.display = 'none';
    }
    if (exportMenuContainer) {
      exportMenuContainer.style.display = 'block';
      exportMenuContainer.classList.add('show');
    }
    if (menuOverlay) {
      menuOverlay.style.display = 'block';
    }
  });

  menuSwitchChannel.addEventListener('click', () => {
    closeOpenMenus();
    channelCodeInput.value = userChannel;
    switchChannelModal.style.display = 'flex';
  });

  menuLogout.addEventListener('click', () => {
    closeOpenMenus();
    backToLogin();
  });

  // ===== NEW MENU ITEM HANDLERS =====
  
  // Notifications toggle in menu
  const menuNotificationToggle = document.getElementById('menuNotificationToggle');
  const menuBetterUiToggle = document.getElementById('menuBetterUiToggle');
  const menuNotifications = document.getElementById('menuNotifications');
  
  menuNotificationToggle.addEventListener('change', async (e) => {
    notificationsEnabled = e.target.checked;
    localStorage.setItem('notifications_enabled', notificationsEnabled);
    await saveSettingsToFirebase();
    
    if (notificationsEnabled && userChannel === 'general') {
      await subscribeOneSignal();
      showNotification('Notifications enabled for general chat');
    } else {
      await unsubscribeOneSignal();
      showNotification('Notifications disabled');
    }
  });

  menuBetterUiToggle.addEventListener('change', async (e) => {
    betterUiEnabled = e.target.checked;
    applyBetterUi(betterUiEnabled);
    localStorage.setItem('better_ui_enabled', betterUiEnabled);
    await saveSettingsToFirebase();
    showNotification(betterUiEnabled ? 'Better UI enabled' : 'Better UI disabled');
  });

  // Profile picture upload from menu
  const menuUploadProfile = document.getElementById('menuUploadProfile');
  const profileUploadInputMenu = document.getElementById('profileUploadInputMenu');
  
  menuUploadProfile.addEventListener('click', () => {
    profileUploadInputMenu.click();
  });

  profileUploadInputMenu.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showNotification('File size must be less than 5MB', true);
      return;
    }

    // Check file type
    if (!isImageFile(file.name)) {
      showNotification('Please upload an image file', true);
      return;
    }

    try {
      const result = await uploadToCloudinary(file);
      userProfileImage = result.secure_url;
      localStorage.setItem(`profile_image_${username}`, result.secure_url);
      await saveSettingsToFirebase();
      
      // Update avatar
      userAvatar.style.backgroundImage = `url(${result.secure_url})`;
      userAvatar.style.backgroundSize = 'cover';
      userAvatar.style.backgroundPosition = 'center';
      userAvatar.textContent = '';
      
      menuOverlay.style.display = 'none';
      menuContainer.classList.remove('show');
      showNotification('Profile picture updated!');
    } catch (error) {
      console.error('Error uploading profile image:', error);
      showNotification('Failed to upload profile image', true);
    }
    
    // Reset input
    profileUploadInputMenu.value = '';
  });

  // Chat background selection from menu
  const menuChatBackground = document.getElementById('menuChatBackground');
  const backgroundSelectionModal = document.getElementById('backgroundSelectionModal');
  const closeBackgroundModal = document.getElementById('closeBackgroundModal');
  const backgroundGridMenu = document.getElementById('backgroundGridMenu');
  
  menuChatBackground.addEventListener('click', () => {
    menuOverlay.style.display = 'none';
    menuContainer.classList.remove('show');
    
    // Update active state for current background
    document.querySelectorAll('#backgroundGridMenu .bg-option').forEach(option => {
      option.classList.remove('active');
      if (chatBackground === 'custom') {
        if (option.id === 'uploadBgOption') {
          option.classList.add('active');
        }
      } else if (option.dataset.bg === chatBackground) {
        option.classList.add('active');
      }
    });
    
    backgroundSelectionModal.style.display = 'flex';
  });

  closeBackgroundModal.addEventListener('click', () => {
    backgroundSelectionModal.style.display = 'none';
  });

  backgroundSelectionModal.addEventListener('click', (e) => {
    if (e.target === backgroundSelectionModal) {
      backgroundSelectionModal.style.display = 'none';
    }
  });

  // Background selection click handlers
  document.querySelectorAll('#backgroundGridMenu .bg-option').forEach(option => {
    if (option.id !== 'uploadBgOption') {
      option.addEventListener('click', async () => {
        const bgType = option.dataset.bg;
        chatBackground = bgType;
        localStorage.setItem('chat_background', bgType);
        localStorage.removeItem('chat_background_custom');
        await saveSettingsToFirebase();
        
        // Update CSS class on messages div
        const messagesDiv = document.getElementById('messages');
        const chatDiv = document.getElementById('chat');
        
        messagesDiv.className = 'chat__messages';
        chatDiv.className = '';
        
        if (bgType !== 'default') {
          messagesDiv.classList.add(`bg-${bgType}`);
          chatDiv.classList.add(`bg-${bgType}`);
        } else {
          chatDiv.classList.add('bg-default');
        }
        
        // Update active state
        document.querySelectorAll('#backgroundGridMenu .bg-option').forEach(opt => {
          opt.classList.remove('active');
        });
        option.classList.add('active');
        
        showNotification('Chat background updated!');
      });
    }
  });

  // Custom background upload functionality
  const uploadBgOption = document.getElementById('uploadBgOption');
  const backgroundUploadInput = document.getElementById('backgroundUploadInput');
  
  if (uploadBgOption && backgroundUploadInput) {
    uploadBgOption.addEventListener('click', () => {
      backgroundUploadInput.click();
    });
    
    backgroundUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Validate file
      if (file.size > 5 * 1024 * 1024) {
        showNotification('File size must be less than 5MB', 'error');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        showNotification('Please select an image file', 'error');
        return;
      }
      
      // Show loading state
      uploadBgOption.style.opacity = '0.5';
      uploadBgOption.style.pointerEvents = 'none';
      
      try {
        // Upload to Cloudinary
        const response = await uploadToCloudinary(file);
        const uploadedUrl = response.secure_url;
        
        if (uploadedUrl) {
          // Store the custom background
          chatBackground = 'custom';
          localStorage.setItem('chat_background', 'custom');
          localStorage.setItem('chat_background_custom', uploadedUrl);
          await saveSettingsToFirebase();
          
          // Update messages container and chat container with background image
          const messagesDiv = document.getElementById('messages');
          const chatDiv = document.getElementById('chat');
          
          messagesDiv.className = 'chat__messages bg-custom';
          messagesDiv.style.backgroundImage = `url('${uploadedUrl}')`;
          
          chatDiv.className = 'bg-custom';
          chatDiv.style.backgroundImage = `url('${uploadedUrl}')`;
          
          // Update modal preview
          const uploadPreview = uploadBgOption.querySelector('.bg-preview');
          uploadPreview.style.backgroundImage = `url('${uploadedUrl}')`;
          uploadPreview.style.background = `url('${uploadedUrl}') center/cover`;
          
          // Update active state
          document.querySelectorAll('#backgroundGridMenu .bg-option').forEach(opt => {
            opt.classList.remove('active');
          });
          uploadBgOption.classList.add('active');
          
          showNotification('Custom background uploaded!');
        } else {
          showNotification('Failed to upload background', 'error');
        }
      } catch (error) {
        console.error('Upload error:', error);
        showNotification('Error uploading background', 'error');
      } finally {
        uploadBgOption.style.opacity = '1';
        uploadBgOption.style.pointerEvents = 'auto';
        backgroundUploadInput.value = '';
      }
    });
  }

  // ===== SETTINGS MODAL FUNCTIONALITY =====
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const notificationToggle = document.getElementById('notificationToggle');
  const uploadProfileBtn = document.getElementById('uploadProfileBtn');
  const profileUploadInput = document.getElementById('profileUploadInput');
  const backgroundGrid = document.getElementById('backgroundGrid');

  // Open settings modal
  function openSettingsModal() {
    settingsModal.style.display = 'flex';
    
    // Update notification toggle state
    notificationToggle.checked = notificationsEnabled;
    
    // Update background selection
    document.querySelectorAll('.bg-option').forEach(option => {
      option.classList.remove('active');
      if (chatBackground === 'custom') {
        if (option.id === 'uploadBgOption') {
          option.classList.add('active');
        }
      } else if (option.dataset.bg === chatBackground) {
        option.classList.add('active');
      }
    });
  }

  // Close settings modal
  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  // Close settings modal on overlay click
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  // Notification toggle
  notificationToggle.addEventListener('change', async (e) => {
    notificationsEnabled = e.target.checked;
    localStorage.setItem('notifications_enabled', notificationsEnabled);
    await saveSettingsToFirebase();
    
    if (notificationsEnabled && userChannel === 'general') {
      await subscribeOneSignal();
    } else {
      await unsubscribeOneSignal();
    }
    
    showNotification(notificationsEnabled ? 'Notifications enabled for general chat' : 'Notifications disabled');
  });

  // Profile upload
  uploadProfileBtn.addEventListener('click', () => {
    profileUploadInput.click();
  });

  profileUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showNotification('File size must be less than 5MB', true);
      return;
    }

    // Check file type
    if (!isImageFile(file.name)) {
      showNotification('Please upload an image file', true);
      return;
    }

    try {
      const uploadedUrl = await uploadToCloudinary(file);
      userProfileImage = uploadedUrl;
      localStorage.setItem(`profile_image_${username}`, uploadedUrl);
      await saveSettingsToFirebase();
      
      // Update avatar
      userAvatar.style.backgroundImage = `url(${uploadedUrl})`;
      userAvatar.style.backgroundSize = 'cover';
      userAvatar.style.backgroundPosition = 'center';
      userAvatar.textContent = '';
      
      showNotification('Profile picture updated!');
    } catch (error) {
      console.error('Error uploading profile image:', error);
      showNotification('Failed to upload profile image', true);
    }
  });

  // Background selection
  document.querySelectorAll('.bg-option').forEach(option => {
    option.addEventListener('click', () => {
      const bgType = option.dataset.bg;
      chatBackground = bgType;
      localStorage.setItem('chat_background', bgType);
      
      // Update CSS class
      const messagesDiv = document.getElementById('messages');
      messagesDiv.className = 'chat__messages';
      if (bgType !== 'default') {
        messagesDiv.classList.add(`bg-${bgType}`);
      }
      
      // Update active state
      document.querySelectorAll('.bg-option').forEach(opt => {
        opt.classList.remove('active');
      });
      option.classList.add('active');
      
      showNotification('Chat background updated!');
    });
  });

  // Export options
  document.querySelectorAll('.export-option').forEach(option => {
    option.addEventListener('click', (e) => {
      const range = e.currentTarget.dataset.range;
      exportMenuContainer.classList.remove('show');
      menuOverlay.style.display = 'none';
      
      // Show export progress
      showNotification('Preparing export...');
      
      // Fetch messages based on range
      let query;
      if (range === 'all') {
        if (userChannel === 'general') {
          query = db.ref('chat').orderByChild('channel').equalTo('general');
        } else if (userChannel === 'admin') {
          query = db.ref('chat');
        } else {
          query = db.ref('chat').orderByChild('channel').equalTo(userChannel);
        }
      } else {
        // Last 100 messages
        query = db.ref('chat').limitToLast(100);
      }
      
      query.once('value').then((snapshot) => {
        const messages = snapshot.val() || {};
        let exportContent = '';
        
        // Format messages for export
        Object.values(messages).forEach(msg => {
          if (!msg) return;
          
          // Filter by channel if not admin
          if (userChannel === 'general') {
            if (msg.channel && msg.channel !== 'general') return;
          } else if (userChannel !== 'admin' && msg.channel !== userChannel) {
            return;
          }
          
          const date = new Date(msg.timestamp).toLocaleString();
          exportContent += `${date} - ${msg.name}: ${msg.text}\n`;
        });
        
        // Create and download file
        const blob = new Blob([exportContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const channelLabel = userChannel === 'general' ? 'general' : userChannel === 'admin' ? 'admin' : `ch${userChannel}`;
        a.download = `chat_${channelLabel}_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Chat exported successfully!');
      }).catch(error => {
        console.error('Export error:', error);
        showNotification('Failed to export chat.', true);
      });
    });
  });

  // Modal handlers
  confirmUsernameBtn.addEventListener('click', () => {
    const newUsername = newUsernameInput.value.trim();
    if (newUsername && newUsername !== username) {
      const oldUsername = username;
      const oldUserId = userId;
      
      // Keep the same userId for the new username
      username = newUsername;
      localStorage.setItem('chat_username', username);
      localStorage.setItem(`chat_userId_${username}`, userId);
      
      // Also store with old username for backward compatibility if needed
      if (oldUsername !== newUsername) {
        localStorage.setItem(`chat_userId_${oldUsername}`, userId);
      }
      
      userAvatar.textContent = username.charAt(0).toUpperCase();
      
      // Update presence with new user info (keep same userId)
      updateUserPresence(true);
      
      // Update all messages from old username to new username (same userId stays)
      db.ref('chat').orderByChild('userId').equalTo(oldUserId).once('value', (snapshot) => {
        const updates = {};
        snapshot.forEach((childSnap) => {
          updates[`${childSnap.key}/name`] = username;
          // Keep same userId - no need to update it
        });
        
        if (Object.keys(updates).length > 0) {
          db.ref('chat').update(updates);
        }
      });
      
      changeUsernameModal.style.display = 'none';
      showNotification('Username updated!');
    }
  });

  cancelUsernameBtn.addEventListener('click', () => {
    changeUsernameModal.style.display = 'none';
  });

  confirmClearBtn.addEventListener('click', () => {
    const isAllChannels = document.querySelector('#clearChatModal .modal-header').textContent.includes('All Channels');
    
    if (isAllChannels && isAdmin) {
      // Clear all channels
      db.ref('chat').remove()
        .then(() => {
          clearChatModal.style.display = 'none';
          showNotification('All channels cleared!');
        })
        .catch(error => {
          console.error("Error clearing chat:", error);
          showNotification('Failed to clear chat', true);
        });
    } else {
      // Clear current channel
      if (userChannel === 'general') {
        // Get all messages and delete those without channel or with channel='general'
        db.ref('chat').once('value', (snapshot) => {
          const messages = snapshot.val();
          if (messages) {
            Object.keys(messages).forEach(key => {
              const msg = messages[key];
              if (!msg.channel || msg.channel === 'general') {
                db.ref(`chat/${key}`).remove();
              }
            });
            clearChatModal.style.display = 'none';
            showNotification('General chat messages cleared!');
          }
        });
      } else {
        // Delete only messages from current channel
        db.ref('chat').orderByChild('channel').equalTo(userChannel).once('value', (snapshot) => {
          const messages = snapshot.val();
          if (messages) {
            Object.keys(messages).forEach(key => {
              db.ref(`chat/${key}`).remove();
            });
            clearChatModal.style.display = 'none';
            showNotification('Channel messages cleared!');
          }
        });
      }
    }
    
    // Reset modal header
    document.querySelector('#clearChatModal .modal-header').textContent = 'Clear Chat';
    document.querySelector('#clearChatModal .modal-body p').textContent = 'Are you sure you want to clear all messages from the current chat? This action cannot be undone.';
  });

  cancelClearBtn.addEventListener('click', () => {
    clearChatModal.style.display = 'none';
    // Reset modal header
    document.querySelector('#clearChatModal .modal-header').textContent = 'Clear Chat';
    document.querySelector('#clearChatModal .modal-body p').textContent = 'Are you sure you want to clear all messages from the current chat? This action cannot be undone.';
  });

  confirmChannelBtn.addEventListener('click', () => {
    const newChannel = channelCodeInput.value.trim();
    if (newChannel) {
      if (newChannel === 'general' || newChannel === 'admin' || /^\d{3}$/.test(newChannel)) {
        userChannel = newChannel;
        localStorage.setItem('user_channel', userChannel);
        switchChannelModal.style.display = 'none';
        markPageReload();
        window.location.reload();
      } else {
        showNotification('Invalid channel code. Must be "general", "admin", or 3 digits.', true);
      }
    }
  });

  cancelChannelBtn.addEventListener('click', () => {
    switchChannelModal.style.display = 'none';
  });

  // Attach button functionality with Cloudinary
  attachBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';  // Allow all file types without restrictions
    input.multiple = false;
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        // Use Supabase storage for PDFs and raw documents
        const isPdf = /\.pdf$/i.test(file.name);
        const isRaw = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar)$/i.test(file.name);
        const timestamp = Date.now();
        const fileName = `${userId}_${timestamp}_${file.name.replace(/\s+/g, '_')}`;

        let storageUrl = null;
        let uploadResult = null;
        let storageType = 'cloudinary';

        if (isPdf || isRaw) {
          storageType = 'supabase';
          const { data, error } = await supabaseClient.storage.from('chat-files').upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

          if (error) {
            console.warn('Supabase upload failed, falling back to Cloudinary:', error);
            const result = await uploadToCloudinary(file);
            uploadResult = result;
            storageUrl = result.secure_url;
            storageType = 'cloudinary';
          } else {
            uploadResult = data;
            const publicUrlResult = supabaseClient.storage.from('chat-files').getPublicUrl(fileName);
            const publicData = publicUrlResult?.data || {};
            const publicError = publicUrlResult?.error;
            if (publicError) {
              throw publicError;
            }

            storageUrl = publicData?.publicUrl || publicData?.publicURL || null;
            if (!storageUrl) {
              throw new Error('Unable to retrieve Supabase public URL');
            }
          }
        } else {
          const result = await uploadToCloudinary(file);
          uploadResult = result;
          storageUrl = result.secure_url;
        }
        
        // Determine media type
        let mediaType = 'file';
        if (isImageFile(file.name)) {
          mediaType = 'image';
        } else if (isVideoFile(file.name)) {
          mediaType = 'video';
        } else if (isAudioFile(file.name)) {
          mediaType = 'audio';
        }

        const message = {
          id: `msg_${timestamp}_${userId}`,
          name: username,
          userId: userId,
          text: mediaType === 'file' ? `Shared a file: ${file.name}` : '',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: timestamp,
          channel: userChannel,
          ...(mediaType !== 'file' ? {
            mediaType: mediaType,
            mediaUrl: storageUrl
          } : {
            fileData: {
              name: file.name,
              size: file.size,
              url: storageUrl,
              type: file.type,
              storage: storageType,
              publicId: uploadResult?.public_id || '',
              format: uploadResult?.format || ''
            }
          })
        };
        
        db.ref('chat').push(message)
          .then(() => {
            showNotification('File shared successfully!');
          })
          .catch(error => {
            console.error("Error sharing file:", error);
            showNotification("Failed to share file.", true);
          });
        
      } catch (error) {
        console.error('Upload error:', error);
        showNotification('Failed to upload file.', true);
      }
    };
    
    input.click();
  });

  // Back to login function
  function backToLogin() {
    updateUserPresence(false);
    if (messageListener) {
      messageListener.off();
      messageListener = null;
    }

    // Clear session when going back to login
    localStorage.removeItem('chat_username');
    localStorage.removeItem('user_channel');
    localStorage.removeItem('user_is_admin');
    localStorage.removeItem('from_admin');
    sessionStorage.removeItem('session_valid'); // Clear session validation

    window.location.href = 'login.html';
  }

  // Add back button functionality
  if (chatBackBtn) {
    chatBackBtn.addEventListener('click', backToLogin);
  }
  
  // Back button from login page
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      // Clear session when going back to login page
      sessionStorage.removeItem('session_valid');
      localStorage.removeItem('chat_username');
      localStorage.removeItem('user_channel');
      localStorage.removeItem('user_is_admin');
      localStorage.removeItem('from_admin');
      window.location.href = 'login.html';
    });
  }

  // Scroll to message function (for reply indicators)
  window.scrollToMessage = function(messageId) {
    const messageDiv = document.querySelector(`[data-id="${messageId}"]`);
    if (messageDiv) {
      messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageDiv.style.backgroundColor = 'rgba(124, 58, 237, 0.3)';
      setTimeout(() => {
        messageDiv.style.backgroundColor = '';
      }, 2000);
    }
  };

  // Initialize the app
  async function initApp() {
    await loadEmojiData();
    initEmojiPicker();
    updateUserPresence(true);
    cleanRecentChatVisits();
    
    // Hook reply cancel button after DOM is ready
    const cancelReplyBtn = document.getElementById('cancelReplyBtn');
    if (cancelReplyBtn) {
      cancelReplyBtn.addEventListener('click', hideReplyPreview);
    }

    // Load channels list if admin
    if (isAdmin) {
      loadChannelsList();
    }
    
    // Hide login back button when in chat
    document.querySelector(".back-button").style.display = "none";
    
    // Show welcome notification
    setTimeout(() => {
      if (userChannel === 'general') {
        showNotification(`Welcome ${username}! You're now in General Chat.`);
      } else if (userChannel === 'admin') {
        showNotification(`Welcome Admin ${username}! You have access to all channels.`);
      } else {
        showNotification(`Welcome ${username}! You're now in Private Channel CH-${userChannel}.`);
      }
    }, 1000);
    
    // Listen for window close/refresh to set offline
    window.addEventListener('beforeunload', () => {
      updateUserPresence(false);
    });
  }

  // Start the app
  initApp();
  
  // Clear page reload flag - reload is now complete
  localStorage.removeItem('page_reload_in_progress');
}

// Session validation - mark session as valid when user logs in
function markSessionValid() {
  sessionStorage.setItem('session_valid', 'true');
}

// Mark page as being reloaded (not navigating away)
function markPageReload() {
  // Use localStorage instead of sessionStorage since it persists through reload
  localStorage.setItem('page_reload_in_progress', 'true');
}

// Clear session when browser/tab closes
window.addEventListener('beforeunload', () => {
  // Check if this is just a page reload
  if (localStorage.getItem('page_reload_in_progress') !== 'true') {
    sessionStorage.removeItem('session_valid');
  }
  // Don't clear the flag here - it will be cleared after reload completes
});

// Use page visibility API to catch tab switches, but NOT during reloads
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Don't clear session if a page reload is happening
    if (localStorage.getItem('page_reload_in_progress') !== 'true') {
      sessionStorage.removeItem('session_valid');
    }
  }
});

function updateLoginBackground() {
  const body = document.body;
  const loginBackground = 'login background 123.png';
  const fallbackGradient = 'linear-gradient(180deg, #0f172a 0%, #111827 100%)';

  if (!body) return;

  if (navigator.onLine) {
    body.style.background = `url("${loginBackground}"), ${fallbackGradient}`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundPosition = 'center center';
    body.style.backgroundColor = '#0f172a';
  } else {
    body.style.background = fallbackGradient;
    body.style.backgroundSize = '';
    body.style.backgroundRepeat = '';
    body.style.backgroundPosition = '';
    body.style.backgroundColor = '#0f172a';
  }
}

window.addEventListener('online', updateLoginBackground);
window.addEventListener('offline', updateLoginBackground);

window.addEventListener("DOMContentLoaded", () => {
  updateLoginBackground();
  // Check if user is already logged in AND session is still valid
  const storedUsername = localStorage.getItem('chat_username');
  const isSessionValid = sessionStorage.getItem('session_valid') === 'true';
  
  // Only auto-login if BOTH conditions are true:
  // 1. Username is stored in localStorage (from previous session)
  // 2. Session is still valid (user didn't close browser/tab)
  if (storedUsername && isSessionValid) {
    // User is already logged in, restore session
    username = storedUsername.trim();
    
    // Restore userId
    const storedUserId = localStorage.getItem(`chat_userId_${username}`);
    if (storedUserId) {
      userId = storedUserId;
    }
    
    // Restore admin status if available
    const isAdminStored = localStorage.getItem('user_is_admin');
    if (isAdminStored) {
      isAdmin = isAdminStored === 'true';
    }
    
    // Restore channel - respect stored channel for all users (including admins who switched channels)
    const storedChannel = localStorage.getItem('user_channel');
    if (storedChannel) {
      userChannel = storedChannel;
    } else {
      // Default: admins default to 'admin', regular users to 'general'
      userChannel = isAdmin ? 'admin' : 'general';
    }
    
    // Check if coming from admin to track navigation history
    const fromAdmin = localStorage.getItem('from_admin');
    if (fromAdmin === 'true') {
      previousPage = 'admin';
      localStorage.removeItem('from_admin'); // Clear the flag after use
    } else {
      previousPage = 'login';
    }
    
    // Hide login form and show chat
    document.querySelector(".login-container").style.display = "none";
    document.getElementById("verification-box").style.display = "none";
    document.getElementById("chat-app").style.display = "flex";
    
    // Initialize chat app
    initializeChatApp();
    markSessionValid(); // Mark this restored session as valid
    return; // Exit early, don't show login form
  }
  
  // Clear invalid session data if session is not valid
  if (storedUsername && !isSessionValid) {
    localStorage.removeItem('chat_username');
    localStorage.removeItem('user_channel');
    localStorage.removeItem('user_is_admin');
    localStorage.removeItem('from_admin');
  }
  
  // Normal login flow - only reached if not already logged in
  const form = document.getElementById("login-form");
  
  // Add form validation and better error handling
  if (!form) {
    console.error('Login form not found!');
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Prevent double submissions
    if (form.dataset.submitting === 'true') {
      return;
    }
    
    try {
      form.dataset.submitting = 'true';

      const data = {
        username: document.getElementById("username").value.trim(),
        password: document.getElementById("password").value.trim(),
        robo_id: document.getElementById("robo-id").value.trim(),
        neuralink_no: document.getElementById("neuralink-no").value.trim(),
        teleportation_id: document.getElementById("teleportation-id").value.trim()
      };
      
      // Validate all fields are filled
      if (!data.username || !data.password || !data.robo_id || !data.neuralink_no || !data.teleportation_id) {
        showNotification('Please fill in all fields', true);
        form.dataset.submitting = 'false';
        return;
      }

      await checkSecretAndProceed(data);
    } catch (error) {
      console.error('Form submission error:', error);
      showNotification('An error occurred during login. Please try again.', true);
      form.dataset.submitting = 'false';
    }
  });
  
  // Clear the page reload flag now that page has loaded
  localStorage.removeItem('page_reload_in_progress');
});