// Builds the extension into dist/: the popup and the offscreen page with Vite, the service worker as an ES module,
// the content script as one classic script (content scripts can't import), the manifest with the version of the
// release, and the WebAssembly files of ONNX Runtime.

import {copyFile, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {build} from "vite";
import react from "@vitejs/plugin-react";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");
// the end-to-end test (e2e/run.mjs) builds into its own folder with the shadow roots of the cards open
const e2e = process.argv.includes("--e2e");
const dist = resolve(root, e2e ? "dist-e2e" : "dist");

const common = {
  configFile: false,
  root: resolve(root, "src"),
  publicDir: false,
  logLevel: "warn",
  mode: e2e ? "e2e" : "production",
  build: {
    outDir: dist,
    emptyOutDir: false,
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    target: "chrome116",
    watch: watch ? {} : null,
  },
};

async function writeManifest() {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  // the version of a release comes from its tag, see .github/workflows/release.yml
  if (process.env.EXTENSION_VERSION) {
    manifest.version = process.env.EXTENSION_VERSION;
  }
  await writeFile(resolve(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

async function copyOnnxRuntime() {
  const from = resolve(root, "node_modules/onnxruntime-web/dist");
  const to = resolve(dist, "ort");
  await mkdir(to, {recursive: true});
  for (const file of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
    await copyFile(resolve(from, file), resolve(to, file));
  }
}

await rm(dist, {recursive: true, force: true});

await build({
  ...common,
  publicDir: resolve(root, "public"),
  plugins: [react()],
  base: "/",
  build: {
    ...common.build,
    modulePreload: {polyfill: false},
    rollupOptions: {
      input: {
        popup: resolve(root, "src/popup/index.html"),
        offscreen: resolve(root, "src/offscreen/index.html"),
      },
    },
  },
});

await build({
  ...common,
  build: {
    ...common.build,
    lib: {entry: resolve(root, "src/background/index.ts"), formats: ["es"], fileName: () => "background.js"},
  },
});

await build({
  ...common,
  build: {
    ...common.build,
    lib: {entry: resolve(root, "src/content/index.ts"), formats: ["iife"], name: "casdoorAutofill", fileName: () => "content.js"},
  },
});

await writeManifest();
await copyOnnxRuntime();
console.log(watch ? `Watching for changes, load ${dist} as an unpacked extension` : `Built ${dist}`);
