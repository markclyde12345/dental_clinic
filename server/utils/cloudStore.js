const fs = require('fs');
const path = require('path');
const supabase = require('../config/db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PREFIX = '__cloud_store__:';

// In-memory cache with short TTL for real-time cross-instance consistency on Vercel
const memoryCache = new Map();
const CACHE_TTL_MS = 1500; // 1.5s TTL ensures real-time freshness across requests

function getLocalSeed(key, defaultValue) {
  try {
    const filename = key.endsWith('.json') ? key : `${key}.json`;
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}
  return defaultValue;
}

function saveLocalMirror(key, value) {
  if (process.env.VERCEL) return;
  try {
    const filename = key.endsWith('.json') ? key : `${key}.json`;
    const filePath = path.join(DATA_DIR, filename);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  } catch (_) {}
}

/**
 * Fetch a JSON document from Supabase cloud store (backed by dental_charts JSONB)
 * @param {string} key - Store key (e.g. 'invoice_supplements', 'clinic_settings')
 * @param {any} defaultValue - Default value if not found
 * @returns {Promise<any>}
 */
async function getCloudStore(key, defaultValue = {}) {
  const cleanKey = String(key).replace(/\.json$/i, '');
  const noteKey = `${STORE_PREFIX}${cleanKey}`;

  const cached = memoryCache.get(cleanKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const { data, error } = await supabase
      .from('dental_charts')
      .select('id, teeth_data, updated_at')
      .is('patient_id', null)
      .eq('notes', noteKey)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0];
      const val = (row.teeth_data && row.teeth_data.__val !== undefined)
        ? row.teeth_data.__val
        : row.teeth_data;
      memoryCache.set(cleanKey, { value: val, rowId: row.id, ts: Date.now() });
      return val;
    }

    // Not in Supabase yet — check local seed file and migrate to Supabase
    const seed = getLocalSeed(cleanKey, defaultValue);
    memoryCache.set(cleanKey, { value: seed, rowId: null, ts: Date.now() });

    // Persist non-empty seed to Supabase asynchronously
    if (seed !== undefined && seed !== null) {
      setCloudStore(cleanKey, seed).catch(() => {});
    }
    return seed;
  } catch (err) {
    console.warn(`[CloudStore Read Fallback: ${cleanKey}]`, err.message);
    if (cached) return cached.value;
    return getLocalSeed(cleanKey, defaultValue);
  }
}

/**
 * Save a JSON document to Supabase cloud store
 * @param {string} key - Store key (e.g. 'invoice_supplements', 'clinic_settings')
 * @param {any} value - JSON-serializable value
 * @returns {Promise<any>}
 */
async function setCloudStore(key, value) {
  const cleanKey = String(key).replace(/\.json$/i, '');
  const noteKey = `${STORE_PREFIX}${cleanKey}`;
  const now = new Date().toISOString();

  const existingCache = memoryCache.get(cleanKey);
  memoryCache.set(cleanKey, {
    value,
    rowId: existingCache?.rowId || null,
    ts: Date.now()
  });

  saveLocalMirror(cleanKey, value);

  try {
    let rowId = existingCache?.rowId || null;

    if (!rowId) {
      const { data: existingRows } = await supabase
        .from('dental_charts')
        .select('id')
        .is('patient_id', null)
        .eq('notes', noteKey)
        .order('updated_at', { ascending: false });

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        rowId = existingRows[0].id;
        // Clean up any duplicate rows for the same key
        if (existingRows.length > 1) {
          const dupIds = existingRows.slice(1).map(r => r.id);
          await supabase.from('dental_charts').delete().in('id', dupIds);
        }
      }
    }

    if (rowId) {
      const { error } = await supabase
        .from('dental_charts')
        .update({
          teeth_data: { __val: value },
          updated_at: now
        })
        .eq('id', rowId);

      if (!error) {
        memoryCache.set(cleanKey, { value, rowId, ts: Date.now() });
        return value;
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from('dental_charts')
      .insert([{
        patient_id: null,
        dentist_id: null,
        chart_type: 'adult',
        notes: noteKey,
        teeth_data: { __val: value },
        updated_at: now
      }])
      .select('id')
      .single();

    if (!insErr && inserted) {
      memoryCache.set(cleanKey, { value, rowId: inserted.id, ts: Date.now() });
    }
  } catch (err) {
    console.warn(`[CloudStore Write Warning: ${cleanKey}]`, err.message);
  }

  return value;
}

/**
 * Synchronous getter from warm cache or local seed (triggers background refresh)
 */
function getCloudStoreSync(key, defaultValue = {}) {
  const cleanKey = String(key).replace(/\.json$/i, '');
  const cached = memoryCache.get(cleanKey);
  if (cached) {
    if ((Date.now() - cached.ts) >= CACHE_TTL_MS) {
      getCloudStore(cleanKey, defaultValue).catch(() => {});
    }
    return cached.value;
  }
  const seed = getLocalSeed(cleanKey, defaultValue);
  memoryCache.set(cleanKey, { value: seed, rowId: null, ts: 0 });
  getCloudStore(cleanKey, defaultValue).catch(() => {});
  return seed;
}

/**
 * Preload key cloud stores on startup
 */
async function warmCloudStores(keys = []) {
  for (const k of keys) {
    await getCloudStore(k, {}).catch(() => {});
  }
}

module.exports = {
  getCloudStore,
  setCloudStore,
  getCloudStoreSync,
  warmCloudStores
};

