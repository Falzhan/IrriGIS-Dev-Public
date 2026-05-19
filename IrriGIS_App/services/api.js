//services/api.js
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000/api';

let onSessionExpired = null;
export function setSessionExpiredHandler(callback) {
  onSessionExpired = callback;
}

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      SecureStore.deleteItemAsync('auth_token');
      SecureStore.deleteItemAsync('user_data');
      if (onSessionExpired) onSessionExpired();
    }
    const message = error.response?.data?.message ||
                    error.response?.data?.error ||
                    error.message ||
                    'An unexpected error occurred';
    return Promise.reject({ message, status: error.response?.status, data: error.response?.data });
  }
);

export const loginUser = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  if (response.data.token) {
    await SecureStore.setItemAsync('auth_token', response.data.token);
    await SecureStore.setItemAsync('user_data', JSON.stringify(response.data.user));
  }
  return response;
};

export const registerUser = async (userData) => api.post('/auth/register', userData);

export const logoutUser = async () => {
  await SecureStore.deleteItemAsync('auth_token');
  await SecureStore.deleteItemAsync('user_data');
};

export const getUserData = async () => {
  const userStr = await SecureStore.getItemAsync('user_data');
  return userStr ? JSON.parse(userStr) : null;
};

export const getToken = async () => SecureStore.getItemAsync('auth_token');

export const getReports = async (params = {}) => api.get('/reports', { params });

export const getMyReports = async (params = {}) => api.get('/reports', { params: { ...params, my_reports: true } });

export const createReport = async (formData) =>
  api.post('/reports', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

export const updateReport = async (id, formData) =>
  api.put(`/reports/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

export const getReportById = async (id) => api.get(`/reports/${id}`);

export const getTicketsForMap = async () => api.get('/tickets', { params: { limit: 1000 } });

export const getTickets = async (params = {}) => api.get('/tickets', { params });

export const getMyTickets = async (params = {}) => api.get('/tickets', { params: { ...params, my_tickets: true } });

export const getTicketById = async (id) => api.get(`/tickets/${id}`);

export const addTicketComment = async (id, comment) => api.post(`/tickets/${id}/comments`, { comment });

export const getTicketComments = async (id) => api.get(`/tickets/${id}/comments`);

export const getSubStatusesForTicket = async (ticketId) => api.get(`/ticket-sub-statuses/for-ticket?ticket_id=${ticketId}`);

export const getReportsGeoJSON = async (params = {}) => api.get('/gis/reports', { params });

export const getInProgressReportsGeoJSON = async (params = {}) => 
  api.get('/gis/reports', { params: { ...params, status: 'in_progress' } });

export const getGISFeatures = async (params = {}) => api.get('/gis/features', { params });

export const getRISList = async () => api.get('/gis/ris');

export const getIAList = async () => api.get('/gis/ias');

export const getNotifications = async (params = {}) => api.get('/notifications', { params });

export const getUnreadNotificationCount = async () => api.get('/notifications/unread-count');

export const markNotificationAsRead = async (id) => api.put(`/notifications/${id}/read`);

export const markAllNotificationsAsRead = async () => api.put('/notifications/read-all');

export const deleteNotification = async (id) => api.delete(`/notifications/${id}`);

export const getReportPresets = async () => api.get('/report-presets');

export const getPresetsByCategory = async (category) => api.get('/report-presets/by-category', { params: { category } });

export const getPresetCategories = async () => api.get('/report-presets/categories');

export const getUserProfile = async () => api.get('/users/me');

export const getIrrigatorAssociations = async () => api.get('/users/ias');

export const updateUserProfile = async (userId, data, token) => {
  try {
    const response = await fetch(`${API_URL}/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to update profile');
    }
    return result;
  } catch (error) {
    console.error('Update user profile error:', error);
    throw error;
  }
};

export const fetchIAs = async () => {
  try {
    const response = await api.get('/gis/ias');
    return response;
  } catch {
    return { data: [
      { id: 'e393d7ca-b78e-468c-b56c-7dae9fc0510d', name: 'Katangawan Sagana Farmer Irrigators Association', code: 'KASAFIA' }
    ]};
  }
};

export const getNearbyGISFeatures = async (latitude, longitude, radiusMeters = 200) => {
  try {
    console.log(`Fetching GIS features for lat: ${latitude}, lng: ${longitude}, radius: ${radiusMeters}`);
    const response = await api.get('/gis/features', { 
      params: { 
        lat: latitude, 
        lng: longitude, 
        radius: radiusMeters 
      } 
    });
    console.log('GIS features API response:', response);
    return response;
  } catch (error) {
    console.error('Error fetching nearby GIS features:', error);
    console.error('Error response:', error.response);
    console.error('Error status:', error.response?.status);
    console.error('Error data:', error.response?.data);
    return { data: [] };
  }
};

export default api;