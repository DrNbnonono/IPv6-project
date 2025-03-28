import { defineNuxtModule, createResolver, addPlugin, addImports, addImportsDir } from '@nuxt/kit';
import { fileURLToPath } from 'node:url';

const module = defineNuxtModule({
  meta: {
    name: "pinia",
    configKey: "pinia",
    compatibility: {
      nuxt: "^3.15.0"
    }
  },
  defaults: {},
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);
    const runtimeDir = fileURLToPath(new URL("./runtime", import.meta.url));
    nuxt.options.build.transpile.push(resolve(runtimeDir));
    nuxt.options.vite.optimizeDeps ??= {};
    nuxt.options.vite.optimizeDeps.exclude ??= [];
    if (!nuxt.options.vite.optimizeDeps.exclude.includes("pinia")) {
      nuxt.options.vite.optimizeDeps.exclude.push("pinia");
    }
    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ types: "@pinia/nuxt" });
    });
    nuxt.hook("modules:done", () => {
      addPlugin(resolve(runtimeDir, "plugin.vue3"));
      addPlugin(resolve(runtimeDir, "payload-plugin"));
    });
    const composables = resolve(runtimeDir, "composables");
    addImports([
      { from: composables, name: "defineStore" },
      { from: composables, name: "acceptHMRUpdate" },
      { from: composables, name: "usePinia" },
      { from: composables, name: "storeToRefs" }
    ]);
    if (!options.storesDirs) {
      options.storesDirs = [resolve(nuxt.options.srcDir, "stores")];
    }
    if (options.storesDirs) {
      for (const storeDir of options.storesDirs) {
        addImportsDir(resolve(nuxt.options.rootDir, storeDir));
      }
    }
  }
});

export { module as default };
