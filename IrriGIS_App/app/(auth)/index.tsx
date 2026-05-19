// app/(auth)/index.tsx
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Checkbox, Modal, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { useSession } from '../../context/ctx';
import { fetchIAs, loginUser, registerUser, updateUserProfile } from '../../services/api';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000/api';

WebBrowser.maybeCompleteAuthSession();

type IA = { id: string; name: string; code: string; };

export default function LandingScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const [visible, setVisible] = useState(false);
  const [registerVisible, setRegisterVisible] = useState(false);
  const [regType, setRegType] = useState('ia');
  const [iaList, setIaList] = useState<IA[]>([]);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [selectedIa, setSelectedIa] = useState<string | null>(null);
  const [currentAddress, setCurrentAddress] = useState('');
  const [fetchingAddress, setFetchingAddress] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // OAuth profile completion state
  const [showOAuthProfile, setShowOAuthProfile] = useState(false);
  const [oauthRole, setOauthRole] = useState('ia');
  const [oauthIa, setOauthIa] = useState<string | null>(null);
  const [oauthAddress, setOauthAddress] = useState('');
  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [partialUser, setPartialUser] = useState<any>(null);
  const [oauthFetchingAddress, setOauthFetchingAddress] = useState(false);
  const [oAuthCurrentAddress, setOAuthCurrentAddress] = useState('');
  const [oAuthIaList, setOAuthIaList] = useState<IA[]>([]);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationStatus, requestLocationPermission] = Location.useForegroundPermissions();

  useEffect(() => {
    (async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      if (!locationStatus?.granted) await requestLocationPermission();
    })();
  }, [cameraPermission, locationStatus]);

  const { control: loginControl, handleSubmit: handleLoginSubmit } = useForm();
  // Using simple state for registration form to avoid react-hook-form blocking
  const [regForm, setRegForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    address: '',
  });

  const pickProfileImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image from gallery');
    }
  };

  const getCurrentAddress = async () => {
    if (!locationStatus?.granted) return;
    
    try {
      setFetchingAddress(true);
      
      // Add timeout to prevent infinite loading
      let locationTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        locationTimeoutId = setTimeout(() => reject(new Error('Location request timeout')), 8000); // 8 second timeout
      });
      
      const location = await Promise.race([locationPromise, timeoutPromise]) as any;
      if (locationTimeoutId) clearTimeout(locationTimeoutId);
      
      const { latitude, longitude } = location.coords;
      
      // Manual abort controller for fetch timeout (AbortSignal.timeout not supported in RN)
      const controller = new AbortController();
      let fetchTimeoutId: ReturnType<typeof setTimeout> | undefined;
      fetchTimeoutId = setTimeout(() => controller.abort(), 8000); // 8 second fetch timeout
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'IrriGIS-Mobile-App/1.0'
          },
          signal: controller.signal
        }
      );
      if (fetchTimeoutId) clearTimeout(fetchTimeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      
      // Check if response is empty or not valid JSON
      if (!text || text.trim() === '') {
        throw new Error('Empty response from geocoding service');
      }
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error:', parseError, 'Response text:', text);
        throw new Error('Invalid JSON response from geocoding service');
      }
      
      if (data && data.display_name) {
        setCurrentAddress(data.display_name);
        setRegForm(prev => ({ ...prev, address: data.display_name }));
      } else {
        console.warn('No display_name in geocoding response:', data);
      }
    } catch (error) {
      console.error('Error getting address:', error);
      // Don't set error state, just silently fail - user can still enter address manually
    } finally {
      setFetchingAddress(false);
    }
  };

  useEffect(() => {
    if (registerVisible && regType === 'ia') {
      fetchIAs()
        .then((res: any) => {
          const iaData = Array.isArray(res.data) ? res.data :
                         Array.isArray(res.data?.data) ? res.data.data : [];
          setIaList(iaData);
        })
        .catch(err => {
          console.error(err);
          setIaList([]);
        });
      
      // Get current address when IA registration opens
      getCurrentAddress();
    }
  }, [registerVisible, regType, locationStatus?.granted]);

  const showModal = () => setVisible(true);
  const hideModal = () => setVisible(false);
  const showRegister = () => { hideModal(); setRegisterVisible(true); };
  const hideRegister = () => setRegisterVisible(false);

  const onLogin = async (data: any) => {
    try {
      setLoading(true);
      const res = await loginUser(data.email, data.password);
      await SecureStore.setItemAsync('remember_me', rememberMe ? 'true' : 'false');
      await signIn(res.data.token, res.data.user);
      router.replace('/(tabs)');
    } catch (error: any) {
      const errorMessage = error.message || error.data?.message || '';
      if (errorMessage.includes('not activated') || errorMessage.includes('admin approval')) {
        Alert.alert("Inactive Account", "Please wait for an administrator to activate your account");
      } else {
        Alert.alert("Login Failed", "Invalid credentials or server error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: string) => {
    const deepLink = Linking.createURL('/');

    try {
      const redirectUrl = Linking.createURL('/oauth/callback');
      console.log('Social login - redirectUrl:', redirectUrl);
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_BASE_URL}/auth/${provider}?redirect_uri=${encodeURIComponent(redirectUrl)}`,
        redirectUrl
      );
      console.log('Social login - result type:', result.type, 'url:', result.url ? 'present' : 'none');
        if (result.type === 'success') {
        if (!result.url) {
          console.log('Social login - success but no URL');
          Alert.alert("Error", "No URL returned from authentication");
          return;
        }
        const urlParts = result.url.split('?');
        const urlParams = new URLSearchParams(urlParts[1]);
        const error = urlParams.get('error');
        if (error) {
          console.log('Social login - error from URL:', error);
          if (error === 'account_inactive') {
            Alert.alert(
              "Inactive Account",
              "Please wait for an administrator to activate your account",
              [
                {
                  text: "OK",
                  onPress: () => {
                    Linking.openURL(deepLink);
                  },
                },
              ]
            );
          } else {
            Alert.alert("Login Error", decodeURIComponent(error));
          }
          return;
        }
        const token = urlParams.get('token');
        console.log('Social login - token received:', token ? 'yes' : 'no');
        const userParam = urlParams.get('user');
        console.log('Social login - userParam:', userParam ? userParam.substring(0, 50) + '...' : 'none');
        if (token) {
          let user = null;
          if (userParam) {
            const cleanedUserParam = userParam.replace(/#_=_$/, '');
            console.log('Social login - cleaned userParam:', cleanedUserParam.substring(0, 50) + '...');
            try {
              user = JSON.parse(decodeURIComponent(cleanedUserParam));
              console.log('Social login - user parsed:', user);
            } catch (parseError) {
              console.error('Social login - user parse error:', parseError);
              console.log('Social login - raw userParam:', userParam);
            }
          }
          console.log('Social login - checking if new OAuth user...');
          // Use backend-provided flag: only show profile completion for brand-new accounts
          const isNewUser = user?.isNewUser === true;
          if (isNewUser) {
            console.log('Social login - new OAuth user, showing profile completion');
            setOauthToken(token);
            setPartialUser(user);
            setShowOAuthProfile(true);
            return;
          }
          console.log('Social login - calling signIn...');
          await signIn(token, user);
          console.log('Social login - signIn complete');
          router.replace('/(tabs)');
        } else {
          Alert.alert("Error", "No token received from server");
        }
      } else {
        console.log('Social login - result type:', result.type);
        Alert.alert("Error", `Social login failed: ${result.type}`);
      }
    } catch (error: any) {
      console.error('Social login error:', error);
      Alert.alert("Error", error?.message || "Social login failed");
    }
  };

  const onRegister = async (data: any) => {
    console.log('Registration form submitted with data:', data);
    console.log('Registration type:', regType);
    console.log('Selected IA:', selectedIa);
    
    // Validate IA selection for IA registration
    if (regType === 'ia' && !selectedIa) {
      Alert.alert("Error", "Please select an Irrigators Association");
      return;
    }

    // Validate required fields
    if (!data.firstName || !data.lastName || !data.email || !data.password) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    // Validate password confirmation
    if (data.password !== data.confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    // Email validation for NIA Staff
    if (regType === 'nia') {
      const validDomains = ['@nia.gov.ph', '@msugensan.edu.ph'];
      const isValidDomain = validDomains.some(domain => data.email.toLowerCase().endsWith(domain));
      if (!isValidDomain) {
        Alert.alert("Error", "NIA Staff must use @nia.gov.ph or @msugensan.edu.ph email");
        return;
      }
    }

    try {
      setLoading(true);

      // Create FormData for file upload
      const formData = new FormData();
      
      // Add basic user data
      formData.append('email', data.email);
      formData.append('password', data.password);
      formData.append('first_name', data.firstName);
      formData.append('last_name', data.lastName);
      formData.append('role', regType === 'nia' ? 'nia_field_officer' : 'ia_member');

      // Add IA-specific data
      if (regType === 'ia') {
        if (data.address) formData.append('address', data.address);
        if (selectedIa) formData.append('ia_id', selectedIa);
      }

      // Add profile image if selected
      if (profileImage) {
        const uri = profileImage;
        const filename = uri.split('/').pop() || 'profile.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('profileImage', {
          uri,
          name: filename,
          type,
        } as any);
      }

      // Make API call with FormData
      console.log('Submitting registration data...');
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      console.log('Registration response status:', response.status);
      const result = await response.json();
      console.log('Registration response data:', result);

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Registration failed');
      }

      Alert.alert("Success", "Account created! Please sign in.");
      hideRegister();
      showModal();

    } catch (error: any) {
      console.error('Registration error:', error);
      Alert.alert("Registration Failed", error.message || "Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getOAuthAddress = async () => {
    if (!locationStatus?.granted) return;
    try {
      setOauthFetchingAddress(true);
      let locationTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const timeoutPromise = new Promise((_, reject) => {
        locationTimeoutId = setTimeout(() => reject(new Error('Location request timeout')), 8000);
      });
      const location = await Promise.race([locationPromise, timeoutPromise]) as any;
      if (locationTimeoutId) clearTimeout(locationTimeoutId);
      const { latitude, longitude } = location.coords;
      const controller = new AbortController();
      let fetchTimeoutId: ReturnType<typeof setTimeout> | undefined;
      fetchTimeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { 'User-Agent': 'IrriGIS-Mobile-App/1.0' }, signal: controller.signal }
      );
      if (fetchTimeoutId) clearTimeout(fetchTimeoutId);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();
      if (!text || text.trim() === '') throw new Error('Empty response');
      const data = JSON.parse(text);
      if (data && data.display_name) {
        setOAuthCurrentAddress(data.display_name);
        setOauthAddress(data.display_name);
      }
    } catch (error) {
      console.error('Error getting address:', error);
    } finally {
      setOauthFetchingAddress(false);
    }
  };

  const handleOAuthCompleteProfile = async () => {
    if (!partialUser || !oauthToken) {
      Alert.alert("Error", "Session expired. Please sign in again.");
      return;
    }
    if (oauthRole === 'ia' && !oauthIa) {
      Alert.alert("Error", "Please select an Irrigators Association");
      return;
    }

    try {
      setLoading(true);
      const data: any = {};
      if (oauthRole === 'ia') {
        data.role = 'ia_member';
        data.ia_id = oauthIa;
      } else {
        data.role = 'nia_field_officer';
      }
      if (oauthAddress) data.address = oauthAddress;

      console.log('Completing OAuth profile with:', data);
      const result = await updateUserProfile(partialUser.id, data, oauthToken);
      console.log('Profile update result:', result);

      // Merge updated fields into the partial user
      const updatedUser = {
        ...partialUser,
        ...result.data,
      };

      await signIn(oauthToken, updatedUser);
      setShowOAuthProfile(false);
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('OAuth profile completion error:', error);
      Alert.alert("Error", error.message || "Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showOAuthProfile && oauthRole === 'ia') {
      fetchIAs()
        .then((res: any) => {
          const iaData = Array.isArray(res.data) ? res.data :
                         Array.isArray(res.data?.data) ? res.data.data : [];
          setOAuthIaList(iaData);
        })
        .catch(err => {
          console.error(err);
          setOAuthIaList([]);
        });
      getOAuthAddress();
    }
  }, [showOAuthProfile, oauthRole, locationStatus?.granted]);

  return (
    <View style={styles.container}>
      <View style={styles.decorativeCircle} />
      <View style={[styles.decorativeCircle, styles.decorativeCircle2]} />

      <View style={styles.hero}>
        <Image
          source={require('../../assets/images/full-icon.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text variant="titleLarge" style={styles.tagline}>Smart Irrigation Monitoring</Text>
        <Text variant="bodyMedium" style={styles.subTagline}>
          Report issues, track progress, and stay informed
        </Text>
      </View>

      <View style={styles.bottomSection}>
        <Button
          mode="contained"
          onPress={showModal}
          buttonColor="#74A5A8"
          style={styles.getStartedBtn}
          labelStyle={styles.getStartedLabel}
          contentStyle={{ height: 52 }}
        >
          Get Started
        </Button>

        {(!cameraPermission?.granted || !locationStatus?.granted) && (
          <View style={styles.permissionBanner}>
            <Text style={styles.permissionText}>
              Camera & Location permissions required for full functionality
            </Text>
          </View>
        )}
      </View>

      <Portal>
        <Modal visible={visible} onDismiss={hideModal} contentContainerStyle={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.modalHeader}>
              <Image
                source={require('../../assets/images/full-icon.png')}
                style={styles.modalLogo}
                resizeMode="contain"
              />
              <Text variant="headlineSmall" style={styles.header}>Welcome Back</Text>
              <Text variant="bodyMedium" style={styles.modalSubtitle}>Sign in to your account</Text>
            </View>

            <Controller control={loginControl} name="email" rules={{ required: true }} render={({ field: { onChange, value } }) => (
              <TextInput label="Email" value={value} onChangeText={onChange} mode="outlined" style={styles.input} keyboardType="email-address" autoCapitalize="none" />
            )}/>
            <Controller control={loginControl} name="password" rules={{ required: true }} render={({ field: { onChange, value } }) => (
              <TextInput 
                label="Password" 
                value={value} 
                onChangeText={onChange} 
                secureTextEntry={!showLoginPassword} 
                mode="outlined" 
                style={styles.input}
                right={
                  <TextInput.Icon 
                    icon={showLoginPassword ? "eye-off" : "eye"} 
                    onPress={() => setShowLoginPassword(!showLoginPassword)}
                  />
                }
              />
            )}/>

            <View style={styles.rememberRow}>
              <Checkbox status={rememberMe ? 'checked' : 'unchecked'} onPress={() => setRememberMe(!rememberMe)} color="#74A5A8" />
              <Text style={styles.rememberText}>Remember Me</Text>
            </View>

            <Button mode="contained" onPress={handleLoginSubmit(onLogin)} loading={loading} style={styles.btn} buttonColor="#74A5A8" textColor="#fff">Sign In</Button>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button icon="google" mode="outlined" onPress={() => handleSocialLogin('google')} style={styles.socialBtn} textColor="#555">Sign in with Google</Button>
            <Button icon="facebook" mode="outlined" onPress={() => handleSocialLogin('facebook')} style={styles.socialBtn} textColor="#555">Sign in with Facebook</Button>

            <Button onPress={showRegister} textColor="#74A5A8" style={{ marginTop: 12 }}>
              Don't have an account? <Text style={{ fontWeight: 'bold', color: '#74A5A8' }}>Register</Text>
            </Button>
          </ScrollView>
        </Modal>
      </Portal>

      <Portal>
        <Modal visible={registerVisible} onDismiss={hideRegister} contentContainerStyle={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.modalHeader}>
              <Image
                source={require('../../assets/images/full-icon.png')}
                style={styles.modalLogo}
                resizeMode="contain"
              />
              <Text variant="headlineSmall" style={styles.header}>Create Account</Text>
              <Text variant="bodyMedium" style={styles.modalSubtitle}>Join your irrigation community</Text>
            </View>

            <SegmentedButtons
              value={regType}
              onValueChange={setRegType}
              buttons={[{ value: 'ia', label: 'IA Member' }, { value: 'nia', label: 'NIA Staff' }]}
              style={{ marginBottom: 16 }}
            />
            
            {/* Profile Picture Selection */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={styles.profileImageContainer}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.profileImagePreview} />
                ) : (
                  <View style={styles.profileImagePlaceholder}>
                    <MaterialCommunityIcons name="camera" size={32} color="#74A5A8" />
                  </View>
                )}
              </View>
              <Button
                mode="outlined"
                onPress={pickProfileImage}
                style={styles.selectImageButton}
                compact
              >
                {profileImage ? 'Change Photo' : 'Select Photo'}
              </Button>
            </View>
            
            <TextInput 
              label="First Name" 
              value={regForm.firstName} 
              onChangeText={(text) => setRegForm(prev => ({ ...prev, firstName: text }))} 
              mode="outlined" 
              style={styles.input} 
            />
            <TextInput 
              label="Last Name" 
              value={regForm.lastName} 
              onChangeText={(text) => setRegForm(prev => ({ ...prev, lastName: text }))} 
              mode="outlined" 
              style={styles.input} 
            />
            <TextInput 
              label="Email" 
              value={regForm.email} 
              onChangeText={(text) => setRegForm(prev => ({ ...prev, email: text }))} 
              mode="outlined" 
              style={styles.input} 
              keyboardType="email-address" 
              autoCapitalize="none"
              placeholder={regType === 'nia' ? "nia.staff@nia.gov.ph" : "your.email@example.com"}
            />
            {regType === 'ia' && (
              <>
                <TextInput 
                  label="Address" 
                  value={regForm.address || currentAddress} 
                  onChangeText={(text) => setRegForm(prev => ({ ...prev, address: text }))} 
                  mode="outlined" 
                  style={styles.input}
                  placeholder={fetchingAddress ? "Getting your current address..." : "Enter your address"}
                  editable={!fetchingAddress}
                  right={
                    <TextInput.Icon 
                      icon="map-marker" 
                      onPress={() => !fetchingAddress && getCurrentAddress()}
                      disabled={fetchingAddress}
                    />
                  }
                />
                <Text style={{ marginTop: 6, marginBottom: 10, color: '#666', fontWeight: '500', fontSize: 13 }}>Select your Irrigators Association</Text>
                <View style={styles.iaList}>
                  {iaList.length === 0 ? (
                    <Text style={{ color: '#999' }}>No IAs available</Text>
                  ) : (
                    iaList.map((ia) => (
                      <Button
                        key={ia.id}
                        mode={selectedIa === ia.id ? 'contained' : 'outlined'}
                        compact
                        onPress={() => setSelectedIa(ia.id)}
                        style={{ margin: 3, borderRadius: 8 }}
                        buttonColor={selectedIa === ia.id ? '#74A5A8' : undefined}
                        textColor={selectedIa === ia.id ? '#fff' : '#555'}
                      >
                        {ia.code}
                      </Button>
                    ))
                  )}
                </View>
              </>
            )}
            <TextInput 
              label="Password" 
              value={regForm.password} 
              onChangeText={(text) => setRegForm(prev => ({ ...prev, password: text }))} 
              secureTextEntry={!showRegPassword} 
              mode="outlined" 
              style={styles.input}
              right={
                <TextInput.Icon 
                  icon={showRegPassword ? "eye-off" : "eye"} 
                  onPress={() => setShowRegPassword(!showRegPassword)}
                />
              }
            />
            <TextInput 
              label="Confirm Password" 
              value={regForm.confirmPassword} 
              onChangeText={(text) => setRegForm(prev => ({ ...prev, confirmPassword: text }))} 
              secureTextEntry={!showConfirmPassword} 
              mode="outlined" 
              style={styles.input}
              right={
                <TextInput.Icon 
                  icon={showConfirmPassword ? "eye-off" : "eye"} 
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                />
              }
            />
            <Button mode="contained" onPress={() => onRegister(regForm)} loading={loading} disabled={loading} style={styles.btn} buttonColor="#74A5A8" textColor="#fff">Sign Up</Button>
            <Button onPress={hideRegister} textColor="#888" style={{ marginTop: 8 }}>Cancel</Button>
          </ScrollView>
        </Modal>
      </Portal>

      <Portal>
        <Modal visible={showOAuthProfile} onDismiss={() => {
          if (!loading) setShowOAuthProfile(false);
        }} contentContainerStyle={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.modalHeader}>
              <Image
                source={require('../../assets/images/full-icon.png')}
                style={styles.modalLogo}
                resizeMode="contain"
              />
              <Text variant="headlineSmall" style={styles.header}>Complete Your Profile</Text>
              <Text variant="bodyMedium" style={styles.modalSubtitle}>
                Tell us a bit more to get started
              </Text>
            </View>

            <SegmentedButtons
              value={oauthRole}
              onValueChange={(val) => {
                setOauthRole(val);
                setOauthIa(null);
              }}
              buttons={[{ value: 'ia', label: 'IA Member' }, { value: 'nia', label: 'NIA Staff' }]}
              style={{ marginBottom: 16 }}
            />

            {oauthRole === 'ia' && (
              <>
                <TextInput
                  label="Address"
                  value={oauthAddress || oAuthCurrentAddress}
                  onChangeText={setOauthAddress}
                  mode="outlined"
                  style={styles.input}
                  placeholder={oauthFetchingAddress ? "Getting your current address..." : "Enter your address"}
                  editable={!oauthFetchingAddress}
                  right={
                    <TextInput.Icon
                      icon="map-marker"
                      onPress={() => !oauthFetchingAddress && getOAuthAddress()}
                      disabled={oauthFetchingAddress}
                    />
                  }
                />
                <Text style={{ marginTop: 6, marginBottom: 10, color: '#666', fontWeight: '500', fontSize: 13 }}>
                  Select your Irrigators Association
                </Text>
                <View style={styles.iaList}>
                  {oAuthIaList.length === 0 ? (
                    <Text style={{ color: '#999' }}>No IAs available</Text>
                  ) : (
                    oAuthIaList.map((ia) => (
                      <Button
                        key={ia.id}
                        mode={oauthIa === ia.id ? 'contained' : 'outlined'}
                        compact
                        onPress={() => setOauthIa(ia.id)}
                        style={{ margin: 3, borderRadius: 8 }}
                        buttonColor={oauthIa === ia.id ? '#74A5A8' : undefined}
                        textColor={oauthIa === ia.id ? '#fff' : '#555'}
                      >
                        {ia.code}
                      </Button>
                    ))
                  )}
                </View>
              </>
            )}

            {oauthRole === 'nia' && (
              <TextInput
                label="Address"
                value={oauthAddress || oAuthCurrentAddress}
                onChangeText={setOauthAddress}
                mode="outlined"
                style={styles.input}
                placeholder={oauthFetchingAddress ? "Getting your current address..." : "Enter your address (optional)"}
                editable={!oauthFetchingAddress}
                right={
                  <TextInput.Icon
                    icon="map-marker"
                    onPress={() => !oauthFetchingAddress && getOAuthAddress()}
                    disabled={oauthFetchingAddress}
                  />
                }
              />
            )}

            <Button
              mode="contained"
              onPress={handleOAuthCompleteProfile}
              loading={loading}
              disabled={loading}
              style={styles.btn}
              buttonColor="#74A5A8"
              textColor="#fff"
            >
              Save & Continue
            </Button>
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
    justifyContent: 'space-between',
  },
  decorativeCircle: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(155,184,141,0.15)',
    top: -60,
    right: -80,
  },
  decorativeCircle2: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(116,165,168,0.12)',
    top: undefined,
    right: undefined,
    bottom: 120,
    left: -60,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  logoImage: {
    width: 220,
    height: 220,
  },
  tagline: {
    color: '#2E5C5F',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subTagline: {
    color: '#5A7D80',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  bottomSection: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    gap: 12,
  },
  getStartedBtn: {
    borderRadius: 14,
    shadowColor: '#74A5A8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  getStartedLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  permissionBanner: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  permissionText: {
    color: '#E67E22',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  modalContainer: {
    backgroundColor: '#fff',
    padding: 24,
    margin: 20,
    borderRadius: 28,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 4,
  },
  modalLogo: {
    width: 120,
    height: 120,
    marginBottom: 8,
  },
  header: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: '#2E5C5F',
    fontSize: 22,
  },
  modalSubtitle: {
    textAlign: 'center',
    color: '#7A9A9D',
    fontSize: 13,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  btn: {
    marginTop: 14,
    borderRadius: 12,
    shadowColor: '#74A5A8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
  },
  socialBtn: {
    marginBottom: 10,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  rememberText: { marginLeft: 8, color: '#555', fontSize: 13 },
  iaList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  addressContainer: { position: 'relative' },
  fetchingText: {
    position: 'absolute',
    right: 12,
    top: 28,
    fontSize: 11,
    color: '#74A5A8',
    fontStyle: 'italic',
  },
  profileImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#74A5A8',
    backgroundColor: '#F5F5F5',
  },
  profileImagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  profileImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },
    selectImageButton: {
    borderColor: '#74A5A8',
    borderRadius: 20,
  },
});
