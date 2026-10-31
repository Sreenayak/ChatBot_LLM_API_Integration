const conversation = document.querySelector("#conversation");
const welcome = document.querySelector("#welcome");
const messageList = document.querySelector("#message-list");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const newChatButton = document.querySelector("#new-chat");

let conversationId = crypto.randomUUID();
let waiting = false;

function scrollToLatest() {
  conversation.scrollTop = conversation.scrollHeight;
}

function appendMessage(role, text) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  if (role === "assistant") {
    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    avatar.textContent = "✦";
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
  bubble.setAttribute("aria-label", "Lumi is thinking");
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

  welcome.hidden = true;
  appendMessage("user", message);
  input.value = "";
  input.style.height = "auto";
  waiting = true;
  sendButton.disabled = true;
  newChatButton.disabled = true;
  const typing = showTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });
    const result = await response.json();
    typing.remove();
    if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
    conversationId = result.conversation_id;
    appendMessage("assistant", result.reply);
  } catch (error) {
    typing.remove();
    appendMessage("assistant", error.message || "We couldn't reach Lumi. Check your connection and try again.");
  } finally {
    waiting = false;
    sendButton.disabled = false;
    newChatButton.disabled = false;
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

newChatButton.addEventListener("click", () => {
  conversationId = crypto.randomUUID();
  messageList.replaceChildren();
  welcome.hidden = false;
  input.value = "";
  input.focus();
});
