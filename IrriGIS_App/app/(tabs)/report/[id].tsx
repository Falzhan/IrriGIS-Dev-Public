// app/(tabs)/report/[id].tsx
import { useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, Image, Alert, RefreshControl, Dimensions } from 'react-native';
import { Text, Button, ActivityIndicator, Divider, Avatar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getReportById } from '../../../services/api';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
import DetailTopBar from '../../../components/DetailTopBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const LEVEL_DESCRIPTIONS: Record<string, Record<string, string>> = {
  water: { dry: 'No water', low: 'Minimal water', normal: 'Adequate water', high: 'Above normal', overflow: 'Flooding' },
  silt: { clean: 'No silt', light: 'Light silt', normal: 'Moderate silt', dirty: 'Heavy silt', heavily_silted: 'Fully silted' },
  debris: { clear: 'No obstruction', light: 'Minor debris', normal: 'Some debris', heavy: 'Heavy debris', blocked: 'Fully blocked' },
};

const LEVEL_VALUES: Record<string, number> = {
  dry: 1, low: 2, normal: 3, high: 4, overflow: 5,
  clean: 1, light: 2, dirty: 4, heavily_silted: 5,
  clear: 1, heavy: 4, blocked: 5,
};

const getLevelDescription = (level: string, type: 'water' | 'silt' | 'debris') => {
  return LEVEL_DESCRIPTIONS[type][level] || 'Normal';
};

const getLevelValue = (level: string) => LEVEL_VALUES[level] || 3;

export default function ReportDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReport = async () => {
    try {
      const response = await getReportById(id as string);
      setReport(response.data?.data || response.data);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load report');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReport();
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const getCoordinates = () => {
    if (report?.location?.coordinates) {
      const coords = report.location.coordinates;
      // GeoJSON is [longitude, latitude]
      return {
        latitude: coords[1],
        longitude: coords[0],
      };
    }
    return { latitude: 6.1164, longitude: 125.1715 }; // Default to General Santos
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#74A5A8" /></View>;
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Text>Report not found</Text>
        <Button mode="contained" onPress={() => router.back()} style={{ marginTop: 16 }}>Go Back</Button>
      </View>
    );
  }

  const submitter = report.User || report.user;
  const images = report.images || report.ReportImages || [];
  const coords = getCoordinates();
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#74A5A8']} />}>
      {/* Custom Top Bar */}
      <DetailTopBar title="Report Details" subtitle={report.category?.charAt(0).toUpperCase() + report.category?.slice(1)} />

      {/* Hero Image Carousel */}
      {images.length > 0 && (
        <View style={styles.heroImageContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll} pagingEnabled>
            {images.map((img: any, idx: number) => {
              const imageUrl = img.imageUrl || img.image_url || img.filename || '';
              let fullImageUrl = imageUrl;
              if (imageUrl && !imageUrl.startsWith('http')) {
                fullImageUrl = `${baseUrl}/uploads/${imageUrl}`;
              }
              return (
                <Image key={idx} source={{ uri: fullImageUrl }} style={styles.heroImage} resizeMode="cover" />
              );
            })}
          </ScrollView>
          {images.length > 1 && (
            <View style={styles.imageCountBadge}>
              <Ionicons name="images" size={12} color="#fff" />
              <Text style={styles.imageCountText}>{images.length}</Text>
            </View>
          )}
        </View>
      )}

      {/* Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.sectionRow}>
          <View style={[styles.categoryBadge, { backgroundColor: '#74A5A820' }]}>
            <Text style={[styles.categoryBadgeText, { color: '#74A5A8' }]}>
              {report.category?.charAt(0).toUpperCase() + report.category?.slice(1)}
            </Text>
          </View>
          {report.ticket && (
            <View style={[styles.statusBadge, { backgroundColor: '#5DADE230' }]}>
              <Text style={styles.statusBadgeText}>
                {report.ticket.status?.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Submitter */}
        <View style={styles.submitterSection}>
          <Text style={styles.sectionLabel}>Submitted by</Text>
          <View style={styles.submitterRow}>
            <Avatar.Text
              size={36}
              label={getInitials(submitter?.first_name + ' ' + submitter?.last_name)}
              style={styles.avatar}
            />
            <View style={styles.submitterInfo}>
              <Text style={styles.submitterName}>{submitter?.first_name} {submitter?.last_name}</Text>
              <Text style={styles.submitterRole}>{submitter?.role?.replace('_', ' ').toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <Divider style={styles.divider} />

        {/* Meta Grid */}
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={18} color="#74A5A8" />
            <View style={styles.metaItemContent}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{formatDate(report.created_at || report.createdAt)}</Text>
            </View>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={18} color="#74A5A8" />
            <View style={styles.metaItemContent}>
              <Text style={styles.metaLabel}>Time</Text>
              <Text style={styles.metaValue}>{formatTime(report.created_at || report.createdAt)}</Text>
            </View>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={18} color="#74A5A8" />
            <View style={styles.metaItemContent}>
              <Text style={styles.metaLabel}>Location</Text>
              <Text style={styles.metaValue}>{report.location_name || 'Unknown Location'}</Text>
            </View>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="navigate-outline" size={18} color="#74A5A8" />
            <View style={styles.metaItemContent}>
              <Text style={styles.metaLabel}>Coordinates</Text>
              <Text style={styles.metaValue}>{coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Level Assessments Card */}
      <View style={styles.levelsCard}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="stats-chart" size={16} color="#74A5A8" style={{ marginRight: 6 }} />
          Level Assessments
        </Text>

        {/* Water Level */}
        <View style={styles.levelRow}>
          <View style={styles.levelIcon}>
            <Ionicons name="water" size={20} color="#3B82F6" />
          </View>
          <View style={styles.levelInfo}>
            <View style={styles.levelLabelRow}>
              <Text style={styles.levelLabel}>Water</Text>
              <Text style={styles.levelDescription}>{getLevelDescription(report.water_level, 'water')}</Text>
            </View>
          </View>
          <View style={[styles.levelIndicator, { backgroundColor: '#3B82F630' }]}>
            <Text style={[styles.levelValue, { color: '#3B82F6' }]}>{getLevelValue(report.water_level)}/5</Text>
          </View>
        </View>

        {/* Silt Level */}
        <View style={[styles.levelRow, { borderTopWidth: 1, borderTopColor: 'rgba(116,165,168,0.1)' }]}>
          <View style={styles.levelIcon}>
            <Ionicons name="layers" size={20} color="#F59E0B" />
          </View>
          <View style={styles.levelInfo}>
            <View style={styles.levelLabelRow}>
              <Text style={styles.levelLabel}>Silt</Text>
              <Text style={styles.levelDescription}>{getLevelDescription(report.silt_level, 'silt')}</Text>
            </View>
          </View>
          <View style={[styles.levelIndicator, { backgroundColor: '#F59E0B30' }]}>
            <Text style={[styles.levelValue, { color: '#F59E0B' }]}>{getLevelValue(report.silt_level)}/5</Text>
          </View>
        </View>

        {/* Debris Level */}
        <View style={[styles.levelRow, { borderTopWidth: 1, borderTopColor: 'rgba(116,165,168,0.1)' }]}>
          <View style={styles.levelIcon}>
            <Ionicons name="trash" size={20} color="#EF4444" />
          </View>
          <View style={styles.levelInfo}>
            <View style={styles.levelLabelRow}>
              <Text style={styles.levelLabel}>Debris</Text>
              <Text style={styles.levelDescription}>{getLevelDescription(report.debris_level, 'debris')}</Text>
            </View>
          </View>
          <View style={[styles.levelIndicator, { backgroundColor: '#EF444430' }]}>
            <Text style={[styles.levelValue, { color: '#EF4444' }]}>{getLevelValue(report.debris_level)}/5</Text>
          </View>
        </View>
      </View>

      {/* Remarks Card */}
      {report.remarks && (
        <View style={styles.remarksCard}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="chatbubble-outline" size={16} color="#74A5A8" style={{ marginRight: 6 }} />
            Remarks
          </Text>
          <View style={styles.remarksBox}>
            <Text style={styles.remarksText}>{report.remarks}</Text>
          </View>
        </View>
      )}

      {/* Minimap Card */}
      <View style={styles.mapCard}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="map-outline" size={16} color="#74A5A8" style={{ marginRight: 6 }} />
          Location Map
        </Text>
        <View style={styles.mapContainer}>
          <WebView
            source={{ html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <style> html, body { margin: 0; padding: 0; height: 100%; } #map { height: 100%; width: 100%; } </style>
              </head>
              <body>
                <div id="map"></div>
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <script>
                  var map = L.map('map').setView([${coords.latitude}, ${coords.longitude}], 15);
                  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
                  L.marker([${coords.latitude}, ${coords.longitude}]).addTo(map)
                    .bindPopup('${report.location_name || 'Report Location'}')
                    .openPopup();
                </script>
              </body>
              </html>
            ` }}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E0EBE2',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Hero Image ──
  heroImageContainer: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    position: 'relative',
  },
  imageScroll: {
    maxHeight: 260,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: 220,
  },
  imageCountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  imageCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Info Card ──
  infoCard: {
    margin: 12,
    marginTop: -20,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5DADE2',
    textTransform: 'uppercase',
  },

  // ── Submitter ──
  submitterSection: {
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  submitterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginRight: 12,
    backgroundColor: '#74A5A8',
  },
  submitterInfo: {
    flex: 1,
  },
  submitterName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  submitterRole: {
    fontSize: 12,
    color: '#74A5A8',
    fontWeight: '600',
  },

  // ── Divider ──
  divider: {
    backgroundColor: 'rgba(116,165,168,0.18)',
    marginVertical: 14,
  },

  // ── Meta Grid ──
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '48%',
    marginBottom: 12,
    backgroundColor: 'rgba(116,165,168,0.06)',
    padding: 10,
    borderRadius: 12,
  },
  metaItemContent: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },

  // ── Section Title ──
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },

  // ── Level Assessments ──
  levelsCard: {
    margin: 12,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  levelIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(116,165,168,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  levelInfo: {
    flex: 1,
  },
  levelLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  levelDescription: {
    fontSize: 12,
    color: '#666',
  },
  levelIndicator: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  levelValue: {
    fontWeight: 'bold',
    fontSize: 14,
  },

  // ── Remarks ──
  remarksCard: {
    margin: 12,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  remarksBox: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  remarksText: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 20,
  },

  // ── Map ──
  mapCard: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  mapContainer: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  map: {
    width: '100%',
    height: '100%',
  },
});
