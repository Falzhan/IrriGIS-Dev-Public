// services/offlineStorage.js
import { File, Directory, Paths } from 'expo-file-system';
import * as Network from 'expo-network';

// MODERN API: Create a Directory object directly
const storageDir = new Directory(Paths.document, 'offline_data');
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;
// Map layer data (GIS features, reports, tickets) is relatively static —
// keep for up to 7 days so the map is usable offline for long periods.
export const MAP_LAYER_EXPIRY = 7 * 24 * 60 * 60 * 1000;

const FILES = {
  PENDING_REPORTS: 'pending_reports.json',
  CACHED_DATA: 'cached_data.json',
  LAST_SYNC: 'last_sync.txt',
};

async function ensureDir() {
  try {
    // Modern API uses a simple exists boolean property
    if (!storageDir.exists) {
      await storageDir.create();
    }
    return true;
  } catch (error) {
    console.warn('Error ensuring directory exists:', error);
    return false;
  }
}

async function readJsonFile(filename) {
  try {
    await ensureDir();
    const file = new File(storageDir, filename);
    if (!file.exists) { console.log(`[ReadFile] ${filename} — DOES NOT EXIST`); return null; }
    
    // Modern API uses .text() to read the file
    const content = await file.text();
    let parsed;
    try { parsed = content ? JSON.parse(content) : null; } catch { console.log('[ReadFile] PARSE ERROR'); return null; }
    // Detailed inspect for cached_data stale data tracking
    if (filename === FILES.CACHED_DATA && parsed && typeof parsed === 'object') {
      for (const k of ['gis_features', 'map_reports', 'map_tickets']) {
        const e = parsed[k];
        if (e) {
          const da = e.data;
          const arrLen = Array.isArray(da) ? da.length : undefined;
          console.log(
            `[ReadFile] cached_data.${k} → { type:${typeof da}${Array.isArray(da)?'✔arr':'✗obj'} len:${arrLen ?? 'n/a'} tsAge:${Date.now()-e.timestamp}ms`
          );
        }
      }
    }
    return parsed;
  } catch (error) {
    console.warn('Error reading file:', error);
    return null;
  }
}

async function writeJsonFile(filename, data) {
  try {
    await ensureDir();
    const file = new File(storageDir, filename);
    const json = JSON.stringify(data);
    if (filename === FILES.CACHED_DATA) {
      try {
        const parsed = JSON.parse(json);
        for (const k of ['gis_features', 'map_reports', 'map_tickets']) {
          const e = parsed[k];
          if (e) {
            const da = e.data;
            console.log(`[Write] cached_data.${k} → { type:${typeof da}${Array.isArray(da)?'✔arr':'✗obj'} len:${da?.length ?? 'n/a'} tsAge:${Date.now()-e.timestamp}ms`);
          }
        }
      } catch { /* noop */ }
    }
    // Modern API uses .write() directly on the file object
    await file.write(json);
    return true;
  } catch (error) {
    console.warn('Error writing file:', error);
    return false;
  }
}

async function readTextFile(filename) {
  try {
    await ensureDir();
    const file = new File(storageDir, filename);
    if (!file.exists) return null;
    return await file.text();
  } catch (error) {
    console.warn('Error reading text file:', error);
    return null;
  }
}

async function writeTextFile(filename, content) {
  try {
    await ensureDir();
    const file = new File(storageDir, filename);
    await file.write(content);
    return true;
  } catch (error) {
    console.warn('Error writing text file:', error);
    return false;
  }
}

// ─── Map-layer cache (7-day TTL, separate try/catch to not corrupt shared cache) ───

function withMapLayerCache(key, fn, expiry = MAP_LAYER_EXPIRY) {
  return (async () => {
    try {
      const all = await readJsonFile(FILES.CACHED_DATA);
      const item = all?.[key];
      if (item && Date.now() - item.timestamp < expiry) {
        console.log(`[Cache] HIT  key=${key}  age=${Date.now() - item.timestamp}ms  items=${Array.isArray(item.data)?item.data.length:'N/A'}`);
        return { data: item.data, isFresh: true };
      }
      if (item) console.log(`[Cache] STALE key=${key}  age=${Date.now() - item.timestamp}ms  limit=${expiry}ms  items=${Array.isArray(item.data)?item.data.length:'N/A'}`);
    } catch { /* fall through to fetch */ }
    // Not cached or expired — run the provided async fetcher
    console.log(`[Cache] MISS  key=${key}  → running fetcher`);
    const result = await fn();
    // Normalise any GeoJSON FeatureCollection to a plain features array
    // before persisting — the callers (map and camera) both need an array.
    let data = result?.data;
    console.log(`[Cache] post-fetch key=${key}  result.success=${result?.success}  rawDataType=${typeof data}  isArray=${Array.isArray(data)}  len=${data?.length ?? 'n/a'}`);
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.features)) {
      console.log(`[Cache] NORM  key=${key}  FC → features[${data.features.length}]`);
      data = data.features;
    }
    // Only persist when the normalised value is a real array.
    // Skip null / undefined so the write-side never stores a null-sentinel.
    if (result?.success && Array.isArray(data)) {
      try {
        all[key] = { data: data, timestamp: Date.now() };
        await writeJsonFile(FILES.CACHED_DATA, all);
        console.log(`[Cache] WRITE key=${key}  items=${data.length}`);
      } catch { /* masked — shared cache corruption should not fail layer ops */ }
    } else {
      console.log(`[Cache] SKIP  key=${key}  success=${result?.success}  isArray=${Array.isArray(data)}  dataType=${
        data == null ? 'null/undef' : typeof data
      }`);
    }
    return { data: result?.data ?? null, isFresh: false };
  })();
}

/**
 * Cache key for the GIS features / canal lines endpoint.
 * Fetches all features (no filter), returns GeoJSON FeatureCollection or array of features.
 */
export const cacheGISFeatures = (data) => withMapLayerCache('gis_features', () => ({ success: true, data }));

/**
 * Cache key for the map reports GeoJSON endpoint.
 */
export const cacheMapReports = (data) => withMapLayerCache('map_reports', () => ({ success: true, data }));

/**
 * Cache key for the tickets list endpoint (all tickets, no filter).
 */
export const cacheTickets = (data) => withMapLayerCache('map_tickets', () => ({ success: true, data }));

/**
 * Read previously cached map-layer data if still fresh.
 * Returns empty arrays / null when no cached data exists.
 */
export const getCachedMapLayers = async () => {
  const empty = { gisFeatures: null, mapReports: null, tickets: null };
  try {
    // ── Read ONCE — every protective layer works from this single object ─────────
    // Using multiple readJsonFile calls (e.g. via Promise.all) caused a second
    // read to race in before the first write finished, rendering the sanitiser
    // ineffective: { data: null } → sanitised → { data: [], ts: now } on disk
    // → second read fetches the just-written sentinel from disk → treated as
    // real cached data → allFeatures = [] on every camera visit.
    const all = await readJsonFile(FILES.CACHED_DATA);

    // ── Sanitise any stale formats in-place ─────────────────────────────────────
    // Three corruption shapes can appear on disk from old write paths:
    //   { data: null | undefined }   — old write guard stored null-sentinel
    //   { data: <FeatureCollection> } — whole FC stored as data field
    //   { timestamp: … }             — bare envelope with no data field
    // All repaired entries are immediately mirrored in the shared in-memory `all`
    // object; the disk write happens only once, after the loop.
    if (all && typeof all === 'object') {
      const mapKeys = ['gis_features', 'map_reports', 'map_tickets'];
      let changed = false;
      for (const key of mapKeys) {
        const entry = all[key];
        if (entry && typeof entry === 'object') {
          // Case A — null-sentinel { data: null, ts } or missing data { ts }
          if (entry.data == null) {
            all[key] = { data: [], timestamp: Date.now() };
            changed = true;
          }
          // Case B — FC object stored as data → unwrap .features array
          else if (!Array.isArray(entry.data) && Array.isArray(entry.data?.features)) {
            all[key] = { data: entry.data.features, timestamp: entry.timestamp || Date.now() };
            changed = true;
          }
          // Case C — bare envelope with no data field at all { timestamp: … }
          else if (!('data' in entry)) {
            all[key] = { data: [], timestamp: Date.now() };
            changed = true;
          }
        }
      }
      await Promise.resolve(); // yield to event loop once (helps callers above us settle)
      if (changed) await writeJsonFile(FILES.CACHED_DATA, all);
    }

    // ── Flat / non-object guard ────────────────────────────────────────────────
    if (!all || typeof all !== 'object') {
      console.log('[Cache] file missing or not an object → returning nulls');
      return empty;
    }

    // ── Helper: normalise any value to a plain array ────────────────────────────
    const toArray = (val) => {
      if (!val) return null;
      if (Array.isArray(val)) return val;
      if (Array.isArray(val.features)) return val.features;
      return null;
    };

    // ── Read all three keys from SAME in-memory object — no double disk reads ─────
    const rawGF = all.gis_features;
    const rawMR = all.map_reports;
    const rawTK = all.map_tickets;

    const isFresh = (entry) =>
      !!entry && Date.now() - entry.timestamp < MAP_LAYER_EXPIRY;

    const gisFeatures = isFresh(rawGF)
      ? toArray(rawGF.data)
      : (toArray(rawGF.data) ?? null);

    const mapReports  = isFresh(rawMR)
      ? toArray(rawMR.data)
      : (toArray(rawMR.data) ?? null);

    const tickets     = isFresh(rawTK)
      ? toArray(rawTK.data)
      : (toArray(rawTK.data) ?? null);

    const result = {
      gisFeatures: gisFeatures ?? [],
      mapReports:  mapReports  ?? [],
      tickets:     tickets     ?? [],
    };
    console.log('[Cache] getCachedMapLayers →', {
      gisFeaturesCount: result.gisFeatures?.length ?? 'null',
      mapReportsCount:  result.mapReports?.length  ?? 'null',
      ticketsCount:     result.tickets?.length     ?? 'null',
      gisFresh: isFresh(rawGF),
      reportFresh: isFresh(rawMR),
    });
    return result;
  } catch {
    return empty;
  }
};

/**
 * Rebuild `cached_data.json` by replacing any key whose value is `{ data: null }`
 * (a leftover null-sentinel from the old write path) with `{ data: [], timestamp: now }`.
 * Returns the cleaned object, or `null` on error.
 */
export async function migrateCache() {
  try {
    const raw = await readJsonFile(FILES.CACHED_DATA);
    if (!raw || typeof raw !== 'object') return raw || {};
    const cleaned = {};
    let changed = false;
    for (const [key, val] of Object.entries(raw)) {
      if (val && typeof val === 'object' && val.data == null) {
        cleaned[key] = { data: [], timestamp: Date.now() };
        changed = true;
      } else if (val && typeof val === 'object' && !('data' in val)) {
        // Bare envelope missing the data field
        cleaned[key] = { data: [], timestamp: Date.now() };
        changed = true;
      } else {
        cleaned[key] = val;
      }
    }
    if (changed) await writeJsonFile(FILES.CACHED_DATA, cleaned);
    return cleaned;
  } catch { return null; }
}

/**
 * Force-saves all map layers to the cache at once to prevent JSON race conditions
 * caused by the old read-through guard skipping writes when a stale or empty
 * array was already on disk.  This function reads the file once, updates every
 * key, and writes back once — so one layer's write can never clobber another.
 *
 * @param {Object[]}  gisFeatures  – array of canal/river feature objects
 * @param {Object[]}  mapReports   – array of report GeoJSON features
 * @param {Object[]}  tickets      – array of ticket objects
 * @returns {Promise<boolean>}
 */
export const saveMapLayers = async (gisFeatures, mapReports, tickets) => {
  try {
    const all = (await readJsonFile(FILES.CACHED_DATA)) || {};
    const now = Date.now();

    // Helper: normalise any GeoJSON FeatureCollection to a plain array
    const normalise = (d) => {
      if (d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.features)) {
        return d.features;
      }
      return d;
    };

    if (gisFeatures) all.gis_features = { data: normalise(gisFeatures), timestamp: now };
    if (mapReports)  all.map_reports  = { data: normalise(mapReports),  timestamp: now };
    if (tickets)     all.map_tickets   = { data: normalise(tickets),      timestamp: now };

    await writeJsonFile(FILES.CACHED_DATA, all);
    console.log(
      `[Cache] BATCH WRITE → gis:${gisFeatures?.length || 0}  reports:${mapReports?.length || 0}  tickets:${tickets?.length || 0}`
    );
    return true;
  } catch (error) {
    console.error('[Cache] Batch write error:', error);
    return false;
  }
};

export const isNetworkAvailable = async () => {
  try {
    const networkState = await Network.getNetworkStateAsync();
    // Prevent false positives on Android
    return networkState.isConnected && networkState.isInternetReachable !== false;
  } catch (e) {
    return false;
  }
};

export const getNetworkType = async () => {
  const networkState = await Network.getNetworkStateAsync();
  return networkState.type ?? 'unknown';
};

export const savePendingReport = async (reportData) => {
  try {
    const pendingReports = await getPendingReports();
    const newReport = {
      id: `local_${Date.now()}`,
      ...reportData,
      createdAt: new Date().toISOString(),
      status: 'pending',
      syncAttempts: 0,
    };
    pendingReports.push(newReport);
    await writeJsonFile(FILES.PENDING_REPORTS, pendingReports);
    return { success: true, report: newReport };
  } catch (error) {
    console.error('Error saving pending report:', error);
    return { success: false, error: error.message };
  }
};

export const getPendingReports = async () => {
  const data = await readJsonFile(FILES.PENDING_REPORTS);
  return data || [];
};

export const deletePendingReport = async (reportId) => {
  try {
    const pendingReports = await getPendingReports();
    const filtered = pendingReports.filter(r => r.id !== reportId);
    await writeJsonFile(FILES.PENDING_REPORTS, filtered);
    return { success: true };
  } catch (error) {
    console.error('Error deleting pending report:', error);
    return { success: false, error: error.message };
  }
};

export const updatePendingReport = async (reportId, updates) => {
  try {
    const pendingReports = await getPendingReports();
    const index = pendingReports.findIndex(r => r.id === reportId);
    if (index !== -1) {
      pendingReports[index] = { ...pendingReports[index], ...updates };
      await writeJsonFile(FILES.PENDING_REPORTS, pendingReports);
      return { success: true, report: pendingReports[index] };
    }
    return { success: false, error: 'Report not found' };
  } catch (error) {
    console.error('Error updating pending report:', error);
    return { success: false, error: error.message };
  }
};

export const cacheData = async (key, data) => {
  try {
    const cacheItem = {
      data,
      timestamp: Date.now(),
    };
    const cachedData = await getCachedData();
    cachedData[key] = cacheItem;
    await writeJsonFile(FILES.CACHED_DATA, cachedData);
    return { success: true };
  } catch (error) {
    console.error('Error caching data:', error);
    return { success: false, error: error.message };
  }
};

export const getCachedData = async () => {
  const data = await readJsonFile(FILES.CACHED_DATA);
  return data || {};
};

export const getCachedItem = async (key) => {
  const cachedData = await getCachedData();
  const item = cachedData[key];
  if (item && Date.now() - item.timestamp < CACHE_EXPIRY) {
    return { data: item.data, isExpired: false };
  } else if (item) {
    return { data: item.data, isExpired: true };
  }
  return { data: null, isExpired: true };
};

export const cacheApiResponse = async (endpoint, response) => {
  return cacheData(endpoint, response);
};

export const getCachedApiResponse = async (endpoint) => {
  return getCachedItem(endpoint);
};

export const setLastSyncTime = async (timestamp = Date.now()) => {
  const success = await writeTextFile(FILES.LAST_SYNC, timestamp.toString());
  return { success };
};

export const getLastSyncTime = async () => {
  const timestamp = await readTextFile(FILES.LAST_SYNC);
  return timestamp ? parseInt(timestamp) : null;
};

export const clearAllCachedData = async () => {
  try {
    if (storageDir.exists) {
      // Modern API: deleting the directory clears everything inside it cleanly
      await storageDir.delete();
    }
    return { success: true };
  } catch (error) {
    console.error('Error clearing cached data:', error);
    return { success: false, error: error.message };
  }
};

export const clearPendingReports = async () => {
  try {
    await writeJsonFile(FILES.PENDING_REPORTS, []);
    return { success: true };
  } catch (error) {
    console.error('Error clearing pending reports:', error);
    return { success: false, error: error.message };
  }
};

export const getPendingReportsCount = async () => {
  const pendingReports = await getPendingReports();
  return pendingReports.length;
};

export const isOnline = async () => {
  const connected = await isNetworkAvailable();
  return connected;
};