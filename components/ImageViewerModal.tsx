import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { clampImageTranslation, containedImageSize } from '@/lib/imageViewer';

const DOUBLE_TAP_SCALE = 3;
const MAX_SCALE = 6;

export function ImageViewerModal({ source, onClose, onError, accessibilityLabel }: {
  source: ImageSource;
  onClose: () => void;
  onError: () => void;
  accessibilityLabel?: string;
}) {
  const window = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: window.width, height: window.height });
  const [imageSize, setImageSize] = useState(viewport);
  const [failedUri, setFailedUri] = useState<string>();
  const { width, height } = viewport;
  const fitted = containedImageSize(imageSize.width, imageSize.height, width, height);
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  useEffect(() => {
    scale.value = savedScale.value = 1;
    translateX.value = savedTranslateX.value = 0;
    translateY.value = savedTranslateY.value = 0;
  }, [width, height, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const pinchGesture = Gesture.Pinch().withTestId('photo-pinch')
    .onStart((event) => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      focalX.value = event.focalX - width / 2;
      focalY.value = event.focalY - height / 2;
    })
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * event.scale));
      const ratio = scale.value / savedScale.value;
      translateX.value = clampImageTranslation(
        event.focalX - width / 2 - (focalX.value - savedTranslateX.value) * ratio,
        fitted.width, width, scale.value
      );
      translateY.value = clampImageTranslation(
        event.focalY - height / 2 - (focalY.value - savedTranslateY.value) * ratio,
        fitted.height, height, scale.value
      );
    });

  const panGesture = Gesture.Pan().withTestId('photo-pan').maxPointers(1)
    .onChange((event) => {
      if (event.numberOfPointers !== 1) return;
      translateX.value = clampImageTranslation(translateX.value + event.changeX, fitted.width, width, scale.value);
      translateY.value = clampImageTranslation(translateY.value + event.changeY, fitted.height, height, scale.value);
    });

  const doubleTapGesture = Gesture.Tap().withTestId('photo-double-tap').numberOfTaps(2)
    .onEnd((_event, success) => {
      if (!success) return;
      scale.value = withTiming(scale.value > 1 ? 1 : DOUBLE_TAP_SCALE);
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
    });

  const composedGesture = Gesture.Exclusive(doubleTapGesture, Gesture.Simultaneous(pinchGesture, panGesture));
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView
        style={styles.root}
        onLayout={({ nativeEvent: { layout } }) => setViewport({ width: layout.width, height: layout.height })}
        onTouchEnd={(event) => event.stopPropagation()}
        accessibilityViewIsModal
      >
        <GestureDetector gesture={composedGesture}>
          <View style={styles.viewport} collapsable={false}>
            <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
              <Image
                key={source.uri}
                source={source}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                cachePolicy="memory-disk"
                accessibilityLabel={accessibilityLabel ?? 'Full-screen photo'}
                onLoad={({ source: loaded }) => {
                  if (loaded.width > 0 && loaded.height > 0) setImageSize({ width: loaded.width, height: loaded.height });
                }}
                onError={() => {
                  setFailedUri(source.uri);
                  onError();
                }}
              />
            </Animated.View>
          </View>
        </GestureDetector>
        {failedUri === source.uri && <Text style={styles.error}>Photo unavailable</Text>}
        <Pressable
          style={[styles.closeButton, { top: Math.max(insets.top, 12), right: Math.max(insets.right, 12) }]}
          accessibilityRole="button"
          accessibilityLabel="Close photo viewer"
          onPress={(event) => { event.stopPropagation(); onClose(); }}
          hitSlop={8}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  viewport: { flex: 1, overflow: 'hidden' },
  closeButton: { position: 'absolute', zIndex: 10, padding: 12, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.6)' },
  error: { position: 'absolute', alignSelf: 'center', top: '50%', color: '#fff' },
});
