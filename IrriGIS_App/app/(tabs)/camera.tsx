//app/(tabs)/camera.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Alert, ScrollView, Image, TouchableOpacity, Dimensions, Platform, Text as RNText, LayoutAnimation, UIManager } from 'react-native';
import { Button, Text, TextInput, SegmentedButtons, ActivityIndicator, Portal, Dialog, Chip } from 'react-native-paper';
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getPresetsByCategory, getReportPresets, getNearbyGISFeatures, getReportById, updateReport } from '../../services/api';
import { getPendingReports, savePendingReport, deletePendingReport, getCachedMapLayers, migrateCache } from '../../services/offlineStorage';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useSheet } from '../../context/SheetContext';
import DraggableBottomSheet from '../../components/DraggableBottomSheet';
import { useSession } from '../../context/ctx';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get('window');

const WATER_LEVELS = ['dry', 'low', 'normal', 'high', 'overflow'];
const SILT_LEVELS = ['clean', 'light', 'normal', 'dirty', 'heavily_silted'];
const DEBRIS_LEVELS = ['clear', 'light', 'normal', 'heavy', 'blocked'];

const WATER_INT_TO_STR = ['', 'dry', 'low', 'normal', 'high', 'overflow'];
const SILT_INT_TO_STR = ['', 'clean', 'light', 'normal', 'dirty', 'heavily_silted'];
const DEBRIS_INT_TO_STR = ['', 'clear', 'light', 'normal', 'heavy', 'blocked'];

// ─── Edit-own-report window: 72 hours after submission ────────────────────────
const REPORT_EDIT_WINDOW_MS = 72 * 60 * 60 * 1000;
const isWithinEditWindow = (createdAt: string) =>
  Date.now() - new Date(createdAt).getTime() < REPORT_EDIT_WINDOW_MS;

const WATER_STR_TO_INT: Record<string, number> = { dry: 1, low: 2, normal: 3, high: 4, overflow: 5 };
const SILT_STR_TO_INT: Record<string, number> = { clean: 1, light: 2, normal: 3, dirty: 4, heavily_silted: 5 };
const DEBRIS_STR_TO_INT: Record<string, number> = { clear: 1, light: 2, normal: 3, heavy: 4, blocked: 5 };

const LEVEL_DESCRIPTIONS: Record<string, Record<string, string>> = {
  water: { dry: 'No water', low: 'Minimal water', normal: 'Adequate water', high: 'Above normal', overflow: 'Flooding' },
  silt: { clean: 'No silt', light: 'Light silt', normal: 'Moderate silt', dirty: 'Heavy silt', heavily_silted: 'Fully silted' },
  debris: { clear: 'No obstruction', light: 'Minor debris', normal: 'Some debris', heavy: 'Heavy debris', blocked: 'Fully blocked' },
};

// Map invalid icon names to valid Ionicons names
const getValidIcon = (iconName: string | undefined): string => {
  if (!iconName) return 'document-text-outline';
  
  const iconMap: Record<string, string> = {
    'info': 'information-circle-outline',
    'check-circle': 'checkmark-circle-outline',
    'alert-triangle': 'warning-outline',
    'alert-octagon': 'shield-outline',
    'feather': 'finger-print-outline',
    'clock': 'time-outline',
    'minus-circle': 'remove-circle-outline',
    'check': 'checkmark-outline',
  };
  
  return iconMap[iconName] || iconName;
};

export default function CameraScreen() {
  const router = useRouter();
  const { isConnected, createReportOffline, pendingCount, syncPendingReports } = useOfflineSync();
  const { user } = useSession();
  const { draft: draftParam, editId: editIdParam } = useLocalSearchParams<{ draft?: string; editId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  
  const [mode, setMode] = useState<'viewfinder' | 'form'>('viewfinder');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const [showGrid, setShowGrid] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [locationLoading, setLocationLoading] = useState(true);
  
  const [waterLevel, setWaterLevel] = useState('normal');
  const [siltLevel, setSiltLevel] = useState('normal');
  const [debrisLevel, setDebrisLevel] = useState('normal');
  const [category, setCategory] = useState('inspection');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showGISModal, setShowGISModal] = useState(false);
  const [timerDuration, setTimerDuration] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState(0);
  const [presets, setPresets] = useState<any[]>([]);
  const [allPresets, setAllPresets] = useState<any[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [localSheetIndex, setLocalSheetIndex] = useState(0);
  const [isGpsVisible, setIsGpsVisible] = useState(true);
  const gpsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setSheetOpen, setSheetIndex } = useSheet();
  
  const [nearbyFeatures, setNearbyFeatures] = useState<any[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [submissionType, setSubmissionType] = useState<'report' | 'ticket'>('report');
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // migrate stale null-sentinels from previous write path first
        await migrateCache();
      } catch { /* non-fatal */ }
      try {
        if (!permission?.granted) await requestPermission();
        if (!micPermission?.granted) await requestMicPermission();
        await getLocation();
      } catch (_) { /* permissions / location denied — non-fatal at lint */ }
      try {
        await loadAllPresets();
      } catch (_) { /* non-fatal */ }
    })().catch(() => { /* top-level absorb to prevent HMR noise */ });
  }, []);

  // ─── Resume Draft from Me tab ────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const uid = typeof draftParam === 'string' ? draftParam : undefined;
      if (!uid) return;

      (async () => {
        try {
          const allPending = await getPendingReports();
          const found = allPending.find((r: any) => r.id === uid);
          if (!found) return;

          // Only set needed fields; avoid clobbering unrelated state
          setCapturedImage(found.images?.[0] ?? null);
          const ws = typeof found.water_level === 'number'
            ? (WATER_INT_TO_STR[found.water_level] || 'normal')
            : (found.water_level || 'normal');
          const ss = typeof found.silt_level === 'number'
            ? (SILT_INT_TO_STR[found.silt_level] || 'normal')
            : (found.silt_level || 'normal');
          const ds = typeof found.debris_level === 'number'
            ? (DEBRIS_INT_TO_STR[found.debris_level] || 'normal')
            : (found.debris_level || 'normal');
          setWaterLevel(ws);
          setSiltLevel(ss);
          setDebrisLevel(ds);
          setCategory(found.category || 'inspection');
          setRemarks(found.remarks || '');
          if (user?.ia_id) setSubmissionType(found.category === 'issue' ? 'ticket' : 'report');
          if (found.gis_feature_id) {
            const features = nearbyFeatures as any[];
            (setSelectedFeature as any)(features.find((f: any) => f.id === found.gis_feature_id) || null);
          }
          setMode('form');
          if (uid) setCurrentDraftId(uid);
        } catch (e) {
          console.error('Error resuming draft:', e);
        }
      })().catch(console.error);
    }, [draftParam, user?.id])
  );

  // ─── Load Report for Editing ─────────────────────────────────────────────────
  const loadEditReport = useCallback(async (reportId: string) => {
    setIsEditing(false);
    setEditingReportId(null);
    try {
      const response = await getReportById(reportId);
      const r: any = response.data?.data || response.data;
      if (!r) return;

      // Must belong to the current user
      if (r.user_id !== user?.id) return;

      // Must be within the 72-hour edit window
      if (!isWithinEditWindow(r.createdAt || r.created_at)) {
        setIsEditing(false);
        Alert.alert('Edit Expired', 'Reports can only be edited within 72 hours of submission.');
        return;
      }

      setIsEditing(true);
      setEditingReportId(r.id);

      // Pre-fill form fields (no auto-save draft — edit is a server-only action)
      const imgList: string[] = (r.images || []).map((img: any) => img.imageUrl || img.image_url);
      setCapturedImage(imgList[0] || null);
      setWaterLevel(typeof r.water_level === 'number' ? WATER_INT_TO_STR[r.water_level] || 'normal' : (r.water_level || 'normal'));
      setSiltLevel(typeof r.silt_level === 'number' ? SILT_INT_TO_STR[r.silt_level] || 'normal' : (r.silt_level || 'normal'));
      setDebrisLevel(typeof r.debris_level === 'number' ? DEBRIS_INT_TO_STR[r.debris_level] || 'normal' : (r.debris_level || 'normal'));
      setCategory(r.category || 'inspection');
      setRemarks(r.remarks || '');
      if (r.gis_feature_id) {
        const features = nearbyFeatures as any[];
        (setSelectedFeature as any)(features.find((f: any) => f.id === r.gis_feature_id) || null);
      }
      setMode('form');
    } catch (e) {
      console.error('Error loading report for edit:', e);
      Alert.alert('Error', 'Could not load report for editing.');
    }
  }, [user?.id, nearbyFeatures]);

  useFocusEffect(
    useCallback(() => {
      const eid = typeof editIdParam === 'string' ? editIdParam : undefined;
      if (!eid) return;
      (async () => { await loadEditReport(eid); })().catch(console.error);
    }, [editIdParam, loadEditReport])
  );

  const loadAllPresets = async () => {
    try {
      setPresetsLoading(true);
      const res = await getReportPresets();
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setAllPresets(data.filter((p: any) => p.is_active !== false));
    } catch (err) {
      console.error('Failed to load presets:', err);
      setAllPresets([]);
    } finally {
      setPresetsLoading(false);
    }
  };

  useEffect(() => {
    const categoryPresets = allPresets.filter((p: any) => p.category === category);
    setPresets(categoryPresets);
  }, [category, allPresets]);

  useEffect(() => {
    return () => {
      if (gpsTimerRef.current) clearTimeout(gpsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerCountdown <= 0) return;
    if (timerCountdown > 0) {
      const timer = setTimeout(() => {
        setTimerCountdown(timerCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [timerCountdown]);

  useEffect(() => {
    if (timerCountdown === 0 && timerDuration > 0) {
      capturePhoto();
    }
  }, [timerCountdown]);

  const handleSheetChange = (index: number) => {
    if (gpsTimerRef.current) clearTimeout(gpsTimerRef.current);

    setLocalSheetIndex(index);
    setSheetIndex(index);
    setSheetOpen(index > 0);

    if (index === 0) {
      gpsTimerRef.current = setTimeout(() => {
        setIsGpsVisible(true);
      }, 300);
    } else {
      setIsGpsVisible(false);
    }
  };

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (geo.length > 0) {
          const g = geo[0];
          setLocationName(`${g.street || g.subregion || ''}, ${g.city || g.region || ''}`.trim());
        }
      } catch {}
    } catch (error) {
      console.error('Location error:', error);
    } finally {
      setLocationLoading(false);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  // Calculate perpendicular distance from a point to a line segment
  const pointToSegmentDistance = (
    plat: number, plon: number,
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number => {
    const dx = lon2 - lon1;
    const dy = lat2 - lat1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return calculateDistance(plat, plon, lat1, lon1);
    }

    let t = ((plat - lat1) * dy + (plon - lon1) * dx) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projLat = lat1 + t * dy;
    const projLon = lon1 + t * dx;

    return calculateDistance(plat, plon, projLat, projLon);
  };

  // Calculate minimum distance from a point to a LineString geometry
  const pointToLineDistance = (lat: number, lon: number, geometry: any): number => {
    if (!geometry || !geometry.coordinates) return Infinity;

    const geomType = geometry.type;
    let minDistance = Infinity;

    if (geomType === 'LineString') {
      const coords = geometry.coordinates;
      for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i];
        const [lon2, lat2] = coords[i + 1];
        const dist = pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2);
        minDistance = Math.min(minDistance, dist);
      }
    } else if (geomType === 'MultiLineString') {
      for (const line of geometry.coordinates) {
        for (let i = 0; i < line.length - 1; i++) {
          const [lon1, lat1] = line[i];
          const [lon2, lat2] = line[i + 1];
          const dist = pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2);
          minDistance = Math.min(minDistance, dist);
        }
      }
    } else if (geomType === 'Point') {
      const [lon1, lat1] = geometry.coordinates;
      minDistance = calculateDistance(lat, lon, lat1, lon1);
    }

    return minDistance;
  };

  const fetchNearbyFeatures = async () => {
    if (!location) return;

    try {
      setFeaturesLoading(true);

      // Progressive search: try 200 m, then 500 m, then 1 000 m
      const searchRadii = [200, 500, 1000];
      let features: any[] = [];
      let finalRadius = 200;

      // ── Phase 1: online API with graceful per-radius degradation ──
      for (const radius of searchRadii) {
        try {
          const response = await getNearbyGISFeatures(location.latitude, location.longitude, radius);
          let currentFeatures: any[] = [];
          if (response.data?.type === 'FeatureCollection' && Array.isArray(response.data.features)) {
            currentFeatures = response.data.features;
          } else if (Array.isArray(response.data)) {
            currentFeatures = response.data;
          } else if (Array.isArray(response.data?.data)) {
            currentFeatures = response.data.data;
          }
          if (currentFeatures.length > 0) {
            features = currentFeatures;
            finalRadius = radius;
            break;
          }
        } catch {
          // Network failed for this radius — try the next larger radius immediately
          continue;
        }
      }

      // ── Phase 2: offline fallback — only when API returned nothing at all radii ──
      if (features.length === 0) {
        try {
          console.log('[Camera] offline fallback — reading cached map layers…');
          const cached = await getCachedMapLayers();

          // Normalise: cached.gisFeatures can be null, an array, a
          // FeatureCollection, or an envelope { data: [...] } from the
          // shared cache reader — whichever shape is on disk is handled here.
          const raw = cached.gisFeatures;
          const allFeatures: any[] = Array.isArray(raw)
            ? raw
            : (raw && Array.isArray(raw.features)
              ? raw.features
              : (raw && Array.isArray(raw?.data)
                ? raw.data
                : []));

          console.log('[Camera] cached gisFeatures raw type:', typeof raw, 'normalised count:', allFeatures.length);
          if (allFeatures.length > 0) {
            for (const radius of searchRadii) {
              const candidates = allFeatures.filter((feat: any) => {
                const d = pointToLineDistance(location.latitude, location.longitude, feat.geometry);
                return d <= radius;
              });
              if (candidates.length > 0) {
                features = candidates;
                finalRadius = radius;
                break;
              }
            }
            if (features.length === 0) {
              features = allFeatures
                .map((feat: any) => ({
                  feature: feat,
                  dist: pointToLineDistance(location.latitude, location.longitude, feat.geometry),
                }))
                .sort((a: any, b: any) => a.dist - b.dist)
                .slice(0, 50)
                .map((x: any) => x.feature);
            }
          }
        } catch { /* cache miss — no offline data available */ }
      }

      if (features.length === 0) {
        setNearbyFeatures([]);
        setSelectedFeature(null);
        setFeaturesLoading(false);
        return;
      }

      // Calculate proper point-to-line distance using geometry coordinates
      const featuresWithDistance = features.map((feature: any) => {
        const lineDistance = pointToLineDistance(
          location.latitude,
          location.longitude,
          feature.geometry,
        );
        return {
          ...feature,
          properties: {
            ...feature.properties,
            distance: lineDistance,
          },
        };
      });

      // Sort by calculated perpendicular distance to line
      const sortedFeatures = featuresWithDistance.sort((a: any, b: any) => {
        return a.properties.distance - b.properties.distance;
      });

      setNearbyFeatures(sortedFeatures);

      // Auto-select the nearest feature
      if (sortedFeatures.length > 0) {
        setSelectedFeature(sortedFeatures[0]);
      }
    } catch (error) {
      console.error('Error fetching nearby features:', error);
      setNearbyFeatures([]);
    } finally {
      setFeaturesLoading(false);
    }
  };

  useEffect(() => {
    if (location) {
      fetchNearbyFeatures();
    }
  }, [location]);

  // STRICT AUTO-CATEGORIZATION RULES
  useEffect(() => {
    const wInt = WATER_STR_TO_INT[waterLevel] || 3;
    const sInt = SILT_STR_TO_INT[siltLevel] || 3;
    const dInt = DEBRIS_STR_TO_INT[debrisLevel] || 3;

    // RULE 1: MUST be a Ticket if Water is 1/5, Silt is 5, or Debris is 5
    if (wInt === 1 || wInt === 5 || sInt === 5 || dInt === 5) {
      if (submissionType !== 'ticket' || category !== 'issue') {
        setSubmissionType('ticket');
        setCategory('issue');
      }
    } 
    // RULE 2: Default to Cleaning if Silt=1 AND Debris=1 (Allow override to maintenance)
    else if (sInt === 1 && dInt === 1) {
      if (submissionType === 'ticket') {
        setSubmissionType('report');
      }
      if (category !== 'maintenance' && category !== 'cleaning') {
        setCategory('cleaning');
      }
    }
  }, [waterLevel, siltLevel, debrisLevel]);

  const loadPresets = async () => {
    try {
      setPresetsLoading(true);
      const res = await getPresetsByCategory(category);
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setPresets(data);
    } catch { setPresets([]); }
    finally { setPresetsLoading(false); }
  };

  const capturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        setCapturedImage(photo.uri);
        setMode('form');

        // ─── Auto-save as draft the moment the form opens ──────────────────
        // Delete any previous in-flight draft from an earlier photo capture
        // so only the latest draft is ever kept
        if (currentDraftId) {
          (async () => { try { await deletePendingReport(currentDraftId); } catch (_) {} })().catch(console.error);
        }
        const draftId = `local_${Date.now()}`;
        setCurrentDraftId(draftId);
        const reportData = {
          id: draftId,
          images: [photo.uri],
          water_level: WATER_STR_TO_INT[waterLevel] || 3,
          silt_level: SILT_STR_TO_INT[siltLevel] || 3,
          debris_level: DEBRIS_STR_TO_INT[debrisLevel] || 3,
          category,
          remarks,
          latitude: location?.latitude || 0,
          longitude: location?.longitude || 0,
          location_name: locationName,
          ...(user?.ia_id && { ia_id: user.ia_id }),
          gis_feature_id: selectedFeature?.id || null,
        };
        await savePendingReport(reportData);
      }
    } catch (error) {
      console.error('Take picture error:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const takePicture = () => {
    if (timerDuration > 0) {
      setTimerCountdown(timerDuration);
      return;
    }
    capturePhoto();
  };

  const retakePhoto = () => {
    // Discard the draft that was created when the image was captured — user is explicitly abandoning it
    if (currentDraftId) {
      (async () => {
        try { await deletePendingReport(currentDraftId); } catch (_) {}
      })().catch(console.error);
      setCurrentDraftId(null);
    }
    setCapturedImage(null);
    setMode('viewfinder');
    setTimerCountdown(0);
  };

  const applyPreset = (preset: any) => {
    if (preset.water_level) setWaterLevel(typeof preset.water_level === 'number' ? WATER_INT_TO_STR[preset.water_level] : preset.water_level);
    if (preset.silt_level) setSiltLevel(typeof preset.silt_level === 'number' ? SILT_INT_TO_STR[preset.silt_level] : preset.silt_level);
    if (preset.debris_level) setDebrisLevel(typeof preset.debris_level === 'number' ? DEBRIS_INT_TO_STR[preset.debris_level] : preset.debris_level);
    if (preset.remarks) setRemarks(preset.remarks);
    
    // Auto-switch submission type based on preset
    if (preset.category === 'issue') {
      setSubmissionType('ticket');
    } else {
      setSubmissionType('report');
    }
    
    setShowPresetModal(false);
  };

  const applyQuickPreset = (type: string) => {
    if (type === 'cleaning') { setSiltLevel('clean'); setDebrisLevel('clear'); }
    else if (type === 'severe') { setWaterLevel('overflow'); setSiltLevel('heavily_silted'); setDebrisLevel('blocked'); }
    else { setWaterLevel('normal'); setSiltLevel('normal'); setDebrisLevel('normal'); }
  };

  // Handles switching between Report/Ticket and expanding the sheet
  const handleTypeToggle = (type: 'report' | 'ticket') => {
    if (type === 'report') {
      const wInt = WATER_STR_TO_INT[waterLevel] || 3;
      const sInt = SILT_STR_TO_INT[siltLevel] || 3;
      const dInt = DEBRIS_STR_TO_INT[debrisLevel] || 3;
      if (wInt === 1 || wInt === 5 || sInt === 5 || dInt === 5) {
        setWaterLevel('normal');
        setSiltLevel('normal');
        setDebrisLevel('normal');
      }
      setCategory('inspection');
    } else {
      setCategory('issue');
    }
    setSubmissionType(type);
  };

  // ─── Save changes when editing an existing report ─────────────────────────────
  const saveEditChanges = async () => {
    if (!editingReportId) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('water_level', String(WATER_STR_TO_INT[waterLevel] || 3));
      formData.append('silt_level', String(SILT_STR_TO_INT[siltLevel] || 3));
      formData.append('debris_level', String(DEBRIS_STR_TO_INT[debrisLevel] || 3));
      formData.append('remarks', remarks || '');
      formData.append('latitude', String(location?.latitude || 0));
      formData.append('longitude', String(location?.longitude || 0));
      formData.append('location_name', locationName || '');
      formData.append('gis_feature_id', selectedFeature?.id || '');
      await updateReport(editingReportId, formData);
      Alert.alert('Saved', 'Your report has been updated.');
      resetFormAfterSubmit();
    } catch (error: any) {
      console.error('Edit error:', error);
      // Fallback: save as draft so no data is lost
      try {
        await savePendingReport({
          images: capturedImage ? [capturedImage] : [],
          water_level: WATER_STR_TO_INT[waterLevel] || 3,
          silt_level: SILT_STR_TO_INT[siltLevel] || 3,
          debris_level: DEBRIS_STR_TO_INT[debrisLevel] || 3,
          category,
          remarks,
          latitude: location?.latitude || 0,
          longitude: location?.longitude || 0,
          location_name: locationName,
          gis_feature_id: selectedFeature?.id || null,
        });
        Alert.alert('Saved Offline', 'Could not reach server. Changes saved locally and will sync when online.');
      } catch (_) {
        Alert.alert('Error', 'Failed to save changes. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

function resetFormAfterSubmit() {
  setCapturedImage(null);
  setMode('viewfinder');
  setWaterLevel('normal');
  setSiltLevel('normal');
  setDebrisLevel('normal');
  setCategory('inspection');
  setRemarks('');
  setSelectedFeature(null);
  setCurrentDraftId(null);
  setIsEditing(false);
  setEditingReportId(null);
  setSubmissionType('report');
  getLocation();
}

  const confirmSubmit = () => {
    if (!location) { Alert.alert('Error', 'Location is required'); return; }
    if (!capturedImage) { Alert.alert('Error', 'Photo is required'); return; }
    Alert.alert(
      'Confirm Report',
      `Location: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}\nWater: ${waterLevel}\nSilt: ${siltLevel}\nDebris: ${debrisLevel}\nCategory: ${category}\n\nSubmit this report?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: submitReport },
      ]
    );
  };

  const submitReport = async () => {
    setLoading(true);
    try {
      if (!capturedImage) throw new Error("No image captured.");

      const reportData = {
        images: [capturedImage],
        water_level: WATER_STR_TO_INT[waterLevel] || 3,
        silt_level: SILT_STR_TO_INT[siltLevel] || 3,
        debris_level: DEBRIS_STR_TO_INT[debrisLevel] || 3,
        category,
        remarks,
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        location_name: locationName,
        ...(user?.ia_id && { ia_id: user.ia_id }),
        gis_feature_id: selectedFeature?.id || null,
      };

      const result = await createReportOffline(reportData);

      if (result.online) {
        // ─── Online success → remove the draft that was auto-saved on photo capture ──
        if (currentDraftId) {
          try { await deletePendingReport(currentDraftId); } catch (_) {}
          setCurrentDraftId(null);
        }
        Alert.alert('Success', 'Report submitted successfully!');
      } else {
        // ─── Offline → draft stays, no action needed ──────────────────────────────
        Alert.alert('Saved Offline', `Report saved locally. ${pendingCount + 1} pending report(s). Will sync when online.`);
      }

      resetFormAfterSubmit();
    } catch (error: any) {
      console.error('Submit error:', error);
      Alert.alert('Error', error.message || 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  const LevelPicker = ({ label, value, onChange, options, type }: any) => {
    // Check if option should be disabled in ticket mode
    const isTicketMode = submissionType === 'ticket';
    const isDisabled = (opt: string) => {
      if (!isTicketMode) return false;
      
      const optInt = type === 'water' ? WATER_STR_TO_INT[opt] : 
                   type === 'silt' ? SILT_STR_TO_INT[opt] : 
                   DEBRIS_STR_TO_INT[opt];
      
      // Ticket restrictions
      if (type === 'silt') {
        return optInt === 1 || optInt === 2 || optInt === 3;
      } else if (type === 'debris') {
        return optInt === 1 || optInt === 2 || optInt === 3;
      }
      return false;
    };

    // Check if option should have red border (critical values for tickets)
    const isCritical = (opt: string) => {
      const optInt = type === 'water' ? WATER_STR_TO_INT[opt] : 
                   type === 'silt' ? SILT_STR_TO_INT[opt] : 
                   DEBRIS_STR_TO_INT[opt];
      
      if (type === 'water') {
        return optInt === 1 || optInt === 5;
      } else if (type === 'silt') {
        return optInt === 5;
      } else if (type === 'debris') {
        return optInt === 5;
      }
      return false;
    };

    // Check if option should have pale red border (level 4 for silt/debris)
    const isPaleCritical = (opt: string) => {
      const optInt = type === 'silt' ? SILT_STR_TO_INT[opt] : 
                   type === 'debris' ? DEBRIS_STR_TO_INT[opt] : 0;
      
      if ((type === 'silt' || type === 'debris') && optInt === 4) {
        return true;
      }
      return false;
    };

    return (
      <View style={styles.pickerContainer}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <View style={styles.pickerRow}>
          {options.map((opt: string) => {
            const isSelected = value === opt;
            const idx = options.indexOf(opt);
            const disabled = isDisabled(opt);
            const critical = isCritical(opt);
            const paleCritical = isPaleCritical(opt);
            
            return (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.levelItem,
                  disabled && styles.levelItemDisabled,
                  (critical || paleCritical) && styles.levelItemCritical
                ]}
                onPress={() => !disabled && onChange(opt)}
                activeOpacity={disabled ? 0.3 : 0.7}
                disabled={disabled}
              >
                {/* Glow layer – always behind the circle; circle itself carries no shadow */}
                {critical && <View style={styles.levelCircleGlow} />}
                <View style={[
                  styles.levelCircle,
                  isSelected
                    ? (critical ? styles.levelCircleCriticalSelected : (paleCritical ? styles.levelCirclePaleCriticalSelected : styles.levelCircleSelected))
                    : (critical ? styles.levelCircleCritical : (paleCritical ? styles.levelCirclePaleCritical : styles.levelCircle))
                ]}>
                  <RNText style={[
                    styles.levelNumber, 
                    isSelected
                      ? (critical ? styles.levelNumberCriticalSelected : (paleCritical ? styles.levelNumberPaleCriticalSelected : styles.levelNumberSelected))
                      : (critical ? styles.levelNumberCritical : (paleCritical ? styles.levelNumberPaleCritical : styles.levelNumber))
                  ]}>
                    {idx + 1}
                  </RNText>
                </View>
                <RNText style={[
                  styles.levelText, 
                  isSelected
                    ? (critical ? styles.levelTextCriticalSelected : (paleCritical ? styles.levelTextPaleCriticalSelected : styles.levelTextSelected))
                    : (critical ? styles.levelTextCritical : (paleCritical ? styles.levelTextPaleCritical : styles.levelText))
                ]}>
                  {LEVEL_DESCRIPTIONS[type]?.[opt] || opt}
                </RNText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const formatDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (!permission) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>Camera permission is required</Text>
        <Button mode="contained" onPress={requestPermission} style={styles.permissionBtn} buttonColor="#74A5A8">Grant Permission</Button>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      {/* Viewfinder or Captured Photo in 4:3 Ratio */}
      {mode === 'viewfinder' ? (
        <CameraView style={styles.camera} facing={cameraType} flash={flash} ref={cameraRef} />
      ) : (
        <Image source={{ uri: capturedImage! }} style={styles.camera} />
      )}
      
      {mode === 'viewfinder' ? (
        <View style={styles.overlayContainer}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topIconBtn} onPress={() => setFlash(flash === 'off' ? 'on' : flash === 'on' ? 'auto' : 'off')}>
              <Ionicons name={flash === 'off' ? 'flash-off-outline' : flash === 'on' ? 'flash-outline' : 'flash-outline'} size={24} color={flash === 'on' ? '#f5dd4b' : '#fff'} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.topIconBtn, timerDuration > 0 && styles.topIconBtnActive]} onPress={() => {
              setTimerDuration(prev => prev === 0 ? 3 : prev === 3 ? 5 : prev === 5 ? 10 : 0);
            }}>
              <View style={styles.timerIconContainer}>
                <Ionicons name="timer-outline" size={24} color={timerDuration > 0 ? '#74A5A8' : '#fff'} />
                {timerDuration > 0 && (
                  <View style={styles.timerBadge}>
                    <RNText style={styles.timerBadgeText}>{timerDuration}</RNText>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.topIconBtn} onPress={() => setShowGrid(!showGrid)}>
              <Ionicons name="grid-outline" size={24} color={showGrid ? '#74A5A8' : '#fff'} />
            </TouchableOpacity>
          </View>

          {showGrid && (
            <View style={styles.gridOverlay}>
              <View style={styles.gridLineH1} />
              <View style={styles.gridLineH2} />
              <View style={styles.gridLineV1} />
              <View style={styles.gridLineV2} />
            </View>
          )}

          <TouchableOpacity 
            style={styles.geoWatermark}
            onPress={() => setShowGISModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.watermarkContent}>
              <Ionicons name="location-sharp" size={12} color="#fff" />
              <RNText style={styles.watermarkText}>
                {formatDate()} {formatTime()}
              </RNText>
            </View>
            {locationName ? (
              <RNText style={styles.watermarkLocation}>{locationName}</RNText>
            ) : null}
            <RNText style={styles.watermarkCoords}>
              {location?.latitude.toFixed(6)}, {location?.longitude.toFixed(6)}
            </RNText>
            
            {/* GIS Feature Information */}
            {selectedFeature ? (
              <View style={styles.selectedFeatureBadge}>
                <Ionicons name="water" size={10} color="#74A5A8" />
                <RNText style={styles.selectedFeatureText}>
                  {selectedFeature.properties?.name || 'Canal'} • {selectedFeature.properties?.distance ? Math.round(selectedFeature.properties.distance) : '?'}m
                </RNText>
                <Ionicons name="chevron-forward" size={10} color="#74A5A8" />
              </View>
            ) : nearbyFeatures.length > 0 ? (
              <View style={styles.featureCountBadge}>
                <Ionicons name="water" size={10} color="#74A5A8" />
                <RNText style={styles.featureCountText}>
                  {nearbyFeatures.length} canals nearby • Tap to select
                </RNText>
                <Ionicons name="chevron-forward" size={10} color="#74A5A8" />
              </View>
            ) : (
              <View style={styles.noFeatureBadge}>
                <Ionicons name="water" size={10} color="#999" />
                <RNText style={styles.noFeatureText}>
                  No canals nearby • Tap to search wider area
                </RNText>
                <Ionicons name="chevron-forward" size={10} color="#999" />
              </View>
            )}
          </TouchableOpacity>

          {timerCountdown > 0 && (
            <View style={styles.countdownOverlay}>
              <RNText style={styles.countdownText}>{timerCountdown}</RNText>
            </View>
          )}

          {/* Edit mode banner — replaces shutter when editing */}
          {isEditing && (
            <View style={styles.editBanner}>
              <Ionicons name="create-outline" size={20} color="#fff" />
              <RNText style={styles.editBannerText}>Editing — tap Save Changes below</RNText>
            </View>
          )}

          {/* Shutter Area — hidden in edit mode so taps don't create duplicates */}
          {!isEditing && (
          <View style={styles.shutterArea}>
            <TouchableOpacity style={styles.flipBtn} onPress={() => setCameraType(cameraType === 'back' ? 'front' : 'back')}>
              <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={styles.shutterWrapper}>
              <TouchableOpacity 
                style={styles.shutterBtn} 
                onPress={timerCountdown > 0 ? () => setTimerCountdown(0) : takePicture}
                activeOpacity={0.8}
              >
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            </View>
            <View style={{ width: 50 }} />
          </View>
          )}
        </View>
      ) : (
        // Bottom Sheet Form with DraggableBottomSheet
        <>
          {/* LOCATION CARD - Outside bottom sheet, at top of image */}
          <View style={styles.locationCard}>
            <View style={styles.locationCardRow}>
              <Ionicons name="location" size={14} color="#fff" />
              <RNText style={styles.locationCardCoords}>
                {location?.latitude.toFixed(4)}° N {location?.longitude.toFixed(4)}° E
              </RNText>
            </View>
            <RNText style={styles.locationCardText}>{locationName || 'Location loading...'}</RNText>
            <RNText style={styles.locationCardDate}>{formatDate()} {formatTime()}</RNText>
            
            {/* GIS Feature (Canal) Information */}
            {selectedFeature ? (
              <View style={styles.canalInfoRow}>
                <Ionicons name="water" size={12} color="#fff" />
                <RNText style={styles.canalInfoText}>
                  {selectedFeature.properties?.name || 'Canal'} • {selectedFeature.properties?.distance ? Math.round(selectedFeature.properties.distance) : '?'}m
                </RNText>
              </View>
            ) : nearbyFeatures.length > 0 ? (
              <View style={styles.canalInfoRow}>
                <Ionicons name="water" size={12} color="#fff" />
                <RNText style={styles.canalInfoText}>
                  {nearbyFeatures.length} canals nearby
                </RNText>
              </View>
            ) : null}
          </View>

          <DraggableBottomSheet
            snapPoints={['50%', '80%']}
            index={localSheetIndex}
            onChange={handleSheetChange}
            onExpandChange={setLocalSheetIndex}
            keyboardAvoiding={true}
          >
            <View style={styles.sheetContent}>
              <View style={styles.formHeader}>
                <TouchableOpacity onPress={() => setShowHelpModal(true)} style={styles.headerBtn}>
                  <Ionicons name="help-circle-outline" size={26} color="#666" />
                </TouchableOpacity>

                <View style={styles.typeToggleContainer}>
                  <TouchableOpacity
                    style={[styles.typeToggleBtn, submissionType === 'report' && styles.typeToggleBtnActive]}
                    onPress={() => handleTypeToggle('report')}
                  >
                    <RNText style={[styles.typeToggleText, submissionType === 'report' && styles.typeToggleTextActive]}>REPORT</RNText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeToggleBtn, submissionType === 'ticket' && styles.typeToggleBtnActive]}
                    onPress={() => handleTypeToggle('ticket')}
                  >
                    <RNText style={[styles.typeToggleText, submissionType === 'ticket' && styles.typeToggleTextActive]}>TICKET</RNText>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={retakePhoto} style={styles.headerBtn}>
                  <Ionicons name="close" size={28} color="#333" />
                </TouchableOpacity>
              </View>

              {/* CATEGORY FIRST - determines available presets */}
              <View style={styles.section}>
                <Text variant="titleMedium" style={styles.sectionTitle}>Category</Text>
                <View style={styles.categoryContainer}>
                  {submissionType === 'ticket' ? (
                     <Chip selected style={styles.categoryChipSelected} textStyle={styles.categoryChipTextSelected} icon={() => <Ionicons name="alert-circle" size={16} color="#fff" />}>
                       Issue
                     </Chip>
                  ) : (
                    [
                      { value: 'inspection', label: 'Inspection', icon: 'search' },
                      { value: 'maintenance', label: 'Maintenance', icon: 'construct' },
                      { value: 'cleaning', label: 'Cleaning', icon: 'water' },
                      { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
                    ].map((cat) => (
                      <Chip
                        key={cat.value}
                        selected={category === cat.value}
                        onPress={() => setCategory(cat.value)}
                        style={[styles.categoryChip, category === cat.value && styles.categoryChipSelected]}
                        textStyle={category === cat.value ? styles.categoryChipTextSelected : styles.categoryChipText}
                        icon={() => <Ionicons name={cat.icon as any} size={16} color={category === cat.value ? '#fff' : '#666'} />}
                      >
                        {cat.label}
                      </Chip>
                    ))
                  )}
                </View>
              </View>

              {/* PRESETS - filtered by selected category */}
              {presets.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text variant="titleMedium" style={styles.sectionTitle}>Presets</Text>
                    <TouchableOpacity onPress={() => setShowPresetModal(true)}>
                      <Text style={styles.viewAllText}>View All</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
                    {presets.slice(0, 3).map((preset) => (
                      <TouchableOpacity
                        key={preset.id}
                        style={styles.presetCard}
                        onPress={() => applyPreset(preset)}
                      >
                        <Ionicons name={getValidIcon(preset.icon) as any} size={24} color="#74A5A8" />
                        <Text style={styles.presetName}>{preset.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* PARAMETERS */}
              <View style={styles.section}>
                <Text variant="titleMedium" style={styles.sectionTitle}>Parameters</Text>
                <LevelPicker label="Water Level" value={waterLevel} onChange={setWaterLevel} options={WATER_LEVELS} type="water" />
                <LevelPicker label="Silt Level" value={siltLevel} onChange={setSiltLevel} options={SILT_LEVELS} type="silt" />
                <LevelPicker label="Debris Level" value={debrisLevel} onChange={setDebrisLevel} options={DEBRIS_LEVELS} type="debris" />
              </View>

              {/* REMARKS */}
              <View style={styles.section}>
                <Text variant="titleMedium" style={styles.sectionTitle}>Remarks</Text>
                <TextInput
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="Add any additional notes..."
                  style={styles.remarksInput}
                  activeOutlineColor="#74A5A8"
                  textColor="#333"
                />
              </View>

              <Button mode="contained" onPress={isEditing ? saveEditChanges : confirmSubmit} loading={loading} disabled={loading} style={styles.submitButton} buttonColor={isEditing ? '#1976D2' : '#74A5A8'}>
                {isEditing ? 'Save Changes' : 'Submit Report'}
              </Button>

              {/* Extra spacer to ensure submit button is clearly visible above nav */}
              <View style={{ height: 120 }} />
            </View>
          </DraggableBottomSheet>
        </>
      )}

      {/* Global Modals overlaying everything */}
      <Portal>
        <Dialog visible={showHelpModal} onDismiss={() => setShowHelpModal(false)} style={{ backgroundColor: '#fff' }}>
          <Dialog.Title>Quick Guide</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ marginBottom: 12, color: '#666' }}>Select the rating based on your observation of the canal's state.</Text>
            <View style={styles.guideTable}>
              <View style={styles.guideHeader}>
                <Text style={styles.guideCol1}>#</Text>
                <Text style={styles.guideCol}>Water</Text>
                <Text style={styles.guideCol}>Silt</Text>
                <Text style={styles.guideCol}>Debris</Text>
              </View>
              {[1, 2, 3, 4, 5].map((n) => (
                <View key={n} style={styles.guideRow}>
                  <View style={styles.guideNum}><Text style={{ color: '#fff', fontWeight: 'bold' }}>{n}</Text></View>
                  <Text style={styles.guideText}>{LEVEL_DESCRIPTIONS.water[WATER_LEVELS[n-1]]}</Text>
                  <Text style={styles.guideText}>{LEVEL_DESCRIPTIONS.silt[SILT_LEVELS[n-1]]}</Text>
                  <Text style={styles.guideText}>{LEVEL_DESCRIPTIONS.debris[DEBRIS_LEVELS[n-1]]}</Text>
                </View>
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setShowHelpModal(false)} textColor="#74A5A8">Got it</Button></Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={showPresetModal} onDismiss={() => setShowPresetModal(false)} style={{ backgroundColor: '#fff' }}>
          <Dialog.Title>Report Presets</Dialog.Title>
          <Dialog.Content>
            {presets.length === 0 ? (
              <Text variant="bodySmall" style={{ color: '#999', textAlign: 'center' }}>No presets for this category</Text>
            ) : (
              presets.map((preset: any) => (
                <Button key={preset.id} mode="outlined" onPress={() => applyPreset(preset)} style={{ marginBottom: 8 }} textColor="#74A5A8">
                  {preset.name}
                </Button>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setShowPresetModal(false)} textColor="#74A5A8">Close</Button></Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={showGISModal} onDismiss={() => setShowGISModal(false)} style={{ backgroundColor: '#fff' }}>
          <Dialog.Title>Select Canal Line</Dialog.Title>
          <Dialog.Content>
            {/* Current Location */}
            <View style={{ marginBottom: 16, padding: 12, backgroundColor: '#f0f4f8', borderRadius: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="location" size={16} color="#74A5A8" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" style={{ color: '#333', fontWeight: '600' }}>
                    Search Location
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#666' }}>
                    {location?.latitude.toFixed(6)}, {location?.longitude.toFixed(6)}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={fetchNearbyFeatures}
                  style={{ padding: 8, backgroundColor: '#74A5A8', borderRadius: 20 }}
                  disabled={featuresLoading}
                >
                  <Ionicons name="refresh" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            
            {featuresLoading ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#74A5A8" />
                <Text variant="bodySmall" style={{ color: '#666', marginTop: 8 }}>Loading nearby canals...</Text>
              </View>
            ) : nearbyFeatures.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Ionicons name="water" size={32} color="#ccc" />
                <Text variant="bodySmall" style={{ color: '#999', textAlign: 'center', marginTop: 8 }}>
                  No canals found nearby
                </Text>
                <Text variant="bodySmall" style={{ color: '#999', textAlign: 'center', marginTop: 4 }}>
                  The app searches up to 1km radius for canals
                </Text>
                <Text variant="bodySmall" style={{ color: '#999', textAlign: 'center', marginTop: 4 }}>
                  Try moving closer to a canal or refresh the search
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {nearbyFeatures.map((feature: any, index: number) => {
                  return (
                  <TouchableOpacity
                    key={feature.id || `feature-${index}`}
                    style={[
                      styles.featureItem,
                      selectedFeature?.id === feature.id && styles.featureItemSelected
                    ]}
                    onPress={() => {
                      setSelectedFeature(feature);
                      setShowGISModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.featureItemLeft}>
                      <Ionicons name="water" size={20} color={selectedFeature?.id === feature.id ? '#fff' : '#74A5A8'} />
                      <View style={styles.featureItemText}>
                        <Text style={[
                          styles.featureName,
                          selectedFeature?.id === feature.id && styles.featureNameSelected
                        ]}>
                          {feature.properties?.name || 'Canal'}
                        </Text>
                        <Text style={styles.featureType}>
                          {feature.properties?.feature_type || 'canal'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.featureItemRight}>
                      <Text style={[
                        styles.featureDistance,
                        selectedFeature?.id === feature.id && styles.featureDistanceSelected
                      ]}>
                        {feature.properties?.distance ? Math.round(feature.properties.distance) : '?'}m
                      </Text>
                      {selectedFeature?.id === feature.id && (
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      )}
                    </View>
                  </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowGISModal(false)} textColor="#74A5A8">Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0EBE2',
  },
  permissionText: {
    color: '#666',
    marginBottom: 16,
    fontSize: 16,
  },
  permissionBtn: {
    backgroundColor: '#74A5A8',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-start', // Anchors to top
  },
  camera: {
    width: width,
    height: width * (4 / 3), // Forces the exact 4:3 Aspect Ratio
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 50,
    paddingBottom: 16,
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: width * (4 / 3), // Confined grid strictly to camera bounds
  },
  gridLineH1: {
    position: 'absolute',
    top: '33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineH2: {
    position: 'absolute',
    top: '66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineV1: {
    position: 'absolute',
    left: '33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineV2: {
    position: 'absolute',
    left: '66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  geoWatermark: {
    position: 'absolute',
    top: (width * (4 / 3)) - 80, // Anchored to bottom of 4:3 area
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    maxWidth: width - 32,
  },
  watermarkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  watermarkText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  watermarkLocation: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 4,
  },
  watermarkCoords: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    marginTop: 2,
  },
  selectedFeatureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  selectedFeatureText: {
    color: '#74A5A8',
    fontSize: 10,
    fontWeight: '600',
  },
  shutterArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: '#000',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingTop: 20,
  },
  shutterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  flipBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Edit mode banner ──────────────────────────────
  editBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(25, 118, 210, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  editBannerText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Custom Bottom Sheet Styles
  bottomSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.70, // Overlays 70% of screen height
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20, // Shadow for android
    paddingBottom: 90, // Leave space for bottom nav
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  // GPS Badge - shown when sheet is collapsed
  gpsBadge: {
    position: 'absolute',
    bottom: height * 0.50 + 10 + 85, // Just above the collapsed sheet
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    zIndex: 10,
  },
  gpsBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  // Sheet content wrapper
  sheetContent: {
    flex: 1,
  },
  // Location Card - outside bottom sheet at top of image
  locationCard: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 12,
    zIndex: 10,
  },
  locationCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  locationCardCoords: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  locationCardText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginBottom: 2,
  },
  locationCardDate: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  canalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  canalInfoText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  // Category chips
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
  },
  categoryChipSelected: {
    backgroundColor: '#74A5A8',
  },
  categoryChipText: {
    color: '#666',
    fontSize: 12,
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Presets
  viewAllText: {
    color: '#74A5A8',
    fontSize: 13,
    fontWeight: '500',
  },
  presetsScroll: {
    flexDirection: 'row',
  },
  presetCard: {
    backgroundColor: 'rgba(116,165,168,0.1)',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  presetName: {
    fontSize: 11,
    color: '#333',
    marginTop: 4,
    textAlign: 'center',
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(116,165,168,0.15)',
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetsDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
  },
  presetsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  helpCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(116,165,168,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpCircleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#74A5A8',
  },
  formTitle: {
    fontWeight: 'bold',
    color: '#333',
    fontSize: 18,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 20,
  },
  locationInfo: {
    backgroundColor: 'rgba(116,165,168,0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    color: '#333',
    fontWeight: '500',
  },
  locationNameText: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
    marginLeft: 24,
  },
  levelItemDisabled: {
    opacity: 0.3,
  },
  levelItemCritical: {
    overflow: 'visible',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  levelCircleCritical: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  levelNumberCritical: {
    color: '#EF4444',
    fontWeight: '600',
  },
  levelTextCritical: {
    color: '#666',
  },
  levelCircleCriticalSelected: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  // Dedicated glow layer — sits behind the circle via absolute positioning
  levelCircleGlow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    top: 2,
    bottom: 0,
    left: 0,
    right: 0,
    marginHorizontal: 'auto',
    marginVertical: 'auto',
    backgroundColor: 'transparent',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  levelNumberCriticalSelected: {
    color: '#fff',
  },
  levelTextCriticalSelected: {
    color: '#333',
  },
  levelCirclePaleCritical: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#F87171',
  },
  levelNumberPaleCritical: {
    color: '#F87171',
    fontWeight: '600',
  },
  levelTextPaleCritical: {
    color: '#666',
  },
  levelCirclePaleCriticalSelected: {
    backgroundColor: '#F87171',
    borderColor: '#F87171',
  },
  levelNumberPaleCriticalSelected: {
    color: '#fff',
  },
  levelTextPaleCriticalSelected: {
    color: '#333',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontWeight: 'bold',
    color: '#333',
    fontSize: 16,
  },
  pickerContainer: {
    marginBottom: 20,
  },
  pickerLabel: {
    fontWeight: '600',
    color: '#333',
    fontSize: 20,
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  levelItem: {
    alignItems: 'center',
    width: 60,
  },
  levelCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#A5B4FC',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  levelCircleSelected: {
    backgroundColor: '#A5B4FC',
    borderColor: '#A5B4FC',
  },
  levelNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A5B4FC',
  },
  levelNumberSelected: {
    color: '#fff',
  },
  levelText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
  levelTextSelected: {
    color: '#333',
    fontWeight: '600',
  },
  segmented: {
    marginTop: 4,
  },
  remarksInput: {
    backgroundColor: '#fff',
  },
  submitButton: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#74A5A8',
  },
  guideTable: {
    borderWidth: 1,
    borderColor: 'rgba(116,165,168,0.2)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  guideHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(116,165,168,0.8)',
    padding: 10,
  },
  guideCol1: {
    color: '#fff',
    fontWeight: 'bold',
    width: 30,
    textAlign: 'center',
  },
  guideCol: {
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
  },
  guideRow: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(116,165,168,0.1)',
  },
  guideNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#74A5A8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  guideText: {
    flex: 1,
    fontSize: 10,
    color: '#333',
  },
  topIconBtnActive: {
    backgroundColor: 'rgba(116,165,168,0.8)',
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  countdownText: {
    fontSize: 100,
    fontWeight: 'bold',
    color: '#fff',
  },
  timerIconContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerBadge: {
    position: 'absolute',
    top: -2,
    right: -6,
    backgroundColor: '#74A5A8',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  timerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  featureItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  featureItemSelected: {
    backgroundColor: '#74A5A8',
    borderColor: '#74A5A8',
  },
  featureItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  featureItemText: {
    flex: 1,
  },
  featureName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  featureNameSelected: {
    color: '#fff',
  },
  featureType: {
    fontSize: 12,
    color: '#666',
  },
  featureItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureDistance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#74A5A8',
  },
  featureDistanceSelected: {
    color: '#fff',
  },
  iaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  iaText: {
    color: '#9BB88D',
    fontSize: 10,
    fontWeight: '600',
  },
  featureCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  featureCountText: {
    color: '#74A5A8',
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  noFeatureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  noFeatureText: {
    color: '#999',
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  typeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#E0EBE2',
    borderRadius: 20,
    padding: 4,
    width: 280,
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: 'center',
  },
  typeToggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  typeToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  typeToggleTextActive: {
    color: '#333',
  },
});