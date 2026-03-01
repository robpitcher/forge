(function () {
  const { marked } = require("marked");

  // Configure marked for chat rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  const vscode = acquireVsCodeApi();
  const chatMessages = document.getElementById("chatMessages");
  const userInput = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");
  const newConvBtn = document.getElementById("newConvBtn");
  const attachSelectionBtn = document.getElementById("attachSelection");
  const attachFileBtn = document.getElementById("attachFile");
  const contextChipsContainer = document.getElementById("contextChips");
  const conversationList = document.getElementById("conversationList");

  let currentAssistantMessage = null;
  let currentAssistantRawText = "";
  let isStreaming = false;
  let pendingContext = [];
  let lastAutoAttachedContent = null;
  let messages = [];

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

    const sentContext = [...pendingContext];
    appendMessage("user", text, sentContext);
    messages.push({ role: "user", content: text });
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
    messages = [];
    vscode.postMessage({ command: "newConversation" });
  }

  function toggleConversationList() {
    if (conversationList.classList.contains("hidden")) {
      vscode.postMessage({ command: "listConversations" });
    } else {
      conversationList.classList.add("hidden");
    }
  }

  function relativeTime(date) {
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  }

  function renderConversationList(conversations) {
    conversationList.innerHTML = "";
    conversationList.classList.remove("hidden");

    if (!conversations || conversations.length === 0) {
      conversationList.innerHTML = '<div class="conversation-empty">No saved conversations</div>';
      return;
    }

    const header = document.createElement("div");
    header.className = "conversation-list-header";
    header.innerHTML = '<span>Conversation History</span><button class="conversation-close-btn">✕</button>';
    header.querySelector(".conversation-close-btn").addEventListener("click", () => {
      conversationList.classList.add("hidden");
    });
    conversationList.appendChild(header);

    conversations.forEach((conv) => {
      const item = document.createElement("div");
      item.className = "conversation-item";

      const info = document.createElement("div");
      info.className = "conversation-info";

      const summary = document.createElement("div");
      summary.className = "conversation-summary";
      summary.textContent = conv.summary || "Untitled conversation";

      const time = document.createElement("div");
      time.className = "conversation-time";
      time.textContent = relativeTime(conv.modifiedTime);

      info.appendChild(summary);
      info.appendChild(time);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "conversation-delete-btn";
      deleteBtn.textContent = "🗑️";
      deleteBtn.title = "Delete conversation";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ command: "deleteConversation", sessionId: conv.sessionId });
      });

      item.appendChild(info);
      item.appendChild(deleteBtn);

      item.addEventListener("click", () => {
        vscode.postMessage({ command: "resumeConversation", sessionId: conv.sessionId });
        conversationList.classList.add("hidden");
      });

      conversationList.appendChild(item);
    });
  }

  function appendMessage(role, content, contextItems = []) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    const roleLabel = document.createElement("div");
    roleLabel.className = "role-label";
    roleLabel.textContent = role === "user" ? "You" : role === "assistant" ? "Forge" : "Error";

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";

    if (role === "assistant") {
      contentDiv.classList.add("markdown-body");
      contentDiv.innerHTML = renderMarkdown(content);
    } else {
      contentDiv.textContent = content;
    }

    messageDiv.appendChild(roleLabel);
    messageDiv.appendChild(contentDiv);

    // Render sent context chips for user messages
    if (role === "user" && contextItems.length > 0) {
      const chipsContainer = document.createElement("div");
      chipsContainer.className = "sent-context-chips";

      contextItems.forEach((ctx) => {
        const chip = document.createElement("span");
        chip.className = "sent-context-chip";

        let label;
        if (ctx.type === "selection") {
          label = `📎 ${truncateFilePath(ctx.filePath)} (L${ctx.startLine}-${ctx.endLine})`;
        } else {
          label = `📄 ${truncateFilePath(ctx.filePath)}`;
        }
        chip.textContent = label;
        chip.title = ctx.filePath; // Full path in tooltip
        chipsContainer.appendChild(chip);
      });

      messageDiv.appendChild(chipsContainer);
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return { messageDiv, contentDiv };
  }

  function truncateFilePath(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    if (normalized.length <= 30) return normalized;
    const parts = normalized.split("/");
    if (parts.length <= 2) return normalized;
    return "…/" + parts.slice(-2).join("/");
  }

  function renderMarkdown(text) {
    if (!text) return "";
    return marked.parse(text);
  }

  function appendDelta(content) {
    if (!currentAssistantMessage) {
      const { contentDiv } = appendMessage("assistant", "");
      currentAssistantMessage = contentDiv;
      currentAssistantRawText = "";
    }
    currentAssistantRawText += content;
    currentAssistantMessage.innerHTML = renderMarkdown(currentAssistantRawText);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  window.addEventListener("message", (event) => {
    const message = event.data;

    switch (message.type) {
      case "authStatus":
        updateAuthBanner(message.status, message.hasEndpoint);
        break;

      case "streamStart":
        currentAssistantMessage = null;
        currentAssistantRawText = "";
        isStreaming = true;
        setInputEnabled(false);
        break;

      case "streamDelta":
        appendDelta(message.content);
        break;

      case "streamEnd":
        if (currentAssistantRawText) {
          messages.push({ role: "assistant", content: currentAssistantRawText });
        }
        currentAssistantMessage = null;
        currentAssistantRawText = "";
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

      case "toolProgress":
        renderToolProgress(message);
        break;

      case "toolPartialResult":
        renderToolPartialResult(message);
        break;

      case "toolComplete": {
        const progressEl = document.querySelector(`.tool-progress[data-tool-id="${message.id}"]`);
        if (progressEl) {
          progressEl.remove();
        }
        break;
      }


      case "conversationReset":
        chatMessages.innerHTML = "";
        currentAssistantMessage = null;
        currentAssistantRawText = "";
        isStreaming = false;
        setInputEnabled(true);
        pendingContext = [];
        contextChipsContainer.innerHTML = "";
        lastAutoAttachedContent = null;
        autoAttachedChipElement = null;
        autoAttachedCtx = null;
        messages = [];
        break;

      case "toggleHistory":
        toggleConversationList();
        break;

      case "conversationList":
        renderConversationList(message.conversations);
        break;

      case "conversationResumed":
        chatMessages.innerHTML = "";
        currentAssistantMessage = null;
        messages = message.messages || [];
        // Render restored messages
        messages.forEach((msg) => {
          appendMessage(msg.role, msg.content);
        });
        break;

      case "modelsUpdated": {
        modelSelector.innerHTML = "";
        const models = message.models || [];
        models.forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m;
          opt.textContent = m;
          modelSelector.appendChild(opt);
        });
        break;
      }

      case "modelSelected":
        if (message.model) {
          modelSelector.value = message.model;
        }
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

  function renderToolProgress(message) {
    let indicator = document.querySelector(`.tool-progress[data-tool-id="${message.id}"]`);
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "tool-progress";
      indicator.dataset.toolId = message.id;

      const spinner = document.createElement("span");
      spinner.className = "tool-spinner";
      spinner.textContent = "⟳";
      indicator.appendChild(spinner);

      const label = document.createElement("span");
      label.className = "tool-progress-label";
      indicator.appendChild(label);

      chatMessages.appendChild(indicator);
    }
    const label = indicator.querySelector(".tool-progress-label");
    if (label) {
      label.textContent = message.message;
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderToolPartialResult(message) {
    let container = document.querySelector(`.tool-partial-result[data-tool-id="${message.id}"]`);
    if (!container) {
      container = document.createElement("div");
      container.className = "tool-partial-result";
      container.dataset.toolId = message.id;

      const header = document.createElement("div");
      header.className = "tool-partial-header";

      const toggle = document.createElement("button");
      toggle.className = "tool-output-toggle";
      toggle.textContent = "▶ Partial output";
      header.appendChild(toggle);

      container.appendChild(header);

      const output = document.createElement("div");
      output.className = "tool-partial-output";
      container.appendChild(output);

      toggle.addEventListener("click", () => {
        const expanded = output.classList.toggle("expanded");
        toggle.textContent = expanded ? "▼ Partial output" : "▶ Partial output";
      });

      chatMessages.appendChild(container);
    }
    const output = container.querySelector(".tool-partial-output");
    if (output) {
      output.appendChild(document.createTextNode(message.output));
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }


  function updateAuthBanner(status, hasEndpoint) {
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

      // Only show endpoint message if endpoint is not configured
      if (!hasEndpoint) {
        banner.appendChild(document.createTextNode("🔐 Set your endpoint in "));

        const settingsLink = document.createElement("button");
        settingsLink.textContent = "Settings";
        settingsLink.addEventListener("click", () => {
          vscode.postMessage({ command: "openEndpointSettings" });
        });
        banner.appendChild(settingsLink);

        banner.appendChild(document.createTextNode(". "));
      } else {
        banner.appendChild(document.createTextNode("🔐 "));
      }

      // Auth options
      banner.appendChild(document.createTextNode("Sign in with "));

      const entraLink = document.createElement("button");
      entraLink.textContent = "Entra ID";
      entraLink.addEventListener("click", () => {
        vscode.postMessage({ command: "signIn" });
      });
      banner.appendChild(entraLink);

      banner.appendChild(document.createTextNode(" or "));

      const apiKeyLink = document.createElement("button");
      apiKeyLink.textContent = "configure an API key";
      apiKeyLink.addEventListener("click", () => {
        vscode.postMessage({ command: "setApiKey" });
      });
      banner.appendChild(apiKeyLink);

      banner.appendChild(document.createTextNode(" to start chatting."));
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
