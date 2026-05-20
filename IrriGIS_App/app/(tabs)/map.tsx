// app/(tabs)/map.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import {
  getGISFeatures, getIAList,
  getReportsGeoJSON, getRISList,
  getTickets, getToken,
} from '../../services/api';
import { getCachedMapLayers, saveMapLayers } from '../../services/offlineStorage';
import { mapHtml } from '../../assets/leaflet-map';
import { useOfflineSync } from '../../hooks/useOfflineSync';

const { height } = Dimensions.get('window');
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000';

// ── Layout (mirror CustomTopNav / CustomBottomNav) ──
const TOPNAV_H    = 56;
const DEFAULT_LAT  = 6.1167;
const DEFAULT_LNG  = 125.1851;
const DEFAULT_ZOOM = 15;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', in_progress: 'In Progress', closed: 'Closed', rejected: 'Rejected',
};
const CATEGORY_LABELS: Record<string, string> = {
  inspection: 'Inspection', maintenance: 'Maintenance', cleaning: 'Cleaning', issue: 'Issue', other: 'Other',
};

function levelToNumber(level: string): number {
  const levels: Record<string, number> = {
    dry: 1, low: 2, normal: 3, high: 4, overflow: 5,
    clean: 1, light: 2, dirty: 4, heavily_silted: 5,
    clear: 1, heavy: 4, blocked: 5,
  };
  return levels[level] || 3;
}

const featureTypes = [
  { value: 'main_canal', label: 'Main Canal' },
  { value: 'lateral',    label: 'Lateral' },
  { value: 'farm_ditch', label: 'Farm Ditch' },
  { value: 'pipeline',   label: 'Pipeline' },
  { value: 'canal',      label: 'Canal' },
];

export default function MapScreen() {
  const router       = useRouter();
  const insets       = useSafeAreaInsets();
  const webViewRef   = useRef<WebView>(null);
  const TOPBAR_H     = TOPNAV_H + insets.top;
  const BOTTOM_H     = 85 + insets.bottom + (insets.top > 0 ? 8 : 0);

  const { isConnected } = useOfflineSync();

  const [reports, setReports]     = useState<any[]>([]);
  const [canals, setCanals]       = useState<any[]>([]);
  const [tickets, setTickets]     = useState<any[]>([]);

  const [loading, setLoading]     = useState(true);
  const [mapReady, setMapReady]   = useState(false);

  const originReportIds = useMemo(() => {
    const s = new Set<number | string>();
    tickets.forEach(t => { if (t.reportId) s.add(String(t.reportId)); });
    return s;
  }, [tickets]);

  // search
  const [searchQuery,    setSearchQuery]   = useState('');
  const [searchResults,  setSearchResults] = useState<any[]>([]);
  const [showSearchDD,   setShowSearchDD]  = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // marker → drawer
  const [selectedReport,  setSelectedReport]  = useState<any>(null);

  // filters & layers
  const [filters,     setFilters]     = useState({ feature_type: '', ris_id: '', ia_id: '' });
  const [risList,     setRisList]     = useState<any[]>([]);
  const [iaList,      setIaList]      = useState<any[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showLayers,  setShowLayers]  = useState(false);

  const [layers, setLayers] = useState({
    canalRoutes: true, showTickets: true, showTicketPending: true,
    showTicketInProgress: true, showTicketClosed: true, showStandalone: true,
    showStandaloneInspection: true, showStandaloneMaintenance: true,
    showStandaloneCleaning: true, showStandaloneOther: true,
  });

  // user location
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating,     setLocating]     = useState(false);

  // ══════════════════════════════════════════════════════════
  //  DATA — offline-first: load cache immediately, then refresh from network
  // ══════════════════════════════════════════════════════════

  const fetchAllDataFromNetwork = useCallback(async () => {
    try {
      const [reportsRes, featuresRes, ticketsRes] = await Promise.all([
        getReportsGeoJSON(), getGISFeatures({}), getTickets({ limit: 1000 }),
      ]);

      const reportsData = Array.isArray(reportsRes.data?.features || reportsRes.data)
        ? (reportsRes.data?.features || reportsRes.data) : [];
      const canalsData   = Array.isArray(featuresRes.data?.features)
        ? featuresRes.data.features : [];
      const ticketsData  = Array.isArray(ticketsRes.data?.tickets)
        ? ticketsRes.data.tickets : [];

      console.log('[Map] fetchAllDataFromNetwork →', {
        reportsCount: reportsData.length,
        canalsCount:  canalsData.length,
        ticketsCount: ticketsData.length,
        featuresResDataType: typeof featuresRes.data,
        featuresResDataHasFeatures: !!featuresRes.data?.features,
        featuresResDataHasData:     !!featuresRes.data?.data,
      });

      setReports(reportsData);
      setCanals(canalsData);
      setTickets(ticketsData);

      console.log('[Map] ABOUT_TO_WRITE → canalsData isArray:', Array.isArray(canalsData), 'len:', canalsData.length,
                  'firstItem:', canalsData[0] ? { id: canalsData[0].id, type: canalsData[0].type } : 'EMPTY_OR_FIRST_ITEM');

      // Persist to offline cache for next time using a safe single-write function.
      // The old Promise.all / read-through pattern caused a race: a stale hit (0 items)
      // fired the write guard's truthy check, skipping the write entirely, even after
      // a fresh network response with 76 items was available.  saveMapLayers reads the
      // file once, updates all three keys, and writes back once — so the new data can
      // never be silently discarded.
      await saveMapLayers(canalsData, reportsData, ticketsData);
      console.log('[Map] CACHE_WRITES_COMPLETE');
    } catch (err: any) {
      console.error('[Map] network fetch failed:', err.message || err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load cached data immediately so the map is populated on mount (even offline)
  // Then quietly try the network; if it fails the map stays on cached data.
  const fetchAllData = useCallback(async () => {
    // 1── Load from cache right away (instant UI)
    try {
      const cached = await getCachedMapLayers();
      if (cached.gisFeatures)  setCanals(cached.gisFeatures);
      if (cached.mapReports)   setReports(cached.mapReports);
      if (cached.tickets)      setTickets(cached.tickets);
    } catch { /* non-fatal */ }

    // 2── If online, refresh from network and update cache
    if (isConnected) {
      try { await fetchAllDataFromNetwork(); }
      catch     { /* network error — keep using cached data */ }
    } else {
      setLoading(false);
    }
  }, [isConnected, fetchAllDataFromNetwork]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  // ── Push data updates to the WebView whenever anything relevant changes ──
  useEffect(() => {
    if (mapReady && !loading && webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'updateMap',
        payload: {
          reports:  reports  || [],
          canals:   layers.canalRoutes ? (canals || []) : [],
          filters,
        },
      }));
    }
  }, [mapReady, loading, reports, canals, layers.canalRoutes, filters]);

  useEffect(() => {
    (async () => {
      try {
        const [risRes, iaRes] = await Promise.all([getRISList(), getIAList()]);
        setRisList(Array.isArray(risRes.data) ? risRes.data : []);
        setIaList(Array.isArray(iaRes.data) ? iaRes.data : []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  // ══════════════════════════════════════════════════════════
  //  USER LOCATION  —  expo-location (same as camera.tsx)
  // ══════════════════════════════════════════════════════════
  const tryGetLocation = useCallback(async (zoom = 17) => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocating(false); return; }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const { latitude: lat, longitude: lng } = loc.coords;
      setUserLocation({ lat, lng });
      setLocating(false);

      // ① pan map
      if (mapReady && webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: 'panToLocation', lat, lng, zoom }));
      }
      // ② place blue dot on Leaflet map
      if (mapReady && webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: 'setUserLocation', lat, lng }));
      }
    } catch { setLocating(false); }
  }, [mapReady]);

  // ① delayed auto-acquire (strain-reducer)
  useEffect(() => {
    const timer = setTimeout(() => { tryGetLocation(17); }, 1000);
    return () => { clearTimeout(timer); };
  }, [tryGetLocation]);

  // ② GenSan fallback if nothing after 4 s
  useEffect(() => {
    if (userLocation) return;
    const timer = setTimeout(() => {
      if (!userLocation && mapReady && webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({
          type: 'panToLocation', lat: DEFAULT_LAT, lng: DEFAULT_LNG, zoom: DEFAULT_ZOOM,
        }));
      }
    }, 4000);
    return () => { clearTimeout(timer); };
  }, [userLocation, mapReady]);

  const handleRecenterLocation = useCallback(() => {
    if (userLocation && webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'panToLocation', lat: userLocation.lat, lng: userLocation.lng, zoom: 18,
      }));
    } else {
      tryGetLocation(18);
    }
  }, [userLocation, tryGetLocation]);

  // ══════════════════════════════════════════════════════════
  //  SEARCH
  // ══════════════════════════════════════════════════════════
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); setShowSearchDD(false); return; }
    const q = query.toLowerCase();
    const results: any[] = [];

    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=en`,
        { headers: { 'User-Agent': 'IrriGIS-Mobile/1.0' } },
      );
      if (nomRes.ok) {
        const data = await nomRes.json();
        data.forEach((place: any) => {
          results.push({
            id: `nom-${place.place_id}`,
            title: (place.display_name || '').split(',')[0].trim(),
            subtitle: place.type || '',
            lat: parseFloat(place.lat), lng: parseFloat(place.lon),
            type: 'location',
          });
        });
      }
    } catch { /* non-fatal */ }

    canals.forEach((feat) => {
      const props = feat.properties || {};
      const name  = props.name || props.remarks || '';
      if (name.toLowerCase().includes(q) || (props.source_file || '').toLowerCase().includes(q) || (props.feature_type || '').toLowerCase().includes(q)) {
        const g = feat.geometry;
        let lat: number | undefined, lng: number | undefined;
        if (typeof g?.type === 'string' && g.type === 'LineString'      && g.coordinates?.length > 0) { lat = g.coordinates[0][1]; lng = g.coordinates[0][0]; }
        else if (typeof g?.type === 'string' && g.type === 'MultiLineString' && g.coordinates?.[0]?.length > 0) { lat = g.coordinates[0][0][1]; lng = g.coordinates[0][0][0]; }
        results.push({ id: `canal-${feat.id || props.name}`, title: name || `${props.feature_type || 'Canal'} #${props.original_id || ''}`, subtitle: props.feature_type || 'Canal', lat, lng, type: 'canal' });
      }
    });

    reports.forEach((feat) => {
      const props = feat.properties || {};
      const reportId = String(props.id || feat.id || '');
      if (props.is_valid === false) return;
      const isOrigin     = originReportIds.has(reportId);
      const isStandalone = !props.ticket_id;
      if (!isOrigin && !isStandalone) return;
      const location = props.location_name || '';
      const remarks  = props.remarks || '';
      const category = props.category || 'other';
      if (location.toLowerCase().includes(q) || remarks.toLowerCase().includes(q) || reportId.toLowerCase().includes(q) || category.toLowerCase().includes(q)) {
        const g = feat.geometry;
        results.push({ id: `report-${reportId}`, title: location || `Report #${reportId.slice(0, 8)}`, subtitle: `${CATEGORY_LABELS[category] || category} – ${remarks?.slice(0, 40) || 'No remarks'}`, lat: g?.coordinates?.[1], lng: g?.coordinates?.[0], type: 'report', reportId });
      }
    });

    results.sort((a, b) => {
      const aLocal = a.type === 'canal' || a.type === 'report';
      const bLocal = b.type === 'canal' || b.type === 'report';
      if (aLocal && !bLocal) return -1;
      if (bLocal && !aLocal) return 1;
      return (a.title || '').localeCompare(b.title || '');
    });

    setSearchResults(results.slice(0, 12));
    setShowSearchDD(results.length > 0);
  }, [reports, canals, originReportIds]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => performSearch(text), 300);
  };

  const handleSearchResultPress = (result: any) => {
    setShowSearchDD(false);
    setSearchQuery(result.title);
    if (result.lat != null && result.lng != null && webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'panToLocation', lat: result.lat, lng: result.lng, zoom: 17 }));
    }
    if (result.type === 'report' && result.reportId) {
      const feat = reports.find((f: any) => String(f.properties?.id || f.id) === result.reportId);
      if (feat) handleMarkerPress(feat);
    }
  };

  // ── mutually-exclusive dropdown toggles (functional updates → no stale closures) ──
  const toggleFilters = () => setShowFilters((prev) => {
    const next = !prev;
    if (next) setShowLayers(false);    // opening Filters → close Layers
    return next;
  });

  const toggleLayers = () => setShowLayers((prev) => {
    const next = !prev;
    if (next) setShowFilters(false);   // opening Layers → close Filters
    return next;
  });

  const handleSearchFocus = () => {
    if (searchResults.length > 0) {
      setShowFilters(false);           // search must not open Filters alongside
      setShowSearchDD(true);
    }
  };

  // ══════════════════════════════════════════════════════════
  //  WEBVIEW MESSAGE
  // ══════════════════════════════════════════════════════════
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapReady') {
        setMapReady(true);
      } else if (data.type === 'markerClick') {
        const report = reports.find((f: any) => String(f.properties?.id || f.id) === data.reportId);
        if (report) handleMarkerPress(report);
      }
    } catch (e) { console.error('Error handling WebView message:', e); }
  };

  // ══════════════════════════════════════════════════════════
  //  MARKER PRESS  →  DETAIL DRAWER
  // ══════════════════════════════════════════════════════════
  const parseFullDate = (d?: string) => !d ? 'N/A'
    : new Date(d).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });

  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
        { headers: { 'User-Agent': 'IrriGIS-Mobile/1.0' } },
      );
      if (res.ok) {
        const data = await res.json();
        const a = data.address || {};
        return a.suburb || a.neighbourhood || a.village || a.town || a.city || null;
      }
    } catch { /* non-fatal */ }
    return null;
  };

  const handleMarkerPress = useCallback(async (feat: any) => {
    const props = feat.properties || {};
    const geom  = feat.geometry?.coordinates || [];
    const lat    = geom[1];
    const lng    = geom[0];

    let ticketData: any = null;
    const reportId  = String(props.id || feat.id);
    const isOrigin  = originReportIds.has(reportId);
    const ticketId  = props.ticket_id as string | undefined;

    if (isOrigin && ticketId) {
      try {
        const token = await getToken();
        const tRes  = await fetch(`${BASE_URL}/api/tickets/${ticketId}`, {
          headers: { Authorization: `Bearer ${token || ''}` },
        });
        const tJson = await tRes.json();
        ticketData  = tJson?.data || tJson;
      } catch { /* non-fatal */ }
    }

    let locName: string | null = null;
    try { locName = await reverseGeocode(lat, lng); } catch { /* non-fatal */ }

    let dateVal = props.created_at || props.createdAt;
    if (ticketData) {
      dateVal = dateVal || ticketData.createdAt || ticketData.created_at
             || ticketData?.Report?.createdAt || ticketData?.Report?.created_at;
    }
    dateVal = dateVal || parseFullDate(String(dateVal || ''));

    const images = (props.images?.length > 0)
      ? props.images
      : (ticketData?.Report?.ReportImages || ticketData?.Report?.images || []);

    const submitter = ticketData?.Report?.User
      ? `${ticketData.Report.User.first_name || ''} ${ticketData.Report.User.last_name || ''}`.trim() || 'Unknown'
      : (props.submitter || props.User?.name || 'Unknown');

    const status = isOrigin
      ? (ticketData?.status || STATUS_LABELS[props.status || 'pending'] || 'Pending')
      : 'No Ticket';

    setSelectedReport({
      id: reportId, ticketId: ticketId || null, isTicket: isOrigin,
      location: props.location_name || locName
             || (lat != null ? `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` : 'Unknown'),
      lat, lng, date: parseFullDate(dateVal), createdAt: dateVal,
      resolvedAt: ticketData?.resolved_at, status,
      waterLevel: levelToNumber(props.water_level),
      siltLevel:  levelToNumber(props.silt_level),
      debrisLevel: levelToNumber(props.debris_level),
      remarks:    props.remarks || 'No remarks',
      images:     images.map((i: any) => i.imageUrl || i.image_url || i),
      submitter,
    });
  }, [originReportIds]);

  // ══════════════════════════════════════════════════════════
  //  FILTER HELPERS
  // ══════════════════════════════════════════════════════════
  const onFilterChange = (key: string, val: string) =>
    setFilters((prev) => ({ ...prev, [key]: val }));
  const clearFilters = () => setFilters({ feature_type: '', ris_id: '', ia_id: '' });

  // ── live counts ────────────────────────────────────────────
  const tc: Record<string, number> = { total: 0, pending: 0, in_progress: 0, closed: 0 };
  const sc: Record<string, number> = { total: 0, inspection: 0, maintenance: 0, cleaning: 0, other: 0 };
  reports.forEach((feat: any) => {
    const p = feat.properties || {};
    if (p.is_valid === false) return;
    if (p.ticket_id) { tc.total++; const s = p.status || 'pending'; if (s in tc) tc[s]++; }
    else { sc.total++; const cat = p.category || 'other'; if (cat !== 'issue' && cat in sc) sc[cat]++; }
  });

  // ══════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════
  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#74A5A8" />
        <Text style={{ marginTop: 8, color: '#666' }}>
          {isConnected ? 'Loading map…' : 'Loading offline data…'}
        </Text>
      </View>
    );
  }

  const SEARCH_H     = 124;
  const GAP          = -70;
  const CONTROLS_TOP = TOPBAR_H + GAP + SEARCH_H + GAP;
  const PANEL_HDR_H  = 30;
  const PANEL_OPEN_H = 260;

  const locBtnBottom = 98 + 8 + insets.bottom;

  return (
    <View style={[st.container, { paddingBottom: BOTTOM_H }]}>
{/* ── MAP WEBVIEW ────────────────────────────────────── */}
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={st.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onMessage={handleWebViewMessage}
        onLoadStart={() => setMapReady(false)}
        onLoadEnd={() => setMapReady(true)}
      />

      {/* ── SEARCH BAR ──────────────────────────────────────── */}
      <View style={[st.searchContainer, { top: TOPBAR_H + GAP }]}>
        <View style={st.searchBox}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={handleSearchFocus}
            placeholder="Search barangays, canals, reports…"
            placeholderTextColor="#9CA3AF"
            style={st.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDD(false); }}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {showSearchDD && searchResults.length > 0 && (
          <ScrollView style={st.searchDD} nestedScrollEnabled>
            {searchResults.map((r: any) => (
              <TouchableOpacity
                key={r.id}
                style={st.searchDDItem}
                onPress={() => handleSearchResultPress(r)}
              >
                <View style={[st.searchDDIcon,
                  r.type === 'location'  && st.iconEm,
                  r.type === 'canal'     && st.iconBl,
                  r.type === 'report'    && st.iconAm,
                ]}>
                  <Ionicons
                    name={r.type === 'location' ? 'globe-outline' : r.type === 'canal' ? 'layers-outline' : 'clipboard-outline'}
                    size={14}
                    color={r.type === 'location' ? '#059669' : r.type === 'canal' ? '#2563EB' : '#D97706'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.searchDDTitle}   numberOfLines={1}>{r.title}</Text>
                  <Text style={st.searchDDSub}     numberOfLines={1}>{r.subtitle || ''}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={st.searchDDCount}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</Text>
          </ScrollView>
        )}
      </View>

      {/* ── CONTROLS ROW (Filters + Layers) ───────────────── */}
      <View style={[st.controlsRow, { top: CONTROLS_TOP }]} pointerEvents="box-none">

        {/* FILTERS PANEL */}
        <View style={[st.panel, st.panelHalf, { height: showFilters ? PANEL_OPEN_H : PANEL_HDR_H }]}>
          <TouchableOpacity style={st.panelHeader} onPress={toggleFilters}>
            <Ionicons name="filter" size={14} color="#6B7280" />
            <Text style={st.panelTitle}>Filters</Text>
            <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
          </TouchableOpacity>
          {showFilters && (
            <ScrollView style={st.panelBody} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <View style={st.field}><Text style={st.fieldLabel}>Feature Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {featureTypes.map((ft) => (
                    <TouchableOpacity
                      key={ft.value}
                      style={[st.chip, filters.feature_type === ft.value && st.chipOn]}
                      onPress={() => onFilterChange('feature_type', filters.feature_type === ft.value ? '' : ft.value)}
                    >
                      <Text style={[st.chipText, filters.feature_type === ft.value && st.chipTextOn]}>{ft.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={st.field}><Text style={st.fieldLabel}>RIS (System)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(risList || []).map((ris: any) => (
                    <TouchableOpacity
                      key={ris.id}
                      style={[st.chip, filters.ris_id === String(ris.id) && st.chipOn]}
                      onPress={() => onFilterChange('ris_id', filters.ris_id === String(ris.id) ? '' : String(ris.id))}
                    >
                      <Text style={[st.chipText, filters.ris_id === String(ris.id) && st.chipTextOn]}>{ris.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={st.field}><Text style={st.fieldLabel}>IA (Association)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(iaList || []).map((ia: any) => (
                    <TouchableOpacity
                      key={ia.id}
                      style={[st.chip, filters.ia_id === String(ia.id) && st.chipOn]}
                      onPress={() => onFilterChange('ia_id', filters.ia_id === String(ia.id) ? '' : String(ia.id))}
                    >
                      <Text style={[st.chipText, filters.ia_id === String(ia.id) && st.chipTextOn]}>{ia.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <TouchableOpacity style={st.clearBtn} onPress={clearFilters}>
                <Text style={st.clearBtnText}>Clear Filters</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>

        {/* LAYERS PANEL */}
        <View style={[st.panel, st.panelHalf, { height: showLayers ? PANEL_OPEN_H : PANEL_HDR_H }]}>
          <TouchableOpacity style={st.panelHeader} onPress={toggleLayers}>
            <Ionicons name="layers" size={14} color="#6B7280" />
            <Text style={st.panelTitle}>Layers</Text>
            <Ionicons name={showLayers ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
          </TouchableOpacity>
          {showLayers && (
            <ScrollView style={st.panelBody} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={st.layerRow} onPress={() => setLayers((prev: any) => ({ ...prev, canalRoutes: !prev.canalRoutes }))}>
                <Ionicons name={layers.canalRoutes ? 'eye' : 'eye-off'} size={15} color={layers.canalRoutes ? '#2563EB' : '#9CA3AF'} />
                <Text style={st.layerText}>Canal Routes</Text>
                <Text style={st.layerCount}>{canals.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.layerRow} onPress={() => setLayers((prev: any) => ({ ...prev, showTickets: !prev.showTickets }))}>
                <Ionicons name={layers.showTickets ? 'eye' : 'eye-off'} size={15} color={layers.showTickets ? '#EF4444' : '#9CA3AF'} />
                <Text style={st.layerText}>Tickets ({tc.total})</Text>
              </TouchableOpacity>
              <View style={st.layerSub}>
                {(['pending', 'in_progress', 'closed'] as const).map((s) => {
                  const key = `showTicket${s.charAt(0).toUpperCase() + s.slice(1)}` as keyof typeof layers;
                  return (
                    <TouchableOpacity key={s} style={st.layerSubRow}
                      onPress={() => { setLayers((prev) => ({ ...prev, [key]: !prev[key] })); }}
                    >
                      <Ionicons name={(layers[key] as any) ? 'eye' : 'eye-off'} size={12} color="#9CA3AF" />
                      <Text style={st.layerSubText}>{s.replace('_', ' ')} ({tc[s]})</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={st.layerRow} onPress={() => setLayers((prev: any) => ({ ...prev, showStandalone: !prev.showStandalone }))}>
                <Ionicons name={layers.showStandalone ? 'eye' : 'eye-off'} size={15} color={layers.showStandalone ? '#6B7280' : '#9CA3AF'} />
                <Text style={st.layerText}>Reports ({sc.total})</Text>
              </TouchableOpacity>
              <View style={st.layerSub}>
                {(['inspection', 'maintenance', 'cleaning', 'other'] as const).map((cat: string) => {
                  const layerKey = `showStandalone${cat.charAt(0).toUpperCase() + cat.slice(1)}` as keyof typeof layers;
                  return (
                    <TouchableOpacity key={cat} style={st.layerSubRow}
                      onPress={() => { setLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] })); }}
                    >
                      <Ionicons name={(layers[layerKey] as any) ? 'eye' : 'eye-off'} size={12} color="#9CA3AF" />
                      <Text style={st.layerSubText}>{CATEGORY_LABELS[cat]} ({sc[cat]})</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* ── LOCATE-ME BUTTON ───────────────────────────────── */}
      <TouchableOpacity
        style={[st.locBtn, { bottom: locBtnBottom }]}
        activeOpacity={0.8}
        onPress={handleRecenterLocation}
      >
        {locating
          ? <Ionicons name="navigate" size={26} color="#fff" />
          : <Ionicons name={userLocation ? 'navigate' : 'navigate-outline'} size={26} color="#fff" />
        }
      </TouchableOpacity>

      {/* ── DETAIL DRAWER ──────────────────────────────────── */}
      {selectedReport && (
        <ScrollView style={st.drawer} showsVerticalScrollIndicator={false}>
          <View style={st.drawerInner}>
            <View style={st.drawerHeader}>
              <Ionicons name="eye" size={16} color="#2563EB" />
              <Text style={st.drawerTitle} numberOfLines={1}>
                {selectedReport.isTicket ? 'Ticket Details' : 'Report Details'}
              </Text>
              <TouchableOpacity onPress={() => { setSelectedReport(null); }}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={st.heroWrap}>
              {selectedReport.images?.length > 0 ? (
                <View style={st.heroImgBox}><Text style={st.heroImgPlaceholder}>Image</Text></View>
              ) : (
                <View style={st.heroImgBox}><Ionicons name="water-outline" size={36} color="#9CA3AF" /></View>
              )}
            </View>

            <View style={st.infoRow}>
              <Text style={st.infoLabel}><Ionicons name="location-outline" size={12} /> Location</Text>
              <Text style={st.infoValue}>{selectedReport.location}</Text>
            </View>

            <View style={st.infoRow}>
              <Text style={st.infoLabel}><Ionicons name="calendar-outline" size={12} /> Date</Text>
              <Text style={st.infoValue}>{selectedReport.date}</Text>
            </View>

            {selectedReport.isTicket && selectedReport.status === 'closed' && selectedReport.resolvedAt && (
              <View style={st.infoRow}>
                <Text style={st.infoLabel}><Ionicons name="checkmark-done-outline" size={12} /> Resolved</Text>
                <Text style={st.infoValue}>{parseFullDate(selectedReport.resolvedAt)}</Text>
              </View>
            )}

            <View style={st.infoRow}>
              <Text style={st.infoLabel}><Ionicons name="person-outline" size={12} /> Submitted By</Text>
              <Text style={st.infoValue}>{selectedReport.submitter}</Text>
            </View>

            {selectedReport.isTicket && (
              <View style={[st.statusChip,
                selectedReport.status === 'closed'      && st.chipGreen,
                selectedReport.status === 'in_progress' && st.chipAmber,
                selectedReport.status === 'pending'      && st.chipBlue,
              ]}>
                <Ionicons
                  name={selectedReport.status === 'closed' ? 'checkmark-circle' : 'time-outline'}
                  size={13}
                  color={
                    selectedReport.status === 'closed'      ? '#059669'
                    : selectedReport.status === 'in_progress' ? '#D97706'
                    : selectedReport.status === 'pending'      ? '#2563EB'
                    : '#6B7280'
                  }
                />
                <Text style={[
                  st.statusChipText,
                  selectedReport.status === 'closed'      && st.txtGreen,
                  selectedReport.status === 'in_progress' && st.txtAmber,
                  selectedReport.status === 'pending'      && st.txtBlue,
                ]}>{STATUS_LABELS[selectedReport.status] || selectedReport.status}</Text>
              </View>
            )}

            <View style={st.levelsCard}>
              <Text style={st.sectionTitle}>Condition Assessment</Text>
              <View style={st.levelsRow}>
                <View style={[st.levelBox, { backgroundColor: '#EFF6FF' }]}>
                  <Text style={st.levelLabel}>Water</Text>
                  <Text style={[st.levelVal, { color: '#2563EB' }]}>{selectedReport.waterLevel}/5</Text>
                </View>
                <View style={[st.levelBox, { backgroundColor: '#FFFBEB' }]}>
                  <Text style={st.levelLabel}>Silt</Text>
                  <Text style={[st.levelVal, { color: '#D97706' }]}>{selectedReport.siltLevel}/5</Text>
                </View>
                <View style={[st.levelBox, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={st.levelLabel}>Debris</Text>
                  <Text style={[st.levelVal, { color: '#DC2626' }]}>{selectedReport.debrisLevel}/5</Text>
                </View>
              </View>
            </View>

            {selectedReport.remarks && (
              <View style={st.remarksBox}>
                <Text style={st.sectionTitle}>Remarks</Text>
                <Text style={st.remarksText}>{selectedReport.remarks}</Text>
              </View>
            )}

            <TouchableOpacity
              style={st.navBtn}
              onPress={() => {
                setSelectedReport(null);
                if (selectedReport.isTicket && selectedReport.ticketId) {
                  router.push(`/(tabs)/ticket/${selectedReport.ticketId}` as any);
                } else if (selectedReport.id) {
                  router.push(`/(tabs)/report/${selectedReport.id}` as any);
                }
              }}
            >
              <Text style={st.navBtnText}>View in {selectedReport.isTicket ? 'Tickets' : 'Reports'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E0EBE2' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map:       { flex: 1 },

  // ── search bar ──────────────────────────────────────────
  searchContainer: {
    position:      'absolute',
    left:          10, right: 10, zIndex: 35,
  },
  searchBox: {
    flexDirection:      'row',
    alignItems:        'center',
    backgroundColor:   'rgba(255,255,255,0.98)',
    borderRadius:      24,
    paddingHorizontal: 12,
    height:            46,
    shadowColor:       '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity:     0.12, shadowRadius: 6, elevation: 6,
  },
  searchInput:  { flex: 1, marginLeft: 8, fontSize: 14, color: '#111827' },
  searchDD:     { maxHeight: 260, backgroundColor: '#fff', borderRadius: 12, marginTop: 4, paddingHorizontal: 4, paddingVertical: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8, zIndex: 36 },
  searchDDItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  searchDDIcon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  iconEm:       { backgroundColor: '#ECFDF5' },
  iconBl:       { backgroundColor: '#EFF6FF' },
  iconAm:       { backgroundColor: '#FFFBEB' },
  searchDDTitle:{ fontSize: 13, fontWeight: '600', color: '#111827' },
  searchDDSub:  { fontSize: 11, color: '#6B7280' },
  searchDDCount:{ fontSize: 10, color: '#9CA3AF', textAlign: 'center', paddingVertical: 4 },

  // ── controls row (filters + layers) ─────────────────────
  controlsRow: {
    position:    'absolute',
    left: 10, right: 10, zIndex: 20,
    flexDirection: 'row', gap: 8,
    alignItems: 'flex-start',
  },
  panel:       { backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 3 },
  panelHalf:   { flex: 1, maxHeight: 260 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  panelTitle:  { flex: 1, fontSize: 12, fontWeight: '600', color: '#374151', marginLeft: 5 },
  panelBody:   { paddingHorizontal: 8, paddingBottom: 8 },

  layerRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  layerSub:     { paddingLeft: 14, paddingBottom: 6 },
  layerSubRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  layerText:    { fontSize: 11, color: '#374151', marginLeft: 6, flex: 1 },
  layerSubText: { fontSize: 10, color: '#9CA3AF', marginLeft: 5 },
  layerCount:   { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },

  field:        { marginBottom: 8 },
  fieldLabel:   { fontSize: 10, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  chip:         { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16, marginRight: 5, marginBottom: 3, backgroundColor: '#F3F4F6' },
  chipOn:       { backgroundColor: '#2563EB' },
  chipText:     { fontSize: 10, color: '#374151', fontWeight: '500' },
  chipTextOn:   { fontSize: 10, color: '#FFFFFF', fontWeight: '600' },
  clearBtn:     { marginTop: 4, paddingVertical: 6, alignItems: 'center', borderRadius: 6, backgroundColor: '#F3F4F6' },
  clearBtnText: { fontSize: 10, color: '#6B7280', fontWeight: '600' },

  // ── locate-me button (enlarged, 72×72) ─────────────────
  locBtn: {
    position:   'absolute',
    right:      16,
    zIndex:     30,
    width:      72,
    height:     72,
    borderRadius: 36,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },

  // ── detail drawer ───────────────────────────────────────
  drawer:       { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: height * 0.52, backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.15, shadowRadius: 12, zIndex: 50 },
  drawerInner:  { padding: 16, paddingBottom: 32 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  drawerTitle:  { flex: 1, fontSize: 16, fontWeight: '700', color: '#1F2937' },

  statusChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, marginTop: 6 },
  statusChipText:{ fontWeight: '700', fontSize: 11 },
  chipBlue:     { backgroundColor: '#DBEAFE' },
  chipAmber:    { backgroundColor: '#FEF3C7' },
  chipGreen:    { backgroundColor: '#D1FAE5' },
  txtBlue:      { color: '#2563EB', fontWeight: '700', fontSize: 11 },
  txtAmber:     { color: '#D97706', fontWeight: '700', fontSize: 11 },
  txtGreen:     { color: '#059669', fontWeight: '700', fontSize: 11 },

  infoRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  infoLabel:   { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', flex: 0.45 },
  infoValue:   { fontSize: 13, color: '#1F2937', fontWeight: '600', flex: 1 },

  levelsCard:  { marginTop: 14, padding: 14, backgroundColor: '#F9FAFB', borderRadius: 12 },
  levelsRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  levelBox:    { flex: 1, marginHorizontal: 3, padding: 8, borderRadius: 10, alignItems: 'center' },
  levelLabel:  { fontSize: 9, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },
  levelVal:    { fontSize: 16, fontWeight: '700', marginTop: 2 },

  heroWrap:     { marginTop: 10 },
  heroImgBox:   { width: 72, height: 72, borderRadius: 10, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  heroImgPlaceholder:{ fontSize: 12, color: '#9CA3AF' },

  remarksBox:  { marginTop: 14, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12 },
  remarksText: { fontSize: 13, color: '#374151', lineHeight: 18 },
  sectionTitle:{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8 },

  navBtn:       { marginTop: 18, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  navBtnText:   { color: '#fff', fontSize: 14, fontWeight: '600' },
});
