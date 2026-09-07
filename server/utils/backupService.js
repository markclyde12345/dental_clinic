const fs = require('fs');
const path = require('path');
const supabase = require('../config/db');

const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const BACKUP_TABLES = ['users', 'appointments', 'invoices', 'payments', 'treatments', 'audit_logs', 'expenses'];
const RETENTION_DAYS = 14;

// Ensure backup directory exists
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Prune backups older than RETENTION_DAYS
 */
function pruneOldBackups() {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    files.forEach(file => {
      if (file.startsWith('backup_') && file.endsWith('.json')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`[Backup Service] Pruned old backup: ${file}`);
        }
      }
    });
  } catch (err) {
    console.error('[Backup Service] Error pruning old backups:', err.message);
  }
}

/**
 * Perform a full export of key tables to JSON
 */
async function performDatabaseBackup() {
  ensureBackupDir();
  const timestamp = new Date().toISOString();
  const fileSafeTime = timestamp.replace(/[:.]/g, '-');
  const backupFileName = `backup_${fileSafeTime}.json`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);
  const latestMetaPath = path.join(BACKUP_DIR, 'latest_backup_meta.json');

  const dump = {
    clinic: 'Fano Dental Clinic',
    version: '1.0.0',
    createdAt: timestamp,
    tables: {},
    summary: {
      totalRows: 0,
      tableCounts: {}
    }
  };

  try {
    let grandTotal = 0;

    for (const table of BACKUP_TABLES) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(10000);

        if (error) {
          console.warn(`[Backup Service] Table ${table} query notice:`, error.message);
          dump.tables[table] = [];
          dump.summary.tableCounts[table] = 0;
        } else {
          dump.tables[table] = data || [];
          dump.summary.tableCounts[table] = (data || []).length;
          grandTotal += (data || []).length;
        }
      } catch (tableErr) {
        console.warn(`[Backup Service] Failed reading table ${table}:`, tableErr.message);
        dump.tables[table] = [];
        dump.summary.tableCounts[table] = 0;
      }
    }

    dump.summary.totalRows = grandTotal;

    // Write backup file
    fs.writeFileSync(backupFilePath, JSON.stringify(dump, null, 2), 'utf8');

    const stats = fs.statSync(backupFilePath);
    const meta = {
      success: true,
      lastBackupTime: timestamp,
      fileName: backupFileName,
      fileSizeBytes: stats.size,
      fileSizeKb: (stats.size / 1024).toFixed(2),
      tableCounts: dump.summary.tableCounts,
      totalRows: grandTotal
    };

    fs.writeFileSync(latestMetaPath, JSON.stringify(meta, null, 2), 'utf8');

    // Clean up older backups
    pruneOldBackups();

    console.log(`\x1b[32m[Backup Service] ✅ Daily DB backup completed:\x1b[0m ${backupFileName} (${meta.fileSizeKb} KB, ${grandTotal} rows)`);

    return meta;
  } catch (error) {
    console.error('[Backup Service] ❌ Backup failed:', error.message);
    return {
      success: false,
      error: error.message,
      lastBackupTime: timestamp
    };
  }
}

/**
 * Get info on the most recent backup
 */
function getLatestBackupInfo() {
  try {
    ensureBackupDir();
    const latestMetaPath = path.join(BACKUP_DIR, 'latest_backup_meta.json');
    if (fs.existsSync(latestMetaPath)) {
      const content = fs.readFileSync(latestMetaPath, 'utf8');
      return JSON.parse(content);
    }

    // Fallback: check files in backup dir
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => {
        const p = path.join(BACKUP_DIR, f);
        return { name: f, time: fs.statSync(p).mtimeMs, size: fs.statSync(p).size };
      })
      .sort((a, b) => b.time - a.time);

    if (files.length > 0) {
      return {
        success: true,
        lastBackupTime: new Date(files[0].time).toISOString(),
        fileName: files[0].name,
        fileSizeBytes: files[0].size,
        fileSizeKb: (files[0].size / 1024).toFixed(2),
        totalRows: 'N/A'
      };
    }

    return {
      success: false,
      message: 'No backups recorded yet.'
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Initialize daily backup timer (runs every 24 hours)
 */
function initScheduledBackups() {
  // Run an initial backup check shortly after startup (after 30 seconds)
  setTimeout(async () => {
    const latest = getLatestBackupInfo();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    if (!latest.lastBackupTime || (Date.now() - new Date(latest.lastBackupTime).getTime() > TWENTY_FOUR_HOURS)) {
      console.log('[Backup Service] Triggering initial scheduled backup...');
      await performDatabaseBackup();
    }
  }, 30000);

  // Repeat daily
  setInterval(async () => {
    console.log('[Backup Service] Running scheduled 24h backup...');
    await performDatabaseBackup();
  }, 24 * 60 * 60 * 1000);
}

module.exports = {
  performDatabaseBackup,
  getLatestBackupInfo,
  initScheduledBackups
};
