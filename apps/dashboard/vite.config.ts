import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../../", "");
  return { envDir: "../../", plugins: [svelte()], server: { host: "0.0.0.0", port: Number(env.DASHBOARD_PORT), strictPort: true } };
});
