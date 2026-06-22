"use client";

import { useEffect, useRef, useState } from "react";
import { getToken, onMessage, Unsubscribe } from "firebase/messaging";
import { fetchToken, messaging } from "@/firebase";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { initPushNotifications } from "@/lib/push-notifications";

async function getNotificationPermissionAndToken() {
  // Step 1: Check if Notifications are supported in the browser.
  if (!("Notification" in window)) {
    console.info("This browser does not support desktop notification");
    return null;
  }

  // Step 2: Check if permission is already granted.
  if (Notification.permission === "granted") {
    return await fetchToken();
  }

  // Step 3: If permission is not denied, request permission from the user.
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      return await fetchToken();
    }
  }

  console.log("Notification permission not granted.");
  return null;
}

function getNativeNotificationPath(data: Record<string, unknown>) {
  if (typeof data.q === "string") return data.q;
  if (typeof data.link !== "string") return null;

  try {
    const link = new URL(data.link, window.location.origin);
    return link.searchParams.get("q") || link.pathname;
  } catch {
    return null;
  }
}

const useFcmToken = () => {
  const router = useRouter(); // Initialize the router for navigation.
  const [notificationPermissionStatus, setNotificationPermissionStatus] =
    useState<NotificationPermission | null>(null); // State to store the notification permission status.
  const [token, setToken] = useState<string | null>(null); // State to store the FCM token.
  const retryLoadToken = useRef(0); // Ref to keep track of retry attempts.
  const isLoading = useRef(false); // Ref to keep track if a token fetch is currently in progress.

  const loadToken = async () => {
    // Step 4: Prevent multiple fetches if already fetched or in progress.
    if (isLoading.current) return;

    isLoading.current = true; // Mark loading as in progress.
    const token = await getNotificationPermissionAndToken(); // Fetch the token.

    // Step 5: Handle the case where permission is denied.
    if (Notification.permission === "denied") {
      setNotificationPermissionStatus("denied");
      console.info(
        "%cPush Notifications issue - permission denied",
        "color: green; background: #c7c7c7; padding: 8px; font-size: 20px",
      );
      isLoading.current = false;
      return;
    }

    // Step 6: Retry fetching the token if necessary. (up to 3 times)
    // This step is typical initially as the service worker may not be ready/installed yet.
    if (!token) {
      if (retryLoadToken.current >= 3) {
        alert("Unable to load token, refresh the browser");
        console.info(
          "%cPush Notifications issue - unable to load token after 3 retries",
          "color: green; background: #c7c7c7; padding: 8px; font-size: 20px",
        );
        isLoading.current = false;
        return;
      }

      retryLoadToken.current += 1;
      console.error("An error occurred while retrieving token. Retrying...");
      isLoading.current = false;
      await loadToken();
      return;
    }

    // Step 7: Set the fetched token and mark as fetched.
    setNotificationPermissionStatus(Notification.permission);
    setToken(token);
    isLoading.current = false;
  };

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let disposed = false;
      let removeNativeListeners: (() => Promise<unknown>) | undefined;

      void initPushNotifications({
        onToken: (nativeToken) => {
          if (!disposed) setToken(nativeToken);
        },
        onPermissionChange: (permission) => {
          if (!disposed) setNotificationPermissionStatus(permission);
        },
        onNotificationAction: (data) => {
          const path = getNativeNotificationPath(data);
          if (!path) return;

          const wrapperUrl = new URL(window.location.href);
          wrapperUrl.hash = "";
          wrapperUrl.search = "";
          wrapperUrl.searchParams.set("q", path);
          window.location.replace(wrapperUrl.toString());
        },
      })
        .then((removeListeners) => {
          if (disposed) {
            void removeListeners();
          } else {
            removeNativeListeners = removeListeners;
          }
        })
        .catch((error) => {
          console.error("Unable to initialize native push notifications:", error);
        });

      return () => {
        disposed = true;
        void removeNativeListeners?.();
      };
    }

    // Browser builds use the Firebase Web Messaging SDK and service worker.
    if ("Notification" in window) void loadToken();
  }, []);

  useEffect(() => {
    const setupListener = async () => {
      if (Capacitor.isNativePlatform()) return;
      if (!token) return; // Exit if no token is available.

      console.log("FCM web token:", token);
      const m = await messaging();
      if (!m) return;

      // Step 9: Register a listener for incoming FCM messages.
      const unsubscribe = onMessage(m, (payload) => {
        if (Notification.permission !== "granted") return;

        console.log("Foreground push notification received:", payload);
        const link = payload.fcmOptions?.link || payload.data?.link;

        if (link) {
          toast.info(
            `${payload.notification?.title}: ${payload.notification?.body}`,
            {
              action: {
                label: "Visit",
                onClick: () => {
                  const link = payload.fcmOptions?.link || payload.data?.link;
                  if (link) {
                    router.push(link);
                  }
                },
              },
            },
          );
        } else {
          toast.info(
            `${payload.notification?.title}: ${payload.notification?.body}`,
          );
        }

        // --------------------------------------------
        // Disable this if you only want toast notifications.
        const n = new Notification(
          payload.notification?.title || "New message",
          {
            body: payload.notification?.body || "This is a new message",
            data: link ? { url: link } : undefined,
          },
        );

        // Step 10: Handle notification click event to navigate to a link if present.
        n.onclick = (event) => {
          event.preventDefault();
          const link = (event.target as any)?.data?.url;
          if (link) {
            router.push(link);
          } else {
            console.log("No link found in the notification payload");
          }
        };
        // --------------------------------------------
      });

      return unsubscribe;
    };

    let unsubscribe: Unsubscribe | null = null;

    setupListener().then((unsub) => {
      if (unsub) {
        unsubscribe = unsub;
      }
    });

    // Step 11: Cleanup the listener when the component unmounts.
    return () => unsubscribe?.();
  }, [token, router, toast]);

  return { token, notificationPermissionStatus }; // Return the token and permission status.
};

export default useFcmToken;
