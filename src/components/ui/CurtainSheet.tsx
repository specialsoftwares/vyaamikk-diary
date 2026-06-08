import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from "react-native-reanimated";

/** Flat deep indigo curtain surface — no gradients. */
export const CURTAIN_SURFACE = "#1E1B4B";

/** Resting height as a fraction of screen (92–95% target: 94%). */
export const CURTAIN_OPEN_RATIO = 0.94;

const CORNER_RADIUS = 20;
const HANDLE_WIDTH = 40;
const HANDLE_HEIGHT = 2;
const HANDLE_COLOR = "rgba(255,255,255,0.25)";
const OVERLAY_MAX_OPACITY = 0.45;
const DISMISS_DRAG_SCREEN_RATIO = 0.3;
const DISMISS_VELOCITY_PX_S = 800;

export const CURTAIN_OPEN_SPRING: WithSpringConfig = {
  mass: 1,
  damping: 26,
  stiffness: 280,
  overshootClamping: true,
};

export const CURTAIN_CLOSE_SPRING: WithSpringConfig = {
  mass: 1,
  damping: 22,
  stiffness: 300,
  overshootClamping: true,
};

export interface CurtainSheetHandle {
  /** Spring-close; optional callback runs after the sheet is fully dismissed. */
  close: (afterClose?: () => void) => void;
}

export interface CurtainSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Drag zone above scrollable content (handle + title). */
  header?: React.ReactNode;
  /** Return true to consume Android back without closing the curtain. */
  onHardwareBack?: () => boolean;
  sheetStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Premium bottom curtain — Reanimated spring open/close, 1:1 header drag,
 * overlay opacity synced to sheet travel on the UI thread.
 */
export const CurtainSheet = forwardRef<CurtainSheetHandle, CurtainSheetProps>(
  function CurtainSheet(
    {
      visible,
      onClose,
      children,
      header,
      onHardwareBack,
      sheetStyle,
      accessibilityLabel = "Sheet",
    },
    ref
  ) {
    const { height: screenHeight } = useWindowDimensions();

    const openY = screenHeight * (1 - CURTAIN_OPEN_RATIO);
    const closedY = screenHeight;
    const sheetHeight = screenHeight - openY;

    const [rendered, setRendered] = useState(false);
    const tornDownRef = useRef(false);
    const prevVisibleRef = useRef(false);
    const onCloseRef = useRef(onClose);
    const onHardwareBackRef = useRef(onHardwareBack);
    const afterCloseRef = useRef<(() => void) | null>(null);
    onCloseRef.current = onClose;
    onHardwareBackRef.current = onHardwareBack;

    const translateY = useSharedValue(closedY);
    const dragStartY = useSharedValue(closedY);
    const isClosing = useSharedValue(false);

    const teardown = useCallback(() => {
      if (tornDownRef.current) return;
      tornDownRef.current = true;
      isClosing.value = false;
      cancelAnimation(translateY);
      translateY.value = closedY;
      setRendered(false);
      onCloseRef.current();
      const next = afterCloseRef.current;
      afterCloseRef.current = null;
      next?.();
    }, [closedY, isClosing, translateY]);

    const springClose = useCallback(
      (afterClose?: () => void) => {
        if (isClosing.value || tornDownRef.current) return;
        isClosing.value = true;
        afterCloseRef.current = afterClose ?? null;
        cancelAnimation(translateY);
        translateY.value = withSpring(closedY, CURTAIN_CLOSE_SPRING, (finished) => {
          if (finished) {
            runOnJS(teardown)();
          }
        });
      },
      [closedY, isClosing, teardown, translateY]
    );

    const springCloseFromGesture = useCallback(() => {
      springClose();
    }, [springClose]);

    const springOpenFromGesture = useCallback(() => {
      cancelAnimation(translateY);
      translateY.value = withSpring(openY, CURTAIN_OPEN_SPRING);
    }, [openY, translateY]);

    const springOpen = useCallback(() => {
      tornDownRef.current = false;
      isClosing.value = false;
      cancelAnimation(translateY);
      translateY.value = closedY;
      translateY.value = withSpring(openY, CURTAIN_OPEN_SPRING);
    }, [closedY, isClosing, openY, translateY]);

    useImperativeHandle(ref, () => ({ close: springClose }), [springClose]);

    useEffect(() => {
      const opening = visible && !prevVisibleRef.current;
      prevVisibleRef.current = visible;

      if (visible) {
        if (opening) {
          tornDownRef.current = false;
        }
        setRendered(true);
        return;
      }
      if (rendered) {
        springClose();
      }
    }, [visible, rendered, springClose]);

    useEffect(() => {
      if (!rendered || !visible) return;
      const frame = requestAnimationFrame(() => {
        springOpen();
      });
      return () => cancelAnimationFrame(frame);
    }, [rendered, visible, springOpen, screenHeight]);

    useEffect(() => {
      if (!rendered) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (onHardwareBackRef.current?.()) {
          return true;
        }
        springClose();
        return true;
      });
      return () => sub.remove();
    }, [rendered, springClose]);

    const headerPanGesture = useMemo(
      () =>
        Gesture.Pan()
          .activeOffsetY(8)
          .failOffsetX([-28, 28])
          .onStart(() => {
            if (isClosing.value) return;
            dragStartY.value = translateY.value;
          })
          .onUpdate((e) => {
            if (isClosing.value) return;
            const next = dragStartY.value + e.translationY;
            translateY.value = Math.min(closedY, Math.max(openY, next));
          })
          .onEnd((e) => {
            if (isClosing.value) return;
            const draggedFromOpen = translateY.value - openY;
            const shouldDismiss =
              draggedFromOpen > screenHeight * DISMISS_DRAG_SCREEN_RATIO ||
              e.velocityY > DISMISS_VELOCITY_PX_S;
            if (shouldDismiss) {
              runOnJS(springCloseFromGesture)();
            } else {
              runOnJS(springOpenFromGesture)();
            }
          }),
      [
        closedY,
        dragStartY,
        isClosing,
        openY,
        screenHeight,
        springCloseFromGesture,
        springOpenFromGesture,
        translateY,
      ]
    );

    const sheetAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        translateY.value,
        [openY, closedY],
        [OVERLAY_MAX_OPACITY, 0],
        Extrapolation.CLAMP
      ),
    }));

    if (!rendered) return null;

    return (
      <Modal
        visible
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={() => springClose()}
        statusBarTranslucent
      >
        <GestureHandlerRootView style={styles.root}>
          <Animated.View
            pointerEvents="none"
            style={[styles.backdrop, backdropAnimatedStyle]}
          />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => springClose()}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <Animated.View
            style={[
              styles.sheet,
              { height: sheetHeight },
              sheetAnimatedStyle,
              sheetStyle,
            ]}
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
          >
            <GestureDetector gesture={headerPanGesture}>
              <View style={styles.dragZone}>
                <View style={styles.handleHit}>
                  <View style={styles.handle} />
                </View>
                {header}
              </View>
            </GestureDetector>
            <View style={styles.body}>{children}</View>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "column",
    backgroundColor: CURTAIN_SURFACE,
    borderTopLeftRadius: CORNER_RADIUS,
    borderTopRightRadius: CORNER_RADIUS,
    overflow: "hidden",
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  dragZone: {
    alignItems: "center",
  },
  handleHit: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  handle: {
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: 1,
    backgroundColor: HANDLE_COLOR,
  },
});
