// hooks/useOfflineSync.js
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Network from 'expo-network';
import api, { createReport } from '../services/api';
import { 
  savePendingReport, 
  getPendingReports, 
  deletePendingReport, 
  updatePendingReport,
  getPendingReportsCount,
  isOnline,
  cacheApiResponse,
  getCachedApiResponse,
  getCachedData,
  cacheData,
  getCachedItem,
  setLastSyncTime,
  getLastSyncTime
} from '../services/offlineStorage';

export function useOfflineSync() {
  const [isConnected, setIsConnected] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkNetworkStatus = useCallback(async () => {
    const connected = await isOnline();
    setIsConnected(connected);
    return connected;
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingReportsCount();
    setPendingCount(count);
  }, []);

  const refreshLastSync = useCallback(async () => {
    const syncTime = await getLastSyncTime();
    setLastSync(syncTime);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkNetworkStatus();
      refreshPendingCount();
      refreshLastSync();
      
      const trySync = async () => {
        const pending = await getPendingReportsCount();
        if (pending > 0) {
          const connected = await isOnline();
          if (connected) {
            syncPendingReports();
          }
        }
      };
      trySync();
    }, [checkNetworkStatus, refreshPendingCount, refreshLastSync, syncPendingReports])
  );

  const syncPendingReports = useCallback(async () => {
    if (isSyncing) return { success: false, message: 'Already syncing' };
    
    const connected = await isOnline();
    if (!connected) return { success: false, message: 'Offline' };
    
    setIsSyncing(true);
    const pendingReports = await getPendingReports();
    let syncedCount = 0;
    let failedCount = 0;
    
    for (const report of pendingReports) {
      try {
        const formData = new FormData();
        
        if (report.images && report.images.length > 0) {
          report.images.forEach((imageUri: string, index: number) => {
            formData.append('images', {
              uri: imageUri,
              type: 'image/jpeg',
              name: `photo_${index}.jpg`,
            });
          });
        }
        
        formData.append('water_level', String(report.water_level));
        formData.append('silt_level', String(report.silt_level));
        formData.append('debris_level', String(report.debris_level));
        formData.append('category', report.category);
        formData.append('remarks', report.remarks || '');
        formData.append('latitude', String(report.latitude || 0));
        formData.append('longitude', String(report.longitude || 0));
        formData.append('location_name', report.location_name || '');
        formData.append('gis_feature_id', report.gis_feature_id || '');

        await createReport(formData);
        await deletePendingReport(report.id);
        syncedCount++;
      } catch (error) {
        console.error('Failed to sync report:', error);
        failedCount++;
        await updatePendingReport(report.id, { 
          syncAttempts: (report.syncAttempts || 0) + 1,
          lastError: error.message 
        });
      }
    }

    await setLastSyncTime();
    await refreshPendingCount();
    await refreshLastSync();
    setIsSyncing(false);

    return { 
      success: failedCount === 0, 
      syncedCount, 
      failedCount,
      message: failedCount === 0 ? 'All reports synced' : `${failedCount} failed, will retry`
    };
  }, [isConnected, isSyncing]);

  const createReportOffline = useCallback(async (reportData) => {
    const connected = await checkNetworkStatus();
    
    if (connected) {
      try {
        const formData = new FormData();
        
        if (reportData.images && reportData.images.length > 0) {
          reportData.images.forEach((imageUri: string, index: number) => {
            formData.append('images', {
              uri: imageUri,
              type: 'image/jpeg',
              name: `photo_${index}.jpg`,
            });
          });
        }
        
        formData.append('water_level', String(reportData.water_level));
        formData.append('silt_level', String(reportData.silt_level));
        formData.append('debris_level', String(reportData.debris_level));
        formData.append('category', reportData.category);
        formData.append('remarks', reportData.remarks || '');
        formData.append('latitude', String(reportData.latitude || 0));
        formData.append('longitude', String(reportData.longitude || 0));
        formData.append('location_name', reportData.location_name || '');
        formData.append('gis_feature_id', reportData.gis_feature_id || '');

        const response = await createReport(formData);
        return { success: true, online: true, data: response.data };
      } catch (error) {
        console.error('Online report failed, will be saved as pending by caller:', error.message);
        return { success: false, online: false, error: error.message };
      }
    } else {
      const result = await savePendingReport(reportData);
      await refreshPendingCount();
      return { success: true, online: false, ...result };
    }
  }, [checkNetworkStatus, refreshPendingCount]);

  return {
    isConnected,
    pendingCount,
    lastSync,
    isSyncing,
    checkNetworkStatus,
    refreshPendingCount,
    refreshLastSync,
    syncPendingReports,
    createReportOffline,
  };
}

export function useOfflineData(endpoint, params = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isStale, setIsStale] = useState(false);
  
  const hasDataRef = useRef(false);
  const paramsRef = useRef(params);
  const endpointRef = useRef(endpoint);
  
  const stableKey = useMemo(() => `${endpoint}_${JSON.stringify(params)}`, [endpoint, params]);

  useEffect(() => {
    paramsRef.current = params;
    endpointRef.current = endpoint;
  }, [stableKey]);

  useEffect(() => {
    let cancelled = false;
    
    const loadData = async () => {
      const cacheKey = `${endpointRef.current}_${JSON.stringify(paramsRef.current)}`;
      
      if (!cancelled) {
        const cached = await getCachedItem(cacheKey);
        if (cached.data) {
          setData(cached.data);
          setIsStale(cached.isExpired);
          hasDataRef.current = true;
        }
      }
      
      const connected = await isOnline();
      if (cancelled) return;
      
      try {
        if (connected) {
          const response = await api.get(endpointRef.current, { params: paramsRef.current });
          if (!cancelled) {
            setData(response.data);
            await cacheData(cacheKey, response.data);
            setIsStale(false);
            hasDataRef.current = true;
          }
        } else if (!hasDataRef.current) {
          const cached = await getCachedItem(cacheKey);
          if (!cancelled && cached.data) {
            setData(cached.data);
            setIsStale(cached.isExpired);
            hasDataRef.current = true;
          }
        }
      } catch (err) {
        if (!cancelled && !hasDataRef.current) {
          const cached = await getCachedItem(cacheKey);
          if (cached.data) {
            setData(cached.data);
            setIsStale(true);
            hasDataRef.current = true;
          }
        }
      }
    };
    
    loadData();
    
    return () => { cancelled = true; };
  }, [stableKey]);

  const refetch = useCallback(() => {
    setIsRefreshing(true);
    setLoading(true);
    
    const doRefetch = async () => {
      const cacheKey = `${endpointRef.current}_${JSON.stringify(paramsRef.current)}`;
      const connected = await isOnline();
      
      try {
        if (connected) {
          const response = await api.get(endpointRef.current, { params: paramsRef.current });
          setData(response.data);
          await cacheData(cacheKey, response.data);
          setIsStale(false);
        }
      } catch (err) {
        console.error('Refetch error:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    };
    
    doRefetch();
  }, [stableKey]);

  return { data, loading, error, isStale, isRefreshing, refetch };
}