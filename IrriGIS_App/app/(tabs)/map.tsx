// app/(tabs)/map.tsx
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet, View, Text, ActivityIndicator, Dimensions,
  TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  getReportsGeoJSON, getGISFeatures, getRISList, getIAList, getTickets, getToken,
} from '../../services/api';

const { width, height } = Dimensions.get('window');
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000';

// ═══════════════════════════════════════════════════════════
//  STATUS / CATEGORY  LABELS & HELPERS
// ═══════════════════════════════════════════════════════════
const STATUS_LABELS: Record<string, string> = {
  pending:     'Pending',
  in_progress: 'In Progress',
  closed:      'Closed',
  rejected:    'Rejected',
};

const CATEGORY_LABELS: Record<string, string> = {
  inspection:  'Inspection',
  maintenance: 'Maintenance',
  cleaning:    'Cleaning',
  issue:       'Issue',
  other:       'Other',
};

function levelToNumber(level: string): number {
  const levels: Record<string, number> = {
    dry: 1, low: 2, normal: 3, high: 4, overflow: 5,
    clean: 1, light: 2, dirty: 4, heavily_silted: 5,
    clear: 1, heavy: 4, blocked: 5,
  };
  return levels[level] || 3;
}

// ═══════════════════════════════════════════════════════════
//  MAIN  MAP  SCREEN
// ═══════════════════════════════════════════════════════════
export default function MapScreen() {
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  
  const [reports, setReports] = useState<any[]>([]);
  const [canals, setCanals] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  
  const originReportIds = useMemo(() => {
    const s = new Set<number | string>();
    tickets.forEach(t => { if (t.reportId) s.add(String(t.reportId)); });
    return s;
  }, [tickets]);
  
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchDD, setShowSearchDD] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [selectedReport, setSelectedReport] = useState<any>(null);
  
  const [filters, setFilters] = useState({ feature_type: '', ris_id: '', ia_id: '' });
  const [risList, setRisList] = useState<any[]>([]);
  const [iaList, setIaList] = useState<any[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showLayers, setShowLayers] = useState(false);

  const [layers, setLayers] = useState({
    canalRoutes: true,
    showTickets: true,
    showTicketPending: true,
    showTicketInProgress: true,
    showTicketClosed: true,
    showStandalone: true,
    showStandaloneInspection: true,
    showStandaloneMaintenance: true,
    showStandaloneCleaning: true,
    showStandaloneOther: true,
  });

  const featureTypes = [
    { value: 'main_canal', label: 'Main Canal' },
    { value: 'lateral', label: 'Lateral' },
    { value: 'farm_ditch', label: 'Farm Ditch' },
    { value: 'pipeline', label: 'Pipeline' },
    { value: 'canal', label: 'Canal' },
  ];

  const fetchAllData = useCallback(async () => {
    try {
      const [reportsRes, featuresRes, ticketsRes] = await Promise.all([
        getReportsGeoJSON(),
        getGISFeatures({}),
        getTickets({ limit: 1000 }),
      ]);
      const rFeatures = reportsRes.data?.features || reportsRes.data || [];
      setReports(Array.isArray(rFeatures) ? rFeatures : []);
      const fFeatures = featuresRes.data?.features || [];
      setCanals(Array.isArray(fFeatures) ? fFeatures : []);
      const tData = ticketsRes.data?.tickets || [];
      setTickets(Array.isArray(tData) ? tData : []);
    } catch (err: any) {
      console.error('[Map] fetch error:', err.message || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  useEffect(() => {
    if (mapReady && !loading && webViewRef.current) {
      const mapData = {
        reports,
        canals: layers.canalRoutes ? canals : []
      };
      webViewRef.current.postMessage(JSON.stringify({
        type: 'updateMap',
        payload: mapData
      }));
    }
  }, [mapReady, loading, reports, canals, layers.canalRoutes]);

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapReady') {
        setMapReady(true);
      } else if (data.type === 'markerClick') {
        const report = reports.find((f: any) => String(f.properties?.id || f.id) === data.reportId);
        if (report) {
          handleMarkerPress(report);
        }
      }
    } catch (e) {
      console.error('Error handling WebView message:', e);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [risRes, iaRes] = await Promise.all([getRISList(), getIAList()]);
        setRisList(Array.isArray(risRes.data) ? risRes.data : []);
        setIaList(Array.isArray(iaRes.data) ? iaRes.data : []);
      } catch { /* non-fatal */ }
    })();
  }, []);

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
            lat: parseFloat(place.lat),
            lng: parseFloat(place.lon),
            type: 'location',
          });
        });
      }
    } catch { /* non-fatal */ }
    canals.forEach((feat) => {
      const props = feat.properties || {};
      const name = props.name || props.remarks || '';
      if (name.toLowerCase().includes(q) || (props.source_file || '').toLowerCase().includes(q) || (props.feature_type || '').toLowerCase().includes(q)) {
        const g = feat.geometry;
        let lat: number | undefined, lng: number | undefined;
        if (g?.type === 'LineString' && g.coordinates?.[0]) lat = g.coordinates[0][1], lng = g.coordinates[0][0];
        else if (g?.type === 'MultiLineString' && g.coordinates?.[0]?.[0]) { lat = g.coordinates[0][0][1]; lng = g.coordinates[0][0][0]; }
        results.push({ id: `canal-${feat.id || props.name}`, title: name || `${props.feature_type || 'Canal'} #${props.original_id || ''}`, subtitle: props.feature_type || 'Canal', lat, lng, type: 'canal' });
      }
    });
    reports.forEach((feat) => {
      const props = feat.properties || {};
      const reportId = String(props.id || feat.id || '');
      if (props.is_valid === false) return;
      const isOrigin = originReportIds.has(reportId);
      const isStandalone = !props.ticket_id;
      if (!isOrigin && !isStandalone) return;
      const location = props.location_name || '';
      const remarks = props.remarks || '';
      const category = props.category || 'other';
      if (location.toLowerCase().includes(q) || remarks.toLowerCase().includes(q) || reportId.toLowerCase().includes(q) || category.toLowerCase().includes(q)) {
        const g = feat.geometry;
        results.push({ id: `report-${reportId}`, title: location || `Report #${reportId.slice(0, 8)}`, subtitle: `${CATEGORY_LABELS[category] || category} – ${remarks?.slice(0, 40) || 'No remarks'}`, lat: g?.coordinates?.[1], lng: g?.coordinates?.[0], type: 'report', reportId });
      }
    });
    results.sort((a, b) => { const aLocal = a.type === 'canal' || a.type === 'report'; const bLocal = b.type === 'canal' || b.type === 'report'; if (aLocal && !bLocal) return -1; if (bLocal && !aLocal) return 1; return (a.title || '').localeCompare(b.title || ''); });
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
      webViewRef.current.postMessage(JSON.stringify({ type: 'panTo', lat: result.lat, lng: result.lng }));
    }
    if (result.type === 'report' && result.reportId) {
      const feat = reports.find((f: any) => String(f.properties?.id || f.id) === result.reportId);
      if (feat) handleMarkerPress(feat);
    }
  };

  const handleMarkerPress = useCallback(async (feat: any) => {
    const props = feat.properties || {};
    const geom = feat.geometry?.coordinates || [];
    const lat = geom[1];
    const lng = geom[0];
    let ticketData: any = null;
    const reportId = String(props.id || feat.id);
    const isOrigin = originReportIds.has(reportId);
    const ticketId = props.ticket_id as string | undefined;
    if (isOrigin && ticketId) {
      try {
        const token = await getToken();
        const tRes = await fetch(`${BASE_URL}/api/tickets/${ticketId}`, { headers: { Authorization: `Bearer ${token || ''}` } });
        const tJson = await tRes.json();
        ticketData = tJson?.data || tJson;
      } catch { /* non-fatal */ }
    }
    let locName: string | null = null;
    try { locName = await reverseGeocode(lat, lng); } catch { /* non-fatal */ }
    let dateVal = props.created_at || props.createdAt;
    if (ticketData) { dateVal = dateVal || ticketData.createdAt || ticketData.created_at || ticketData?.Report?.createdAt || ticketData?.Report?.created_at; }
    dateVal = dateVal || parseFullDate(String(dateVal || ''));
    const images = (props.images?.length > 0) ? props.images : (ticketData?.Report?.ReportImages || ticketData?.Report?.images || []);
    const submitter = ticketData?.Report?.User ? `${ticketData.Report.User.first_name || ''} ${ticketData.Report.User.last_name || ''}`.trim() || 'Unknown' : (props.submitter || props.User?.name || 'Unknown');
    const status = isOrigin ? (ticketData?.status || STATUS_LABELS[props.status || 'pending'] || 'Pending') : 'No Ticket';
    setSelectedReport({ id: reportId, ticketId: ticketId || null, isTicket: isOrigin, location: props.location_name || locName || (lat != null ? `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` : 'Unknown'), lat, lng, date: parseFullDate(dateVal), createdAt: dateVal, resolvedAt: ticketData?.resolved_at, status, waterLevel: levelToNumber(props.water_level), siltLevel: levelToNumber(props.silt_level), debrisLevel: levelToNumber(props.debris_level), remarks: props.remarks || 'No remarks', images: images.map((i: any) => i.imageUrl || i.image_url || i), submitter });
  }, [originReportIds] as any);

  const onFilterChange = (key: string, val: string) => setFilters((prev) => ({ ...prev, [key]: val }));
  const clearFilters = () => setFilters({ feature_type: '', ris_id: '', ia_id: '' });

  const tc: Record<string, number> = { total: 0, pending: 0, in_progress: 0, closed: 0 };
  const sc: Record<string, number> = { total: 0, inspection: 0, maintenance: 0, cleaning: 0, other: 0 };
  reports.forEach((feat: any) => {
    const p = feat.properties || {};
    if (p.is_valid === false) return;
    if (p.ticket_id) { tc.total++; const s = p.status || 'pending'; if (s in tc) tc[s]++; }
    else { sc.total++; const cat = p.category || 'other'; if (cat !== 'issue' && cat in sc) sc[cat]++; }
  });

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#74A5A8" />
        <Text style={{ marginTop: 8, color: '#666' }}>Loading map…</Text>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <WebView
        ref={webViewRef}
        source={require('../../assets/leaflet-map.html')}
        style={st.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleWebViewMessage}
        onLoadStart={() => setMapReady(false)}
        onLoadEnd={() => setMapReady(true)}
      />

      <View style={st.searchContainer}>
        <View style={st.searchBox}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput value={searchQuery} onChangeText={handleSearchChange} onFocus={() => searchResults.length > 0 && setShowSearchDD(true)} placeholder="Search barangays, canals, reports…" placeholderTextColor="#9CA3AF" style={st.searchInput} />
          {searchQuery.length > 0 && (<TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDD(false); }}><Ionicons name="close-circle" size={16} color="#9CA3AF" /></TouchableOpacity>)}
        </View>
        {showSearchDD && searchResults.length > 0 && (
          <ScrollView style={st.searchDD} nestedScrollEnabled>
            {searchResults.map((r: any) => (
              <TouchableOpacity key={r.id} style={st.searchDDItem} onPress={() => handleSearchResultPress(r)}>
                <View style={[st.searchDDIcon, r.type === 'location' && st.iconEm, r.type === 'canal' && st.iconBl, r.type === 'report' && st.iconAm]}>
                  <Ionicons name={r.type === 'location' ? 'globe-outline' : r.type === 'canal' ? 'layers-outline' : 'clipboard-outline'} size={14} color={r.type === 'location' ? '#059669' : r.type === 'canal' ? '#2563EB' : '#D97706'} />
                </View>
                <View style={{ flex: 1 }}><Text style={st.searchDDTitle} numberOfLines={1}>{r.title}</Text><Text style={st.searchDDSub} numberOfLines={1}>{r.subtitle || ''}</Text></View>
              </TouchableOpacity>
            ))}
            <Text style={st.searchDDCount}>{searchResults.length} result{searchResults.length > 1 ? 's' : ''}</Text>
          </ScrollView>
        )}
      </View>

      <View style={st.controlsRow} pointerEvents="box-none">
        <View style={[st.panel, st.panelHalf]}>
          <TouchableOpacity style={st.panelHeader} onPress={() => setShowLayers(!showLayers)}>
            <Ionicons name="layers" size={14} color="#6B7280" /><Text style={st.panelTitle}>Layers</Text><Ionicons name={showLayers ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
          </TouchableOpacity>
          {showLayers && (
            <ScrollView style={st.panelBody} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={st.layerRow} onPress={() => setLayers((prev: any) => ({ ...prev, canalRoutes: !prev.canalRoutes }))}>
                <Ionicons name={layers.canalRoutes ? 'eye' : 'eye-off'} size={15} color={layers.canalRoutes ? '#2563EB' : '#9CA3AF'} /><Text style={st.layerText}>Canal Routes</Text><Text style={st.layerCount}>{canals.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.layerRow} onPress={() => setLayers((prev: any) => ({ ...prev, showTickets: !prev.showTickets }))}>
                <Ionicons name={layers.showTickets ? 'eye' : 'eye-off'} size={15} color={layers.showTickets ? '#EF4444' : '#9CA3AF'} /><Text style={st.layerText}>Tickets ({tc.total})</Text>
              </TouchableOpacity>
              <View style={st.layerSub}>
                {(['pending', 'in_progress', 'closed'] as const).map((s) => (
                  <TouchableOpacity key={s} style={st.layerSubRow} onPress={() => { const key = `showTicket${s.charAt(0).toUpperCase() + s.slice(1)}` as keyof typeof layers; setLayers((prev) => ({ ...prev, [key]: !prev[key] })); }}>
                    <Ionicons name={(layers[`showTicket${s.charAt(0).toUpperCase() + s.slice(1)}` as keyof typeof layers] as any) ? 'eye' : 'eye-off'} size={12} color="#9CA3AF" /><Text style={st.layerSubText}>{s.replace('_', ' ')} ({tc[s]})</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={st.layerRow} onPress={() => setLayers((prev: any) => ({ ...prev, showStandalone: !prev.showStandalone }))}>
                <Ionicons name={layers.showStandalone ? 'eye' : 'eye-off'} size={15} color={layers.showStandalone ? '#6B7280' : '#9CA3AF'} /><Text style={st.layerText}>Reports ({sc.total})</Text>
              </TouchableOpacity>
              <View style={st.layerSub}>
                {(['inspection', 'maintenance', 'cleaning', 'other'] as const).map((cat: string) => {
                  const layerKey = `showStandalone${cat.charAt(0).toUpperCase() + cat.slice(1)}` as keyof typeof layers;
                  return (<TouchableOpacity key={cat} style={st.layerSubRow} onPress={() => setLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }))}><Ionicons name={(layers[layerKey] as any) ? 'eye' : 'eye-off'} size={12} color="#9CA3AF" /><Text style={st.layerSubText}>{CATEGORY_LABELS[cat]} ({sc[cat]})</Text></TouchableOpacity>);
                })}
              </View>
            </ScrollView>
          )}
        </View>
        <View style={[st.panel, st.panelHalf]}>
          <TouchableOpacity style={st.panelHeader} onPress={() => setShowFilters(!showFilters)}>
            <Ionicons name="filter" size={14} color="#6B7280" /><Text style={st.panelTitle}>Filters</Text><Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
          </TouchableOpacity>
          {showFilters && (
            <ScrollView style={st.panelBody} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <View style={st.field}><Text style={st.fieldLabel}>Feature Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {featureTypes.map((ft) => (<TouchableOpacity key={ft.value} style={[st.chip, filters.feature_type === ft.value && st.chipOn]} onPress={() => onFilterChange('feature_type', filters.feature_type === ft.value ? '' : ft.value)}><Text style={[st.chipText, filters.feature_type === ft.value && st.chipTextOn]}>{ft.label}</Text></TouchableOpacity>))}
                </ScrollView>
              </View>
              <View style={st.field}><Text style={st.fieldLabel}>RIS (System)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(risList || []).map((ris: any) => (<TouchableOpacity key={ris.id} style={[st.chip, filters.ris_id === String(ris.id) && st.chipOn]} onPress={() => onFilterChange('ris_id', filters.ris_id === String(ris.id) ? '' : String(ris.id))}><Text style={[st.chipText, filters.ris_id === String(ris.id) && st.chipTextOn]}>{ris.name}</Text></TouchableOpacity>))}
                </ScrollView>
              </View>
              <View style={st.field}><Text style={st.fieldLabel}>IA (Association)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(iaList || []).map((ia: any) => (<TouchableOpacity key={ia.id} style={[st.chip, filters.ia_id === String(ia.id) && st.chipOn]} onPress={() => onFilterChange('ia_id', filters.ia_id === String(ia.id) ? '' : String(ia.id))}><Text style={[st.chipText, filters.ia_id === String(ia.id) && st.chipTextOn]}>{ia.name}</Text></TouchableOpacity>))}
                </ScrollView>
              </View>
              <TouchableOpacity style={st.clearBtn} onPress={clearFilters}><Text style={st.clearBtnText}>Clear Filters</Text></TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>

      {selectedReport && (
        <ScrollView style={st.drawer} showsVerticalScrollIndicator={false}>
          <View style={st.drawerInner}>
            <View style={st.drawerHeader}>
              <Ionicons name="eye" size={16} color="#2563EB" /><Text style={st.drawerTitle} numberOfLines={1}>{selectedReport.isTicket ? 'Ticket Details' : 'Report Details'}</Text>
              <TouchableOpacity onPress={() => { setSelectedReport(null); }}><Ionicons name="close" size={20} color="#6B7280" /></TouchableOpacity>
            </View>
            <View style={st.heroWrap}>
              {selectedReport.images?.length > 0 ? (<View style={st.heroImgBox}><Text style={st.heroImgPlaceholder}>Image</Text></View>) : (<View style={st.heroImgBox}><Ionicons name="water-outline" size={36} color="#9CA3AF" /></View>)}
            </View>
            <View style={st.infoRow}><Text style={st.infoLabel}><Ionicons name="location-outline" size={12} /> Location</Text><Text style={st.infoValue}>{selectedReport.location}</Text></View>
            <View style={st.infoRow}><Text style={st.infoLabel}><Ionicons name="calendar-outline" size={12} /> Date</Text><Text style={st.infoValue}>{selectedReport.date}</Text></View>
            {selectedReport.isTicket && selectedReport.status === 'closed' && selectedReport.resolvedAt && (
              <View style={st.infoRow}><Text style={st.infoLabel}><Ionicons name="checkmark-done-outline" size={12} /> Resolved</Text><Text style={st.infoValue}>{parseFullDate(selectedReport.resolvedAt)}</Text></View>
            )}
            <View style={st.infoRow}><Text style={st.infoLabel}><Ionicons name="flag-outline" size={12} /> Status</Text><Text style={[st.infoValue, { color: selectedReport.status === 'closed' ? '#10B981' : selectedReport.status === 'in_progress' ? '#F59E0B' : '#6B7280' }]}>{selectedReport.status}</Text></View>
            <View style={st.infoRow}><Text style={st.infoLabel}><Ionicons name="person-outline" size={12} /> Submitter</Text><Text style={st.infoValue}>{selectedReport.submitter}</Text></View>
            <View style={st.infoRow}><Text style={st.infoLabel}><Ionicons name="water-outline" size={12} /> Water Level</Text><Text style={st.infoValue}>{selectedReport.waterLevel}/5</Text></View>
            <View style={st.infoRow}><Text style={st.infoLabel}><Ionicons name="layers-outline" size={12} /> Silt Level</Text><Text style={st.infoValue}>{selectedReport.siltLevel}/5</Text></View>
            <View style={st.infoRow}><Text style={st.infoLabel}><Ionicons name="trash-outline" size={12} /> Debris Level</Text><Text style={st.infoValue}>{selectedReport.debrisLevel}/5</Text></View>
            <View style={st.remarksBox}><Text style={st.remarksLabel}>Remarks</Text><Text style={st.remarksText}>{selectedReport.remarks}</Text></View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { flex: 1 },
  searchContainer: { position: 'absolute', top: 50, left: 10, right: 10, zIndex: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#333' },
  searchDD: { backgroundColor: '#fff', borderRadius: 8, marginTop: 4, maxHeight: 200, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  searchDDItem: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  searchDDIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  iconEm: { backgroundColor: '#D1FAE5' },
  iconBl: { backgroundColor: '#DBEAFE' },
  iconAm: { backgroundColor: '#FEF3C7' },
  searchDDTitle: { fontSize: 13, fontWeight: '500', color: '#333' },
  searchDDSub: { fontSize: 11, color: '#666' },
  searchDDCount: { textAlign: 'center', padding: 6, fontSize: 11, color: '#9CA3AF' },
  controlsRow: { position: 'absolute', bottom: 20, left: 10, right: 10, flexDirection: 'row', gap: 10 },
  panel: { backgroundColor: '#fff', borderRadius: 8, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  panelHalf: { flex: 1, maxHeight: 250 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 6 },
  panelTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: '#333' },
  panelBody: { paddingHorizontal: 10, paddingBottom: 10 },
  layerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  layerText: { flex: 1, fontSize: 13, color: '#333' },
  layerCount: { fontSize: 11, color: '#9CA3AF' },
  layerSub: { paddingLeft: 22 },
  layerSubRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 6 },
  layerSubText: { fontSize: 12, color: '#666' },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: '#666', marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 16, marginRight: 6 },
  chipOn: { backgroundColor: '#74A5A8' },
  chipText: { fontSize: 12, color: '#333' },
  chipTextOn: { color: '#fff' },
  clearBtn: { alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#EF4444', borderRadius: 4 },
  clearBtnText: { fontSize: 12, color: '#fff' },
  drawer: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: height * 0.5, backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 10 },
  drawerInner: { padding: 16 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  drawerTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#333' },
  heroWrap: { alignItems: 'center', marginBottom: 12 },
  heroImgBox: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  heroImgPlaceholder: { fontSize: 12, color: '#9CA3AF' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  infoLabel: { fontSize: 12, color: '#666', flex: 0.4 },
  infoValue: { fontSize: 13, color: '#333', flex: 1 },
  remarksBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  remarksLabel: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 4 },
  remarksText: { fontSize: 13, color: '#333', lineHeight: 18 },
});