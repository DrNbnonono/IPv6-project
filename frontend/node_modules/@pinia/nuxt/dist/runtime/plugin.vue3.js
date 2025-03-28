import { createPinia, setActivePinia } from "pinia";
import { defineNuxtPlugin } from "#app";
import { toRaw } from "vue";
const plugin = defineNuxtPlugin({
  name: "pinia",
  setup(nuxtApp) {
    const pinia = createPinia();
    nuxtApp.vueApp.use(pinia);
    setActivePinia(pinia);
    if (import.meta.server) {
      nuxtApp.payload.pinia = toRaw(pinia.state.value);
    } else if (nuxtApp.payload && nuxtApp.payload.pinia) {
      pinia.state.value = nuxtApp.payload.pinia;
    }
    return {
      provide: {
        pinia
      }
    };
  }
});
export default plugin;
