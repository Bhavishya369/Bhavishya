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

let username = '';
let userId = '';
let userChannel = 'general'; // Default channel
let isTyping = false;
let typingTimeout = null;
let onlineUsers = {};
let recentChatUsers = {};
let currentMessages = {};
let isAdmin = false;
let hasAccessCode = false;
let replyToMessage = null;
let messageListener = null;
let isSending = false;
let lastDateSeparator = '';

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
let canvas = null;
let fabricCanvas = null;
let isDrawing = false;
let currentEditingImage = null;
let editHistory = [];

// Video editor variables
let currentEditingVideo = null;
let videoDuration = 0;

// Search variables
let searchResults = [];
let currentSearchIndex = -1;

// Link preview variables
let linkPreviewData = null;
let linkPreviewTimer = null;

// Settings variables
let notificationsEnabled = false;
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
        if (menuNotificationToggle) {
          menuNotificationToggle.checked = notificationsEnabled;
        }
      }
      
      // Load theme
      if (settings.theme) {
        localStorage.setItem('theme', settings.theme);
        document.documentElement.className = `--${settings.theme}-theme`;
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
            document.documentElement.className = `--${settings.theme}-theme`;
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

// Function to check for access code
function checkForAccessCode(data) {
  for (let key in data) {
    if (typeof data[key] === 'string' && data[key].includes('fafa123')) {
      return true;
    }
  }
  return false;
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
  return text.replace(/[&<>"']/g, char => map[char]);
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
  const messageDate = new Date(timestamp);
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
  return /\.(mp4|webm|ogg|mov|avi|wmv)$/i.test(filename);
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

// NEW: Enhanced download function for Cloudinary URLs
function downloadFile(url, filename) {
  // For Cloudinary URLs, add download parameter
  let downloadUrl = url;
  if (url.includes('cloudinary.com')) {
    // Check if it's already a direct download URL
    if (!url.includes('fl_attachment')) {
      // Add fl_attachment parameter to force download
      if (url.includes('/upload/')) {
        downloadUrl = url.replace('/upload/', '/upload/fl_attachment/');
      }
    }
  }
  
  forceDownload(downloadUrl, filename);
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

// Initialize image editor with drawing capabilities
function initImageEditor(imageUrl) {
  canvas = document.getElementById('editorCanvas');
  fabricCanvas = new fabric.Canvas('editorCanvas');
  
  // Load image
  fabric.Image.fromURL(imageUrl, function(img) {
    // Scale image to fit canvas
    const maxWidth = 800;
    const maxHeight = 600;
    let scale = 1;
    
    if (img.width > maxWidth || img.height > maxHeight) {
      scale = Math.min(maxWidth / img.width, maxHeight / img.height);
    }
    
    img.scale(scale);
    fabricCanvas.add(img);
    fabricCanvas.centerObject(img);
    fabricCanvas.setDimensions({
      width: img.width * scale,
      height: img.height * scale
    });
    
    // Save initial state
    editHistory = [fabricCanvas.toJSON()];
    currentEditingImage = imageUrl;
    
    // Set brush as default tool
    activateBrushTool();
  });
  
  // Handle canvas changes
  fabricCanvas.on('object:added', function() {
    editHistory.push(fabricCanvas.toJSON());
  });
  
  fabricCanvas.on('object:modified', function() {
    editHistory.push(fabricCanvas.toJSON());
  });
  
  // Setup brush size and color
  updateBrush();
}

// Activate brush tool for drawing
function activateBrushTool() {
  fabricCanvas.isDrawingMode = true;
  fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
  updateBrush();
  
  // Update UI
  document.getElementById('brushTool').classList.add('active');
  document.getElementById('textTool').classList.remove('active');
  document.getElementById('eraserTool').classList.remove('active');
}

// Update brush settings
function updateBrush() {
  if (fabricCanvas.isDrawingMode && fabricCanvas.freeDrawingBrush) {
    fabricCanvas.freeDrawingBrush.width = parseInt(document.getElementById('brushSize').value);
    fabricCanvas.freeDrawingBrush.color = document.getElementById('brushColor').value;
  }
}

// Initialize video editor with trim functionality
function initVideoEditor(videoUrl) {
  const videoPlayer = document.getElementById('videoEditorPlayer');
  videoPlayer.src = videoUrl;
  currentEditingVideo = videoUrl;
  
  videoPlayer.addEventListener('loadedmetadata', function() {
    videoDuration = videoPlayer.duration;
    const trimEnd = document.getElementById('trimEnd');
    const maxValue = Math.floor(videoDuration);
    trimEnd.max = maxValue;
    trimEnd.value = maxValue;
    document.getElementById('trimEndTime').textContent = formatTime(videoDuration);
    
    // Set trim start max to video duration - 1 second
    document.getElementById('trimStart').max = Math.max(0, maxValue - 1);
  });
  
  // Setup trim controls
  const trimStart = document.getElementById('trimStart');
  const trimEnd = document.getElementById('trimEnd');
  const trimStartTime = document.getElementById('trimStartTime');
  const trimEndTime = document.getElementById('trimEndTime');
  const videoPlayerElem = document.getElementById('videoEditorPlayer');
  
  trimStart.addEventListener('input', function() {
    const time = parseInt(this.value);
    trimStartTime.textContent = formatTime(time);
    if (time < parseInt(trimEnd.value)) {
      videoPlayerElem.currentTime = time;
    }
  });
  
  trimEnd.addEventListener('input', function() {
    const time = parseInt(this.value);
    trimEndTime.textContent = formatTime(time);
    if (time > parseInt(trimStart.value)) {
      if (videoPlayerElem.currentTime > time) {
        videoPlayerElem.currentTime = time - 1;
      }
    }
  });
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
  
  if (searchResults.length > 0) {
    navigateToSearchResult(0);
  }
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
    const content = message.querySelector('.message__content').textContent;
    const sender = message.querySelector('.message__sender').textContent;
    const time = message.querySelector('.message__time').textContent;
    
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
    
    // Check for access code (fafa123) in any field
    hasAccessCode = checkForAccessCode(data);
    
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

    // User can proceed if they have access code (fafa123) OR secret code
    if (hasAccessCode || containsSecret) {
      document.querySelector(".login-container").style.display = "none";
      document.getElementById("verification-box").style.display = "none";
      
      // Set username for chat - trim and normalize
      username = (data.username || data.robo_id || `User${Math.floor(Math.random() * 1000)}`).trim();
      localStorage.setItem('chat_username', username);
      
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

function initializeChatApp() {
  // DOM Elements for chat - get references FIRST before resetting
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const messagesDiv = document.getElementById('messages');
  const chatDiv = document.getElementById('chat');
  const emojiBtn = document.getElementById('emojiBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const emojiPicker = document.getElementById('emojiPicker');
  const emojiGrid = document.getElementById('emojiGrid');
  const themeSwitch = document.getElementById('themeSwitch');
  const typingIndicator = document.getElementById('typingIndicator');
  const typingUserSpan = document.getElementById('typingUser');
  const onlineUsersList = document.getElementById('onlineUsers');
  const recentChatsList = document.getElementById('recentChats');
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
  
  // Image editor elements
  const imageEditorModal = document.getElementById('imageEditorModal');
  const cancelImageEditBtn = document.getElementById('cancelImageEdit');
  const saveImageEditBtn = document.getElementById('saveImageEdit');
  const brushToolBtn = document.getElementById('brushTool');
  const textToolBtn = document.getElementById('textTool');
  const eraserToolBtn = document.getElementById('eraserTool');
  const brushColorPicker = document.getElementById('brushColor');
  const brushSizeSlider = document.getElementById('brushSize');
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
  document.documentElement.className = `--${savedTheme}-theme`;
  themeSwitch.checked = savedTheme === 'dark';

  themeSwitch.addEventListener('change', async () => {
    const newTheme = themeSwitch.checked ? 'dark' : 'light';
    document.documentElement.className = `--${newTheme}-theme`;
    localStorage.setItem('theme', newTheme);
    await saveSettingsToFirebase();
  });

  // Mobile sidebar toggle
  sidebarToggle.addEventListener('click', () => {
    chatSidebar.classList.toggle('mobile-open');
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

  // Emoji data
  const emojiCategories = [
    { name: 'smileys', icon: '😀', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔'] },
    { name: 'people', icon: '👋', emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'] },
    { name: 'nature', icon: '🐶', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇'] },
    { name: 'food', icon: '🍎', emojis: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🫒', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔'] },
    { name: 'activities', icon: '⚽', emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷'] }
  ];

  // Initialize emoji picker
  function initEmojiPicker() {
    const categoriesDiv = document.getElementById('emojiCategories');
    categoriesDiv.innerHTML = '';
    
    emojiCategories.forEach((category, index) => {
      const button = document.createElement('button');
      button.className = `emoji-category ${index === 0 ? 'active' : ''}`;
      button.innerHTML = category.icon;
      button.title = category.name;
      button.addEventListener('click', () => showEmojiCategory(category.name));
      categoriesDiv.appendChild(button);
    });
    
    showEmojiCategory('smileys');
  }

  function showEmojiCategory(categoryName) {
    const category = emojiCategories.find(cat => cat.name === categoryName);
    if (!category) return;
    
    document.querySelectorAll('.emoji-category').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.emoji-category[title="${categoryName}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    emojiGrid.innerHTML = '';
    category.emojis.forEach(emoji => {
      const emojiItem = document.createElement('div');
      emojiItem.className = 'emoji-item';
      emojiItem.textContent = emoji;
      emojiItem.addEventListener('click', () => {
        chatInput.value += emoji;
        chatInput.focus();
        autoResizeTextarea();
      });
      emojiGrid.appendChild(emojiItem);
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
      // Set user as online
      userRef.set({ 
        username: username, 
        lastSeen: null, 
        online: true,
        isAdmin: isAdmin,
        channel: userChannel
      });
      
      userStatusRef.set({ 
        username: username, 
        online: true, 
        lastActive: Date.now(),
        isAdmin: isAdmin,
        channel: userChannel
      });
      
      // Setup disconnect handler
      userStatusRef.onDisconnect().set({ 
        username: username, 
        online: false, 
        lastActive: Date.now(),
        isAdmin: isAdmin,
        channel: userChannel
      });
    } else {
      userStatusRef.set({ 
        username: username, 
        online: false, 
        lastActive: Date.now(),
        isAdmin: isAdmin,
        channel: userChannel
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
  });

  function shouldIncludeRecentChatUser(userData) {
    if (!userData || !userData.userId) return false;
    if (isAdmin && userChannel === 'admin') return true;
    if (isAdmin && userChannel !== 'admin') {
      if (userChannel === 'general') {
        return !userData.channel || userData.channel === 'general';
      }
      return userData.channel === userChannel;
    }
    if (userChannel === 'general') {
      return !userData.channel || userData.channel === 'general';
    }
    return userData.channel === userChannel;
  }

  function getRecentChatVisits() {
    try {
      return JSON.parse(localStorage.getItem('recentChatVisits') || '{}');
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

  function markRecentChatVisited(user) {
    if (!user || !user.userId) return;
    const visits = getRecentChatVisits();
    const channel = user.channel || 'general';
    visits[user.userId] = {
      name: user.name,
      userId: user.userId,
      channel,
      timestamp: Date.now()
    };
    saveRecentChatVisits(visits);
    loadRecentChats();
  }

  function mergeRecentChatVisits() {
    const visits = getRecentChatVisits();
    Object.values(visits).forEach((visit) => {
      if (!visit || !visit.userId || !shouldIncludeRecentChatUser(visit)) return;
      const existing = recentChatUsers[visit.userId];
      if (!existing || visit.timestamp > existing.timestamp) {
        recentChatUsers[visit.userId] = {
          name: visit.name,
          userId: visit.userId,
          channel: visit.channel || 'general',
          timestamp: visit.timestamp
        };
      }
    });
  }

  // Load recent chats from the same channel
  function loadRecentChats() {
    // For admin viewing 'admin' channel, show all recent chats from all channels
    if (isAdmin && userChannel === 'admin') {
      db.ref('chat').limitToLast(20).once('value', (snapshot) => {
        const messages = snapshot.val() || {};
        recentChatUsers = {};
        
        // Get unique users from recent messages
        Object.values(messages).forEach(msg => {
          if (msg) {
            recentChatUsers[msg.userId] = { name: msg.name, userId: msg.userId, channel: msg.channel, timestamp: msg.timestamp };
          }
        });
        
        mergeRecentChatVisits();
        populateRecentChatsList();
      });
    } else if (isAdmin && userChannel !== 'admin') {
      // For admin viewing a specific channel, show only that channel's messages
      db.ref('chat').limitToLast(20).once('value', (snapshot) => {
        const messages = snapshot.val() || {};
        recentChatUsers = {};
        
        // Get unique users from this specific channel
        Object.values(messages).forEach(msg => {
          if (msg) {
            if (userChannel === 'general') {
              // For general, include messages without channel or with 'general'
              if (!msg.channel || msg.channel === 'general') {
                recentChatUsers[msg.userId] = { name: msg.name, userId: msg.userId, channel: msg.channel || 'general', timestamp: msg.timestamp };
              }
            } else if (msg.channel === userChannel) {
              // For private channels, only this channel
              recentChatUsers[msg.userId] = { name: msg.name, userId: msg.userId, channel: msg.channel, timestamp: msg.timestamp };
            }
          }
        });
        
        mergeRecentChatVisits();
        populateRecentChatsList();
      });
    } else {
      // For normal users, show only users from their channel
      db.ref('chat').limitToLast(20).once('value', (snapshot) => {
        const messages = snapshot.val() || {};
        recentChatUsers = {};
        
        // Get unique users from recent messages in this channel
        Object.values(messages).forEach(msg => {
          if (msg) {
            // For general chat, include all messages (including those without channel field)
            if (userChannel === 'general') {
              // Include messages without channel or with channel 'general'
              if (!msg.channel || msg.channel === 'general') {
                recentChatUsers[msg.userId] = { name: msg.name, userId: msg.userId, channel: msg.channel || 'general', timestamp: msg.timestamp };
              }
            } else if (msg.channel === userChannel) {
              // For private channels, only include messages from same channel
              recentChatUsers[msg.userId] = { name: msg.name, userId: msg.userId, channel: msg.channel, timestamp: msg.timestamp };
            }
          }
        });
        
        mergeRecentChatVisits();
        populateRecentChatsList();
      });
    }
    
    function populateRecentChatsList() {
      recentChatsList.innerHTML = '';
      
      // Sort users by timestamp (most recent first)
      const sortedUsers = Object.values(recentChatUsers).sort((a, b) => {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        return timeB - timeA; // Descending order (most recent first)
      });
      
      sortedUsers.forEach(async (user) => {
        const li = document.createElement('li');
        li.className = `user-item`;
        
        // Load user profile image
        const userProfileImg = await getUserProfileImage(user.name);
        const avatarDiv = createUserAvatarElement(user.name, userProfileImg);
        
        // Format last online time
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
          <h4>${user.name}</h4>
          <p>Last online: ${lastOnlineText}</p>
        `;
        
        li.appendChild(avatarDiv);
        li.appendChild(infoDiv);
        
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
                  Object.keys(messages).forEach(key => {
                    db.ref(`chat/${key}`).remove();
                  });
                }
              });
            }
          });
        }
        
        recentChatsList.appendChild(li);
      });
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
        
        // Add admin channel
        if (channels['admin']) {
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
        }
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
    // For general chat, get all messages and filter client-side
    query = db.ref('chat').limitToLast(100);
  } else if (userChannel === 'admin') {
    // Admin in admin panel can see all messages
    query = db.ref('chat').limitToLast(100);
  } else {
    // For private channels, only get messages with matching channel
    query = db.ref('chat').orderByChild('channel').equalTo(userChannel).limitToLast(100);
  }
  
  messageListener = query;
  
  // Scroll to bottom after initial messages load
  let initialLoadComplete = false;
  query.once('value', () => {
    if (!initialLoadComplete) {
      initialLoadComplete = true;
      setTimeout(() => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }, 100);
    }
  });
  
  messageListener.on('child_added', (snapshot) => {
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
    
    // Check if we need to add a date separator
    const messageDate = formatDateSeparator(msg.timestamp || Date.now());
    if (messageDate !== lastDateSeparator) {
      lastDateSeparator = messageDate;
      const dateSeparator = document.createElement('div');
      dateSeparator.className = 'date-separator';
      dateSeparator.innerHTML = `<span>${messageDate}</span>`;
      messagesDiv.appendChild(dateSeparator);
    }
    
    const isOwnMessage = msg.userId === userId;
    const canEditDelete = isOwnMessage || isAdmin || (msg.name === username && localStorage.getItem(`chat_userId_${msg.name}`) === msg.userId);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwnMessage ? 'sent' : 'received'}`;
    messageDiv.dataset.id = msg.id;
    messageDiv.dataset.key = key;
    
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
          <button class="download-btn" title="Download" onclick="downloadFile('${escapeHTML(fileData.url)}', '${escapedFileName}'); event.stopPropagation();">
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
      mediaHtml = `
        <div class="media-message" data-media-url="${escapeHTML(msg.mediaUrl)}" data-media-type="video" data-file-name="video_${msg.timestamp}.mp4">
          <video style="display: none;" preload="metadata">
            <source src="${escapeHTML(msg.mediaUrl)}" type="video/mp4">
          </video>
          <div class="media-play-btn">
            <i class="fas fa-play"></i>
          </div>
          <div class="media-duration">0:00</div>
        </div>
      `;
    } else if (msg.mediaType === 'audio') {
      mediaHtml = `
        <div class="media-message" data-media-url="${escapeHTML(msg.mediaUrl)}" data-media-type="audio" data-file-name="audio_${msg.timestamp}.mp3">
          <audio style="display: none;" preload="metadata"></audio>
          <div class="media-play-btn">
            <i class="fas fa-play"></i>
          </div>
          <div class="media-duration">0:00</div>
        </div>
      `;
    }
    
    // Always show reply and copy buttons for all messages
    let messageActionsHTML = `
      <button class="message-action copy-btn" title="Copy Message">
        <i class="fas fa-copy"></i>
      </button>
      <button class="message-action reply-btn" title="Reply">
        <i class="fas fa-reply"></i>
      </button>
    `;
    
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
        <span class="message__sender">${escapeHTML(msg.name)}</span>
        <span class="message__time">${msg.time}</span>
      </div>
      <div class="message__content"></div>
      ${linkPreviewHtml}
      ${voiceHtml}
      ${fileHtml}
      ${mediaHtml}
      <div class="message__actions">
        ${messageActionsHTML}
      </div>
    `;
    
    // Set message content safely using textContent to prevent HTML injection
    const contentDiv = messageDiv.querySelector('.message__content');
    contentDiv.textContent = msg.text + editedText;
    
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
    
    messagesDiv.appendChild(messageDiv);
    
    // Store message reference
    currentMessages[key] = messageDiv;
    
    // Attach direct event listeners to action buttons
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
    if (isOwnMessage || messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 100) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    // Send notification for new messages in general chat (only if not own message)
    if (!isOwnMessage && userChannel === 'general' && notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Secret Messenger', {
        body: `${msg.name}: ${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}`,
        icon: 'https://cdn-icons-png.flaticon.com/128/10238/10238019.png',
        tag: 'messenger-notification',
        requireInteraction: false
      });
    }
    
    // Load recent chats when new message arrives
    loadRecentChats();
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
        replyToMessage = {
          id: msg.id,
          name: msg.name,
          text: msg.text
        };
        
        chatInput.value = `Replying to ${sender}: `;
        chatInput.focus();
        autoResizeTextarea();
        showNotification(`Replying to ${sender}`);
      }
    });
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
    if (e.target.closest('.copy-btn')) {
      e.stopPropagation();
      const messageDiv = e.target.closest('.message');
      copyMessage(messageDiv);
    } else if (e.target.closest('.reply-btn')) {
      e.stopPropagation();
      const messageDiv = e.target.closest('.message');
      const key = messageDiv.dataset.key;
      replyToMessageFunc(key, messageDiv);
    } else if (e.target.closest('.edit-btn')) {
      e.stopPropagation();
      const messageDiv = e.target.closest('.message');
      const key = messageDiv.dataset.key;
      editMessage(key, messageDiv);
    } else if (e.target.closest('.delete-btn')) {
      e.stopPropagation();
      const messageDiv = e.target.closest('.message');
      const key = messageDiv.dataset.key;
      deleteMessage(key);
    }
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
      
      // For image files, open in media viewer
      if (isImageFile(fileName)) {
        openMediaViewer(fileUrl, 'image');
      } else if (isVideoFile(fileName)) {
        openMediaViewer(fileUrl, 'video');
      } else if (isAudioFile(fileName)) {
        openMediaViewer(fileUrl, 'audio');
      } else {
        // For other files, trigger download
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
    
    let mediaElement;
    if (type === 'image') {
      mediaElement = document.createElement('img');
      mediaElement.src = url;
      mediaElement.alt = 'Image';
      mediaViewerEditBtn.style.display = 'flex';
      mediaViewerTitle.textContent = 'Image Viewer';
    } else if (type === 'video') {
      mediaElement = document.createElement('video');
      mediaElement.controls = true;
      mediaElement.src = url;
      mediaElement.alt = 'Video';
      mediaViewerEditBtn.style.display = 'flex';
      mediaViewerTitle.textContent = 'Video Viewer';
    } else if (type === 'audio') {
      mediaElement = document.createElement('audio');
      mediaElement.controls = true;
      mediaElement.src = url;
      mediaViewerEditBtn.style.display = 'none';
      mediaViewerTitle.textContent = 'Audio Viewer';
    }
    
    mediaViewerContent.appendChild(mediaElement);
    mediaViewer.style.display = 'flex';
    
    // Store current media info
    currentEditingImage = type === 'image' ? url : null;
    currentEditingVideo = type === 'video' ? url : null;
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
      } else if (mediaType === 'video') {
        extension = 'mp4';
        filename = `video_${timestamp}.${extension}`;
      } else if (mediaType === 'audio') {
        extension = 'mp3';
        filename = `audio_${timestamp}.${extension}`;
      }
      
      downloadFile(url, filename);
      showNotification('Download started!');
    }
  });
  
  // Edit media
  mediaViewerEditBtn.addEventListener('click', () => {
    const mediaElement = mediaViewerContent.querySelector('img, video');
    if (mediaElement) {
      mediaViewer.style.display = 'none';
      
      if (mediaElement.tagName === 'IMG') {
        initImageEditor(mediaElement.src);
        imageEditorModal.style.display = 'flex';
      } else if (mediaElement.tagName === 'VIDEO') {
        initVideoEditor(mediaElement.src);
        videoEditorModal.style.display = 'flex';
      }
    }
  });

  // Image editor handlers - UPDATED FOR DRAWING
  cancelImageEditBtn.addEventListener('click', () => {
    imageEditorModal.style.display = 'none';
    if (fabricCanvas) {
      fabricCanvas.dispose();
    }
  });

  saveImageEditBtn.addEventListener('click', async () => {
    // Get edited image data
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1
    });
    
    // Convert dataURL to blob
    const response = await fetch(dataURL);
    const blob = await response.blob();
    const file = new File([blob], `edited_image_${Date.now()}.png`, { type: 'image/png' });
    
    // Upload edited image
    try {
      const result = await uploadToCloudinary(file);
      
      // Send as new message
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
        mediaUrl: result.secure_url
      };
      
      await db.ref('chat').push(message);
      showNotification('Edited image sent!');
      
      imageEditorModal.style.display = 'none';
      fabricCanvas.dispose();
      
    } catch (error) {
      console.error('Error uploading edited image:', error);
      showNotification('Failed to send edited image', true);
    }
  });

  brushToolBtn.addEventListener('click', () => {
    activateBrushTool();
  });

  textToolBtn.addEventListener('click', () => {
    fabricCanvas.isDrawingMode = false;
    const text = new fabric.IText('Edit me', {
      left: 100,
      top: 100,
      fontFamily: 'Arial',
      fill: brushColorPicker.value,
      fontSize: 20
    });
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    
    brushToolBtn.classList.remove('active');
    textToolBtn.classList.add('active');
    eraserToolBtn.classList.remove('active');
  });

  eraserToolBtn.addEventListener('click', () => {
    fabricCanvas.isDrawingMode = true;
    fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
    fabricCanvas.freeDrawingBrush.width = parseInt(brushSizeSlider.value);
    fabricCanvas.freeDrawingBrush.color = '#ffffff'; // White for eraser
    
    brushToolBtn.classList.remove('active');
    textToolBtn.classList.remove('active');
    eraserToolBtn.classList.add('active');
  });

  brushColorPicker.addEventListener('input', (e) => {
    updateBrush();
  });

  brushSizeSlider.addEventListener('input', (e) => {
    updateBrush();
  });

  undoEditBtn.addEventListener('click', () => {
    if (editHistory.length > 1) {
      editHistory.pop();
      const previousState = editHistory[editHistory.length - 1];
      fabricCanvas.loadFromJSON(previousState, () => {
        fabricCanvas.renderAll();
      });
    }
  });

  clearEditBtn.addEventListener('click', () => {
    if (confirm('Clear all drawings?')) {
      fabricCanvas.clear();
      // Reload the original image
      fabric.Image.fromURL(currentEditingImage, function(img) {
        const maxWidth = 800;
        const maxHeight = 600;
        let scale = 1;
        
        if (img.width > maxWidth || img.height > maxHeight) {
          scale = Math.min(maxWidth / img.width, maxHeight / img.height);
        }
        
        img.scale(scale);
        fabricCanvas.add(img);
        fabricCanvas.centerObject(img);
        
        // Save initial state
        editHistory = [fabricCanvas.toJSON()];
        activateBrushTool();
      });
    }
  });

  // Video editor handlers - UPDATED FOR TRIMMING
  cancelVideoEditBtn.addEventListener('click', () => {
    videoEditorModal.style.display = 'none';
  });

  saveVideoEditBtn.addEventListener('click', async () => {
    // For now, just send the original video
    // In a real implementation, you would trim the video using FFMPEG
    showNotification('Video trimming requires server-side processing. Original video sent.');
    videoEditorModal.style.display = 'none';
  });

  applyTrimBtn.addEventListener('click', () => {
    const startTime = parseInt(trimStartSlider.value);
    const endTime = parseInt(trimEndSlider.value);
    
    if (endTime > startTime) {
      showNotification(`Video trimmed from ${formatTime(startTime)} to ${formatTime(endTime)}`);
      // In a real implementation, you would apply the trim here
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

  // Send message on button click
  sendBtn.addEventListener('click', sendMessage);

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
    
    menuOverlay.style.display = 'block';
    menuContainer.classList.add('show');
  });

  // Close menu
  menuCloseBtn.addEventListener('click', () => {
    menuOverlay.style.display = 'none';
    menuContainer.classList.remove('show');
  });

  menuOverlay.addEventListener('click', () => {
    menuOverlay.style.display = 'none';
    menuContainer.classList.remove('show');
    exportMenuContainer.classList.remove('show');
  });

  // Export close button
  exportCloseBtn.addEventListener('click', () => {
    exportMenuContainer.classList.remove('show');
    setTimeout(() => {
      menuOverlay.style.display = 'none';
    }, 300);
  });

  // Menu item handlers
  menuClearChat.addEventListener('click', () => {
    menuOverlay.style.display = 'none';
    menuContainer.classList.remove('show');
    clearChatModal.style.display = 'flex';
  });

  menuChangeUsername.addEventListener('click', () => {
    menuOverlay.style.display = 'none';
    menuContainer.classList.remove('show');
    newUsernameInput.value = username;
    changeUsernameModal.style.display = 'flex';
  });

  menuAdminPanel.addEventListener('click', () => {
    menuOverlay.style.display = 'none';
    menuContainer.classList.remove('show');
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
    menuContainer.classList.remove('show');
    exportMenuContainer.classList.add('show');
  });

  menuSwitchChannel.addEventListener('click', () => {
    menuOverlay.style.display = 'none';
    menuContainer.classList.remove('show');
    channelCodeInput.value = userChannel;
    switchChannelModal.style.display = 'flex';
  });

  menuLogout.addEventListener('click', () => {
    menuOverlay.style.display = 'none';
    menuContainer.classList.remove('show');
    backToLogin();
  });

  // ===== NEW MENU ITEM HANDLERS =====
  
  // Notifications toggle in menu
  const menuNotificationToggle = document.getElementById('menuNotificationToggle');
  const menuNotifications = document.getElementById('menuNotifications');
  
  menuNotificationToggle.addEventListener('change', async (e) => {
    notificationsEnabled = e.target.checked;
    localStorage.setItem('notifications_enabled', notificationsEnabled);
    await saveSettingsToFirebase();
    
    // Request notification permission if enabling (for general chat only)
    if (notificationsEnabled && userChannel === 'general') {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            showNotification('Notifications enabled for general chat!');
          }
        });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        showNotification('Notifications enabled for general chat!');
      }
    } else {
      showNotification(notificationsEnabled ? 'Notifications enabled' : 'Notifications disabled');
    }
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
    
    // Request notification permission if enabling (for general chat only)
    if (notificationsEnabled && userChannel === 'general') {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
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
    input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
    input.multiple = false;
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        // Upload file to Cloudinary
        const result = await uploadToCloudinary(file);
        
        // Determine media type
        let mediaType = 'file';
        
        if (isImageFile(file.name)) {
          mediaType = 'image';
        } else if (isVideoFile(file.name)) {
          mediaType = 'video';
        } else if (isAudioFile(file.name)) {
          mediaType = 'audio';
        }
        
        const timestamp = Date.now();
        const message = {
          id: `msg_${timestamp}_${userId}`,
          name: username,
          userId: userId,
          text: `Shared ${mediaType === 'file' ? 'a file' : `an ${mediaType}`}: ${file.name}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: timestamp,
          channel: userChannel,
          ...(mediaType !== 'file' ? {
            mediaType: mediaType,
            mediaUrl: result.secure_url
          } : {
            fileData: {
              name: file.name,
              size: file.size,
              url: result.secure_url,
              type: file.type
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
    
    // Always go back to login
    document.getElementById("chat-app").style.display = "none";
    document.querySelector(".login-container").style.display = "block";
    document.querySelector(".back-button").style.display = "none";
    
    // Clear session when going back to login
    localStorage.removeItem('chat_username');
    localStorage.removeItem('user_channel');
    localStorage.removeItem('user_is_admin');
    localStorage.removeItem('from_admin');
    sessionStorage.removeItem('session_valid'); // Clear session validation
    
    // Clear form inputs
    const form = document.getElementById("login-form");
    if (form) {
      form.reset();
      form.dataset.submitting = 'false';
    }
  }

  // Add back button functionality
  if (chatBackBtn) {
    chatBackBtn.addEventListener('click', backToLogin);
  }
  
  // Back button from login page
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      // Clear session when going back to homepage
      sessionStorage.removeItem('session_valid');
      window.location.href = 'index.html';
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
  function initApp() {
    initEmojiPicker();
    updateUserPresence(true);
    loadRecentChats();
    
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

window.addEventListener("DOMContentLoaded", () => {
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
