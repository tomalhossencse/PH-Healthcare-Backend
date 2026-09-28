import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src"],

    format: ["esm"], // Keep this as ESM

    target: "esnext",

    outDir: "dist",

    clean: true,

    bundle: true,

    splitting: false,

    sourcemap: true,
    loader: {
        ".ejs": "copy",
    },

    // Add this banner to shim require() for CJS dependencies

    banner: {
        js: `

   import { createRequire } from 'module';

   const require = createRequire(import.meta.url);

  `,
    },
});
