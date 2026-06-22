import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "online.unlibets.app",
  appName: "Unlibets",
  webDir: "public",
  server: {
    url: "https://ubdev2026.github.io",
    cleartext: true,
  },
  android: {
    // Add these for stability
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
