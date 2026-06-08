import React, { memo, useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { SWIPE_DELETE_ACTION_WIDTH, SwipeDeleteAction } from "./SwipeDeleteAction";
import { notifySwipeRowClosed, notifySwipeRowOpened } from "./swipeDeleteRegistry";
import type { UserDeletableEntityType } from "@/services/records/userContentDeleteTypes";
import { useT } from "@/i18n";

export interface SwipeToDeleteRowProps {
  /** Unique per visible row (e.g. `entry-${id}`). */
  rowKey: string;
  recordId: string;
  entityType: UserDeletableEntityType;
  /** Used for accessibility on the delete action. */
  title: string;
  children: React.ReactNode;
  /** Called when user taps delete (before confirmation). */
  onDeletePress: () => void;
  disabled?: boolean;
  deleteInProgress?: boolean;
}

function SwipeToDeleteRowInner({
  rowKey,
  title,
  children,
  onDeletePress,
  disabled = false,
  deleteInProgress = false,
}: SwipeToDeleteRowProps) {
  const t = useT();
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const rowIdRef = useRef(rowKey);
  rowIdRef.current = rowKey;

  const closeSelf = useCallback(() => {
    swipeRef.current?.close();
  }, []);

  const onSwipeableOpen = useCallback(() => {
    notifySwipeRowOpened(closeSelf);
  }, [closeSelf]);

  const onSwipeableClose = useCallback(() => {
    notifySwipeRowClosed(closeSelf);
  }, [closeSelf]);

  const renderRightActions = useCallback(() => {
    if (disabled) return null;
    const a11y = title.trim()
      ? `Delete ${title}`
      : "Delete";
    return (
      <SwipeDeleteAction
        onPress={() => {
          closeSelf();
          onDeletePress();
        }}
        accessibilityLabel={a11y}
        disabled={deleteInProgress}
      />
    );
  }, [disabled, title, closeSelf, onDeletePress, deleteInProgress, t]);

  if (disabled) {
    return <View style={styles.plain}>{children}</View>;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      overshootRight={false}
      rightThreshold={SWIPE_DELETE_ACTION_WIDTH / 2}
      renderRightActions={renderRightActions}
      onSwipeableOpen={onSwipeableOpen}
      onSwipeableClose={onSwipeableClose}
      containerStyle={styles.container}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderRadius: 0,
  },
  plain: {
    marginBottom: 0,
  },
});

export const SwipeToDeleteRow = memo(SwipeToDeleteRowInner);
