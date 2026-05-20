// app/(profile)/my-reports.tsx
import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { Card, Text, Chip, ActivityIndicator, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSession } from '../../context/ctx';
import { getMyReports } from '../../services/api';

const LEVEL_DESCRIPTIONS: Record<string, Record<string, string>> = {
  water: { dry: 'No water', low: 'Minimal water', normal: 'Adequate water', high: 'Above normal', overflow: 'Flooding' },
  silt: { clean: 'No silt · Clean', light: 'Light silt', dirty: 'Heavy silt', heavily_silted: 'Fully silted' },
  debris: { clear: 'No obstruction · Clear', light: 'Minor debris', heavy: 'Heavy debris', blocked: 'Fully blocked' },
};

const getLevelDescription = (level: string, type: 'water' | 'silt' | 'debris'): string => {
  return LEVEL_DESCRIPTIONS[type]?.[level] || level;
};

export default function MyReportsScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchReports = useCallback(async () => {
    try {
      const response = await getMyReports({ limit: 100 });
      const reportData = Array.isArray(response.data) ? response.data :
                         Array.isArray(response.data?.data) ? response.data.data : [];
      setReports(reportData);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReports();
  }, [fetchReports]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#5DADE2';
      case 'in_progress': return '#2BD586';
      case 'closed': return '#4CAF50';
      default: return '#999';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const renderReport = ({ item }: { item: any }) => {
    const ticket = item.Ticket;
    const images = item.ReportImages || [];

    return (
      <Card style={styles.card} onPress={() => ticket && router.push(`/(tabs)/ticket/${ticket.id}` as any)}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View>
              <Text variant="titleMedium" style={styles.title}>{item.category?.toUpperCase()}</Text>
              <Text variant="bodySmall" style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>
            <Chip 
              style={{ 
                backgroundColor: getStatusColor(ticket?.status || 'pending') + '30', 
                borderWidth: 1,
                borderColor: getStatusColor(ticket?.status || 'pending'),
                height: 22,
              }} 
              textStyle={{ color: getStatusColor(ticket?.status || 'pending'), fontSize: 10, fontWeight: '600' }}
            >
              {(ticket?.status || 'pending').replace('_', ' ').toUpperCase()}
            </Chip>
          </View>

          {images.length > 0 && (() => {
            const imageUrl = images[0].image_url || images[0].filename || '';
            let fullImageUrl = imageUrl;
            
            // Handle Supabase URLs (full URLs) and legacy local paths
            if (imageUrl && !imageUrl.startsWith('http')) {
              fullImageUrl = `${process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000'}/uploads/${imageUrl}`;
            }
            
            return (
              <Image
                source={{ uri: fullImageUrl }}
                style={styles.thumbnail}
              />
            );
          })()}

          <View style={styles.levelsRow}>
            <Text style={styles.levelText}>Water: {getLevelDescription(item.water_level, 'water')}</Text>
            <Text style={styles.levelText}>Silt: {getLevelDescription(item.silt_level, 'silt')}</Text>
            <Text style={styles.levelText}>Debris: {getLevelDescription(item.debris_level, 'debris')}</Text>
          </View>

          {item.remarks && (
            <Text variant="bodySmall" style={styles.remarks} numberOfLines={2}>{item.remarks}</Text>
          )}
        </Card.Content>
      </Card>
    );
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#74A5A8" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={reports}
        renderItem={renderReport}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#74A5A8']} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text variant="titleLarge" style={styles.listTitle}>My Reports ({reports.length})</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyLarge" style={{ color: '#999' }}>No reports found</Text>
            <Button mode="contained" onPress={() => router.push('/(tabs)/camera')} style={{ marginTop: 12 }} buttonColor="#74A5A8">
              Create a Report
            </Button>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#E0EBE2',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  listTitle: { 
    fontWeight: 'bold', 
    color: '#333', 
    fontSize: 20 
  },
  filterContainer: { 
    padding: 12, 
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  list: { padding: 12 },
  card: { 
    marginBottom: 12, 
    backgroundColor: 'rgba(255,255,255,0.7)', 
    borderRadius: 16, 
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  title: { fontWeight: 'bold', color: '#333', fontSize: 15 },
  date: { color: '#666', marginTop: 3 },
  thumbnail: { 
    width: '100%', 
    height: 120, 
    borderRadius: 12, 
    marginBottom: 10, 
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  levelsRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  levelText: { 
    fontSize: 12, 
    color: '#666', 
    fontWeight: '500',
    backgroundColor: 'rgba(116,165,168,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  remarks: { color: '#555', marginTop: 8, fontStyle: 'italic' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
});
