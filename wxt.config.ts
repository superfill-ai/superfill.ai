import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import { APP_NAME } from "./src/constants";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "./src",
  vite: () => {
    return {
      plugins: [tailwindcss()],
    };
  },
  react: {
    vite: {
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    },
  },
  manifest: ({ manifestVersion, mode }) => {
    const isDev = mode === "development";
    const allowLocalhost = isDev ? " http://localhost:3000" : "";

    const baseManifest = {
      name: APP_NAME,
      version: "0.2.3",
      description: "AI-powered form filling browser extension",
      permissions: ["activeTab", "storage", "offscreen", "contextMenus"],
      host_permissions: [
        "https://api.openai.com/*",
        "https://api.anthropic.com/*",
        "https://api.groq.com/*",
        "https://api.deepseek.com/*",
        "https://generativelanguage.googleapis.com/*",
        "https://superfill.ai/*",
        "https://*.superfill.ai/*",
        "http://localhost:3002/*",
      ],
      icons: {
        16: "/icon-16.png",
        32: "/icon-32.png",
        48: "/icon-48.png",
        128: "/icon-128.png",
        256: "/icon-256.png",
        512: "/icon-512.png",
      },
      browser_specific_settings: {
        gecko: {
          data_collection_permissions: {
            required: ["none"],
          },
        },
      },
    } as const;

    if (manifestVersion === 3) {
      return {
        ...baseManifest,
        web_accessible_resources: [
          {
            resources: [
              "icon-128.webp",
              "favicon.svg",
              "right-click-context.gif",
            ],
            matches: ["<all_urls>"],
          },
        ],
        content_security_policy: {
          extension_pages: `script-src 'self' 'wasm-unsafe-eval'${allowLocalhost}; object-src 'self';`,
          sandbox: `script-src 'self' 'unsafe-inline' 'unsafe-eval'${allowLocalhost}; sandbox allow-scripts allow-forms allow-popups allow-modals; child-src 'self';`,
        },
      } as const;
    }

    const unsafeEval = isDev ? " 'unsafe-eval'" : "";
    const wasmEval = " 'wasm-unsafe-eval'";
    return {
      ...baseManifest,
      content_security_policy: {
        extension_pages: `script-src 'self'${wasmEval}${unsafeEval}${allowLocalhost}; object-src 'self';`,
        sandbox: `script-src 'self' 'unsafe-inline' 'unsafe-eval'${allowLocalhost}; sandbox allow-scripts allow-forms allow-popups allow-modals; child-src 'self';`,
      },
    } as const;
  },
});
