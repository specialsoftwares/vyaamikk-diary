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

import {
  createCurtainPhaseController,
  type CurtainPhase,
  type CurtainPhaseController,
} from "./curtainSheetPhases";

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
 *
 * Lifecycle is driven by an explicit phase model (closed → opening → open →
 * closing → closed, see curtainSheetPhases.ts). Teardown is guaranteed even
 * when the close spring is cancelled or reports `finished === false`, backed
 * by a defensive timeout — so the modal and its full-screen backdrop can
 * never remain mounted as an invisible touch blocker after dismissal.
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

    const [phase, setPhase] = useState<CurtainPhase>("closed");
    const onCloseRef = useRef(onClose);
    const onHardwareBackRef = useRef(onHardwareBack);
    onCloseRef.current = onClose;
    onHardwareBackRef.current = onHardwareBack;

    const translateY = useSharedValue(closedY);
    const dragStartY = useSharedValue(closedY);
    const isClosing = useSharedValue(false);

    // Geometry refs so the (stable) controller callbacks always see current values.
    const closedYRef = useRef(closedY);
    closedYRef.current = closedY;
    const translateYRef = useRef(translateY);
    translateYRef.current = translateY;
    const isClosingRef = useRef(isClosing);
    isClosingRef.current = isClosing;

    const controllerRef = useRef<CurtainPhaseController | null>(null);
    if (controllerRef.current === null) {
      controllerRef.current = createCurtainPhaseController({
        onPhaseChange: setPhase,
        onTeardown: () => {
          // Reset animation state and release everything for the parent.
          cancelAnimation(translateYRef.current);
          translateYRef.current.value = closedYRef.current;
          isClosingRef.current.value = false;
          onCloseRef.current();
        },
        scheduleTimeout: (fn, ms) => {
          const id = setTimeout(fn, ms);
          return () => clearTimeout(id);
        },
      });
    }
    const controller = controllerRef.current;

    const handleOpenSettled = useCallback(() => {
      controller.handleOpenSettled();
    }, [controller]);

    const handleCloseSettled = useCallback(() => {
      controller.handleCloseSettled();
    }, [controller]);

    const springClose = useCallback(
      (afterClose?: () => void) => {
        if (!controller.requestClose(afterClose)) return;
        // Phase is now "closing": backdrop + sheet pointerEvents are released
        // on this same render pass; the spring callback fires regardless of
        // `finished`, and the controller timeout covers a dropped callback.
        isClosing.value = true;
        cancelAnimation(translateY);
        translateY.value = withSpring(closedY, CURTAIN_CLOSE_SPRING, () => {
          runOnJS(handleCloseSettled)();
        });
      },
      [closedY, controller, handleCloseSettled, isClosing, translateY]
    );

    const springCloseFromGesture = useCallback(() => {
      springClose();
    }, [springClose]);

    const springOpenFromGesture = useCallback(() => {
      cancelAnimation(translateY);
      translateY.value = withSpring(openY, CURTAIN_OPEN_SPRING);
    }, [openY, translateY]);

    useImperativeHandle(ref, () => ({ close: springClose }), [springClose]);

    // Drive phases from the `visible` prop.
    useEffect(() => {
      if (visible) {
        controller.requestOpen();
      } else if (controller.getPhase() !== "closed") {
        springClose();
      }
    }, [visible, controller, springClose]);

    // Run the open spring once the modal content is mounted ("opening" phase).
    useEffect(() => {
      if (phase !== "opening") return;
      const frame = requestAnimationFrame(() => {
        isClosing.value = false;
        cancelAnimation(translateY);
        translateY.value = closedY;
        translateY.value = withSpring(openY, CURTAIN_OPEN_SPRING, () => {
          runOnJS(handleOpenSettled)();
        });
      });
      return () => cancelAnimationFrame(frame);
    }, [phase, closedY, openY, isClosing, translateY, handleOpenSettled, screenHeight]);

    // Unmount: clear controller timers and stop worklets. onClose is not
    // called here — the parent owning `visible` is going away with us.
    useEffect(() => {
      return () => {
        controller.dispose();
        cancelAnimation(translateYRef.current);
      };
    }, [controller]);

    const rendered = phase !== "closed";
    const closing = phase === "closing";

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
        <GestureHandlerRootView
          style={styles.root}
          pointerEvents={closing ? "box-none" : "auto"}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.backdrop, backdropAnimatedStyle]}
          />
          <Pressable
            style={StyleSheet.absoluteFill}
            pointerEvents={closing ? "none" : "auto"}
            disabled={closing}
            onPress={() => springClose()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityElementsHidden={closing}
            importantForAccessibility={closing ? "no-hide-descendants" : "auto"}
          />
          <Animated.View
            style={[
              styles.sheet,
              { height: sheetHeight },
              sheetAnimatedStyle,
              sheetStyle,
            ]}
            pointerEvents={closing ? "none" : "auto"}
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
