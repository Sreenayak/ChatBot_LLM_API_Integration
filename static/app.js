const conversation = document.querySelector("#conversation");
const welcome = document.querySelector("#welcome");
const messageList = document.querySelector("#message-list");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const newChatButton = document.querySelector("#new-chat");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const storageNotice = document.querySelector("#storage-notice");

const HISTORY_STORAGE_KEY = "mira-chat-history";
const MAX_SAVED_CONVERSATIONS = 50;
let conversationId = crypto.randomUUID();
let waiting = false;
let savedConversations = loadConversations();

function showStorageNotice(message) {
  storageNotice.textContent = message;
  storageNotice.hidden = !message;
}

function loadConversations() {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved chat history has an invalid format.");

    return parsed.filter((item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.updatedAt === "number" &&
      Array.isArray(item.messages) &&
      item.messages.every((message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string"
      )
    );
  } catch (error) {
    showStorageNotice("Chat history could not be loaded from this browser.");
    return [];
  }
}

function persistConversations() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(savedConversations));
    showStorageNotice("");
    return true;
  } catch (error) {
    showStorageNotice("This conversation could not be saved in this browser. Check available browser storage.");
    return false;
  }
}

function renderHistory() {
  historyList.replaceChildren();
  historyEmpty.hidden = savedConversations.length > 0;

  savedConversations.forEach((saved) => {
    const button = document.createElement("button");
    button.className = "history-item";
    button.type = "button";
    button.disabled = waiting;
    button.setAttribute("aria-current", saved.id === conversationId ? "page" : "false");

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = saved.title;
    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = new Date(saved.updatedAt).toLocaleDateString();
    button.append(title, date);
    button.addEventListener("click", () => openConversation(saved.id));
    historyList.append(button);
  });
}

function openConversation(id) {
  const saved = savedConversations.find((item) => item.id === id);
  if (!saved || waiting) return;

  conversationId = saved.id;
  welcome.hidden = saved.messages.length > 0;
  messageList.replaceChildren();
  saved.messages.forEach((message) => appendMessage(message.role, message.content));
  renderHistory();
  input.focus();
}

function startNewChat() {
  conversationId = crypto.randomUUID();
  messageList.replaceChildren();
  welcome.hidden = false;
  input.value = "";
  input.style.height = "auto";
  renderHistory();
  input.focus();
}

function saveMessage(role, content) {
  const existing = savedConversations.find((item) => item.id === conversationId);
  const saved = existing || {
    id: conversationId,
    title: role === "user" ? content.slice(0, 48) : "New conversation",
    messages: [],
    updatedAt: Date.now(),
  };
  saved.messages.push({ role, content });
  if (role === "user" && saved.messages.filter((message) => message.role === "user").length === 1) {
    saved.title = content.slice(0, 48);
  }
  saved.updatedAt = Date.now();
  savedConversations = savedConversations.filter((item) => item.id !== conversationId);
  savedConversations.unshift(saved);
  savedConversations = savedConversations.slice(0, MAX_SAVED_CONVERSATIONS);
  persistConversations();
  renderHistory();
}

function resolveApiUrl() {
  const isLocalApp = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  const isDefaultAppPort = ["", "5000"].includes(window.location.port);
  return isLocalApp && isDefaultAppPort ? "/api/chat" : "http://127.0.0.1:5000/api/chat";
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return { error: "The server returned an empty response. Please try again." };
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { error: text.slice(0, 300) || "The server returned an invalid response. Please try again." };
  }
}

function scrollToLatest() {
  conversation.scrollTop = conversation.scrollHeight;
}

function appendMessage(role, text) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  if (role === "assistant") {
    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    const icon = document.createElement("span");
    icon.className = "bubble-glyph";
    icon.setAttribute("aria-hidden", "true");
    avatar.append(icon);
    avatar.setAttribute("aria-hidden", "true");
    row.append(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  row.append(bubble);
  messageList.append(row);
  scrollToLatest();
  return row;
}

function showTyping() {
  const row = appendMessage("assistant", "");
  row.classList.add("typing");
  const bubble = row.querySelector(".message-bubble");
  bubble.setAttribute("aria-label", "Mira is thinking");
  bubble.replaceChildren(...[0, 1, 2].map(() => {
    const dot = document.createElement("span");
    dot.className = "typing-dot";
    return dot;
  }));
  return row;
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message || waiting) return;

  const sentConversationId = conversationId;
  welcome.hidden = true;
  appendMessage("user", message);
  saveMessage("user", message);
  input.value = "";
  input.style.height = "auto";
  waiting = true;
  sendButton.disabled = true;
  newChatButton.disabled = true;
  renderHistory();
  const typing = showTyping();

  try {
    const response = await fetch(resolveApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });
    const result = await readJsonResponse(response);
    typing.remove();
    if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
    if (result.conversation_id !== sentConversationId) {
      conversationId = result.conversation_id;
      const saved = savedConversations.find((item) => item.id === sentConversationId);
      if (saved) {
        saved.id = conversationId;
        persistConversations();
      }
    }
    appendMessage("assistant", result.reply);
    saveMessage("assistant", result.reply);
  } catch (error) {
    typing.remove();
    appendMessage("assistant", error.message || "We couldn't reach Mira. Check your connection and try again.");
  } finally {
    waiting = false;
    sendButton.disabled = false;
    newChatButton.disabled = false;
    renderHistory();
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

newChatButton.addEventListener("click", startNewChat);
renderHistory();
