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
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  userInput.addEventListener("input", autoResizeTextarea);

  function autoResizeTextarea() {
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
  }

  function setInputEnabled(enabled) {
    sendBtn.disabled = !enabled;
    userInput.disabled = !enabled;
  }

  function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isStreaming) return;

    appendMessage("user", text);
    userInput.value = "";
    autoResizeTextarea();

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
    roleLabel.textContent = role === "user" ? "You" : role === "assistant" ? "Forge" : "Error";

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

      case "toolConfirmation":
        renderToolConfirmation(message);
        break;

      case "toolResult":
        renderToolResult(message);
        break;

      case "conversationReset":
        chatMessages.innerHTML = "";
        currentAssistantMessage = null;
        isStreaming = false;
        setInputEnabled(true);
        break;
    }
  });

  function renderToolConfirmation(message) {
    const card = document.createElement("div");
    card.className = "tool-confirmation";
    card.dataset.toolId = message.id;

    const header = document.createElement("div");
    header.className = "tool-name";
    header.textContent = `🔧 Tool: ${message.tool}`;

    const params = document.createElement("div");
    params.className = "tool-params";

    function formatParamValue(value) {
      if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      if (typeof value === "string") {
        return value.length > 120 ? value.slice(0, 120) + "…" : value;
      }
      try {
        const seen = new WeakSet();
        const json = JSON.stringify(
          value,
          (key, val) => {
            if (typeof val === "object" && val !== null) {
              if (seen.has(val)) {
                return "[Circular]";
              }
              seen.add(val);
            }
            return val;
          },
          2
        );
        const maxLen = 200;
        return json.length > maxLen ? json.slice(0, maxLen) + "…" : json;
      } catch (e) {
        return String(value);
      }
    }

    const paramEntries = message.params ? Object.entries(message.params) : [];
    params.textContent = paramEntries
      .map(([k, v]) => {
        return `${k}: ${formatParamValue(v)}`;
      })
      .join("\n");

    const actions = document.createElement("div");
    actions.className = "tool-actions";

    const approveBtn = document.createElement("button");
    approveBtn.className = "tool-btn-approve";
    approveBtn.textContent = "Approve";

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "tool-btn-reject";
    rejectBtn.textContent = "Reject";

    function respond(approved) {
      vscode.postMessage({ command: "toolResponse", id: message.id, approved });
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      actions.innerHTML = "";
      const status = document.createElement("span");
      status.className = approved ? "tool-status-approved" : "tool-status-rejected";
      status.textContent = approved ? "Approved ✓" : "Rejected ✗";
      actions.appendChild(status);
    }

    approveBtn.addEventListener("click", () => respond(true));
    rejectBtn.addEventListener("click", () => respond(false));

    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);

    card.appendChild(header);
    card.appendChild(params);
    card.appendChild(actions);
    chatMessages.appendChild(card);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderToolResult(message) {
    const result = document.createElement("div");
    result.className = `tool-result ${message.status === "success" ? "success" : "error"}`;

    const icon = message.status === "success" ? "✅" : "❌";
    const verb = message.status === "success" ? "completed" : "failed";

    const summary = document.createElement("div");
    summary.className = "tool-result-summary";
    summary.textContent = `${icon} ${message.tool} ${verb}`;

    result.appendChild(summary);

    if (message.output) {
      const toggle = document.createElement("button");
      toggle.className = "tool-output-toggle";
      toggle.textContent = " ▶ Details";
      summary.appendChild(toggle);

      const output = document.createElement("div");
      output.className = "tool-output";
      output.textContent = message.output;
      result.appendChild(output);

      toggle.addEventListener("click", () => {
        const expanded = output.classList.toggle("expanded");
        toggle.textContent = expanded ? " ▼ Details" : " ▶ Details";
      });
    }

    chatMessages.appendChild(result);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
})();
