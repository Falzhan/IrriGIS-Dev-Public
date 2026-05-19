// app/(tabs)/map.tsx
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet, View, Text, ActivityIndicator, Dimensions,
  TouchableOpacity, ScrollView, TextInput, AppState,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile, Callout } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle, G } from 'react-native-svg';
import {
  getReportsGeoJSON, getGISFeatures, getRISList, getIAList, getTickets, getToken,
} from '../../services/api';

const { width, height } = Dimensions.get('window');
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000';

// ═══════════════════════════════════════════════════════════
//  COLOR CONSTANTS
// ═══════════════════════════════════════════════════════════
const DEFAULT_MAP_COLORS = {
  main_canal: '#2563EB',
  lateral:     '#7C3AED',
  farm_ditch:  '#06B6D4',
  pipeline:    '#F59E0B',
  canal:       '#74A5A8',
  other:       '#6B7280',
};

const DEFAULT_CATEGORY_COLORS = {
  inspection:  '#3B82F6',
  maintenance: '#F59E0B',
  cleaning:    '#06B6D4',
  issue:       '#EF4444',
  other:       '#6B7280',
};

function getFeatureColors() {
  try {
    const saved = localStorage.getItem('mapFeatureColors');
    return saved ? { ...DEFAULT_MAP_COLORS, ...JSON.parse(saved) } : DEFAULT_MAP_COLORS;
  } catch {
    return DEFAULT_MAP_COLORS;
  }
}

function getCategoryColors() {
  try {
    const saved = localStorage.getItem('categoryColors');
    return saved ? { ...DEFAULT_CATEGORY_COLORS, ...JSON.parse(saved) } : DEFAULT_CATEGORY_COLORS;
  } catch {
    return DEFAULT_CATEGORY_COLORS;
  }
}

const CATEGORY_COLORS = getCategoryColors();
const FEATURE_COLORS  = getFeatureColors();

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

function getReportDisplayDays(): number {
  try {
    const saved = localStorage.getItem('reportDisplayDays');
    return saved ? parseInt(saved, 10) : 7;
  } catch {
    return 7;
  }
}

function getPendingOpacity(): number {
  try {
    const saved = localStorage.getItem('pendingMarkerOpacity');
    return saved ? parseInt(saved, 10) / 100 : 0.4;
  } catch {
    return 0.4;
  }
}

function calculateClosedOpacity(createdAt: string | undefined): number {
  const displayDays = getReportDisplayDays();
  if (!createdAt) return 0.3;
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return 0.3;
  const now = new Date();
  const daysOld = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld > displayDays) return 0;
  if (daysOld < 1) return 1;
  const remainingDays = displayDays - daysOld;
  return Math.max(0.2, remainingDays / 3);
}

// ═══════════════════════════════════════════════════════════
//  CANAL LINE HELPERS (react-native-maps Polyline)
// ═══════════════════════════════════════════════════════════
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getFeatureColor(type: string): string {
  return FEATURE_COLORS[type] || FEATURE_COLORS.canal;
}

function getFeatureStrokeWidth(featureType: string): number {
  switch (featureType) {
    case 'main_canal': return 6;
    case 'lateral':    return 5;
    case 'farm_ditch': return 2;
    default:           return 4;
  }
}

// ═══════════════════════════════════════════════════════════
//  SVG  MARKER  COMPONENTS
// ═══════════════════════════════════════════════════════════

// Red flag marker — origin ticket marker color-coded by status
function FlagMarker({ status, createdAt, size = 38 }: { status: string; createdAt?: string; size?: number }) {
  let color = '#F59E0B';      // pending → amber
  let opacity = 1;

  if (status === 'closed') {
    color = '#10B981';        // closed → green
    if (createdAt) opacity = calculateClosedOpacity(createdAt);
  } else if (status === 'in_progress') {
    color = '#EF4444';        // in_progress → red
  } else if (status === 'pending') {
    opacity = getPendingOpacity();
  } else if (status === 'rejected') {
    color = '#EF4444';        // rejected → red
    opacity = 0.6;
  }

  const poleW = 2.2;
  const flagW = 26;
  const tipX  = flagW - poleW;
  const poleX = poleW / 2;

  return (
    <Svg width={size} height={size * 1.14} viewBox={`0 0 ${size} ${Math.ceil(size * 1.14)}`}>
      <G opacity={opacity}>
        {/* flag body */}
        <Path
          d={`M ${poleW} 2 L ${tipX} 2 Q ${tipX - 3} 10.5 ${tipX} 19 L ${poleW} 19 z`}
          fill={color}
        />
        {/* pole */}
        <Path
          d={`M ${poleX} 2 L ${poleX} ${size * 0.82}`}
          stroke="#6B7280"
          strokeWidth={poleW}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

// Teardrop / pin marker — standalone report color-coded by category
function TeardropMarker({
  category, status, createdAt, size = 38,
}: {
  category: string;
  status: string;
  createdAt?: string;
  size?: number;
}) {
  const colors  = getCategoryColors();
  let color     = colors[category] || colors.other;
  let opacity   = 1;

  if (status === 'closed') {
    color = '#10B981';
    if (createdAt) opacity = calculateClosedOpacity(createdAt);
  } else if (status === 'pending') {
    opacity = getPendingOpacity();
  }

  const svgH = Math.round(size * 1.15);
  const cx   = size / 2;
  const cy   = svgH * 0.42;
  const r    = size * 0.44;

  // Icon selection per category (standard 24x24 paths)
  let iconPath: string;
  switch (category) {
    case 'inspection':
      iconPath = 'M9.5 2.5a.75.75 0 0 0-1.5 0v2.25a.75.75 0 0 0 .08.43l1.72 2.72a.75.75 0 0 0 .36.19h3.8a.75.75 0 0 0 .6-.7l.07-1.35A.75.75 0 0 0 13 5.3l-.29-.28-1.7 1.7a.75.75 0 0 0 1.06 1.06L14 7.06a.75.75 0 0 0-.36.19l-2.05 1.74a.25.25 0 0 1-.09.14.25.25 0 0 1-.14.09H9.26a.25.25 0 0 1-.17-.07.25.25 0 0 1-.08-.16V3.94a.25.25 0 0 1 .25-.25h1a.25.25 0 0 1 .25.25V8.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V3.06a.75.75 0 0 0-1.5 0v3.31a.25.25 0 0 1-.17.07.25.25 0 0 1-.17-.09l-.88-.75A.75.75 0 0 0 9.5 5.1V2.5z M10 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z';
      break;
    case 'maintenance':
      iconPath = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';
      break;
    case 'cleaning':
      iconPath = 'M8 6h13 M8 12h13 M8 18h13 M3 6h1 M3 12h1 M3 18h1';
      break;
    case 'issue':
      iconPath = 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z M12 9v4 M12 17h.01';
      break;
    default:
      iconPath = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
  }

  // Safe inner translation math for standard 24x24 icons
  const iconScale = 0.65;
  const tX = cx - (12 * iconScale);
  const tY = (cy * 0.9) - (12 * iconScale);

  return (
    <Svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`}>
      <G opacity={opacity}>
        {/* teardrop body - completely symmetrical path */}
        <Path
          d={`M ${cx} ${svgH - 1} Q ${cx - r} ${svgH * 0.75} ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Q ${cx + r} ${svgH * 0.75} ${cx} ${svgH - 1} Z`}
          fill={color}
        />
        {/* inner white circle */}
        <Circle cx={cx} cy={cy * 0.9} r={r * 0.38} fill="white" />
        {/* cleanly translated icon path */}
        <G transform={`translate(${tX}, ${tY}) scale(${iconScale})`}>
          <Path d={iconPath} fill={color} />
        </G>
      </G>
    </Svg>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN  MAP  SCREEN
// ═══════════════════════════════════════════════════════════
export default function MapScreen() {
  const router = useRouter();
  // ── report data (GIS GeoJSON) ────────────────────────────
  const [reports, setReports]         = useState<any[]>([]);
  const [canals,  setCanals]           = useState<any[]>([]);
  const mapRef = useRef<MapView>(null!);
  // ── tickets (for origin-report lookup) ───────────────────
  const [tickets, setTickets]         = useState<any[]>([]);
  // parallel set for O(1) lookup
  const originReportIds = useMemo(() => {
    const s = new Set<number | string>();
    tickets.forEach(t => { if (t.reportId) s.add(String(t.reportId)); });
    return s;
  }, [tickets]);
  
  // ── loading / refresh ──────────────────────────────────
  const [loading, setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // ── tracksViewChanges workaround ─────────────────────────
  const [markersTrackChanges, setMarkersTrackChanges] = useState(true);
  const tvcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // ── search ───────────────────────────────────────────────
  const [searchQuery,      setSearchQuery]          = useState('');
  const [searchResults,    setSearchResults]        = useState<any[]>([]);
  const [showSearchDD,     setShowSearchDD]         = useState(false);
  const searchTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<View>(null);
  
  // ── marker selection & drawer ────────────────────────────
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedReport,   setSelectedReport]   = useState<any>(null);
  const [selectedGisFeature, setSelectedGisFeature] = useState<any>(null);
  const [gisFeatureReports, setGisFeatureReports]   = useState<any[]>([]);
  
  // ── filters & layers ──────────────────────────────────────
  const [filters,    setFilters]    = useState({ feature_type: '', ris_id: '', ia_id: '' });
  const [risList,    setRisList]    = useState<any[]>([]);
  const [iaList,     setIaList]     = useState<any[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showLayers, setShowLayers]   = useState(false);

  const [layers, setLayers] = useState({
    canalRoutes:            true,
    showLabels:             true,
    showTickets:            true,
    showTicketPending:      true,
    showTicketInProgress:   true,
    showTicketClosed:       true,
    showStandalone:         true,
    showStandaloneInspection:  true,
    showStandaloneMaintenance: true,
    showStandaloneCleaning:    true,
    showStandaloneOther:       true,
  });

  // ── FEATURE TYPES ────────────────────────────────────────
  const featureTypes = [
    { value: 'main_canal',   label: 'Main Canal' },
    { value: 'lateral',      label: 'Lateral' },
    { value: 'farm_ditch',   label: 'Farm Ditch' },
    { value: 'pipeline',     label: 'Pipeline' },
    { value: 'canal',        label: 'Canal' },
  ];

  // ══════════════════════════════════════════════════════════
  //  DATA FETCHING
  // ══════════════════════════════════════════════════════════
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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAllData();   }, [fetchAllData]);

  // Delayed transition: tracksViewChanges={true} → false after data loads
  useEffect(() => {
    if (loading) return;
    if (tvcTimerRef.current) clearTimeout(tvcTimerRef.current);
    tvcTimerRef.current = setTimeout(() => {
      setMarkersTrackChanges(false);
    }, 1000);
    return () => {
      if (tvcTimerRef.current) clearTimeout(tvcTimerRef.current);
    };
  }, [loading]);

  // Handle Layer Toggle re-renders (Fixes the visibility bug!)
  useEffect(() => {
    if (loading) return;
    setMarkersTrackChanges(true);
    if (tvcTimerRef.current) clearTimeout(tvcTimerRef.current);
    tvcTimerRef.current = setTimeout(() => {
      setMarkersTrackChanges(false);
    }, 600);
  }, [layers, loading]);

  // Cold-start / foreground: markers may have been frozen during background
  useEffect(() => {
    const handler = () => {
      setMarkersTrackChanges(true);
      if (tvcTimerRef.current) clearTimeout(tvcTimerRef.current);
      tvcTimerRef.current = setTimeout(() => {
        setMarkersTrackChanges(false);
      }, 500);
    };
    // @ts-expect-error AppState available in React Native
    const sub = (AppState || { addEventListener: () => ({ remove: () => {} }) }).addEventListener('change', handler);
    return () => { sub?.remove?.(); };
  }, []);

  // ── RIS / IA dropdown lists ─────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [risRes, iaRes] = await Promise.all([getRISList(), getIAList()]);
        setRisList(Array.isArray(risRes.data) ? risRes.data : []);
        setIaList(Array.isArray(iaRes.data) ? iaRes.data : []);
        const gensan = (risRes.data || []).find(
          (r: any) => (r.name || '').toLowerCase().includes('gensan')
            || (r.name || '').toLowerCase().includes('general santos'),
        );
        if (gensan) {
          try {
            const detailRes = await fetch(
              `${BASE_URL.replace(/\/$/, '')}/api/gis/ris/${gensan.id}`,
              { headers: { 'Content-Type': 'application/json' } },
            );
            const detailJson = await detailRes.json();
            const sa = detailJson?.data?.service_area;
            if (sa?.geometry?.coordinates) {
              const coords = sa.geometry.coordinates;
              let bounds: any = null;
              if (sa.geometry.type === 'Polygon') {
                const ext = coords[0];
                const lats = ext.map((c: number[]) => c[1]);
                const lngs = ext.map((c: number[]) => c[0]);
                bounds = {
                  latitude:  (Math.min(...lats) + Math.max(...lats)) / 2,
                  longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
                  latitudeDelta:  0.08,
                  longitudeDelta: 0.12,
                };
              }
              if (sa.geometry.type === 'MultiPolygon') {
                let allLats: number[] = [], allLngs: number[] = [];
                coords.forEach((poly: number[][][]) => {
                  const exterior = poly[0];
                  allLats.push(...exterior.map((c: number[]) => c[1]));
                  allLngs.push(...exterior.map((c: number[]) => c[0]));
                });
                bounds = {
                  latitude:  (Math.min(...allLats) + Math.max(...allLats)) / 2,
                  longitude: (Math.min(...allLngs) + Math.max(...allLngs)) / 2,
                  latitudeDelta:  0.08,
                  longitudeDelta: 0.12,
                };
              }
              if (bounds) {
                (mapRef.current as any)?.fitToBounds?.(bounds);
              }
            }
          } catch { /* non-fatal */ }
        }
      } catch { /* non-fatal */ }
    })();
  }, []);

  // ══════════════════════════════════════════════════════════
  //  HELPERS
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

  // ══════════════════════════════════════════════════════════
  //  MARKER SEARCH HELPERS (for search bar)
  // ══════════════════════════════════════════════════════════
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); setShowSearchDD(false); return; }

    const q = query.toLowerCase();
    const results: any[] = [];

    // 1) Search Nominatim
    try {
      const camera = await mapRef.current?.getCamera();
      const center = camera?.center || { latitude: 6.5, longitude: 125.0 };
      const viewbox = `${center.longitude - 0.5},${center.latitude - 0.5},${center.longitude + 0.5},${center.latitude + 0.5}`;
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=0&limit=5&accept-language=en`,
        { headers: { 'User-Agent': 'IrriGIS-Mobile/1.0' } },
      );
      if (nomRes.ok) {
        const data = await nomRes.json();
        data.forEach((place: any) => {
          results.push({
            id:       `nom-${place.place_id}`,
            title:    (place.display_name || '').split(',')[0].trim(),
            subtitle: place.type || '',
            lat:      parseFloat(place.lat),
            lng:      parseFloat(place.lon),
            type:     'location',
          });
        });
      }
    } catch { /* non-fatal */ }

    // 2) Search GIS features
    canals.forEach((feat) => {
      const props = feat.properties || {};
      const name  = props.name || props.remarks || '';
      if (
        name.toLowerCase().includes(q)
        || (props.source_file || '').toLowerCase().includes(q)
        || (props.feature_type || '').toLowerCase().includes(q)
      ) {
        const g = feat.geometry;
        let lat: number | undefined, lng: number | undefined;
        if (g?.type === 'LineString' && g.coordinates?.[0])
          lat = g.coordinates[0][1], lng = g.coordinates[0][0]; // eslint-disable-line no-unused-expressions
        else if (g?.type === 'MultiLineString' && g.coordinates?.[0]?.[0]) {
          lat = g.coordinates[0][0][1]; lng = g.coordinates[0][0][0];
        }
        results.push({
          id: `canal-${feat.id || props.name}`,
          title: name || `${props.feature_type || 'Canal'} #${props.original_id || ''}`,
          subtitle: props.feature_type || 'Canal',
          lat, lng, type: 'canal',
        });
      }
    });

    // 3) Search reports
    reports.forEach((feat) => {
      const props   = feat.properties || {};
      const reportId = String(props.id || feat.id || '');
      if (props.is_valid === false) return;
      const isOrigin    = originReportIds.has(reportId);
      const isStandalone = !props.ticket_id;
      if (!isOrigin && !isStandalone) return;

      const location = props.location_name || '';
      const remarks  = props.remarks || '';
      const category = props.category || 'other';
      if (location.toLowerCase().includes(q) ||
          remarks.toLowerCase().includes(q) ||
          reportId.toLowerCase().includes(q) ||
          category.toLowerCase().includes(q)) {
        const g = feat.geometry;
        results.push({
          id:       `report-${reportId}`,
          title:    location || `Report #${reportId.slice(0, 8)}`,
          subtitle: `${CATEGORY_LABELS[category] || category} – ${remarks?.slice(0, 40) || 'No remarks'}`,
          lat:      g?.coordinates?.[1],
          lng:      g?.coordinates?.[0],
          type:     'report',
          reportId,
        });
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
    if (result.lat != null && result.lng != null) {
      mapRef.current?.animateToRegion({
        latitude: result.lat, longitude: result.lng,
        latitudeDelta: 0.02, longitudeDelta: 0.02,
      }, 600);
    }
    if (result.type === 'report' && result.reportId) {
      const feat = reports.find((f: any) => String(f.properties?.id || f.id) === result.reportId);
      if (feat) handleMarkerPress(feat);
    }
  };

  // ══════════════════════════════════════════════════════════
  //  MARKER  PRESS  (origin + standalone)
  // ══════════════════════════════════════════════════════════
  const handleMarkerPress = useCallback(async (feat: any) => {
    const props   = feat.properties || {};
    const geom    = feat.geometry?.coordinates || [];
    const lat     = geom[1];
    const lng     = geom[0];

    let ticketData: any = null;
    const reportId = String(props.id || feat.id);

    const isOrigin = originReportIds.has(reportId);
    const ticketId = props.ticket_id as string | undefined;

    if (isOrigin && ticketId) {
      try {
        const token = await getToken();
        const tRes = await fetch(`${BASE_URL}/api/tickets/${ticketId}`, {
          headers: { Authorization: `Bearer ${token || ''}` },
        });
        const tJson = await tRes.json();
        ticketData = tJson?.data || tJson;
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

    const status = isOrigin ? (ticketData?.status || STATUS_LABELS[props.status || 'pending'] || 'Pending') : 'No Ticket';

    setSelectedMarkerId(reportId);
    setSelectedReport({
      id:               reportId,
      ticketId:         ticketId || null,
      isTicket:         isOrigin,
      location:         props.location_name || locName
                     || (lat != null ? `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` : 'Unknown'),
      lat, lng,
      date:             parseFullDate(dateVal),
      createdAt:        dateVal,
      resolvedAt:       ticketData?.resolved_at,
      status,
      waterLevel:       levelToNumber(props.water_level),
      siltLevel:        levelToNumber(props.silt_level),
      debrisLevel:      levelToNumber(props.debris_level),
      remarks:          props.remarks || 'No remarks',
      images:           images.map((i: any) => i.imageUrl || i.image_url || i),
      submitter,
    });
  }, [originReportIds] as any);

  // ══════════════════════════════════════════════════════════
  //  FILTER  HELPERS
  // ══════════════════════════════════════════════════════════
  const onFilterChange = (key: string, val: string) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  const clearFilters = () =>
    setFilters({ feature_type: '', ris_id: '', ia_id: '' });

  // Compute live layer counts
  const tc: Record<string, number> = { total: 0, pending: 0, in_progress: 0, closed: 0 };
  const sc: Record<string, number> = { total: 0, inspection: 0, maintenance: 0, cleaning: 0, other: 0 };
  reports.forEach((feat: any) => {
    const p = feat.properties || {};
    if (p.is_valid === false) return;
    if (p.ticket_id) {
      tc.total++;
      const s = p.status || 'pending';
      if (s in tc) tc[s]++;
    } else {
      sc.total++;
      const cat = p.category || 'other';
      if (cat !== 'issue' && cat in sc) sc[cat]++;
    }
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
      {/* ── MAP ────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={st.map}
        initialRegion={
          reports.length > 0 && reports[0].geometry?.coordinates
            ? {
                latitude:  reports[0].geometry.coordinates[1],
                longitude: reports[0].geometry.coordinates[0],
                latitudeDelta:   0.05,
                longitudeDelta:  0.05,
              }
            : { latitude: 6.5, longitude: 125.0, latitudeDelta: 0.5, longitudeDelta: 0.5 }
        }
        minZoomLevel={10}
        maxZoomLevel={18}
      >
        <UrlTile
          urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />

        {/* ── Canal / GIS polylines ──────────────────────── */}
        {layers.canalRoutes && canals.map((feat: any, idx: number) => {
          try {
            const g   = feat.geometry;
            const p   = feat.properties || {};
            if (!g?.coordinates) return null;

            const color      = getFeatureColor(p.feature_type || 'canal');
            const strokeColor = hexToRgba(color, 0.85);
            const sw         = getFeatureStrokeWidth(p.feature_type || 'canal');

            if (g.type === 'MultiLineString') {
              return g.coordinates.map((line: number[][], li: number) => {
                if (!Array.isArray(line) || line.length < 2) return null;
                return (
                  <Polyline
                    key={`canal-${idx}-${li}`}
                    coordinates={line.map((c: number[]) => ({ latitude: c[1], longitude: c[0] }))}
                    strokeColor={strokeColor}
                    strokeWidth={sw}
                  />
                );
              });
            }
            // LineString
            const coords = (g as any).coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return null;
            return (
              <Polyline
                key={`canal-${idx}`}
                coordinates={coords.map((c: number[]) => ({ latitude: c[1], longitude: c[0] }))}
                strokeColor={strokeColor}
                strokeWidth={sw}
              />
            );
          } catch { return null; }
        })}

        {/* ── Report markers ─────────────────────────────── */}
        {reports.map((feat: any, idx: number) => {
          const props     = feat.properties || {};
          const reportId  = String(props.id || feat.id || idx);
          const geom      = feat.geometry?.coordinates;
          if (!geom?.length || geom.length < 2) return null;
          if (props.is_valid === false) return null;

          const hasTicketId  = !!props.ticket_id;
          const isStandalone = !hasTicketId;

          // Origin reports → Red Flag marker
          if (hasTicketId) {
            if (!layers.showTickets) return null;
            const status = props.status || 'pending';
            if (status === 'pending'      && !layers.showTicketPending)    return null;
            if (status === 'in_progress'  && !layers.showTicketInProgress) return null;
            if (status === 'closed'       && !layers.showTicketClosed)     return null;

            const isSelected = selectedMarkerId === reportId;
            return (
              <Marker
                key={reportId}
                coordinate={{ latitude: geom[1], longitude: geom[0] }}
                tracksViewChanges={markersTrackChanges}
                onPress={() => handleMarkerPress(feat)}
              >
                <View style={[st.flagWrap, isSelected && st.flagWrapSelected]}>
                  <FlagMarker status={status} createdAt={props.createdAt || props.created_at} />
                </View>
                <Callout tooltip>
                  <View style={st.callout}>
                    <Text style={st.calloutTitle}>Ticket – {props.location_name || `#${reportId.slice(0, 8)}`}</Text>
                    <Text style={st.calloutSub}>
                      Status:{' '}
                      <Text style={[
                        st.cblBadgePad,
                        status === 'closed'     && st.cbBadgeGreen,
                        status === 'in_progress' && st.cbBadgeAmber,
                        status === 'pending'     && st.cbBadgeBlue,
                      ]}>
                        {STATUS_LABELS[status] || status}
                      </Text>
                    </Text>
                    <Text style={st.calloutSub}>Category: {(props.category || '?').toUpperCase()}</Text>
                  </View>
                </Callout>
              </Marker>
            );
          }

          // Standalone reports → Teardrop marker (non-issue only)
          if (isStandalone) {
            if (!layers.showStandalone) return null;
            const cat = (props.category || 'other') as string;
            if (cat === 'issue') return null; // issues always have a ticket — skip
            const layerKey = `showStandalone${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
            if (!layers[layerKey as keyof typeof layers]) return null;

            const isSelected = selectedMarkerId === reportId;
            return (
              <Marker
                key={reportId}
                coordinate={{ latitude: geom[1], longitude: geom[0] }}
                tracksViewChanges={markersTrackChanges}
                onPress={() => handleMarkerPress(feat)}
              >
                <View style={[st.teardropWrap, isSelected && st.teardropWrapSelected]}>
                  <TeardropMarker status={props.status || 'pending'} category={cat} createdAt={props.createdAt || props.created_at} />
                </View>
                <Callout tooltip>
                  <View style={st.callout}>
                    <Text style={st.calloutTitle}>{props.location_name || `#${reportId.slice(0, 8)}`}</Text>
                    <Text style={st.calloutSub}>{(CATEGORY_LABELS[cat] || cat)} – No Ticket</Text>
                  </View>
                </Callout>
              </Marker>
            );
          }

          // Everything else (hidden duplicates): skip
          return null;
        })}
      </MapView>

      {/* ═══════════════════════════════════════════════════
          SEARCH BAR  (absolute top-left)
         ═══════════════════════════════════════════════════ */}
      <View style={st.searchContainer} ref={searchContainerRef}>
        <View style={st.searchBox}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={() => searchResults.length > 0 && setShowSearchDD(true)}
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

        {/* Search results dropdown */}
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
                    name={
                      r.type === 'location' ? 'globe-outline' :
                        r.type === 'canal'   ? 'layers-outline'
                                              : 'clipboard-outline'
                    }
                    size={14}
                    color={
                      r.type === 'location'  ? '#059669' :
                        r.type === 'canal'   ? '#2563EB'
                                              : '#D97706'
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.searchDDTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={st.searchDDSub}   numberOfLines={1}>{r.subtitle || ''}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={st.searchDDCount}>{searchResults.length} result{searchResults.length > 1 ? 's' : ''}</Text>
          </ScrollView>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════
          CONTROLS ROW (Layers + Filters side-by-side)
          ═══════════════════════════════════════════════ */}
      <View style={st.controlsRow} pointerEvents="box-none">
        
        {/* LAYERS PANEL */}
        <View style={[st.panel, st.panelHalf]}>
          <TouchableOpacity style={st.panelHeader} onPress={() => setShowLayers(!showLayers)}>
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
                {(['pending', 'in_progress', 'closed'] as const).map((s) => (
                  <TouchableOpacity key={s} style={st.layerSubRow}
                    onPress={() => {
                      const key = `showTicket${s.charAt(0).toUpperCase() + s.slice(1)}` as keyof typeof layers;
                      setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
                    }}
                  >
                    <Ionicons
                      name={(layers[`showTicket${s.charAt(0).toUpperCase() + s.slice(1)}` as keyof typeof layers] as any) ? 'eye' : 'eye-off'}
                      size={12}
                      color="#9CA3AF"
                    />
                    <Text style={st.layerSubText}>{s.replace('_', ' ')} ({tc[s]})</Text>
                  </TouchableOpacity>
                ))}
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
                      onPress={() => setLayers((prev: any) => ({ ...prev, [layerKey]: !prev[layerKey] }))}
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

        {/* FILTERS PANEL */}
        <View style={[st.panel, st.panelHalf]}>
          <TouchableOpacity style={st.panelHeader} onPress={() => setShowFilters(!showFilters)}>
            <Ionicons name="filter" size={14} color="#6B7280" />
            <Text style={st.panelTitle}>Filters</Text>
            <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
          </TouchableOpacity>
          {showFilters && (
            <ScrollView style={st.panelBody} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {/* Feature type */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>Feature Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {featureTypes.map((ft) => (
                    <TouchableOpacity
                      key={ft.value}
                      style={[
                        st.chip,
                        filters.feature_type === ft.value && st.chipOn,
                      ]}
                      onPress={() => onFilterChange('feature_type', filters.feature_type === ft.value ? '' : ft.value)}
                    >
                      <Text style={[st.chipText, filters.feature_type === ft.value && st.chipTextOn]}>
                        {ft.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* RIS */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>RIS (System)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(risList || []).map((ris: any) => (
                    <TouchableOpacity
                      key={ris.id}
                      style={[st.chip, filters.ris_id === String(ris.id) && st.chipOn]}
                      onPress={() => onFilterChange('ris_id', filters.ris_id === String(ris.id) ? '' : String(ris.id))}
                    >
                      <Text style={[st.chipText, filters.ris_id === String(ris.id) && st.chipTextOn]}>
                        {ris.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* IA */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>IA (Association)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(iaList || []).map((ia: any) => (
                    <TouchableOpacity
                      key={ia.id}
                      style={[st.chip, filters.ia_id === String(ia.id) && st.chipOn]}
                      onPress={() => onFilterChange('ia_id', filters.ia_id === String(ia.id) ? '' : String(ia.id))}
                    >
                      <Text style={[st.chipText, filters.ia_id === String(ia.id) && st.chipTextOn]}>
                        {ia.name}
                      </Text>
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
      </View>

      {/* ═══════════════════════════════════════════════════
          RIGHT  DRAWER  —  Report / Ticket  Details
          ═══════════════════════════════════════════════ */}
      {selectedReport && (
        <ScrollView style={st.drawer} showsVerticalScrollIndicator={false}>
          <View style={st.drawerInner}>
            <View style={st.drawerHeader}>
              <Ionicons name="eye" size={16} color="#2563EB" />
              <Text style={st.drawerTitle} numberOfLines={1}>
                {selectedReport.isTicket ? 'Ticket Details' : 'Report Details'}
              </Text>
              <TouchableOpacity onPress={() => { setSelectedReport(null); setSelectedMarkerId(null); }}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* thumbnail */}
            <View style={st.heroWrap}>
              {selectedReport.images?.length > 0 ? (
                <View style={st.heroImgBox}>
                  <Text style={st.heroImgPlaceholder}>Image</Text>
                </View>
              ) : (
                <View style={st.heroImgBox}>
                  <Ionicons name="water-outline" size={36} color="#9CA3AF" />
                </View>
              )}
            </View>

            {/* Location */}
            <View style={st.infoRow}>
              <Text style={st.infoLabel}><Ionicons name="location-outline" size={12} /> Location</Text>
              <Text style={st.infoValue}>{selectedReport.location}</Text>
            </View>

            {/* Date / resolved */}
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

            {/* Submitter */}
            <View style={st.infoRow}>
              <Text style={st.infoLabel}><Ionicons name="person-outline" size={12} /> Submitted By</Text>
              <Text style={st.infoValue}>{selectedReport.submitter}</Text>
            </View>

            {/* Status badge */}
            {selectedReport.isTicket && (
              <View style={[st.statusChip,
                selectedReport.status === 'closed'      && st.chipGreen,
                selectedReport.status === 'in_progress' && st.chipAmber,
                selectedReport.status === 'pending'      && st.chipBlue,
              ]}
              >
                <Ionicons name={
                  selectedReport.status === 'closed' ? 'checkmark-circle' : 'time-outline'
                } size={13} color={
                  selectedReport.status === 'closed'      ? '#059669'
                    : selectedReport.status === 'in_progress' ? '#D97706'
                    : selectedReport.status === 'pending'      ? '#2563EB'
                    : '#6B7280'
                } />
                <Text style={[
                  st.statusChipText,
                  selectedReport.status === 'closed'      && st.txtGreen,
                  selectedReport.status === 'in_progress' && st.txtAmber,
                  selectedReport.status === 'pending'      && st.txtBlue,
                ]}>{STATUS_LABELS[selectedReport.status] || selectedReport.status}</Text>
              </View>
            )}

            {/* Condition assessments */}
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

            {/* Remarks */}
            {selectedReport.remarks && (
              <View style={st.remarksBox}>
                <Text style={st.sectionTitle}>Remarks</Text>
                <Text style={st.remarksText}>{selectedReport.remarks}</Text>
              </View>
            )}

            {/* Navigate button */}
            <Button
              mode="contained"
              onPress={() => {
                setSelectedReport(null);
                setSelectedMarkerId(null);
                if (selectedReport.isTicket && selectedReport.ticketId) {
                  router.push(`/(tabs)/ticket/${selectedReport.ticketId}`);
                } else if (selectedReport.id) {
                  router.push(`/(tabs)/report/${selectedReport.id}`);
                }
              }}
              contentStyle={st.navBtn}
              style={st.navBtn}
              buttonColor="#2563EB"
            >
              View in {selectedReport.isTicket ? 'Tickets' : 'Reports'}
            </Button>
          </View>
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════
          CANAL  HISTORY  PANEL  (right-side)
          ═══════════════════════════════════════════════ */}
      {selectedGisFeature && (
        <View style={st.histPanel}>
          <ScrollView style={st.histScroll}>
            <View style={st.histHeader}>
              <View>
                <Text style={st.histTitle}>Canal History</Text>
                <Text style={st.histSubtitle}>{selectedGisFeature.name}</Text>
              </View>
              <TouchableOpacity onPress={() => { setSelectedGisFeature(null); setGisFeatureReports([]); }}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {gisFeatureReports.length === 0 ? (
              <View style={st.histCenter}>
                <Ionicons name="alert-circle-outline" size={40} color="#9CA3AF" />
                <Text style={st.histEmpty}>No reports found for this canal</Text>
              </View>
            ) : (() => {
              // IIFE scope: compute ongoing/past lists inline then return JSX
              const ongoing = gisFeatureReports.filter((r: any) => {
                const s = r.ticket?.status || r.ticket_status;
                return s && s !== 'closed';
              });
              const past = gisFeatureReports.filter((r: any) => {
                const s = r.ticket?.status || r.ticket_status;
                return !s || s === 'closed';
              });

              return (
                <View style={{ padding: 12 }}>
                  {ongoing.length > 0 && (
                    <View style={st.histSection}>
                      <View style={st.histSectionHeader}>
                        <View style={st.liveDot} />
                        <Text style={st.histSectionTitle}>Ongoing ({ongoing.length})</Text>
                      </View>
                      {ongoing.map((report: any) => (
                        <CanalReportCard
                          key={report.id}
                          report={report}
                          onPress={() => {
                            setSelectedGisFeature(null);
                            const tid = report.ticket?.id || report.ticket_id;
                            if (tid) router.push(`/(tabs)/ticket/${tid}`);
                          }}
                        />
                      ))}
                    </View>
                  )}
                  {past.length > 0 && (
                    <View style={[st.histSection, ongoing.length > 0 && { marginTop: 16 }]}>
                      <Text style={st.histPastTitle}>Past ({past.length})</Text>
                      {past.map((report: any) => (
                        <CanalReportCard
                          key={report.id}
                          report={report}
                          compact
                          onPress={() => {
                            setSelectedGisFeature(null);
                            const tid = report.ticket?.id || report.ticket_id;
                            if (tid) router.push(`/(tabs)/ticket/${tid}`);
                          }}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )
            })()}
          </ScrollView>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════
          EMPTY  STATE
          ═══════════════════════════════════════════════ */}
      {reports.length === 0 && !loading && (
        <View style={st.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color="#B6C9B8" />
          <Text style={st.emptyText}>No reports found</Text>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  CANAL  REPORT  CARD  (Canal History)
// ═══════════════════════════════════════════════════════════
function CanalReportCard({
  report, onPress, compact = false,
}: {
  report: any;
  onPress: () => void;
  compact?: boolean;
}) {
  const ticket    = report.ticket || {};
  const tStatus   = ticket.status || 'no_ticket';
  const imgUrl    = report.images?.[0]?.imageUrl || report.images?.[0]?.image_url || '';
  const subName   = report.User ? `${report.User.first_name || ''} ${report.User.last_name || ''}`.trim() : 'Unknown';
  const date      = report.created_at
    ? new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : new Date(report.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const catColor  = (CATEGORY_COLORS[(report.category || 'other') as keyof typeof CATEGORY_COLORS] || '#6B7280');
  const catLabel  = (CATEGORY_LABELS[(report.category || 'other') as keyof typeof CATEGORY_LABELS] || 'Other');

  if (compact) {
    return (
      <TouchableOpacity style={st.histCompactCard} onPress={onPress} activeOpacity={0.7}>
        <View style={[st.histChip, { backgroundColor: catColor + '1A', borderColor: catColor + '44' }]}>
          <Text style={[st.histChipText, { color: catColor }]}>{catLabel}</Text>
        </View>
        <Text style={st.histCompactRemarks} numberOfLines={2}>{report.remarks || 'No remarks'}</Text>
        <Text style={st.histCompactMeta}>
          {subName} · {date}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={st.histCard} onPress={onPress} activeOpacity={0.8}>
      {imgUrl ? (
        <View style={st.histThumbImg} />
      ) : (
        <View style={st.histThumb}>
          <Ionicons name="water-outline" size={22} color="#B6C9B8" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={st.histCardHeader}>
          <View style={[st.histCardStatus,
            tStatus === 'closed'      && st.histStatusGreen,
            tStatus === 'in_progress' && st.histStatusAmber,
            tStatus === 'pending'     && st.histStatusBlue,
            tStatus === 'rejected'    && st.histStatusRed,
          ]}
          >
            <Text style={st.histCardStatusText}>{STATUS_LABELS[tStatus] || tStatus.replace('_', ' ')}</Text>
          </View>
          <Text style={st.histCompactMeta}>
            <Ionicons name="calendar-outline" size={10} /> {date}
          </Text>
        </View>
        <Text style={st.histCardRemarks} numberOfLines={3}>{report.remarks || 'No remarks'}</Text>
      </View>
      {/* color stripe left border */}
      <View style={[st.histColorStripe, { backgroundColor: catColor }]} />
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1 },

  // ── map ──────────────────────────────────────────────────
  map: { width: width, height: height },

  // ── custom SVG marker wrapper ────────────────────────────
  flagWrap: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  flagWrapSelected: {
    transform: [{ scale: 1.18 }],
  },
  teardropWrap: {
    width: 40, height: 44,
    justifyContent: 'center', alignItems: 'center',
  },
  teardropWrapSelected: {
    transform: [{ scale: 1.18 }],
  },

  // ── callout ──────────────────────────────────────────────
  callout: {
    minWidth: 140, padding: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  calloutTitle:  { fontWeight: '700', fontSize: 11, color: '#1F2937', marginBottom: 3 },
  calloutSub:    { fontSize: 10, color: '#6B7280' },
  calloutStatus: { fontSize: 10, color: '#6B7280', marginTop: 3 },
  calloutStatusBadge: { fontWeight: '700', fontSize: 10 },

  // ── search ───────────────────────────────────────────────
  searchContainer: {
    position: 'absolute', top: 10, left: 12, right: 12, zIndex: 900,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 24, paddingHorizontal: 12, height: 46,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 5,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#111827', marginLeft: 8 },
  searchDD: {
    maxHeight: 260, backgroundColor: 'white', borderRadius: 12,
    marginTop: 4, paddingHorizontal: 4, paddingVertical: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
  },
  searchDDItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingVertical: 7, borderRadius: 8,
  },
  searchDDIcon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  iconEm: { backgroundColor: '#ECFDF5' },
  iconBl: { backgroundColor: '#EFF6FF' },
  iconAm: { backgroundColor: '#FFFBEB' },
  searchDDTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  searchDDSub:   { fontSize: 11, color: '#6B7280' },
  searchDDCount: { fontSize: 10, color: '#9CA3AF', textAlign: 'center', paddingVertical: 4 },

  // ── Controls Layout (Layers + Filters) ───────────────────
  controlsRow: {
    position: 'absolute', top: 64, left: 12, right: 12,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', zIndex: 800,
  },
  panel: {
    backgroundColor: 'white', borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },
  panelHalf: {
    width: '48%',
    maxHeight: 300,
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  panelTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: '#374151', marginLeft: 5 },
  panelBody: { padding: 10 },

  // layer panel specifics
  layerRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  layerSub:  { paddingLeft: 14, paddingBottom: 6 },
  layerSubRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  layerText:     { fontSize: 11, color: '#374151', marginLeft: 6, flex: 1 },
  layerSubText:  { fontSize: 10, color: '#9CA3AF', marginLeft: 5 },
  layerCount:    { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },

  // filter panel specifics
  field:      { marginBottom: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  chip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16,
    marginRight: 5, marginBottom: 3,
    backgroundColor: '#F3F4F6',
  },
  chipOn: { backgroundColor: '#2563EB' },
  chipText:     { fontSize: 10, color: '#374151', fontWeight: '500' },
  chipTextOn:   { fontSize: 10, color: '#FFFFFF', fontWeight: '600' },
  clearBtn: {
    marginTop: 4, paddingVertical: 6,
    alignItems: 'center', borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  clearBtnText: { fontSize: 10, color: '#6B7280', fontWeight: '600' },

  // ── drawer ───────────────────────────────────────────────
  drawer: {
    position: 'absolute', top: 0, right: 0,
    width: Math.min(width * 0.82, 330),
    height: '100%',
    backgroundColor: 'white',
    elevation: 10, shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.15, shadowRadius: 10,
    zIndex: 950,
  },
  drawerInner:  { flex: 1 },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#F9FAFB',
  },
  drawerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1F2937', marginLeft: 6 },

  // status badge
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 16, marginTop: 6, marginLeft: 12,
  },
  statusChipText: { fontWeight: '700', fontSize: 11 },
  chipBlue:   { backgroundColor: '#DBEAFE' },
  chipAmber:  { backgroundColor: '#FEF3C7' },
  chipGreen:  { backgroundColor: '#D1FAE5' },
  txtBlue:    { color: '#2563EB', fontWeight: '700', fontSize: 11 },
  txtAmber:   { color: '#D97706', fontWeight: '700', fontSize: 11 },
  txtGreen:   { color: '#059669', fontWeight: '700', fontSize: 11 },

  // info rows
  infoRow:   { marginHorizontal: 14, marginTop: 10 },
  infoLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, color: '#1F2937', marginTop: 2, fontWeight: '600' },

  // levels
  levelsCard: {
    marginHorizontal: 14, marginTop: 14, padding: 14,
    backgroundColor: '#F9FAFB', borderRadius: 12,
  },
  levelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  levelBox: {
    flex: 1, marginHorizontal: 3, padding: 8,
    borderRadius: 10, alignItems: 'center',
  },
  levelLabel: { fontSize: 9, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },
  levelVal:   { fontSize: 16, fontWeight: '700', marginTop: 2 },

  // navigation button
  navBtn: { marginHorizontal: 14, marginTop: 20, borderRadius: 12 },
  badgeBlue:   { color: '#2563EB', fontWeight: '700', fontSize: 11 },
  badgeAmber:  { color: '#D97706', fontWeight: '700', fontSize: 11 },
  badgeGreen:  { color: '#059669', fontWeight: '700', fontSize: 11 },

  // hero / thumbnail
  heroWrap:  { marginHorizontal: 14, marginTop: 14 },
  heroImgBox: {
    height: 120, borderRadius: 12,
    backgroundColor: '#EEF2E8', alignItems: 'center', justifyContent: 'center',
  },
  heroImgPlaceholder: { color: '#B6C9B8', fontSize: 14 },

  remarksBox: { marginHorizontal: 14, marginTop: 12, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12 },
  remarksText: { fontSize: 13, color: '#374151', lineHeight: 19 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8 },

  // callout badge colors (used in the flag marker callout tooltip)
  cbBadgeGreen:  { color: '#059669', fontWeight: '700', fontSize: 10 },
  cbBadgeAmber:  { color: '#D97706', fontWeight: '700', fontSize: 10 },
  cbBadgeBlue:   { color: '#2563EB', fontWeight: '700', fontSize: 10 },
  cblBadgePad:   { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },

  // ── Canal History panel ──────────────────────────────────
  histPanel: {
    position: 'absolute', top: 0, right: 0,
    width: Math.min(width * 0.82, 340),
    height: '100%',
    backgroundColor: 'white',
    elevation: 10, shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.15, shadowRadius: 10,
    zIndex: 950,
  },
  histScroll:     { flex: 1 },
  histCenter:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  histEmpty:      { fontSize: 13, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  histHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#F9FAFB',
  },
  histTitle:    { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  histSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  histSection:  { padding: 12 },
  histSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  liveDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 6 },
  histSectionTitle: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8 },
  histPastTitle:    { fontSize: 10, fontWeight: '700', color: '#D1D5DB', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  // card within Canal History
  histCard: {
    flexDirection: 'row', backgroundColor: 'white', borderRadius: 10,
    marginBottom: 8, padding: 10, borderWidth: 1, borderColor: '#E5E7EB',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2,
  },
  histThumb: {
    width: 46, height: 46, borderRadius: 8,
    backgroundColor: '#EEF2E8', alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  histThumbImg: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#E5E7EB', marginRight: 10 },
  histCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  histCardStatus: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    marginBottom: 4,
  },
  histStatusBlue:   { backgroundColor: '#DBEAFE' },
  histStatusAmber:  { backgroundColor: '#FEF3C7' },
  histStatusGreen:  { backgroundColor: '#D1FAE5' },
  histStatusRed:    { backgroundColor: '#FEE2E2' },
  histCardStatusText: { fontSize: 9, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
  histCardRemarks:  { fontSize: 12, color: '#4B5563', lineHeight: 16 },
  histCompactCard:  {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: '#F9FAFB', borderRadius: 8, marginBottom: 6,
  },
  histChip: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, marginRight: 8,
    borderWidth: 1,
  },
  histChipText:      { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  histCompactRemarks: { flex: 1, fontSize: 12, color: '#374151' },
  histCompactMeta:   { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  histColorStripe:   { width: 3, borderRadius: 2, marginLeft: 8, alignSelf: 'stretch' },

  // ── empty ────────────────────────────────────────────────
  emptyCard: {
    position: 'absolute', top: '40%', left: 20, right: 20,
    alignItems: 'center', padding: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16, elevation: 4,
  },
  emptyText: { fontSize: 13, color: '#B6C9B8', marginTop: 8, textAlign: 'center' },

  // ── centered ─────────────────────────────────────────────
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});