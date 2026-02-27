(function () {
  const vscode = acquireVsCodeApi();
  const chatMessages = document.getElementById("chatMessages");
  const userInput = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");
  const newConvBtn = document.getElementById("newConvBtn");

  let currentAssistantMessage = null;
  let isStreaming = false;

  sendBtn.addEventListener("click", sendMessage);
  newConvBtn.addEventListener("click", newConversation);

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  });

  function setInputEnabled(enabled) {
    sendBtn.disabled = !enabled;
    userInput.disabled = !enabled;
  }

  function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isStreaming) return;

    appendMessage("user", text);
    userInput.value = "";

    vscode.postMessage({ command: "sendMessage", text });
  }

  function newConversation() {
    chatMessages.innerHTML = "";
    currentAssistantMessage = null;
    vscode.postMessage({ command: "newConversation" });
  }

  function appendMessage(role, content) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    const roleLabel = document.createElement("div");
    roleLabel.className = "role-label";
    roleLabel.textContent = role === "user" ? "You" : role === "assistant" ? "Enclave" : "Error";

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    contentDiv.textContent = content;

    messageDiv.appendChild(roleLabel);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return { messageDiv, contentDiv };
  }

  function appendDelta(content) {
    if (!currentAssistantMessage) {
      const { contentDiv } = appendMessage("assistant", "");
      currentAssistantMessage = contentDiv;
    }
    currentAssistantMessage.textContent += content;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  window.addEventListener("message", (event) => {
    const message = event.data;

    switch (message.type) {
      case "streamStart":
        currentAssistantMessage = null;
        isStreaming = true;
        setInputEnabled(false);
        break;

      case "streamDelta":
        appendDelta(message.content);
        break;

      case "streamEnd":
        currentAssistantMessage = null;
        isStreaming = false;
        setInputEnabled(true);
        break;

      case "error":
        appendMessage("error", `⚠️ ${message.message}`);
        currentAssistantMessage = null;
        isStreaming = false;
        setInputEnabled(true);
        break;

      case "conversationReset":
        chatMessages.innerHTML = "";
        currentAssistantMessage = null;
        isStreaming = false;
        setInputEnabled(true);
        break;
    }
  });
})();
