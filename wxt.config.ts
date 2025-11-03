import { defineConfig } from "wxt";
import { APP_NAME } from "./src/constants";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "./src",
  manifest: {
    name: APP_NAME,
    version: "0.0.1",
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
        24: "/icon-24.png",
        48: "/icon-48.png",
        96: "/icon-96.png",
        128: "/icon-128.png",
      },
    },
  },
});
