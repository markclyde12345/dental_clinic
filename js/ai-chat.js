/**
 * Fano Dental Clinic — Unified AI Assistant
 * Single floating trigger button that opens a full-featured assistant
 * with quick-action symptom intake ("Check My Symptoms" / Denti) and General Support.
 */

(function() {
  'use strict';

  const BASE_ORIGIN = (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port !== '5000' && window.location.port !== ''
  ) ? 'http://localhost:5000' : '';
  const AI_API = `${BASE_ORIGIN}/api/ai`;

  const SUGGESTIONS = {
    support: [
      'How do I book an appointment?',
      'What dental services do you offer?',
      'Check clinic branch locations',
      'Doctor schedules & office hours'
    ],
    dental: [
      'My tooth hurts when chewing',
      'Gum bleeding when brushing',
      'Sharp sensitivity to cold / hot',
      'Jaw stiffness & clicking pain'
    ]
  };

  const WELCOME_MSGS = {
    support: 'Hello! I\'m your **Fano AI Assistant** 🤖\n\nI can help you with:\n• **Booking appointments & rescheduling**\n• **Clinic services, fees & branches**\n• **Account & login assistance**\n• **Checking dentist schedules**\n\nHow can I help you today?',
    dental: 'Hi! I\'m **Denti** 🦷, your dental symptom helper.\n\nDescribe what you are feeling in your teeth, gums, or jaw (e.g. sharp pain, swelling, bleeding) and I will help you assess potential causes. Remember, always visit our clinic for a proper in-person examination!'
  };

  /* ═══════════════════════════════════════════════════════════
     1. INJECT UNIFIED CHAT WIDGET
     ═══════════════════════════════════════════════════════════ */
  function injectChatWidgets() {
    const html = `
      <!-- Single Floating AI Trigger -->
      <div class="ai-chat-triggers" id="ai-chat-triggers">
        <div class="ai-trigger-row" id="ai-unified-trigger-row">
          <span class="trigger-pill" id="ai-unified-pill">💬 Fano AI Assistant</span>
          <button class="ai-trigger-orb" id="ai-unified-trigger" type="button" aria-label="Open AI Assistant" title="Click to chat with Fano AI Assistant">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <span class="notif-dot" id="ai-unified-notif"></span>
          </button>
        </div>
      </div>

      <!-- Single Unified AI Assistant Window -->
      <div class="ai-chat-window unified-chat-window" id="fano-unified-chat" role="dialog" aria-label="Fano AI Assistant">
        <div class="chat-header" id="chat-header">
          <div class="chat-header-avatar" id="chat-header-avatar">🤖</div>
          <div class="chat-header-info">
            <p class="chat-header-name" id="chat-header-name">Fano AI Assistant</p>
            <p class="chat-header-status" id="chat-header-status">Online • 24/7 Clinic Guide</p>
          </div>
          <button class="chat-close-btn" id="chat-close-btn" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Quick-Action Mode Switch Bar -->
        <div class="chat-mode-bar">
          <button type="button" class="chat-mode-btn active" id="btn-mode-support" data-mode="support">
            <span>💬 General Support</span>
          </button>
          <button type="button" class="chat-mode-btn symptom-btn" id="btn-mode-dental" data-mode="dental">
            <span>🦷 Check Symptoms</span>
          </button>
        </div>

        <!-- Specialized Symptom Disclaimer Banner -->
        <div class="chat-disclaimer" id="chat-disclaimer" style="display: none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span><strong>Symptom Intake:</strong> AI assessment only. Please book an appointment for official diagnosis.</span>
        </div>

        <!-- Message Stream -->
        <div class="chat-messages" id="chat-messages"></div>

        <!-- Suggestion Chips -->
        <div class="chat-suggestions" id="chat-suggestions"></div>

        <!-- Input Area -->
        <div class="chat-input-area">
          <textarea class="chat-textarea" id="chat-input" placeholder="Ask anything about the clinic or appointments…" rows="1" maxlength="500"></textarea>
          <button class="chat-send-btn" id="chat-send-btn" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>

        <!-- Footer -->
        <div class="chat-footer-actions">
          <button class="chat-clear-btn" id="chat-clear-btn">Clear conversation</button>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
  }

  /* ═══════════════════════════════════════════════════════════
     2. UNIFIED CHAT CONTROLLER
     ═══════════════════════════════════════════════════════════ */
  class UnifiedAssistant {
    constructor() {
      this.window       = document.getElementById('fano-unified-chat');
      this.trigger      = document.getElementById('ai-unified-trigger');
      this.pill         = document.getElementById('ai-unified-pill');
      this.notifDot     = document.getElementById('ai-unified-notif');
      this.closeBtn     = document.getElementById('chat-close-btn');
      this.header       = document.getElementById('chat-header');
      this.avatar       = document.getElementById('chat-header-avatar');
      this.title        = document.getElementById('chat-header-name');
      this.status       = document.getElementById('chat-header-status');
      this.disclaimer   = document.getElementById('chat-disclaimer');
      this.messages     = document.getElementById('chat-messages');
      this.suggestions  = document.getElementById('chat-suggestions');
      this.input        = document.getElementById('chat-input');
      this.sendBtn      = document.getElementById('chat-send-btn');
      this.clearBtn     = document.getElementById('chat-clear-btn');
      this.btnSupport   = document.getElementById('btn-mode-support');
      this.btnDental    = document.getElementById('btn-mode-dental');

      this.mode         = 'support'; // 'support' | 'dental'
      this.isOpen       = false;
      this.history      = { support: [], dental: [] };
      this.greeted      = { support: false, dental: false };

      this._bindEvents();
      this._renderSuggestions();
    }

    _bindEvents() {
      this.trigger.addEventListener('click', () => this.toggle());
      this.closeBtn.addEventListener('click', () => this.close());
      this.sendBtn.addEventListener('click', () => this._submit());
      this.clearBtn.addEventListener('click', () => this._clearChat());

      this.btnSupport.addEventListener('click', () => this.setMode('support'));
      this.btnDental.addEventListener('click', () => this.setMode('dental'));

      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._submit();
        }
      });

      this.input.addEventListener('input', () => {
        this.input.style.height = 'auto';
        this.input.style.height = Math.min(this.input.scrollHeight, 100) + 'px';
      });
    }

    setMode(newMode) {
      if (this.mode === newMode && this.greeted[newMode]) return;
      this.mode = newMode;

      if (this.mode === 'dental') {
        this.btnDental.classList.add('active');
        this.btnSupport.classList.remove('active');
        this.header.classList.add('dental-theme');
        this.avatar.textContent = '🦷';
        this.title.textContent = 'Denti — Symptom Checker';
        this.status.textContent = 'Dental Health Assistant';
        this.disclaimer.style.display = 'flex';
        this.input.placeholder = "Describe what you're feeling in your teeth or gums…";
      } else {
        this.btnSupport.classList.add('active');
        this.btnDental.classList.remove('active');
        this.header.classList.remove('dental-theme');
        this.avatar.textContent = '🤖';
        this.title.textContent = 'Fano AI Assistant';
        this.status.textContent = 'Online • 24/7 Clinic Guide';
        this.disclaimer.style.display = 'none';
        this.input.placeholder = "Ask anything about the clinic or appointments…";
      }

      this._renderSuggestions();

      // If mode hasn't greeted yet, send its welcome message
      if (!this.greeted[this.mode]) {
        this.greeted[this.mode] = true;
        this._addBotMsg(WELCOME_MSGS[this.mode], this.mode === 'dental' ? '🦷' : '🤖');
      }

      this.input.focus();
    }

    _renderSuggestions() {
      const list = SUGGESTIONS[this.mode] || [];
      this.suggestions.innerHTML = list.map(text => 
        `<button type="button" class="suggestion-chip ${this.mode === 'dental' ? 'dental-chip' : ''}">${this._escapeHtml(text)}</button>`
      ).join('');

      this.suggestions.style.display = 'flex';
      this.suggestions.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this.input.value = chip.textContent.trim();
          this._submit();
        });
      });
    }

    open() {
      this.isOpen = true;
      this.window.classList.add('open');
      document.body.classList.add('ai-chat-active');
      this.notifDot.classList.remove('show');

      if (!this.greeted.support) {
        this.greeted.support = true;
        setTimeout(() => this._addBotMsg(WELCOME_MSGS.support, '🤖'), 300);
      }
      setTimeout(() => this.input.focus(), 350);
    }

    close() {
      this.isOpen = false;
      this.window.classList.remove('open');
      document.body.classList.remove('ai-chat-active');
    }

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    _addBotMsg(text, icon) {
      const avatarIcon = icon || (this.mode === 'dental' ? '🦷' : '🤖');
      const msg = document.createElement('div');
      msg.className = 'chat-msg bot';
      msg.innerHTML = `
        <div class="msg-avatar">${avatarIcon}</div>
        <div class="msg-bubble">${this._formatText(text)}</div>
      `;
      this.messages.appendChild(msg);
      this._scrollToBottom();
    }

    _addUserMsg(text) {
      const msg = document.createElement('div');
      msg.className = 'chat-msg user';
      msg.innerHTML = `
        <div class="msg-bubble ${this.mode === 'dental' ? 'user-dental' : ''}">${this._escapeHtml(text)}</div>
      `;
      this.messages.appendChild(msg);
      this._scrollToBottom();
    }

    _showTyping() {
      const avatarIcon = this.mode === 'dental' ? '🦷' : '🤖';
      const el = document.createElement('div');
      el.className = 'chat-msg bot typing-indicator';
      el.id = 'ai-unified-typing';
      el.innerHTML = `
        <div class="msg-avatar">${avatarIcon}</div>
        <div class="typing-dots"><span></span><span></span><span></span></div>
      `;
      this.messages.appendChild(el);
      this._scrollToBottom();
    }

    _removeTyping() {
      const el = document.getElementById('ai-unified-typing');
      if (el) el.remove();
    }

    _scrollToBottom() {
      this.messages.scrollTop = this.messages.scrollHeight;
    }

    async _submit() {
      const text = this.input.value.trim();
      if (!text) return;

      const currentMode = this.mode;
      this.input.value = '';
      this.input.style.height = 'auto';
      this.sendBtn.disabled = true;

      if (this.suggestions) this.suggestions.style.display = 'none';

      this._addUserMsg(text);
      this._showTyping();

      this.history[currentMode].push({ role: 'user', text });

      try {
        const res = await fetch(`${AI_API}/${currentMode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history: this.history[currentMode].slice(-10) }),
        });

        const data = await res.json();
        this._removeTyping();

        if (res.ok) {
          const reply = data.reply || "I didn't catch that. Could you please rephrase?";
          this.history[currentMode].push({ role: 'model', text: reply });
          this._addBotMsg(reply, currentMode === 'dental' ? '🦷' : '🤖');
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
      this.history = { support: [], dental: [] };
      this.greeted = { support: false, dental: false };
      this._renderSuggestions();
      this.setMode(this.mode);
    }

    _formatText(text) {
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
  function initUnifiedAssistant() {
    if (document.getElementById('ai-chat-triggers')) return;

    injectChatWidgets();
    const assistant = new UnifiedAssistant();

    // Auto-hide the non-clickable name label after 2 seconds
    setTimeout(() => {
      const pill = document.getElementById('ai-unified-pill');
      if (pill) pill.classList.add('pill-hidden');
    }, 2000);

    // Show notification dot after 3 seconds if not opened
    setTimeout(() => {
      if (!assistant.greeted.support && !assistant.isOpen) {
        assistant.notifDot.classList.add('show');
      }
    }, 3000);

    // Close on outside click
    document.addEventListener('click', (e) => {
      const triggers = document.getElementById('ai-chat-triggers');
      const win = document.getElementById('fano-unified-chat');
      if (assistant.isOpen && win && !win.contains(e.target) && triggers && !triggers.contains(e.target)) {
        assistant.close();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && assistant.isOpen) {
        assistant.close();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUnifiedAssistant);
  } else {
    initUnifiedAssistant();
  }

})();
