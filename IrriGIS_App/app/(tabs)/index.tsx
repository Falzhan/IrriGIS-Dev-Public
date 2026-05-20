// app/(tabs)/index.tsx

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  StyleSheet, View, ScrollView, RefreshControl,
  TouchableOpacity, Image, Alert, Animated, Text as RNText,
  Modal, FlatList, TouchableWithoutFeedback,
} from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSession } from '../../context/ctx';
import { useOfflineData } from '../../hooks/useOfflineSync';
import { getPendingReports, deletePendingReport } from '../../services/offlineStorage';
import Ionicons from '@expo/vector-icons/Ionicons';

// ─── Constants ────────────────────────────────────────────────────────────────
const AVATAR_SIZE    = 46;
const BASE_URL       = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';
const IMG_WIDTH      = 120;

// ─── Level / urgency helpers ──────────────────────────────────────────────────
const LEVEL_VALUES: Record<string, number> = {
  dry: 1, low: 2, normal: 3, high: 4, overflow: 5,
  clean: 1, light: 2, dirty: 4, heavily_silted: 5,
  clear: 1, heavy: 4, blocked: 5,
};
// Used for Draft card water level display
const WATER_INT_TO_STR = ['', 'dry', 'low', 'normal', 'high', 'overflow'];
const lv = (l: string) => LEVEL_VALUES[l] ?? 3;

type Urgency = 'critical' | 'moderate' | 'low';
const getUrgency = (r: any): Urgency => {
  const wv = lv(r.water_level), sv = lv(r.silt_level), dv = lv(r.debris_level);

  // 1. Immediate Critical — Water 1 & 5, or Silt/Debris fully blocked (5)
  if (wv === 1 || wv === 5 || sv === 5 || dv === 5) {
    return 'critical';
  }

  // 2. Moderate — Water 2 & 4, Silt 4, Debris 4
  if (dv === 4 || sv === 4 || wv === 4 || wv === 2) {
    return 'moderate';
  }

  // 3. Low — everything else
  return 'low';
};
const URGENCY: Record<Urgency, { color: string; label: string }> = {
  critical: { color: '#EF5350', label: 'Critical' },
  moderate: { color: '#FFA726', label: 'Moderate' },
  low:      { color: '#66BB6A', label: 'Low' },
};

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS: Record<string, { color: string; label: string }> = {
  pending:     { color: '#9E9E9E', label: 'Pending' },
  in_progress: { color: '#8BC34A', label: 'In Progress' },
  closed:      { color: '#4CAF50', label: 'Closed' },
  rejected:    { color: '#EF5350', label: 'Rejected' },
  no_ticket:   { color: '#9E9E9E', label: 'No Ticket' },
};
const getStatusKey = (ticket: any, report: any) => {
  if (!ticket) return report?.is_valid === false ? 'rejected' : 'no_ticket';
  return ticket.status ?? 'pending';
};

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const PALETTE = ['#74A5A8','#9BB88D','#7BA7BC','#B8A99A','#A8A574','#8FA3B1'];
const avatarColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
};
const getInitials = (name: string) => {
  if (!name?.trim()) return '?';
  const p = name.trim().split(' ');
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
};

// ─── ReportCard ───────────────────────────────────────────────────────────────
const ReportCard = ({
  item,
  isTicket,
  onPress,
}: {
  item: any;
  isTicket: boolean;
  onPress: () => void;
}) => {
  const report = isTicket ? item.Report : item;
  const ticket = isTicket ? item : (item.ticket ?? null);
  if (!report) return null;

  const sub      = report.User ?? report.user;
  const fullName = `${sub?.first_name ?? ''} ${sub?.last_name ?? ''}`.trim() || 'Unknown';
  const sk       = getStatusKey(ticket, report);
  const status   = STATUS[sk] ?? STATUS.no_ticket;
  const isInvalid = report.is_valid === false;
  const category  = report.category ?? '';
  const urgency   = category === 'issue' ? URGENCY[getUrgency(report)] : null;

  // Profile image
  const profileRaw = sub?.profile_image_url ?? '';
  const profileUri = profileRaw
    ? profileRaw.startsWith('http') ? profileRaw : `${BASE_URL}/${profileRaw}`
    : null;
  const bg = avatarColor(fullName);

  // Report thumbnail
  const pri    = report.images?.find((i: any) => i.isPrimary) ?? report.images?.[0];
  const imgRaw = pri?.imageUrl ?? pri?.image_url ?? '';
  const imgUri = imgRaw
    ? imgRaw.startsWith('http') ? imgRaw : `${BASE_URL}/uploads/${imgRaw}`
    : null;

  // Date / time
  const raw     = report.created_at ?? report.createdAt ?? '';
  const d       = raw ? new Date(raw) : null;
  const dateStr = d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const timeStr = d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <View style={styles.wrapper}>
      {/* Header row: username on left, date/time on right */}
      <View style={styles.headerRow}>
        <Text style={styles.username}>{fullName}</Text>
        {d && (
          <Text style={styles.headerDateTime}>
            {dateStr}{'  '}{timeStr}
          </Text>
        )}
      </View>

      {/*
        cardOuter is position:relative so the avatar can be
        positioned absolute at the bottom-left corner.
      */}
      <View style={styles.cardOuter}>

        {/* ── The card ── */}
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.82}>

          {/* LEFT: thumbnail — flush with card edges, clipped by card's borderRadius */}
          <View style={styles.imageCol}>
            {imgUri ? (
              <Image source={{ uri: imgUri }} style={styles.reportImage} resizeMode="cover" />
            ) : (
              <View style={[styles.reportImage, styles.imgPlaceholder]}>
                <Ionicons name="image-outline" size={28} color="#ccc" />
              </View>
            )}

            {/* Invalid overlay */}
            {isInvalid && (
              <View style={StyleSheet.absoluteFill}>
                <View style={styles.invalidOverlay}>
                  <Text style={styles.invalidText}>INVALID</Text>
                </View>
              </View>
            )}

            {/* Urgency badge */}
            {urgency && !isInvalid && (
              <View style={[styles.urgencyBadge, { backgroundColor: urgency.color }]}>
                <Text style={styles.urgencyText}>{urgency.label}</Text>
              </View>
            )}
          </View>

          {/* RIGHT: text info */}
          <View style={styles.infoCol}>
            <Text style={styles.categoryText} numberOfLines={1}>{categoryLabel}</Text>

            {report.remarks ? (
              <Text style={styles.remarksText} numberOfLines={2}>{report.remarks}</Text>
            ) : null}

            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={11} color="#999" style={{ marginTop: 1 }} />
              <Text style={styles.locText} numberOfLines={2}>
                {report.location_name ?? 'Unknown Location'}
              </Text>
            </View>

            {/* Status pill */}
            <View style={[
              styles.statusPill,
              { backgroundColor: status.color + '22', borderColor: status.color + '88' },
            ]}>
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>

        </TouchableOpacity>

        {/* ── Avatar — absolute bottom-left, overlapping card edge ── */}
        <View style={[styles.avatarRing, { backgroundColor: bg }]}>
          {profileUri ? (
            <Image source={{ uri: profileUri }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{getInitials(fullName)}</Text>
          )}
        </View>

      </View>
    </View>
  );
};

// ─── HomeScreen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();
  const params = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<'reports' | 'tickets' | 'me'>(
    (params.tab as 'reports' | 'tickets' | 'me') ?? 'reports'
  );
  const [refreshing, setRefreshing] = useState(false);
  const tabAnim = useState(new Animated.Value(
    params.tab === 'me' ? 2 : params.tab === 'tickets' ? 1 : 0
  ))[0];

  // ─── Month filter ─────────────────────────────────────────────────────────────
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth()); // 0-indexed
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  // ─── Offline drafts (appear at top of Me tab) ─────────────────────────────────
  const [draftItems, setDraftItems] = useState<any[]>([]);

  const loadDrafts = useCallback(async () => {
    try {
      const pending = await getPendingReports();
      setDraftItems(pending);
    } catch (e) {
      console.error('Error loading drafts:', e);
      setDraftItems([]);
    }
  }, []);


  useFocusEffect(
    useCallback(() => {
      loadDrafts();
      return () => {};
    }, [loadDrafts])
  );

  useEffect(() => {
    if (params.tab) {
      setActiveTab(params.tab as 'reports' | 'tickets' | 'me');
    }
  }, [params.tab]);

  const { data: reportsData, loading, error, refetch } = useOfflineData('/reports', { limit: 50 });
  const { data: ticketsData }   = useOfflineData('/tickets',  { limit: 50 });

  const allReports = useMemo(() =>
    reportsData?.data?.reports ??
    (Array.isArray(reportsData?.data) ? reportsData.data :
     Array.isArray(reportsData) ? reportsData : []), [reportsData]);

  const allTickets = useMemo(() =>
    ticketsData?.data?.tickets ?? ticketsData?.tickets ?? [], [ticketsData]);

  const myReports = useMemo(() => {
    const reports = allReports.filter((r: any) => r.user_id === user?.id);
    return reports;
  }, [allReports, user?.id]);

  const myTickets = useMemo(() => {
    const tickets = allTickets.filter((t: any) => {
      const originReport = t.Report;
      return originReport && originReport.user_id === user?.id;
    });
    return tickets;
  }, [allTickets, user?.id]);

  const standaloneReports = useMemo(() =>
    allReports.filter((r: any) => !r.ticket_id), [allReports]);

  const filterActive = filterYear !== now.getFullYear() || filterMonth !== now.getMonth();
  const insets = useSafeAreaInsets();
  const pickerOpenTop = 64 + insets.top; // matches CustomTopBar height on both platforms

  const getFilteredByMonth = useCallback((list: any[]): any[] => {
    return list.filter((item: any) => {
      // Direct report
      const reportDirect = item.category ? item : item.Report;
      if (!reportDirect) return false;
      const raw = reportDirect.created_at ?? reportDirect.createdAt ?? '';
      if (!raw) return false;
      const d = new Date(raw);
      return d.getFullYear() === filterYear && d.getMonth() === filterMonth;
    });
  }, [filterYear, filterMonth]);

  const switchTab = (tab: 'reports' | 'tickets' | 'me') => {
    setActiveTab(tab);
    Animated.timing(tabAnim, {
      toValue: tab === 'reports' ? 0 : tab === 'tickets' ? 1 : 2,
      duration: 210, useNativeDriver: true,
    }).start();
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true); refetch();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refetch]);

  const filteredData = useMemo(() => {
    let data: any[];
    switch (activeTab) {
      case 'reports': data = standaloneReports; break;
      case 'tickets': data = allTickets; break;
      case 'me':      data = [...draftItems, ...myReports.filter((r: any) => !r.ticket_id), ...myTickets]; break;
      default:        data = []; break;
    }
    return getFilteredByMonth(data);
  }, [activeTab, standaloneReports, allTickets, myReports, myTickets, draftItems, getFilteredByMonth]);

  // ─── Delete a draft by its local_id ─────────────────────────────────────────
  const handleDeleteDraft = useCallback(async (draftId: string) => {
    try {
      await deletePendingReport(draftId);
      setDraftItems(prev => prev.filter(d => d.id !== draftId));
    } catch (e) {
      Alert.alert('Error', 'Could not delete draft');
    }
  }, []);

  if (loading && allReports.length === 0)
    return <View style={styles.centered}><ActivityIndicator size="large" color="#74A5A8" /></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.tabBar}>
          {(['reports', 'tickets', 'me'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => switchTab(tab)}
            >
              <Ionicons
                name={tab === 'reports' ? 'document-text' : tab === 'tickets' ? 'ticket' : 'person'}
                size={16}
                color={activeTab === tab ? '#fff' : '#74A5A8'}
              />
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.calendarWrap}>
          <TouchableOpacity
            style={[styles.calendarBtn, filterActive && styles.calendarBtnActive]}
            onPress={() => setShowMonthPicker(prev => !prev)}
          >
            <Ionicons name="calendar-outline" size={20} color="#2a2a2a" />
            <Ionicons name="chevron-down" size={12} color="#999" style={{ marginLeft: -6, marginBottom: 2 }} />
          </TouchableOpacity>
          {filterActive && <View style={styles.filterDot} />}
        </View>
      </View>

      {/* ── Month picker dropdown ── */}
      {showMonthPicker && (
        <Modal
          visible={showMonthPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMonthPicker(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowMonthPicker(false)}>
            <View style={styles.pickerOverlay}>
              <View
                style={[
                  styles.monthPickerCard,
                  Platform.OS === 'web' ? { position: 'fixed', top: pickerOpenTop, right: 16, zIndex: 9999 } : { top: pickerOpenTop, right: 16 },
                ]}
              >
                {/* Year navigator */}
                <View style={styles.monthPickerHeader}>
                  <TouchableOpacity
                    onPress={() => setFilterYear(y => y - 1)}
                    style={styles.yrNavBtn}
                  >
                    <Ionicons name="chevron-back" size={22} color="#2a2a2a" />
                  </TouchableOpacity>
                  <Text style={styles.yrLabel}>{filterYear}</Text>
                  <TouchableOpacity
                    onPress={() => setFilterYear(y => y + 1)}
                    style={styles.yrNavBtn}
                  >
                    <Ionicons name="chevron-forward" size={22} color="#2a2a2a" />
                  </TouchableOpacity>
                </View>

                {/* Month grid */}
                <FlatList
                  data={monthNames}
                  keyExtractor={(_, i) => i.toString()}
                  numColumns={4}
                  contentContainerStyle={styles.monthGrid}
                  columnWrapperStyle={styles.monthRow}
                  renderItem={({ item, index }) => {
                    return (
                      <TouchableOpacity
                        style={[
                          styles.monthCell,
                          filterYear === now.getFullYear() && index === now.getMonth()
                            ? styles.monthCellNow
                            : index === filterMonth
                              ? styles.monthCellSelected
                              : null,
                        ]}
                        onPress={() => {
                          setFilterYear(filterYear);
                          setFilterMonth(index);
                          setShowMonthPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.monthCellText,
                            filterYear === now.getFullYear() && index === now.getMonth()
                              ? styles.monthCellTextNow
                              : index === filterMonth
                                ? styles.monthCellTextSelected
                                : null,
                          ]}
                          numberOfLines={1}
                        >
                          {item.substring(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />

                {/* Quick actions */}
                <View style={styles.monthPickerActions}>
                  <TouchableOpacity
                    style={styles.thisMonthBtn}
                    onPress={() => {
                      setFilterYear(now.getFullYear());
                      setFilterMonth(now.getMonth());
                      setShowMonthPicker(false);
                    }}
                  >
                    <Text style={styles.thisMonthText}>This Month</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}


      {error && !filteredData.length
        ? <View style={styles.errorBanner}>
            <Text style={styles.errorText}>Unable to load. Showing cached content.</Text>
          </View>
        : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#74A5A8']} />
        }
      >
        {filteredData.length > 0
          ? filteredData.map((item: any, idx: number) => {
              // ── Pending offline draft ──────────────────────────────────────────
              const isDraft = typeof item?.id === 'string' && item.id.startsWith('local_');
              if (isDraft) {
                const draftId = item.id;
                const draftRemarks = item.remarks || '';
                const levelLabel =
                  (typeof item.water_level === 'number' ? WATER_INT_TO_STR[item.water_level] : item.water_level)
                  || 'Normal';
                const catLabel = item.category
                  ? item.category.charAt(0).toUpperCase() + item.category.slice(1)
                  : 'Draft';
                // Use first image if stored locally
                const localUri = Array.isArray(item.images) ? item.images[0] : item.images;
                const created = item.createdAt
                  ? new Date(item.createdAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                  : 'Unknown date';

                return (
                  <View key={draftId} style={styles.draftCardWrapper}>
                    {/* Delete button — absolute top-right as a child of draftCardWrapper so it overlays the View */}
                    <TouchableOpacity
                      style={styles.draftDeleteBtn}
                      activeOpacity={0.7}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteDraft(draftId);
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF5350" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.draftCard}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/(tabs)/camera?draft=${encodeURIComponent(draftId)}` as any)}
                    >
                      {/* Thumbnail */}
                      <View style={styles.draftImgCol}>
                        {localUri ? (
                          <Image source={{ uri: localUri as string }} style={styles.reportImage} resizeMode="cover" />
                        ) : (
                          <View style={[styles.reportImage, styles.imgPlaceholder]}>
                            <Ionicons name="camera-outline" size={28} color="#bbb" />
                          </View>
                        )}
                        {/* DRAFT badge */}
                        <View style={styles.draftBadge}>
                          <Text style={styles.draftBadgeText}>DRAFT</Text>
                        </View>
                      </View>

                      {/* Info */}
                      <View style={styles.infoCol}>
                        <Text style={[styles.categoryText, styles.draftCategoryText]}>{catLabel}</Text>
                        <Text style={styles.remarksText} numberOfLines={2}>{draftRemarks || 'No remarks'}</Text>
                        <RNText style={styles.draftMeta}>
                          {levelLabel} · saved {created}
                        </RNText>
                        <View style={styles.draftStatusPill}>
                          <View style={[styles.statusDot, { backgroundColor: '#999' }]} />
                          <Text style={[styles.statusLabel, { color: '#999' }]}>Draft</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              }

              // ── Server-backed report or ticket ──────────────────────────────────
              const isTicket = activeTab === 'tickets' || (activeTab === 'me' && !!item.Report);
              const report   = isTicket ? item.Report : item;
              const ticket   = isTicket ? item : (item.ticket ?? null);

              return (
                <ReportCard
                  key={item.id ?? idx}
                  item={item}
                  isTicket={isTicket}
                  onPress={() => {
                    if (isTicket && item?.id) {
                      router.push(`/(tabs)/ticket/${item.id}` as any);
                    } else if (report?.id) {
                      router.push(`/(tabs)/report/${report.id}` as any);
                    } else if (!ticket) {
                      Alert.alert(
                        report?.is_valid === false ? 'Report Rejected' : 'Report Pending',
                        report?.is_valid === false
                          ? 'This report has been marked as invalid.'
                          : 'This report is under review…',
                        [{ text: 'OK' }],
                      );
                    }
                  }}
                />
              );
            })
          : (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={52} color="#c4d6c6" />
              <Text style={styles.emptyText}>
                No {activeTab === 'reports' ? 'reports' : activeTab === 'tickets' ? 'tickets' : 'items'} found
              </Text>
              <Button
                mode="contained"
                onPress={() => router.push('/(tabs)/camera')}
                buttonColor="#74A5A8"
                style={{ marginTop: 18, borderRadius: 14 }}
              >
                Create New Report
              </Button>
            </View>
          )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: '#E0EBE2' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:   { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 110,
  },

  // ── Header row: tabs (left) + calendar (right) ─
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
  },

  // ── Tab bar (fills available space) ─────────────
  tabBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  tabActive:     { backgroundColor: '#74A5A8' },
  tabText:       { color: '#74A5A8', fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#fff' },

  // ── Error banner ──────────────────────────────────
  errorBanner: {
    backgroundColor: '#FFF3CD',
    paddingVertical: 7,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 10,
  },
  errorText: { color: '#856404', fontSize: 12, textAlign: 'center' },

  // ── Card wrapper ──────────────────────────────────
  wrapper: {
    // Extra bottom margin = avatar overlap below card (so next card's username
    // doesn't sit on top of the avatar)
    marginBottom: Math.round(AVATAR_SIZE * 0.5) + 14,
  },

  // ── Header row (username + date/time) ───────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    paddingHorizontal: 4,
  },

  username: {
    fontWeight: '700',
    fontSize: 13,
    color: '#2a2a2a',
  },

  headerDateTime: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },

  // position:relative so avatar absolute coords are relative to this
  cardOuter: {
    position: 'relative',
  },

  // ── Card ─────────────────────────────────────────
  card: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    overflow: 'hidden',       // ← this is what clips the image to the rounded corners
    height: 125,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 5,
  },

  // ── Left image column — fully flush, no padding ──
  imageCol: {
    width: IMG_WIDTH,
    height: 125,
    position: 'relative',
  },
  reportImage: {
    width: IMG_WIDTH,
    height: 125,
  },
  imgPlaceholder: {
    backgroundColor: '#eef2ef',
    justifyContent: 'center',
    alignItems: 'center',
  },

  invalidOverlay: {
    flex: 1,
    backgroundColor: 'rgba(239,83,80,0.60)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invalidText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.3,
  },

  urgencyBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  urgencyText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── Right info column ─────────────────────────────
  infoCol: {
    flex: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 2,
  },
  categoryText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  remarksText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 16,
    marginTop: 1,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
    marginTop: 4,
  },
  locText: {
    fontSize: 11,
    color: '#777',
    flex: 1,
    lineHeight: 15,
  },
  dateText: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },

  // ── Status pill ───────────────────────────────────
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 7,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Draft card ────────────────────────────────────
  draftCardWrapper: {
    marginBottom: Math.round(AVATAR_SIZE * 0.5) + 14,
  },
  draftCard: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 22,
    overflow: 'hidden',
    height: 125,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    // Dimmed to indicate not yet submitted
    opacity: 0.82,
  },
  draftImgCol: {
    width: IMG_WIDTH,
    height: 125,
    position: 'relative',
  },
  draftBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#999',
  },
  draftBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  draftCategoryText: {
    color: '#999',
  },
  draftCardOuter: {
    position: 'relative',
  },
  draftDeleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  draftMeta: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 2,
  },
  draftStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },

  // ── Avatar — absolute, bottom-left of card ────────
  avatarRing: {
    position: 'absolute',
    // Sit at the bottom of the card, partially overlapping downward
    bottom: -(Math.round(AVATAR_SIZE * 0.45)),
    left: 10,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    // Matches screen background so it looks like the avatar is floating
    borderWidth: 2.5,
    borderColor: '#E0EBE2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },

  // ── Empty state ───────────────────────────────────
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#c4d6c6',
    marginTop: 16,
  },
  emptyText: {
    color: '#aaa',
    fontSize: 15,
    marginTop: 14,
  },

  // ── Calendar button & indicator ───────────────────
  calendarBtn: {
    width: 38,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 19,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1.2,
    borderColor: 'rgba(116,165,168,0.35)',
  },
  calendarBtnActive: {
    backgroundColor: 'rgba(116,165,168,0.18)',
    borderColor: '#74A5A8',
  },
  calendarWrap: {
    position: 'relative',
  },
  filterDot: {
    position: 'absolute',
    top: 1,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#74A5A8',
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  // ── Month picker drop-down ───────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.00)',
  },
  monthPickerCard: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: 64,
    right: 16,
    width: 296,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 14,
  },
  monthPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  yrLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  yrNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(116,165,168,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthGrid: { paddingHorizontal: 2 },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  monthCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(116,165,168,0.10)',
  },
  monthCellNow: {
    backgroundColor: '#74A5A8',
  },
  monthCellSelected: {
    backgroundColor: '#9BBBD0',
  },
  monthCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2a2a2a',
  },
  monthCellTextNow: {
    color: '#fff',
    fontWeight: '700',
  },
  monthCellTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  monthPickerActions: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  thisMonthBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(116,165,168,0.15)',
  },
  thisMonthText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#74A5A8',
  },
});