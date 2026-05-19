//components/DraggableBottomSheet.tsx
import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Dimensions,
  Animated,
  ScrollView,
  PanResponder,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableWithoutFeedback,
  Platform,
  UIManager,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const NAV_HEIGHT = 90 + (Platform.OS === 'ios' ? 34 : 0);
const EXTRA_PADDING_FOR_BUTTON = 140;

interface DraggableBottomSheetProps {
  children: React.ReactNode;
  snapPoints?: string[];
  onExpandChange?: (index: number) => void;
  onAnimate?: (fromIndex: number, toIndex: number) => void;
  onChange?: (index: number) => void;
  index?: number;
  backdropColor?: string | null;
  onBackdropPress?: () => void;
  keyboardAvoiding?: boolean;
  closeVelocityThreshold?: number;
}

export default function DraggableBottomSheet({
  children,
  snapPoints = ['50%', '80%'],
  onExpandChange,
  onAnimate,
  onChange,
  index = 0,
  backdropColor = 'rgba(0,0,0,0.45)',
  onBackdropPress,
  keyboardAvoiding = true,
  closeVelocityThreshold = 2.0,
}: DraggableBottomSheetProps) {
  const snapPointValues = useMemo(() =>
    snapPoints.map((pt) => {
      const pct = parseFloat(pt.replace('%', '')) / 100;
      return SCREEN_HEIGHT * (1 - pct);
    }),
    [snapPoints]
  );

  const clampedStartIndex = Math.max(0, Math.min(index, snapPointValues.length - 1));

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setIsKeyboardVisible(true);
      if (snapIndexRef.current < snapPointValues.length - 1) {
        snapTo(snapPointValues.length - 1);
      }
    });

    const keyboardHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    });

    return () => {
      keyboardShow.remove();
      keyboardHide.remove();
    };
  }, [snapPointValues, snapTo]);

  const snapIndexRef = useRef(clampedStartIndex);
  const dragStartY = useRef(0);
  const scrollYRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const isDraggingRef = useRef(false);

  const translateY = useRef(
    new Animated.Value(snapPointValues[clampedStartIndex]),
  ).current;

  const backdropOpacity = useMemo(
    () =>
      translateY.interpolate({
        inputRange: [
          snapPointValues[snapPointValues.length - 1],
          snapPointValues[0],
        ],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [translateY, snapPointValues],
  );

  const snapTo = useCallback(
    (targetIndex: number, animated = true) => {
      const clamped = Math.max(0, Math.min(targetIndex, snapPointValues.length - 1));
      const currentIndex = snapIndexRef.current;

      snapIndexRef.current = clamped;

      if (animated) {
        isAnimatingRef.current = true;
        if (currentIndex !== clamped) {
          onAnimate?.(currentIndex, clamped);
        }
        Animated.spring(translateY, {
          toValue: snapPointValues[clamped],
          useNativeDriver: true,
          overshootClamping: true,
          tension: 50,
          friction: 10,
        }).start(() => {
          isAnimatingRef.current = false;
          onChange?.(clamped);
        });
      } else {
        translateY.setValue(snapPointValues[clamped]);
        isAnimatingRef.current = false;
        onChange?.(clamped);
      }

      onExpandChange?.(clamped);
    },
    [snapPointValues, translateY, onExpandChange, onAnimate, onChange],
  );

  const findNearestSnapIndex = useCallback(
    (y: number) => {
      const midPoints = snapPointValues.map((v, i) => {
        const next = snapPointValues[i + 1];
        return next !== undefined ? (v + next) / 2 : v;
      });

      for (let i = 0; i < midPoints.length; i++) {
        if (y < midPoints[i]) return i + 1;
      }
      return snapPointValues.length - 1;
    },
    [snapPointValues],
  );

  const handleRelease = useCallback(
    (dy: number, vy: number) => {
      isDraggingRef.current = false;
      isAnimatingRef.current = true;
      const finalY = dragStartY.current + dy;
      let target = findNearestSnapIndex(finalY);

      if (Math.abs(vy) > closeVelocityThreshold) {
        if (vy > 0 && target < snapPointValues.length - 1) target++;
        if (vy < 0 && target > 0) target--;
      }

      snapIndexRef.current = target;
      snapTo(target, true);
    },
    [findNearestSnapIndex, snapPointValues, snapTo, closeVelocityThreshold],
  );

  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartY.current = (translateY as any)._value;
          isDraggingRef.current = true;
        },
        onPanResponderMove: (_, { dy }) => {
          const lo = snapPointValues[snapPointValues.length - 1];
          const hi = snapPointValues[0];
          translateY.setValue(
            Math.max(lo, Math.min(dragStartY.current + dy, hi)),
          );
        },
        onPanResponderRelease: (_, { dy, vy }) => handleRelease(dy, vy),
        onPanResponderTerminate: (_, { dy, vy }) => handleRelease(dy, vy),
      }),
    [snapPointValues, translateY, handleRelease],
  );

  const contentPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, { dy, dx }) => {
          const isVertical = Math.abs(dy) > Math.abs(dx) * 1.5;
          const isScrolling = scrollYRef.current > 5;
          const draggingUp = dy < -20;
          const draggingDown = dy > 20;
          const atScrollTop = scrollYRef.current <= 0;

          if (!isVertical) return false;
          if (isScrolling) return false;

          if (draggingUp && snapIndexRef.current < snapPointValues.length - 1) {
            return true;
          }

          if (draggingDown && atScrollTop && snapIndexRef.current > 0) {
            return true;
          }
          return false;
        },
        onPanResponderGrant: () => {
          dragStartY.current = (translateY as any)._value;
          isDraggingRef.current = true;
        },
        onPanResponderMove: (_, { dy }) => {
          const lo = snapPointValues[snapPointValues.length - 1];
          const hi = snapPointValues[0];
          translateY.setValue(
            Math.max(lo, Math.min(dragStartY.current + dy, hi)),
          );
        },
        onPanResponderRelease: (_, { dy, vy }) => handleRelease(dy, vy),
        onPanResponderTerminate: (_, { dy, vy }) => handleRelease(dy, vy),
      }),
    [snapPointValues, translateY, handleRelease],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y;
    },
    [],
  );

  const handleBackdropPress = useCallback(() => {
    if (onBackdropPress) {
      onBackdropPress();
    } else {
      snapTo(0);
    }
  }, [onBackdropPress, snapTo]);

  const renderContent = () => (
    <>
      {backdropColor !== null && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: backdropColor, opacity: backdropOpacity, zIndex: 1 },
          ]}
          pointerEvents="box-none"
        >
          <TouchableWithoutFeedback onPress={handleBackdropPress}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        </Animated.View>
      )}

      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY }],
            bottom: keyboardHeight > 0 ? keyboardHeight - 20 : 0,
          },
        ]}
      >
        <View style={styles.handleArea} {...handlePanResponder.panHandlers}>
          <View style={styles.handlePill} />
        </View>

        <View style={styles.scrollWrapper} {...contentPanResponder.panHandlers}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: isKeyboardVisible ? 40 : EXTRA_PADDING_FOR_BUTTON },
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            scrollEventThrottle={8}
            onScroll={handleScroll}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </Animated.View>
    </>
  );

  if (keyboardAvoiding && Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        behavior="padding"
        style={StyleSheet.absoluteFill}
        keyboardVerticalOffset={0}
      >
        {renderContent()}
      </KeyboardAvoidingView>
    );
  }

  return renderContent();
}

export function BottomSheetScrollView({
  children,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  contentContainerStyle?: object;
}) {
  return (
    <ScrollView
      contentContainerStyle={[{ padding: 20, paddingBottom: 120 }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: NAV_HEIGHT,
    height: SCREEN_HEIGHT - NAV_HEIGHT,
    zIndex: 2,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 24,
  },
  handleArea: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  handlePill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: EXTRA_PADDING_FOR_BUTTON,
  },
});