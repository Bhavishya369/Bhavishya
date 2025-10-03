const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const randomBtn = document.getElementById("randomBtn");

// Preloaded Q&A
const qaPairs = [
  { q: "kepler koi", a: "Kepler Objects of Interest (KOI) lists all confirmed exoplanets and candidates observed by Kepler." },
  { q: "kepler classification", a: "Kepler classifies exoplanets, planetary candidates, and false positives using light curve data." },
  { q: "tess toi", a: "TESS Objects of Interest (TOI) lists exoplanets, candidates, false positives, and known planets discovered by TESS." },
  { q: "tfowpg disposition", a: "The 'TFOWPG Disposition' column in TESS indicates classification like PC, FP, APC, or KP." },
  { q: "k2 dataset", a: "K2 Planets and Candidates dataset contains exoplanets observed during K2 mission campaigns." },
  { q: "machine learning", a: "Machine learning can classify exoplanet candidates, distinguish false positives, and predict properties." },
  { q: "neossat", a: "NEOSSat is Canada's space telescope observing asteroids, space debris, and exoplanets." },
  { q: "jwst", a: "James Webb Space Telescope (JWST) is an infrared telescope studying exoplanets, galaxies, and the early universe." },
  // Add more questions here...
];

// Scroll helper
function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Add message
function addMessage(content, sender = "user") {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", sender);
  msgDiv.innerHTML = content;
  chatBox.appendChild(msgDiv);
  scrollToBottom();
}

// Bot response
function getBotResponse(userText) {
  const text = userText.toLowerCase();

  // Greetings
  const greetings = ["hi","hello","hey","good morning","good afternoon","good evening","what's up","yo"];
  const greetResponses = [
    "Hello there! 👋 I’m ExoGuide. Ask me anything about exoplanets 🌌",
    "Hey! 🌟 Ready to explore some exoplanets?",
    "Hi! 🚀 I’m here to answer your questions about the cosmos!",
    "Hello! 🌌 Curious about planets outside our solar system?"
  ];
  if (greetings.some(g => text.includes(g))) {
    return greetResponses[Math.floor(Math.random() * greetResponses.length)];
  }

  // Keyword-based Q&A
  for (let pair of qaPairs) {
    const keywords = pair.q.toLowerCase().split(" ");
    if (keywords.some(k => text.includes(k))) return pair.a;
  }

  return "Sorry, I don't have an answer to that yet. Try asking about Kepler, TESS, K2, NEOSSat, or JWST!";
}

// Send message
sendButton.addEventListener("click", () => {
  const userText = messageInput.value.trim();
  if (!userText) return;
  addMessage(userText, "user");
  messageInput.value = "";

  const botMsg = document.createElement("div");
  botMsg.classList.add("message", "bot");
  botMsg.innerHTML = "ExoGuide is typing...";
  chatBox.appendChild(botMsg);
  scrollToBottom();

  setTimeout(() => {
    botMsg.innerHTML = getBotResponse(userText);
    scrollToBottom();
  }, 800);
});

// Enter key send
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendButton.click();
  }
});

// Random question
randomBtn.addEventListener("click", () => {
  if (qaPairs.length === 0) return;
  const randomIndex = Math.floor(Math.random() * qaPairs.length);
  const randomQuestion = qaPairs[randomIndex].q;
  addMessage(randomQuestion, "user");

  const botMsg = document.createElement("div");
  botMsg.classList.add("message", "bot");
  botMsg.innerHTML = "ExoGuide is typing...";
  chatBox.appendChild(botMsg);
  scrollToBottom();

  setTimeout(() => {
    botMsg.innerHTML = getBotResponse(randomQuestion);
    scrollToBottom();
  }, 800);
});
