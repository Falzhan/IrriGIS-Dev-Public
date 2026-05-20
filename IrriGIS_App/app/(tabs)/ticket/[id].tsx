// app/(tabs)/ticket/[id].tsx
import { useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, Image, Alert, RefreshControl, Dimensions, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, TextInput, ActivityIndicator, Divider, Avatar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getTicketById, getTicketComments, getSubStatusesForTicket } from '../../../services/api';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
import DetailTopBar from '../../../components/DetailTopBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000';

const LEVEL_VALUES: Record<string, number> = {
  dry: 1, low: 2, normal: 3, high: 4, overflow: 5,
  clean: 1, light: 2, dirty: 4, heavily_silted: 5,
  clear: 1, heavy: 4, blocked: 5,
};

const lv = (l: string) => LEVEL_VALUES[l] ?? 3;

const LEVEL_DESCRIPTIONS: Record<string, Record<string, string>> = {
  water: { dry: 'No water', low: 'Minimal water', normal: 'Adequate water', high: 'Above normal', overflow: 'Flooding' },
  silt: { clean: 'No silt · Clean', light: 'Light silt', dirty: 'Heavy silt', heavily_silted: 'Fully silted' },
  debris: { clear: 'No obstruction · Clear', light: 'Minor debris', heavy: 'Heavy debris', blocked: 'Fully blocked' },
};

const WATER_NUM_TO_SLUG = ['', 'dry', 'low', 'normal', 'high', 'overflow'];
const SILT_NUM_TO_SLUG = ['', 'clean', 'light', 'normal', 'dirty', 'heavily_silted'];
const DEBRIS_NUM_TO_SLUG = ['', 'clear', 'light', 'normal', 'heavy', 'blocked'];

const getLevelDesc = (type: 'water' | 'silt' | 'debris', num: number): string => {
  const slugMap = type === 'water' ? WATER_NUM_TO_SLUG : type === 'silt' ? SILT_NUM_TO_SLUG : DEBRIS_NUM_TO_SLUG;
  const slug = slugMap[num] || 'normal';
  return LEVEL_DESCRIPTIONS[type][slug] || 'Moderate silt';
};

const levelColors: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' },
  2: { bg: '#FEF9C3', text: '#854D0E', border: '#FDE68A' },
  3: { bg: '#FEF08A', text: '#854D0E', border: '#FDE68A' },
  4: { bg: '#FED7AA', text: '#9A3412', border: '#FDBA74' },
  5: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
};

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: '#5DADE2', bg: '#EBF5FB', label: 'Pending' },
  in_progress: { color: '#F59E0B', bg: '#FFFBEB', label: 'In Progress' },
  closed: { color: '#10B981', bg: '#ECFDF5', label: 'Closed' },
  rejected: { color: '#EF4444', bg: '#FEF2F2', label: 'Rejected' },
};

const categoryColors: Record<string, { bg: string; text: string }> = {
  inspection: { bg: '#DBEAFE', text: '#1E40AF' },
  maintenance: { bg: '#FEF3C7', text: '#92400E' },
  cleaning: { bg: '#CFFAFE', text: '#0E7490' },
  issue: { bg: '#FEE2E2', text: '#991B1B' },
  other: { bg: '#F3F4F6', text: '#374151' },
};

function WorkflowStepper({ status }: { status: string }) {
  const steps = ['pending', 'in_progress', 'closed'];
  const currentIdx = steps.indexOf(status);
  const isRejected = status === 'rejected';

  if (isRejected) {
    return (
      <View style={styles.rejectedContainer}>
        <View style={styles.rejectedIcon}>
          <Ionicons name="close-circle" size={40} color="#EF4444" />
        </View>
        <Text style={styles.rejectedText}>Rejected / Invalid</Text>
      </View>
    );
  }

  return (
    <View style={styles.stepperContainer}>
      <View style={styles.stepperTrack}>
        <View style={[styles.stepperProgress, { width: currentIdx === 0 ? '0%' : currentIdx === 1 ? '50%' : '100%' }]} />
      </View>
      <View style={styles.stepperSteps}>
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIdx;
          const isActive = idx === currentIdx;
          const config = statusConfig[step];
          return (
            <View key={step} style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                isCompleted && { backgroundColor: config.color, borderColor: config.color },
                isActive && { borderColor: config.color, backgroundColor: '#fff' },
                !isCompleted && !isActive && { borderColor: '#D1D5DB', backgroundColor: '#F3F4F6' },
              ]}>
                {isCompleted ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : (
                  <Ionicons name="remove" size={16} color={isActive ? config.color : '#9CA3AF'} />
                )}
              </View>
              <Text style={[
                styles.stepLabel,
                isActive && { color: config.color, fontWeight: '700' },
                isCompleted && { color: '#374151' },
                !isActive && !isCompleted && { color: '#9CA3AF' },
              ]}>
                {config.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SubStatusTimeline({ workflowSteps, subStatuses, currentSubStatus }: { 
  workflowSteps: any[]; 
  subStatuses: any[];
  currentSubStatus: any;
}) {
  // Get color for a sub-status
  const getSubStatusColor = (subStatusId: string) => {
    const subStatus = subStatuses.find(s => s.id === subStatusId);
    return subStatus?.color || '#74A5A8';
  };
  
  // If no workflow steps but there's a current sub-status, show it
  const showCurrentStatus = currentSubStatus && (!workflowSteps || workflowSteps.length === 0);
  
  if (!workflowSteps || workflowSteps.length === 0) {
    return (
      <View style={styles.emptyTimeline}>
        <Ionicons name="time-outline" size={24} color="#9CA3AF" />
        <Text style={styles.emptyTimelineText}>No progress updates yet</Text>
        {currentSubStatus && (
          <View style={[styles.currentSubStatusBadge, { backgroundColor: (currentSubStatus.color || '#74A5A8') + '20' }]}>
            <View style={[styles.currentSubStatusDot, { backgroundColor: currentSubStatus.color || '#74A5A8' }]} />
            <Text style={[styles.currentSubStatusText, { color: currentSubStatus.color || '#74A5A8' }]}>
              Current: {currentSubStatus.name || 'In Progress'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.timelineContainer}>
      <View style={styles.timelineLine} />
      {workflowSteps.map((step, idx) => {
        const stepColor = step.color || getSubStatusColor(step.sub_status_id);
        return (
          <View key={idx} style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: stepColor }]} />
            <View style={styles.timelineContent}>
              <View style={styles.timelineHeader}>
                <View style={styles.timelineTitleRow}>
                  <View style={[styles.timelineColorDot, { backgroundColor: stepColor }]} />
                  <Text style={styles.timelineTitle}>{step.sub_status_name || 'Progress Update'}</Text>
                </View>
                <Text style={styles.timelineDate}>
                  {step.created_at ? new Date(step.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  }) : ''}
                </Text>
              </View>
              {step.comment && <Text style={styles.timelineComment}>{step.comment}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ReportCarousel({ reports, currentIndex, onPrev, onNext }: { 
  reports: any[]; 
  currentIndex: number; 
  onPrev: () => void;
  onNext: () => void;
}) {
  const report = reports[currentIndex];
  if (!report) return null;

  const images = report.ReportImages || report.images || [];
  const primaryImage = images.find((img: any) => img.isPrimary) || images[0];
  
  const getImageUrl = (img: any) => {
    const url = img?.imageUrl || img?.image_url || img?.filename || '';
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${BASE_URL}/uploads/${url}`;
  };

  const imageUrl = getImageUrl(primaryImage);
  const submitter = report.User ? `${report.User.first_name || ''} ${report.User.last_name || ''}`.trim() : 'Unknown';
  const locationName = report.location_name || report.IrrigatorAssociation?.name || 'Unknown Location';
  const coords = report.location?.coordinates;
  
  const waterNum = lv(report.water_level);
  const siltNum = lv(report.silt_level);
  const debrisNum = lv(report.debris_level);

  const catConfig = categoryColors[report.category] || categoryColors.other;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <View style={styles.carouselContainer}>
      {/* Navigation Arrows */}
      {reports.length > 1 && (
        <View style={styles.carouselNav}>
          <Button mode="text" onPress={onPrev} disabled={currentIndex === 0} compact>
            <Ionicons name="chevron-back" size={24} color={currentIndex === 0 ? '#D1D5DB' : '#74A5A8'} />
          </Button>
          <Text style={styles.carouselIndicator}>
            Report {currentIndex + 1}/{reports.length}
          </Text>
          <Button mode="text" onPress={onNext} disabled={currentIndex === reports.length - 1} compact>
            <Ionicons name="chevron-forward" size={24} color={currentIndex === reports.length - 1 ? '#D1D5DB' : '#74A5A8'} />
          </Button>
        </View>
      )}

      {/* Image Section */}
      {images.length > 0 && (
        <View style={styles.imageSection}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.noImagePlaceholder]}>
              <Ionicons name="image-outline" size={48} color="#9CA3AF" />
            </View>
          )}
          {images.length > 1 && (
            <View style={styles.imageCountBadge}>
              <Ionicons name="images" size={12} color="#fff" />
              <Text style={styles.imageCountText}>{images.length}</Text>
            </View>
          )}
        </View>
      )}

      {/* Report Info */}
      <View style={styles.reportInfoCard}>
        {/* Header */}
        <View style={styles.reportHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: catConfig.bg }]}>
            <Text style={[styles.categoryText, { color: catConfig.text }]}>
              {(report.category || 'other').charAt(0).toUpperCase() + (report.category || 'other').slice(1)}
            </Text>
          </View>
          {currentIndex === 0 && reports.length > 1 && (
            <View style={styles.originBadge}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.originText}>Origin</Text>
            </View>
          )}
        </View>

        {/* Location & Coordinates */}
        <View style={styles.locationRow}>
          <Ionicons name="location" size={18} color="#74A5A8" />
          <Text style={styles.locationText}>{locationName}</Text>
        </View>
        {coords && coords.length === 2 && (
          <Text style={styles.coordText}>{coords[1].toFixed(4)}, {coords[0].toFixed(4)}</Text>
        )}

        <Divider style={styles.divider} />

        {/* Submitter & Date */}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Submitter</Text>
            <Text style={styles.infoValue}>{submitter}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{formatDate(report.created_at || report.createdAt)}</Text>
          </View>
        </View>

        <Divider style={styles.divider} />

        {/* Condition Assessment */}
        <Text style={styles.sectionTitle}>Condition Assessment</Text>
        <View style={styles.conditionRow}>
          <View style={[styles.conditionCard, { backgroundColor: levelColors[waterNum].bg, borderColor: levelColors[waterNum].border }]}>
            <Ionicons name="water" size={18} color={levelColors[waterNum].text} />
            <Text style={[styles.conditionLabel, { color: levelColors[waterNum].text }]}>Water</Text>
            <Text style={[styles.conditionValue, { color: levelColors[waterNum].text }]}>{getLevelDesc('water', waterNum)}</Text>
            <Text style={[styles.conditionNum, { color: levelColors[waterNum].text }]}>{waterNum}/5</Text>
          </View>
          <View style={[styles.conditionCard, { backgroundColor: levelColors[siltNum].bg, borderColor: levelColors[siltNum].border }]}>
            <Ionicons name="layers" size={18} color={levelColors[siltNum].text} />
            <Text style={[styles.conditionLabel, { color: levelColors[siltNum].text }]}>Silt</Text>
            <Text style={[styles.conditionValue, { color: levelColors[siltNum].text }]}>{getLevelDesc('silt', siltNum)}</Text>
            <Text style={[styles.conditionNum, { color: levelColors[siltNum].text }]}>{siltNum}/5</Text>
          </View>
          <View style={[styles.conditionCard, { backgroundColor: levelColors[debrisNum].bg, borderColor: levelColors[debrisNum].border }]}>
            <Ionicons name="trash" size={18} color={levelColors[debrisNum].text} />
            <Text style={[styles.conditionLabel, { color: levelColors[debrisNum].text }]}>Debris</Text>
            <Text style={[styles.conditionValue, { color: levelColors[debrisNum].text }]}>{getLevelDesc('debris', debrisNum)}</Text>
            <Text style={[styles.conditionNum, { color: levelColors[debrisNum].text }]}>{debrisNum}/5</Text>
          </View>
        </View>

        {/* Remarks */}
        {report.remarks && (
          <>
            <Divider style={styles.divider} />
            <Text style={styles.sectionTitle}>Remarks</Text>
            <View style={styles.remarksBox}>
              <Text style={styles.remarksText}>{report.remarks}</Text>
            </View>
          </>
        )}

        {/* Mini Map (OpenStreetMap) */}
        {coords && coords.length === 2 && (
          <>
            <Divider style={styles.divider} />
            <Text style={styles.sectionTitle}>Location</Text>
            <View style={styles.mapContainer}>
              <WebView
                source={{
                  html: `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body{margin:0;padding:0;height:100%;width:100%}#map{height:100%;width:100%}</style>
</head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map').setView([${coords[1]},${coords[0]}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);
var pin=L.icon({iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',iconAnchor:[12,41],popupAnchor:[0,-41]});
L.marker([${coords[1]},${coords[0]}],{icon:pin}).addTo(map)
  .bindPopup('${locationName}').openPopup();
</script></body></html>`,
                }}
                style={styles.map}
                javaScriptEnabled
                domStorageEnabled
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export default function TicketDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [currentReportIndex, setCurrentReportIndex] = useState(0);
  const [subStatuses, setSubStatuses] = useState<any[]>([]);
  const [currentSubStatus, setCurrentSubStatus] = useState<any>(null);

  const insets = useSafeAreaInsets();

  const fetchTicket = async () => {
    try {
      const [ticketRes, commentsRes, subStatusRes] = await Promise.all([
        getTicketById(id as string),
        getTicketComments(id as string).catch(() => ({ data: [] })),
        getSubStatusesForTicket(id as string).catch(() => ({ data: [] })),
      ]);
      
      const ticketData = ticketRes.data?.data || ticketRes.data;
      setTicket(ticketData);
      setComments(Array.isArray(commentsRes.data) ? commentsRes.data : commentsRes.data?.data || []);
      
      // Get available sub-statuses
      const availableSubStatuses = subStatusRes.data?.data || subStatusRes.data || [];
      setSubStatuses(availableSubStatuses);
      
      // Get workflow steps from ticket
      const steps = ticketData?.workflow_steps || [];
      setWorkflowSteps(steps);
      
      // Get current sub-status from ticket
      const ticketSubStatus = ticketData?.subStatus || ticketData?.SubStatus || null;
      setCurrentSubStatus(ticketSubStatus);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTicket();
  };

  const sendComment = async () => {
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      const { addTicketComment } = await import('../../../services/api');
      await addTicketComment(id as string, commentText);
      setCommentText('');
      await fetchTicket();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send comment');
    } finally {
      setCommentLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const goPrevReport = () => {
    if (currentReportIndex > 0) setCurrentReportIndex(prev => prev - 1);
  };

  const goNextReport = () => {
    const reports = ticket?.Reports || ticket?.reports || [];
    if (currentReportIndex < reports.length - 1) setCurrentReportIndex(prev => prev + 1);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#74A5A8" /></View>;
  }

  if (!ticket) {
    return (
      <View style={styles.centered}>
        <Text>Ticket not found</Text>
        <Button mode="contained" onPress={() => router.back()} style={{ marginTop: 16 }}>Go Back</Button>
      </View>
    );
  }

  const reports = ticket.Reports || ticket.reports || [];
  const statusConfigData = statusConfig[ticket.status] || statusConfig.pending;
  const isInProgress = ticket.status === 'in_progress';

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#74A5A8']} />} contentContainerStyle={{ paddingBottom: 85 + insets.bottom }}>
      {/* Custom Top Bar */}
      <DetailTopBar title="Ticket Details" subtitle={`#${ticket.id?.slice(0, 8)}`} />

      {/* Ticket Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.sectionRow}>
          <View style={[styles.categoryBadge, { backgroundColor: statusConfigData.bg + '30' }]}>
            <Text style={[styles.categoryBadgeText, { color: statusConfigData.color }]}>
              {statusConfigData.label}
            </Text>
          </View>
          {reports.length > 1 && (
            <View style={styles.reportCountBadge}>
              <Text style={styles.reportCountText}>{reports.length} reports</Text>
            </View>
          )}
        </View>

        {/* Ticket ID */}
        <View style={styles.ticketIdRow}>
          <Ionicons name="ticket" size={18} color="#74A5A8" />
          <Text style={styles.ticketId}>#{ticket.id?.slice(0, 8)}</Text>
        </View>

        {/* Timestamps */}
        {(ticket.acknowledged_at || ticket.resolved_at) && (
          <View style={styles.timestampsRow}>
            {ticket.acknowledged_at && (
              <View style={styles.timestampItem}>
                <Ionicons name="checkmark-circle" size={14} color="#F59E0B" />
                <Text style={styles.timestampLabel}>Acknowledged:</Text>
                <Text style={styles.timestampValue}>{formatDate(ticket.acknowledged_at)}</Text>
              </View>
            )}
            {ticket.resolved_at && (
              <View style={styles.timestampItem}>
                <Ionicons name="checkmark-done" size={14} color="#10B981" />
                <Text style={styles.timestampLabel}>Resolved:</Text>
                <Text style={styles.timestampValue}>{formatDate(ticket.resolved_at)}</Text>
              </View>
            )}
          </View>
        )}

        <Divider style={styles.divider} />

        {/* Meta Grid */}
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={18} color="#74A5A8" />
            <View style={styles.metaItemContent}>
              <Text style={styles.metaLabel}>Created</Text>
              <Text style={styles.metaValue}>{formatDate(ticket.created_at || ticket.createdAt)}</Text>
            </View>
          </View>
          {ticket.acknowledged_at && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={18} color="#74A5A8" />
              <View style={styles.metaItemContent}>
                <Text style={styles.metaLabel}>Acknowledged</Text>
                <Text style={styles.metaValue}>{formatDate(ticket.acknowledged_at)}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Reports Carousel */}
      {reports.length > 0 && (
        <ReportCarousel
          reports={reports}
          currentIndex={currentReportIndex}
          onPrev={goPrevReport}
          onNext={goNextReport}
        />
      )}

      {/* Workflow Progress Card */}
      <View style={styles.workflowCard}>
        <Text style={styles.cardTitle}>Workflow Progress</Text>

        <WorkflowStepper status={ticket.status} />

        {isInProgress && (
          <>
            <Divider style={styles.workflowDivider} />
            {currentSubStatus && (
              <View style={styles.currentSubStatusContainer}>
                <Text style={styles.subStatusLabel}>Current Sub-Status</Text>
                <View style={[styles.currentSubStatusBadgeLarge, { backgroundColor: (currentSubStatus.color || '#74A5A8') + '20' }]}>
                  <View style={[styles.currentSubStatusDotLarge, { backgroundColor: currentSubStatus.color || '#74A5A8' }]} />
                  <Text style={[styles.currentSubStatusTextLarge, { color: currentSubStatus.color || '#74A5A8' }]}>
                    {currentSubStatus.name || 'In Progress'}
                  </Text>
                </View>
              </View>
            )}
            <Text style={styles.subStatusTitle}>Sub-Status Progress</Text>
            <SubStatusTimeline workflowSteps={workflowSteps} subStatuses={subStatuses} currentSubStatus={currentSubStatus} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E0EBE2',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0EBE2',
  },
  infoCard: {
    margin: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
  reportCountBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  reportCountText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  ticketIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  ticketId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    fontFamily: 'monospace',
  },
  timestampsRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  timestampItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestampLabel: {
    fontSize: 11,
    color: '#888',
  },
  timestampValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  divider: {
    marginVertical: 14,
    backgroundColor: 'rgba(116,165,168,0.2)',
  },
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
    marginBottom: 10,
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  carouselContainer: {
    marginHorizontal: 12,
    marginBottom: 8,
  },
  carouselNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  carouselIndicator: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  imageSection: {
    position: 'relative',
    height: 220,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  noImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#374151',
  },
  imageCountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  imageCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  reportInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  originBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  originText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  locationText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  coordText: {
    fontSize: 11,
    color: '#888',
    marginBottom: 12,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  conditionCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  conditionLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  conditionValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  conditionNum: {
    fontSize: 10,
    opacity: 0.8,
  },
  remarksBox: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  remarksText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  mapContainer: {
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  workflowCard: {
    margin: 12,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  stepperContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stepperTrack: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginBottom: 16,
    position: 'relative',
  },
  stepperProgress: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#F59E0B',
    borderRadius: 2,
    left: 0,
  },
  stepperSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
    width: '33%',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  workflowDivider: {
    marginVertical: 16,
    backgroundColor: 'rgba(116,165,168,0.2)',
  },
  subStatusTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  emptyTimeline: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  emptyTimelineText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  timelineContainer: {
    position: 'relative',
    paddingLeft: 20,
  },
  timelineLine: {
    position: 'absolute',
    left: 7,
    top: 8,
    bottom: 8,
    width: 2,
    backgroundColor: '#E5E7EB',
    borderRadius: 1,
  },
  timelineItem: {
    position: 'relative',
    paddingBottom: 16,
  },
  timelineDot: {
    position: 'absolute',
    left: -16,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#74A5A8',
    borderWidth: 2,
    borderColor: '#fff',
  },
  timelineContent: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  timelineDate: {
    fontSize: 10,
    color: '#888',
  },
  timelineComment: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timelineColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  currentSubStatusContainer: {
    marginBottom: 16,
  },
  subStatusLabel: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 8,
    fontWeight: '600',
  },
  currentSubStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  currentSubStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  currentSubStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  currentSubStatusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 8,
    alignSelf: 'flex-start',
  },
  currentSubStatusDotLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  currentSubStatusTextLarge: {
    fontSize: 14,
    fontWeight: '700',
  },
  commentsCard: {
    margin: 12,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  emptyComments: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 13,
    paddingVertical: 16,
  },
  commentsList: {
    marginBottom: 16,
  },
  commentItem: {
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    marginBottom: 10,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#74A5A8',
  },
  commentDate: {
    fontSize: 10,
    color: '#888',
  },
  commentText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#fff',
  },
  sendButton: {
    borderRadius: 12,
  },
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  readOnlyText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
});