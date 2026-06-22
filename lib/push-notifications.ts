import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

type PushNotificationOptions = {
  onToken?: (token: string) => void;
  onPermissionChange?: (permission: "granted" | "denied") => void;
};

export async function initPushNotifications({
  onToken,
  onPermissionChange,
}: PushNotificationOptions = {}) {
  if (!Capacitor.isNativePlatform()) return () => Promise.resolve();

  // Register listeners first: Android can emit the token immediately after
  // register(), so attaching them later can miss the event.
  const listeners = await Promise.all([
    PushNotifications.addListener("registration", (token) => {
      console.log("FCM registration token:", token.value);
      onToken?.(token.value);
    }),
    PushNotifications.addListener("registrationError", (error) => {
      console.error("FCM registration failed:", error);
    }),
    PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        console.log("Foreground push notification received:", notification);
      },
    ),
    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        console.log("Push notification opened:", action.notification);
      },
    ),
  ]);

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== "granted") {
    console.warn("Push notification permission denied");
    onPermissionChange?.("denied");
    await Promise.all(listeners.map((listener) => listener.remove()));
    return () => Promise.resolve();
  }

  onPermissionChange?.("granted");
  await PushNotifications.register();

  return () => Promise.all(listeners.map((listener) => listener.remove()));
}
