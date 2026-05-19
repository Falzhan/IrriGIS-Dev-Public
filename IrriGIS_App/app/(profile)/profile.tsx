// app/(profile)/profile.tsx
import { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, Image } from 'react-native';
import { Text, Button, Avatar, Card, List, Divider, Surface, Modal, Portal, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSession } from '../../context/ctx';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, signIn } = useSession();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    address: '',
  });
  const [newProfileImage, setNewProfileImage] = useState<string | null>(null);

  // Update editForm when user data is available
  useEffect(() => {
    if (user) {
      setEditForm({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        address: user.address || '',
      });
    } else {
      setEditForm({
        first_name: '',
        last_name: '',
        email: '',
        address: '',
      });
    }
  }, [user]);

  const getProfileImageUrl = () => {
    if (user?.profile_image_url) {
      // If it's already a full Supabase URL, return as-is
      if (user.profile_image_url.startsWith('https://')) {
        return user.profile_image_url;
      }
      
      // Legacy local path - redirect to backend which redirects to Supabase
      return `${API_BASE_URL}/users/${user.profile_image_url}`;
    }
    return null;
  };

  const pickProfileImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setNewProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image from gallery');
    }
  };

  const handleEditProfile = () => {
    setEditForm({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      address: user?.address || '',
    });
    setNewProfileImage(null);
    setEditModalVisible(true);
  };

  const saveProfile = async () => {
    try {
      setLoading(true);

      console.log('=== SAVE PROFILE START ===');
      console.log('User object:', user);
      console.log('EditForm object:', editForm);

      // Check if user data is available
      if (!user) {
        throw new Error('User data not available. Please log in again.');
      }

      // Handle profile image upload separately
      if (newProfileImage) {
        console.log('Processing profile image...');
        const uri = newProfileImage;
        console.log('Image URI:', uri);
        const filename = uri.split('/').pop() || 'profile.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        const imageFormData = new FormData();
        imageFormData.append('profileImage', {
          uri,
          name: filename,
          type,
        } as any);
        
        console.log('Uploading profile image...');
        const token = await SecureStore.getItemAsync('auth_token');
        const imageResponse = await fetch(`${API_BASE_URL}/auth/profile-image`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: imageFormData,
        });
        
        if (!imageResponse.ok) {
          const errorData = await imageResponse.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to upload profile image');
        }
        
        const imageResult = await imageResponse.json();
        console.log('Profile image uploaded:', imageResult);
      }

      // Update user profile data (text fields only)
      const safeEditForm = {
        first_name: editForm?.first_name || user?.first_name || '',
        last_name: editForm?.last_name || user?.last_name || '',
        email: editForm?.email || user?.email || '',
        address: editForm?.address || user?.address || '',
      };

      console.log('Safe edit form:', safeEditForm);

      const formData = new FormData();
      console.log('About to append first_name:', safeEditForm.first_name);
      formData.append('first_name', safeEditForm.first_name);
      console.log('About to append last_name:', safeEditForm.last_name);
      formData.append('last_name', safeEditForm.last_name);
      console.log('About to append email:', safeEditForm.email);
      formData.append('email', safeEditForm.email);
      console.log('About to append address:', safeEditForm.address);
      formData.append('address', safeEditForm.address);
      console.log('FormData created successfully');

      console.log('Getting auth token...');
      const token = await SecureStore.getItemAsync('auth_token');
      console.log('Token retrieved, user ID:', user?.id);
      
      const apiUrl = `${API_BASE_URL}/users/${user?.id}`;
      console.log('About to call API:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      console.log('API call completed, response status:', response.status);
      console.log('About to parse JSON response...');

      let result;
      try {
        result = await response.json();
        console.log('Response parsed successfully:', result);
      } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        throw new Error(result?.message || 'Update failed');
      }

      // Update user data in secure store and refresh context
      if (result?.data) {
        await SecureStore.setItemAsync('user_data', JSON.stringify(result.data));
        
        // Trigger a re-render by updating the user context
        // This will refresh the profile image in sidebar and profile page
        const token = await SecureStore.getItemAsync('auth_token');
        if (token) {
          signIn(token, result.data);
        }
        
        Alert.alert('Success', 'Profile updated successfully!');
        setEditModalVisible(false);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const getInitials = () => {
    if (!user) return '?';
    const first = user?.first_name?.[0] || '';
    const last = user?.last_name?.[0] || '';
    return (first + last).toUpperCase();
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'nia_admin': return 'NIA Administrator';
      case 'nia_field_officer': return 'NIA Field Officer';
      case 'ia_admin': return 'IA Administrator';
      case 'ia_member': return 'IA Member';
      default: return role;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header Profile Card */}
        <Surface style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              {getProfileImageUrl() ? (
                <Image source={{ uri: getProfileImageUrl() || undefined }} style={styles.profileImage} />
              ) : (
                <Avatar.Text 
                  size={100} 
                  label={getInitials()} 
                  style={styles.avatarText} 
                  labelStyle={styles.avatarLabel}
                />
              )}
            </View>
            <View style={styles.userInfo}>
              <Text variant="headlineMedium" style={styles.name}>
                {user?.first_name} {user?.last_name}
              </Text>
              <Text variant="bodyLarge" style={styles.role}>
                {getRoleLabel(user?.role)}
              </Text>
              <Text variant="bodyMedium" style={styles.email}>
                {user?.email}
              </Text>
            </View>
          </View>
        </Surface>


        {/* Account Information */}
        <Card style={styles.menuCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Account Information</Text>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="account-badge" size={20} color="#74A5A8" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>User ID</Text>
                  <Text style={styles.infoValue}>{user?.id?.slice(0, 8) || 'N/A'}</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="login-variant" size={20} color="#74A5A8" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Auth Provider</Text>
                  <Text style={styles.infoValue}>{user?.provider || 'local'}</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="shield-account" size={20} color="#74A5A8" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Role</Text>
                  <Text style={styles.infoValue}>{user?.role || 'N/A'}</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="map-marker" size={20} color="#74A5A8" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>{user?.address || 'Not set'}</Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Settings */}
        <Card style={styles.menuCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Settings</Text>
            <List.Item
              title="Edit Profile"
              description="Update your profile information"
              left={props => <List.Icon {...props} icon="account-edit" color="#74A5A8" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={handleEditProfile}
              style={styles.listItem}
            />
            <Divider style={styles.divider} />
            <List.Item
              title="Notifications"
              description="Manage your notification preferences"
              left={props => <List.Icon {...props} icon="bell-outline" color="#74A5A8" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              style={styles.listItem}
            />
            <Divider style={styles.divider} />
            <List.Item
              title="Privacy & Security"
              description="Manage your privacy settings"
              left={props => <List.Icon {...props} icon="shield-outline" color="#74A5A8" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              style={styles.listItem}
            />
          </Card.Content>
        </Card>

        {/* Logout Button */}
        <View style={styles.logoutContainer}>
          <Button
            mode="contained"
            onPress={handleLogout}
            buttonColor="#F44336"
            style={styles.logoutButton}
            icon="logout"
            contentStyle={styles.logoutButtonContent}
          >
            Logout
          </Button>
        </View>

        <Text style={styles.version}>IrriGIS Mobile v1.0.0</Text>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Portal>
        <Modal 
          visible={editModalVisible} 
          onDismiss={() => setEditModalVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text variant="headlineSmall" style={styles.modalTitle}>Edit Profile</Text>
            
            {/* Profile Image */}
            <View style={styles.imageSection}>
              <View style={styles.imageContainer}>
                {newProfileImage ? (
                  <Image source={{ uri: newProfileImage || undefined }} style={styles.previewImage} />
                ) : getProfileImageUrl() ? (
                  <Image source={{ uri: getProfileImageUrl() }} style={styles.previewImage} />
                ) : (
                  <Avatar.Text 
                    size={80} 
                    label={getInitials()} 
                    style={styles.avatarText} 
                  />
                )}
              </View>
              <Button
                mode="outlined"
                onPress={pickProfileImage}
                style={styles.imageButton}
                compact
              >
                Change Photo
              </Button>
            </View>

            {/* Form Fields */}
            <TextInput
              label="First Name"
              value={editForm.first_name}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, first_name: text }))}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Last Name"
              value={editForm.last_name}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, last_name: text }))}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Email"
              value={editForm.email}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, email: text }))}
              mode="outlined"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              label="Address"
              value={editForm.address}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, address: text }))}
              mode="outlined"
              style={styles.input}
            />

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <Button
                mode="text"
                onPress={() => setEditModalVisible(false)}
                style={styles.cancelButton}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={saveProfile}
                loading={loading}
                style={styles.saveButton}
                buttonColor="#74A5A8"
              >
                Save
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#E0EBE2',
  },
  profileCard: {
    margin: 16,
    borderRadius: 20,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  profileHeader: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 16,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#74A5A8',
  },
    avatarLabel: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
  },
  userInfo: {
    flex: 1,
  },
  name: {
    fontWeight: 'bold',
    color: '#2E5C5F',
    marginBottom: 4,
  },
  role: {
    color: '#74A5A8',
    fontWeight: '600',
    marginBottom: 4,
  },
  email: {
    color: '#666',
  },
  menuCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#2E5C5F',
    fontSize: 18,
  },
  listItem: {
    paddingVertical: 4,
  },
  divider: {
    backgroundColor: '#E0E0E0',
    marginVertical: 4,
  },
  infoGrid: {
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  infoValue: {
    fontWeight: '600',
    color: '#333',
  },
  logoutContainer: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  logoutButton: {
    borderRadius: 12,
  },
  logoutButtonContent: {
    paddingVertical: 8,
  },
  version: {
    textAlign: 'center',
    color: '#999',
    marginTop: 24,
    fontSize: 12,
  },
  // Modal styles
  modalContainer: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#2E5C5F',
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  imageContainer: {
    marginBottom: 12,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#74A5A8',
  },
  avatarText: {
    backgroundColor: '#74A5A8',
  },
  imageButton: {
    borderColor: '#74A5A8',
  },
  input: {
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  saveButton: {
    flex: 1,
    marginLeft: 8,
  },
});
