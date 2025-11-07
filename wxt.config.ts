import { defineConfig } from "wxt";
import { APP_NAME } from "./src/constants";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "./src",
  manifest: {
    name: APP_NAME,
    version: "0.0.4",
    description: "AI-powered form filling browser extension",
    permissions: ["activeTab", "storage"],
    host_permissions: [
      "https://api.openai.com/*",
      "https://api.anthropic.com/*",
      "https://api.groq.com/*",
      "https://api.deepseek.com/*",
      "https://generativelanguage.googleapis.com/*",
    ],
    manifest: {
      icons: {
        16: "/icon-16.png",
        32: "/icon-32.png",
        48: "/icon-48.png",
        128: "/icon-128.png",
        256: "/icon-256.png",
        512: "/icon-512.png",
      },
    },
  },
});
