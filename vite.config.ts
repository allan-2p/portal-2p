// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Server-side env (no VITE_ prefix) for server routes such as the email webhook.
// Not added to client define — these must never reach the browser bundle.
const serverEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Identidade do build: muda a cada publicação e dispara o refresh forçado
    // nos navegadores que ainda estão numa versão antiga.
    define: {
      __APP_BUILD_ID__: JSON.stringify(
        process.env["LOVABLE_BUILD_ID"] ?? process.env["CF_VERSION_METADATA_ID"] ?? String(Date.now()),
      ),
    },
    plugins: [mcpPlugin()],

    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          // Bibliotecas pesadas em chunks próprios: saem do bundle inicial e
          // só são baixadas na tela que precisa delas (catálogo, funil, chat).
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            if (id.includes("xlsx")) return "vendor-xlsx";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("shiki") || id.includes("streamdown") || id.includes("mermaid"))
              return "vendor-markdown";
            if (id.includes("qrcode")) return "vendor-qrcode";
            return;
          },
        },
      },
    },

    resolve: {
      // Aliases exatos: um alias "entities" solto também capturava subcaminhos
      // (ex.: "entities/escape" do parse5 v8) e apontava para a v4 da raiz.
      alias: [
        {
          find: "entities/lib/decode.js",
          replacement: path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        },
        {
          find: "entities/lib/encode.js",
          replacement: path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        },
        { find: /^entities$/, replacement: path.resolve(__dirname, "node_modules/entities") },
      ],
    },
  },
});
