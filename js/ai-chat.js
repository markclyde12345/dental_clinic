/**
 * Fano Dental Clinic — AI Chat Widgets
 * Denti:          Dental symptom assistant (restricted scope)
 * Fano Assistant: Full system & clinic support (open scope)
 */

const AI_API = 'http://localhost:5000/api/ai';

/* ═══════════════════════════════════════════════════════════
   1. INJECT HTML FOR BOTH CHAT WIDGETS
   ═══════════════════════════════════════════════════════════ */
function injectChatWidgets(showDental) {
  const html = `
    <!-- AI Chat Triggers (floating buttons) -->
    <div class="ai-chat-triggers" id="ai-chat-triggers">

      ${showDental ? `
      <!-- Dental Symptom Bot -->
      <button class="ai-trigger-btn" id="dental-trigger" aria-label="Open dental symptom assistant">
        <span class="trigger-pill">🦷 Tooth Symptom Checker</span>
        <div class="ai-trigger-orb">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2C8.5 2 5 4.5 5 8c0 2.3.9 4 2 5.5C8.5 15.8 9 17.5 9 19.5a2 2 0 004 0c0-2-.5-3.7-2-6.5 1.1-1.5 2-3.2 2-5C13 5.5 14.3 4 16 4"/>
            <path d="M16 4c2.2.5 3 2 3 4 0 2.3-.9 4-2 5.5"/>
          </svg>
          <span class="notif-dot" id="dental-notif"></span>
        </div>
      </button>
      ` : ''}

      <!-- Support Bot -->
      <button class="ai-trigger-btn" id="support-trigger" aria-label="Open system support assistant">
        <span class="trigger-pill">💬 AI System Support</span>
        <div class="ai-trigger-orb">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <span class="notif-dot" id="support-notif"></span>
        </div>
      </button>
    </div>

    ${showDental ? `
    <!-- ═══ DENTAL SYMPTOM CHAT WINDOW ═══ -->
    <div class="ai-chat-window" id="dental-chat" role="dialog" aria-label="Dental Symptom Assistant">
      <div class="chat-header">
        <div class="chat-header-avatar">🦷</div>
        <div class="chat-header-info">
          <p class="chat-header-name">Denti</p>
          <p class="chat-header-status">Dental Symptom Assistant</p>
        </div>
        <button class="chat-close-btn" id="dental-close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="chat-disclaimer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>This assistant only answers dental symptom questions. Always consult a dentist for diagnosis.</span>
      </div>

      <div class="chat-messages" id="dental-messages"></div>

      <div class="chat-suggestions" id="dental-suggestions">
        <button class="suggestion-chip" data-chat="dental">My tooth hurts when I eat</button>
        <button class="suggestion-chip" data-chat="dental">Gum bleeding when brushing</button>
        <button class="suggestion-chip" data-chat="dental">Tooth is sensitive to cold</button>
        <button class="suggestion-chip" data-chat="dental">Jaw pain and stiffness</button>
      </div>

      <div class="chat-input-area">
        <textarea class="chat-textarea" id="dental-input" placeholder="Describe your tooth or gum concern…" rows="1" maxlength="500"></textarea>
        <button class="chat-send-btn" id="dental-send" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div class="chat-footer-actions">
        <button class="chat-clear-btn" id="dental-clear">Clear conversation</button>
      </div>
    </div>
    ` : ''}

    <!-- ═══ SUPPORT CHAT WINDOW ═══ -->
    <div class="ai-chat-window" id="support-chat" role="dialog" aria-label="Fano AI Support">
      <div class="chat-header">
        <div class="chat-header-avatar">🤖</div>
        <div class="chat-header-info">
          <p class="chat-header-name">Fano Assistant</p>
          <p class="chat-header-status">AI System Support</p>
        </div>
        <button class="chat-close-btn" id="support-close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="chat-messages" id="support-messages"></div>

      <div class="chat-suggestions" id="support-suggestions">
        <button class="suggestion-chip" data-chat="support">How do I book an appointment?</button>
        <button class="suggestion-chip" data-chat="support">I can't log into my account</button>
        <button class="suggestion-chip" data-chat="support">What services do you offer?</button>
        <button class="suggestion-chip" data-chat="support">How does OTP verification work?</button>
      </div>

      <div class="chat-input-area">
        <textarea class="chat-textarea" id="support-input" placeholder="Ask anything about the clinic or system…" rows="1" maxlength="500"></textarea>
        <button class="chat-send-btn" id="support-send" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div class="chat-footer-actions">
        <button class="chat-clear-btn" id="support-clear">Clear conversation</button>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
}

/* ═══════════════════════════════════════════════════════════
   2. CHAT ENGINE
   ═══════════════════════════════════════════════════════════ */
class ChatBot {
  constructor({ windowId, endpoint, inputId, sendBtnId, messagesId, closeId, clearId, triggerId, notifId, suggestionsId, welcomeMsg }) {
    this.window      = document.getElementById(windowId);
    this.endpoint    = endpoint;
    this.input       = document.getElementById(inputId);
    this.sendBtn     = document.getElementById(sendBtnId);
    this.messages    = document.getElementById(messagesId);
    this.closeBtn    = document.getElementById(closeId);
    this.clearBtn    = document.getElementById(clearId);
    this.trigger     = document.getElementById(triggerId);
    this.notifDot    = document.getElementById(notifId);
    this.suggestions = document.getElementById(suggestionsId);
    this.welcomeMsg  = welcomeMsg;
    this.history     = [];
    this.isOpen      = false;
    this.hasGreeted  = false;

    this._bindEvents();
  }

  _bindEvents() {
    this.trigger.addEventListener('click', () => this.toggle());
    this.closeBtn.addEventListener('click', () => this.close());
    this.sendBtn.addEventListener('click', () => this._submit());
    this.clearBtn.addEventListener('click', () => this._clearChat());

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });

    // Auto-resize textarea
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 100) + 'px';
    });

    // Suggestion chips
    this.suggestions.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.input.value = chip.textContent.trim();
        this._submit();
      });
    });
  }

  open() {
    // Close other chat window if open
    document.querySelectorAll('.ai-chat-window').forEach(w => {
      if (w.id !== this.window.id) w.classList.remove('open');
    });

    this.isOpen = true;
    this.window.classList.add('open');
    document.body.classList.add('ai-chat-active');
    this.notifDot.classList.remove('show');
    // Show welcome message once
    if (!this.hasGreeted) {
      this.hasGreeted = true;
      setTimeout(() => this._addBotMsg(this.welcomeMsg), 300);
    }
    setTimeout(() => this.input.focus(), 350);
  }

  close() {
    this.isOpen = false;
    this.window.classList.remove('open');
    const anyOpen = document.querySelector('.ai-chat-window.open');
    if (!anyOpen) {
      document.body.classList.remove('ai-chat-active');
    }
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  _addBotMsg(text) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg bot';
    msg.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">${this._formatText(text)}</div>
    `;
    this.messages.appendChild(msg);
    this._scrollToBottom();
  }

  _addUserMsg(text) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg user';
    msg.innerHTML = `
      <div class="msg-bubble">${this._escapeHtml(text)}</div>
    `;
    this.messages.appendChild(msg);
    this._scrollToBottom();
  }

  _showTyping() {
    const el = document.createElement('div');
    el.className = 'chat-msg bot typing-indicator';
    el.id = 'typing-' + this.endpoint;
    el.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="typing-dots"><span></span><span></span><span></span></div>
    `;
    this.messages.appendChild(el);
    this._scrollToBottom();
  }

  _removeTyping() {
    const el = document.getElementById('typing-' + this.endpoint);
    if (el) el.remove();
  }

  _scrollToBottom() {
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  async _submit() {
    const text = this.input.value.trim();
    if (!text) return;

    this.input.value   = '';
    this.input.style.height = 'auto';
    this.sendBtn.disabled  = true;

    // Hide suggestions after first message
    if (this.suggestions) this.suggestions.style.display = 'none';

    this._addUserMsg(text);
    this._showTyping();

    // Add to history
    this.history.push({ role: 'user', text });

    try {
      const res  = await fetch(`${AI_API}/${this.endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history: this.history.slice(-10) }),
      });

      const data = await res.json();
      this._removeTyping();

      if (res.ok) {
        const reply = data.reply || "Sorry, I didn't get a response.";
        this.history.push({ role: 'model', text: reply });
        this._addBotMsg(reply);
      } else {
        this._addBotMsg(data.message || 'Something went wrong. Please try again.');
      }
    } catch {
      this._removeTyping();
      this._addBotMsg('Cannot connect to the AI service. Please make sure the server is running.');
    }

    this.sendBtn.disabled = false;
    this.input.focus();
  }

  _clearChat() {
    this.messages.innerHTML = '';
    this.history = [];
    this.hasGreeted = false;
    if (this.suggestions) this.suggestions.style.display = 'flex';
    // Re-show welcome
    setTimeout(() => {
      this.hasGreeted = true;
      this._addBotMsg(this.welcomeMsg);
    }, 100);
  }

  _formatText(text) {
    // Convert markdown-like formatting to HTML
    return this._escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  _escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

/* ═══════════════════════════════════════════════════════════
   3. INITIALIZE ON DOM READY
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Only show the dental symptom bot on the patient-dashboard page
  const showDental = window.location.pathname.includes('patient-dashboard');

  // Inject the chat widget HTML (optionally containing the dental bot markup)
  injectChatWidgets(showDental);

  let dentalBot = null;
  if (showDental) {
    // Dental Symptom Bot
    dentalBot = new ChatBot({
      windowId:     'dental-chat',
      endpoint:     'dental',
      inputId:      'dental-input',
      sendBtnId:    'dental-send',
      messagesId:   'dental-messages',
      closeId:      'dental-close',
      clearId:      'dental-clear',
      triggerId:    'dental-trigger',
      notifId:      'dental-notif',
      suggestionsId:'dental-suggestions',
      welcomeMsg:   'Hi! I\'m Denti 🦷 your dental symptom helper.\n\nDescribe what you\'re feeling in your teeth, gums, or jaw and I\'ll try to help you understand it. Remember, always visit a dentist for proper diagnosis!',
    });

    // Override bot avatar for dental
    dentalBot._addBotMsg = function(text) {
      const msg = document.createElement('div');
      msg.className = 'chat-msg bot';
      msg.innerHTML = `
        <div class="msg-avatar">🦷</div>
        <div class="msg-bubble">${this._formatText(text)}</div>
      `;
      this.messages.appendChild(msg);
      this._scrollToBottom();
    };
    dentalBot._showTyping = function() {
      const el = document.createElement('div');
      el.className = 'chat-msg bot typing-indicator';
      el.id = 'typing-' + this.endpoint;
      el.innerHTML = `
        <div class="msg-avatar">🦷</div>
        <div class="typing-dots"><span></span><span></span><span></span></div>
      `;
      this.messages.appendChild(el);
      this._scrollToBottom();
    };
  }

  // System Support Bot
  const supportBot = new ChatBot({
    windowId:     'support-chat',
    endpoint:     'support',
    inputId:      'support-input',
    sendBtnId:    'support-send',
    messagesId:   'support-messages',
    closeId:      'support-close',
    clearId:      'support-clear',
    triggerId:    'support-trigger',
    notifId:      'support-notif',
    suggestionsId:'support-suggestions',
    welcomeMsg:   'Hello! I\'m the Fano Assistant 🤖\n\nI can help you with:\n• **Booking appointments**\n• **Account & login issues**\n• **Clinic services & info**\n• **How to use the system**\n\nWhat can I help you with today?',
  });

  // Show notification dots after 3 seconds if chat not opened yet
  setTimeout(() => {
    if (dentalBot && !dentalBot.hasGreeted) dentalBot.notifDot.classList.add('show');
    if (!supportBot.hasGreeted) supportBot.notifDot.classList.add('show');
  }, 3000);

  // Close chat when clicking outside
  document.addEventListener('click', (e) => {
    const triggers = document.getElementById('ai-chat-triggers');
    const dentalWin = document.getElementById('dental-chat');
    const supportWin = document.getElementById('support-chat');
    if (
      dentalBot &&
      dentalBot.isOpen &&
      !dentalWin.contains(e.target) &&
      !triggers.contains(e.target)
    ) {
      dentalBot.close();
    }
    if (
      supportBot.isOpen &&
      !supportWin.contains(e.target) &&
      !triggers.contains(e.target)
    ) {
      supportBot.close();
    }
  });

  // ESC key closes open chat
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (dentalBot) dentalBot.close();
      supportBot.close();
    }
  });
});
