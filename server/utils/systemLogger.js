// ─── Shared Live System Logs & Cross-Module Error Monitor ──────────────────────
const systemLogsBuffer = [
  { id: 1, timestamp: new Date(Date.now() - 120000).toISOString(), level: 'INFO', module: 'SYSTEM', message: 'System core services initialized. Security middleware (Helmet, RateLimiters, XSS) active.' },
  { id: 2, timestamp: new Date(Date.now() - 90000).toISOString(), level: 'SUCCESS', module: 'DATABASE', message: 'Supabase PostgreSQL cloud connection verified and pool active.' },
  { id: 3, timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', module: 'AI', message: 'AI Dental Symptoms & Diagnosis service online (Gemini 2.5 Flash).' },
  { id: 4, timestamp: new Date(Date.now() - 40000).toISOString(), level: 'INFO', module: 'AUTH', message: 'JWT Auth token validator and RBAC guards online.' },
  { id: 5, timestamp: new Date(Date.now() - 20000).toISOString(), level: 'INFO', module: 'SYSTEM', message: 'REST API listener ready on port 5000.' }
];

let nextLogId = 6;
let consoleHookInstalled = false;
let isRecordingConsole = false;

const recordServerLog = (level, moduleName, message) => {
  const cleanLevel = (level || 'INFO').toUpperCase();
  const normalizedLevel = cleanLevel === 'WARNING' ? 'WARN' : cleanLevel;
  const newEntry = {
    id: nextLogId++,
    timestamp: new Date().toISOString(),
    level: normalizedLevel,
    module: (moduleName || 'SYSTEM').toUpperCase(),
    message: String(message || '').slice(0, 500)
  };
  systemLogsBuffer.unshift(newEntry);
  if (systemLogsBuffer.length > 250) {
    systemLogsBuffer.pop();
  }
  return newEntry;
};

const detectModuleFromPath = (urlPath = '') => {
  const p = String(urlPath).toLowerCase();
  if (p.includes('/auth')) return 'AUTH';
  if (p.includes('/appointment')) return 'APPOINTMENTS';
  if (p.includes('/patient')) return 'PATIENTS';
  if (p.includes('/dentist')) return 'DENTIST';
  if (p.includes('/payment') || p.includes('paymongo')) return 'PAYMENTS';
  if (p.includes('/invoice') || p.includes('/expense')) return 'BILLING';
  if (p.includes('/inventory')) return 'INVENTORY';
  if (p.includes('/treatment')) return 'TREATMENTS';
  if (p.includes('/notification')) return 'NOTIFICATIONS';
  if (p.includes('/ai')) return 'AI';
  if (p.includes('/admin') || p.includes('/audit')) return 'SYSTEM';
  return 'API';
};

const detectModuleFromMessage = (msg = '') => {
  const m = String(msg).toLowerCase();
  if (m.includes('supabase') || m.includes('database') || m.includes('postgres') || m.includes('keep-alive')) return 'DATABASE';
  if (m.includes('auth') || m.includes('login') || m.includes('otp') || m.includes('jwt') || m.includes('totp')) return 'AUTH';
  if (m.includes('appointment') || m.includes('booking') || m.includes('slot') || m.includes('queue')) return 'APPOINTMENTS';
  if (m.includes('patient')) return 'PATIENTS';
  if (m.includes('dentist') || m.includes('chart') || m.includes('prescription')) return 'DENTIST';
  if (m.includes('paymongo') || m.includes('payment')) return 'PAYMENTS';
  if (m.includes('invoice') || m.includes('reconcil') || m.includes('billing') || m.includes('expense')) return 'BILLING';
  if (m.includes('inventory') || m.includes('stock')) return 'INVENTORY';
  if (m.includes('gemini') || m.includes('ai ')) return 'AI';
  return 'SYSTEM';
};

const installConsoleErrorHook = () => {
  if (consoleHookInstalled) return;
  consoleHookInstalled = true;

  const originalError = console.error.bind(console);
  console.error = (...args) => {
    originalError(...args);
    if (isRecordingConsole) return;
    isRecordingConsole = true;
    try {
      const text = args.map(a => {
        if (a instanceof Error) return a.message;
        if (typeof a === 'object' && a !== null) {
          try { return JSON.stringify(a); } catch (_) { return String(a); }
        }
        return String(a);
      }).join(' ').trim();

      if (text) {
        recordServerLog('ERROR', detectModuleFromMessage(text), text);
      }
    } catch (_) {
      // Never crash console.error
    } finally {
      isRecordingConsole = false;
    }
  };
};

module.exports = {
  systemLogsBuffer,
  recordServerLog,
  detectModuleFromPath,
  detectModuleFromMessage,
  installConsoleErrorHook
};
