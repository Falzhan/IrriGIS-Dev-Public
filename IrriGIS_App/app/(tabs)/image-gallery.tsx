// app/(tabs)/image-gallery.tsx
import { useState } from 'react';
import { StyleSheet, View, Image, Dimensions, TouchableOpacity } from 'react-native';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

const { width, height } = Dimensions.get('window');

export default function ImageGalleryScreen() {
  const router = useRouter();
  const { images: imagesParam, startIndex: startIndexParam } = useLocalSearchParams();
  const [currentIndex, setCurrentIndex] = useState(parseInt(startIndexParam as string) || 0);
  const [loading, setLoading] = useState(true);

  let images: string[] = [];
  try {
    images = JSON.parse(imagesParam as string) || [];
  } catch {
    images = [];
  }

  const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.192:3000';

  const getImageUrl = (img: string) => {
    if (img.startsWith('http')) return img;
    return `${API_BASE}/uploads/${img}`;
  };

  const goNext = () => {
    if (currentIndex < images.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  if (images.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#fff' }}>No images</Text>
        <IconButton icon="close" iconColor="#fff" size={28} onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <IconButton icon="close" iconColor="#fff" size={28} onPress={() => router.back()} />
        <Text style={styles.counter}>{currentIndex + 1} / {images.length}</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.imageContainer}>
        {loading && <ActivityIndicator size="large" color="#fff" />}
        <Image
          source={{ uri: getImageUrl(images[currentIndex]) }}
          style={styles.fullImage}
          resizeMode="contain"
          onLoadEnd={() => setLoading(false)}
        />
      </View>

      {currentIndex > 0 && (
        <TouchableOpacity style={[styles.navBtn, styles.prevBtn]} onPress={goPrev}>
          <IconButton icon="chevron-left" iconColor="#fff" size={36} />
        </TouchableOpacity>
      )}

      {currentIndex < images.length - 1 && (
        <TouchableOpacity style={[styles.navBtn, styles.nextBtn]} onPress={goNext}>
          <IconButton icon="chevron-right" iconColor="#fff" size={36} />
        </TouchableOpacity>
      )}

      <View style={styles.thumbnailStrip}>
        {images.map((img: string, idx: number) => (
          <TouchableOpacity
            key={idx}
            onPress={() => { setCurrentIndex(idx); setLoading(true); }}
            style={[styles.thumb, idx === currentIndex && styles.thumbActive]}
          >
            <Image source={{ uri: getImageUrl(img) }} style={styles.thumbImage} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  topBar: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingTop: 44, 
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  counter: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  imageContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  fullImage: { 
    width: width, 
    height: height * 0.65,
  },
  navBtn: { 
    position: 'absolute', 
    top: '40%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prevBtn: { left: 12 },
  nextBtn: { right: 12 },
  thumbnailStrip: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    padding: 16, 
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  thumb: { 
    width: 54, 
    height: 54, 
    borderRadius: 8, 
    overflow: 'hidden', 
    borderWidth: 2, 
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  thumbActive: { 
    borderColor: '#74A5A8',
    backgroundColor: 'rgba(116,165,168,0.3)',
  },
  thumbImage: { 
    width: 54, 
    height: 54,
  },
});
