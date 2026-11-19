import { Host, Popover, Rectangle, RNHostView } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AcademyMenuRows } from "./AcademyMenuRows";
import type { AcademyMenuProps } from "./AcademyMenu.types";
import { hasSearchTabs } from "./platform";

/**
 * Native SwiftUI popover (compact adaptation: popover) anchored over the academy tab item.
 * The tab item cannot anchor a popover, so an inert view over it does, as in the SwiftUI shell.
 */
export function AcademyMenu({ open, onClose, ...rows }: AcademyMenuProps) {
  const { bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // iOS 26.1+: detached search-role circle at the trailing edge. Earlier: third of three tab items.
  const anchor = hasSearchTabs
    ? { right: 21, bottom: bottom - 12, width: 60, height: 60 }
    : { right: 0, bottom, width: width / 3, height: 49 };
  return (
    <View pointerEvents="none" style={[styles.anchor, anchor]}>
      <Host style={StyleSheet.absoluteFill}>
        <Popover isPresented={open} onIsPresentedChange={(shown) => !shown && onClose()} arrowEdge="bottom">
          <Popover.Trigger>
            <Rectangle modifiers={[foregroundStyle("clear")]} />
          </Popover.Trigger>
          <Popover.Content>
            <RNHostView matchContents>
              <AcademyMenuRows {...rows} />
            </RNHostView>
          </Popover.Content>
        </Popover>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({ anchor: { position: "absolute" } });
