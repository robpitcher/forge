(function () {
  const { marked } = require("marked");
  const DOMPurify = require("dompurify");
  const hljs = require("highlight.js/lib/core");

  // Register only languages commonly used in developer chat
  hljs.registerLanguage("javascript", require("highlight.js/lib/languages/javascript"));
  hljs.registerLanguage("typescript", require("highlight.js/lib/languages/typescript"));
  hljs.registerLanguage("python", require("highlight.js/lib/languages/python"));
  hljs.registerLanguage("java", require("highlight.js/lib/languages/java"));
  hljs.registerLanguage("csharp", require("highlight.js/lib/languages/csharp"));
  hljs.registerLanguage("go", require("highlight.js/lib/languages/go"));
  hljs.registerLanguage("rust", require("highlight.js/lib/languages/rust"));
  hljs.registerLanguage("ruby", require("highlight.js/lib/languages/ruby"));
  hljs.registerLanguage("php", require("highlight.js/lib/languages/php"));
  hljs.registerLanguage("sql", require("highlight.js/lib/languages/sql"));
  hljs.registerLanguage("bash", require("highlight.js/lib/languages/bash"));
  hljs.registerLanguage("json", require("highlight.js/lib/languages/json"));
  hljs.registerLanguage("yaml", require("highlight.js/lib/languages/yaml"));
  hljs.registerLanguage("xml", require("highlight.js/lib/languages/xml"));
  hljs.registerLanguage("css", require("highlight.js/lib/languages/css"));
  hljs.registerLanguage("markdown", require("highlight.js/lib/languages/markdown"));
  hljs.registerLanguage("diff", require("highlight.js/lib/languages/diff"));
  const { markedHighlight } = require("marked-highlight");

  const COPY_FEEDBACK_MS = 2000;
  const AUTH_BANNER_DISMISS_MS = 3000;
  const RENDER_THROTTLE_MS = 50;

  // Configure marked with syntax highlighting
  marked.use(
    markedHighlight({
      langPrefix: "hljs language-",
      highlight(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
    })
  );
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
  const modelSelector = document.getElementById("modelSelector");

  let currentAssistantMessage = null;
  let currentAssistantRawText = "";
  let isStreaming = false;
  let pendingContext = [];
  let lastAutoAttachedContent = null;
  let messages = [];
  let renderTimeout = null;
  let configIsComplete = false;
  let _lastWelcomeFlags = null;

  sendBtn.addEventListener("click", sendMessage);
  newConvBtn.addEventListener("click", newConversation);
  modelSelector.addEventListener("change", () => {
    vscode.postMessage({ command: "modelChanged", model: modelSelector.value });
  });
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

  function resetUIState() {
    isStreaming = false;
    currentAssistantRawText = "";
    currentAssistantMessage = null;
    pendingContext = [];
    contextChipsContainer.innerHTML = "";
    lastAutoAttachedContent = null;
    autoAttachedChipElement = null;
    autoAttachedCtx = null;
    setInputEnabled(true);
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

  function applyConfigStatus(hasEndpoint, hasAuth, hasModels) {
    const welcomeScreen = document.getElementById("welcomeScreen");
    const inputArea = document.querySelector(".input-area");
    configIsComplete = hasEndpoint && hasAuth && hasModels;

    if (!configIsComplete) {
      const flagsKey = `${hasEndpoint}:${hasAuth}:${hasModels}`;
      if (_lastWelcomeFlags === flagsKey) { return; }
      _lastWelcomeFlags = flagsKey;

      welcomeScreen.classList.remove("hidden");
      chatMessages.classList.add("hidden");
      inputArea.classList.add("hidden");
      renderWelcomeScreen(welcomeScreen, hasEndpoint, hasAuth, hasModels);
    } else {
      _lastWelcomeFlags = null;
      welcomeScreen.classList.add("hidden");
      chatMessages.classList.remove("hidden");
      inputArea.classList.remove("hidden");
    }
  }

  function showConfigCheckFeedback(missing, allGood) {
    const feedbackEl = document.getElementById("configCheckFeedback");
    if (!feedbackEl) { return; }

    if (allGood) {
      feedbackEl.innerHTML = '<span class="config-feedback-ok">✅ All set!</span>';
    } else {
      const items = missing.map((m) => `<div class="config-feedback-item">❌ Missing: ${m}</div>`).join("");
      feedbackEl.innerHTML = items;
    }

    feedbackEl.classList.remove("hidden");
    // Re-trigger animation on repeat clicks
    feedbackEl.classList.remove("config-feedback-flash");
    void feedbackEl.offsetWidth;
    feedbackEl.classList.add("config-feedback-flash");
  }

  function renderWelcomeScreen(container, hasEndpoint, hasAuth, hasModels) {
    container.innerHTML = "";

    const icon = document.createElement("img");
    icon.className = "welcome-icon";
    icon.src = container.dataset.iconUri;
    icon.alt = "Forge";
    container.appendChild(icon);

    const title = document.createElement("h1");
    title.textContent = "Welcome to Forge";
    container.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = "AI chat powered by your Azure AI Foundry endpoint — private, secure, yours.";
    container.appendChild(subtitle);

    const steps = document.createElement("div");
    steps.className = "setup-steps";

    // Step 1: Endpoint
    const step1 = createSetupStep(
      1, hasEndpoint,
      "Connect your endpoint",
      "Point Forge to your Azure AI Foundry resource",
      [{ label: "Open Endpoint Settings", command: "openEndpointSettings" }]
    );
    steps.appendChild(step1);

    // Step 2: Model
    const step2 = createSetupStep(
      2, hasModels,
      "Add a model",
      "Configure your model deployment name(s)",
      [{ label: "Open Model Settings", command: "openModelSettings" }]
    );
    steps.appendChild(step2);

    // Step 3: Auth
    const step3 = createSetupStep(
      3, hasAuth,
      "Authenticate",
      "Sign in with Entra ID or provide an API key",
      [
        { label: "Sign in with Entra ID", command: "signIn" },
        { label: "Set API Key", command: "setApiKey" },
      ]
    );
    steps.appendChild(step3);

    container.appendChild(steps);

    // "Check Configuration" button
    const checkDiv = document.createElement("div");
    checkDiv.className = "check-config";
    const checkBtn = document.createElement("button");
    checkBtn.className = "check-config-btn";
    checkBtn.textContent = "🔄 Check Configuration";
    checkBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "checkConfig" });
    });
    checkDiv.appendChild(checkBtn);

    const feedbackDiv = document.createElement("div");
    feedbackDiv.id = "configCheckFeedback";
    feedbackDiv.className = "config-check-feedback hidden";
    checkDiv.appendChild(feedbackDiv);

    container.appendChild(checkDiv);

    const helpDiv = document.createElement("div");
    helpDiv.className = "help-link";
    helpDiv.appendChild(document.createTextNode("Need help? "));
    const helpBtn = document.createElement("button");
    helpBtn.textContent = "View documentation";
    helpBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "openDocs" });
    });
    helpDiv.appendChild(helpBtn);
    container.appendChild(helpDiv);
  }

  function createSetupStep(number, completed, title, description, actions) {
    const step = document.createElement("div");
    step.className = "setup-step" + (completed ? " completed" : "");

    const indicator = document.createElement("div");
    indicator.className = "step-indicator";
    if (completed) {
      indicator.textContent = "✅";
    } else {
      const circle = document.createElement("div");
      circle.className = "step-number";
      circle.textContent = String(number);
      indicator.appendChild(circle);
    }
    step.appendChild(indicator);

    const content = document.createElement("div");
    content.className = "step-content";

    const h3 = document.createElement("h3");
    h3.textContent = title;
    content.appendChild(h3);

    const p = document.createElement("p");
    p.textContent = description;
    content.appendChild(p);

    if (!completed) {
      actions.forEach(({ label, command }) => {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.addEventListener("click", () => {
          vscode.postMessage({ command });
        });
        content.appendChild(btn);
      });
    }

    step.appendChild(content);
    return step;
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
      addCopyButtons(contentDiv);
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
    return DOMPurify.sanitize(marked.parse(text));
  }

  function addCopyButtons(container) {
    const preBlocks = container.querySelectorAll("pre");
    preBlocks.forEach((pre) => {
      if (pre.querySelector(".code-copy-btn")) return;
      const btn = document.createElement("button");
      btn.className = "code-copy-btn";
      btn.type = "button";
      btn.title = "Copy code";
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5z"/></svg>';
      const copyIcon = btn.innerHTML;
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code");
        const text = code ? code.textContent : pre.textContent;
        navigator.clipboard.writeText(text).then(() => {
          btn.innerHTML = '<span class="code-copy-feedback">Copied!</span>';
          setTimeout(() => {
            btn.innerHTML = copyIcon;
          }, COPY_FEEDBACK_MS);
        }).catch((err) => {
          console.error("Clipboard write failed:", err);
          btn.innerHTML = '<span class="code-copy-feedback">Copy failed</span>';
          setTimeout(() => { btn.innerHTML = copyIcon; }, COPY_FEEDBACK_MS);
        });
      });
      pre.appendChild(btn);
    });
  }

  function appendDelta(content) {
    if (!currentAssistantMessage) {
      const { contentDiv } = appendMessage("assistant", "");
      currentAssistantMessage = contentDiv;
      currentAssistantRawText = "";
    }
    currentAssistantRawText += content;
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      currentAssistantMessage.innerHTML = renderMarkdown(currentAssistantRawText);
      addCopyButtons(currentAssistantMessage);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      renderTimeout = null;
    }, RENDER_THROTTLE_MS);
  }

  window.addEventListener("message", (event) => {
    const message = event.data;

    switch (message.type) {
      case "authStatus":
        updateAuthBanner(message.status, message.hasEndpoint);
        break;
      
      case "cliStatus":
        updateCliBanner(message.result);
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
        if (renderTimeout) {
          clearTimeout(renderTimeout);
          renderTimeout = null;
        }
        if (currentAssistantMessage) {
          currentAssistantMessage.innerHTML = renderMarkdown(currentAssistantRawText);
          addCopyButtons(currentAssistantMessage);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
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
        currentAssistantRawText = "";
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
        const progressEl = document.querySelector(`.tool-progress[data-tool-id="${CSS.escape(message.id)}"]`);
        if (progressEl) {
          progressEl.remove();
        }
        break;
      }


      case "conversationReset":
        resetUIState();
        if (configIsComplete) {
          chatMessages.innerHTML = "";
        }
        messages = [];
        break;

      case "toggleHistory":
        toggleConversationList();
        break;

      case "conversationList":
        renderConversationList(message.conversations);
        break;

      case "conversationResumed":
        resetUIState();
        chatMessages.innerHTML = "";
        messages = message.messages || [];
        // Render restored messages
        messages.forEach((msg) => {
          appendMessage(msg.role, msg.content);
        });
        break;

      case "modelsUpdated": {
        modelSelector.innerHTML = "";
        const models = message.models || [];
        if (models.length === 0) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "No models configured";
          opt.disabled = true;
          opt.selected = true;
          modelSelector.appendChild(opt);
          modelSelector.disabled = true;
        } else {
          modelSelector.disabled = false;
          models.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            modelSelector.appendChild(opt);
          });
        }
        break;
      }

      case "modelSelected":
        if (message.model) {
          modelSelector.value = message.model;
        }
        break;

      case "configStatus": {
        applyConfigStatus(message.hasEndpoint, message.hasAuth, message.hasModels);
        break;
      }

      case "configCheckResult": {
        showConfigCheckFeedback(message.missing, message.allGood);
        break;
      }

      case "toolTimeout": {
        const card = document.querySelector(`.tool-confirmation[data-tool-id="${CSS.escape(message.id)}"]`);
        if (card) {
          const actions = card.querySelector(".tool-actions");
          if (actions) {
            actions.innerHTML = "";
            const status = document.createElement("span");
            status.className = "tool-status-rejected";
            status.textContent = "Timed out — auto-denied";
            actions.appendChild(status);
          }
          const btns = card.querySelectorAll("button");
          btns.forEach((b) => { b.disabled = true; });
        }
        break;
      }
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
    let indicator = document.querySelector(`.tool-progress[data-tool-id="${CSS.escape(message.id)}"]`);
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
    let container = document.querySelector(`.tool-partial-result[data-tool-id="${CSS.escape(message.id)}"]`);
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
      }, AUTH_BANNER_DISMISS_MS);
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

  function updateCliBanner(result) {
    let banner = document.getElementById("cliBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "cliBanner";
      banner.className = "auth-banner";
      chatMessages.insertBefore(banner, chatMessages.firstChild);
    }
    
    // Clear existing content
    banner.innerHTML = "";
    
    if (result.valid) {
      banner.className = "auth-banner authenticated";
      banner.textContent = `✅ CLI ready`;
      
      // Auto-dismiss after 2 seconds
      setTimeout(() => {
        if (banner.parentNode) {
          banner.remove();
        }
      }, 2000);
    } else {
      // CLI validation failed
      banner.className = "auth-banner error";
      
      let message = "";
      if (result.reason === "not_found") {
        const details = (result.details || "").toLowerCase();
        if (details.includes("no clipath configured")) {
          // Startup preflight already prompts auto-install in this case; avoid redundant red error banner.
          if (banner.parentNode) {
            banner.remove();
          }
          return;
        }
        message = "⚠️ Copilot CLI not found. Install GitHub Copilot CLI or configure path.";
      } else if (result.reason === "wrong_binary") {
        message = "⚠️ Wrong 'copilot' binary detected. Please configure the correct path.";
      } else if (result.reason === "version_check_failed") {
        const details = result.details ? ` (${result.details})` : "";
        message = `⚠️ Could not verify Copilot CLI${details}.`;
      }
      
      banner.appendChild(document.createTextNode(message + " "));
      
      const fixBtn = document.createElement("button");
      fixBtn.textContent = "Fix";
      fixBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "openSettings" });
      });
      banner.appendChild(fixBtn);
    }
  }

  // Signal readiness so extension can send initial state (avoids race condition)
  vscode.postMessage({ command: "webviewReady" });
})();
