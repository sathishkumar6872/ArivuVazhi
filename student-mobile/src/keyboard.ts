import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Small cushion so the composer clears Gboard / suggestion bar (WhatsApp-like). */
const EXTRA_LIFT = Platform.OS === "android" ? 28 : Platform.OS === "ios" ? 12 : 16;

/**
 * Bottom lift so the chat composer sits on top of the keyboard (WhatsApp-style).
 * Uses keyboard events on iOS/Android. Web uses visualViewport when available.
 */
export function useKeyboardLift() {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const vv = window.visualViewport;
      if (!vv) return;
      const sync = () => {
        const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        setLift(covered > 0 ? covered + EXTRA_LIFT : 0);
      };
      vv.addEventListener("resize", sync);
      vv.addEventListener("scroll", sync);
      sync();
      return () => {
        vv.removeEventListener("resize", sync);
        vv.removeEventListener("scroll", sync);
      };
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (event) => {
      const height = Math.max(0, Math.round(event.endCoordinates.height));
      setLift(height > 0 ? height + EXTRA_LIFT : 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setLift(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return lift;
}
