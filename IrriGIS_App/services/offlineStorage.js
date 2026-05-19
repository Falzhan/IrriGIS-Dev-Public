// services/offlineStorage.js
import { File, Directory, Paths } from 'expo-file-system';
import * as Network from 'expo-network';

// MODERN API: Create a Directory object directly
const storageDir = new Directory(Paths.document, 'offline_data');
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

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
    if (!file.exists) return null;
    
    // Modern API uses .text() to read the file
    const content = await file.text();
    return content ? JSON.parse(content) : null;
  } catch (error) {
    console.warn('Error reading file:', error);
    return null;
  }
}

async function writeJsonFile(filename, data) {
  try {
    await ensureDir();
    const file = new File(storageDir, filename);
    
    // Modern API uses .write() directly on the file object
    await file.write(JSON.stringify(data));
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