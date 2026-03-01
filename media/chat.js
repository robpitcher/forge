(function () {
  const vscode = acquireVsCodeApi();
  const chatMessages = document.getElementById("chatMessages");
  const userInput = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");
  const newConvBtn = document.getElementById("newConvBtn");
  const attachSelectionBtn = document.getElementById("attachSelection");
  const attachFileBtn = document.getElementById("attachFile");
  const contextChipsContainer = document.getElementById("contextChips");

  let currentAssistantMessage = null;
  let isStreaming = false;
  let pendingContext = [];
  let lastAutoAttachedContent = null;

  sendBtn.addEventListener("click", sendMessage);
  newConvBtn.addEventListener("click", newConversation);
  attachSelectionBtn.addEventListener("click", () => {
    vscode.postMessage({ command: "attachSelection" });
  });
  attachFileBtn.addEventListener("click", () => {
    vscode.postMessage({ command: "attachFile" });
  });

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  userInput.addEventListener("input", autoResizeTextarea);

  let autoAttachedChipElement = null;
  let autoAttachedCtx = null;

  userInput.addEventListener("focus", () => {
    if (pendingContext.length === 0 && !contextChipsContainer.hasChildNodes()) {
      vscode.postMessage({ command: "chatFocused" });
    }
  });

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

    const msg = { command: "sendMessage", text };
    if (pendingContext.length > 0) {
      msg.context = pendingContext;
      pendingContext = [];
      contextChipsContainer.innerHTML = "";
    }
    lastAutoAttachedContent = null;
    autoAttachedChipElement = null;
    autoAttachedCtx = null;
    vscode.postMessage(msg);
  }

  function newConversation() {
    chatMessages.innerHTML = "";
    currentAssistantMessage = null;
    pendingContext = [];
    contextChipsContainer.innerHTML = "";
    lastAutoAttachedContent = null;
    autoAttachedChipElement = null;
    autoAttachedCtx = null;
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
      case "authStatus":
        updateAuthBanner(message.status);
        break;

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

      case "contextAttached": {
        const ctx = message.context;
        const key = ctx.content + ":" + ctx.filePath + ":" + (ctx.startLine || "") + ":" + (ctx.endLine || "");
        if (key === lastAutoAttachedContent) { break; }
        if (message.autoAttached && autoAttachedChipElement) {
          const idx = pendingContext.indexOf(autoAttachedCtx);
          if (idx !== -1) { pendingContext.splice(idx, 1); }
          autoAttachedChipElement.remove();
          autoAttachedChipElement = null;
          autoAttachedCtx = null;
        }
        lastAutoAttachedContent = key;
        const chip = addContextChip(ctx);
        if (message.autoAttached) {
          autoAttachedChipElement = chip;
          autoAttachedCtx = ctx;
        }
        break;
      }

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
        pendingContext = [];
        contextChipsContainer.innerHTML = "";
        lastAutoAttachedContent = null;
        autoAttachedChipElement = null;
        autoAttachedCtx = null;
        break;
    }
  });

  function addContextChip(ctx) {
    pendingContext.push(ctx);
    const chip = document.createElement("span");
    chip.className = "context-chip";
    let label;
    if (ctx.type === "selection") {
      label = `📎 ${ctx.filePath}:${ctx.startLine}-${ctx.endLine} (${ctx.languageId})`;
    } else {
      label = `📄 ${ctx.filePath} (${ctx.languageId})`;
    }
    const text = document.createTextNode(label + " ");
    chip.appendChild(text);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.setAttribute("aria-label", "Remove attached context");
    removeBtn.title = "Remove attached context";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      const idx = pendingContext.indexOf(ctx);
      if (idx !== -1) { pendingContext.splice(idx, 1); }
      chip.remove();
    });
    chip.appendChild(removeBtn);
    contextChipsContainer.appendChild(chip);
    return chip;
  }

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

  function updateAuthBanner(status) {
    let banner = document.getElementById("authBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "authBanner";
      banner.className = "auth-banner";
      chatMessages.insertBefore(banner, chatMessages.firstChild);
    }
    
    // Clear existing content
    banner.innerHTML = "";
    
    if (status.state === "authenticated") {
      banner.className = "auth-banner authenticated";
      const methodLabel = status.method === "entraId" ? "Entra ID" : "API Key";
      banner.textContent = `✅ Authenticated via ${methodLabel}`;
      
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        if (banner.parentNode) {
          banner.remove();
        }
      }, 3000);
    } else if (status.state === "notAuthenticated") {
      banner.className = "auth-banner not-authenticated";
      banner.textContent = "🔐 Sign in to start chatting — ";
      
      const signInBtn = document.createElement("button");
      signInBtn.textContent = "Sign In";
      signInBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "signIn" });
      });
      banner.appendChild(signInBtn);
    } else if (status.state === "error") {
      banner.className = "auth-banner error";
      const rawMsg = status.message || "Unknown error";
      const shortMsg = rawMsg.length > 80 ? rawMsg.slice(0, 80) + "…" : rawMsg;
      banner.textContent = `⚠️ Authentication issue — ${shortMsg} `;
      
      const troubleshootBtn = document.createElement("button");
      troubleshootBtn.textContent = "Troubleshoot";
      troubleshootBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "openSettings" });
      });
      banner.appendChild(troubleshootBtn);
    }
  }
})();
