import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android shell. It loads the static export in `out/` from the APK itself,
 * so the app has no dependency on the server or on a network connection.
 */
const config: CapacitorConfig = {
  appId: "il.cartfit.app",
  appName: "CartFit",
  webDir: "out",
  android: {
    allowMixedContent: false,
    backgroundColor: "#F8FAFC",
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
