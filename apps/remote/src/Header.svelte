<script lang="ts">
  import Power from "lucide-svelte/icons/power";
  import Wifi from "lucide-svelte/icons/wifi";
  import { type HomeState } from "../../../packages/protocol";
  import { formatClock, formatDate } from "../../../packages/protocol/content";

  export let state: HomeState;
  export let now = Date.now();
  export let connected = false;
  export let contentError = "";
  export let command: (action: string, value?: unknown, label?: string) => void;
</script>

<header>
  <div class="brand"><strong>TV Kit</strong><span>{formatDate(now)}</span></div>
  <time>{formatClock(now)}</time>
  <div class:offline={!connected} class="connection"><Wifi size={16}/>{connected ? contentError || "Tengt" : "Tengi"}</div>
  <button class:off={!state.power} aria-label={state.power ? "Slökkva" : "Kveikja"} on:click={() => command("power", undefined, state.power ? "Slökkt" : "Kveikt")}><Power size={21}/></button>
</header>

<style>
  header{height:76px;padding:env(safe-area-inset-top) 18px 0;position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1fr auto auto 48px;align-items:center;gap:15px;border-bottom:1px solid var(--border);background:var(--header)}
  .brand{display:flex;flex-direction:column}.brand strong{font-size:15px}.brand span{font-size:10px;color:var(--muted);text-transform:capitalize}
  .connection{display:flex;align-items:center;gap:6px;color:var(--presence-accent);font-size:10px}.connection.offline{color:var(--primary)}
  time{font-size:16px;font-variant-numeric:tabular-nums}
  button{width:46px;height:46px;border:0;border-radius:11px;background:var(--raised);display:grid;place-items:center}button.off{color:var(--primary)}
  @media(max-width:760px){header{padding-inline:12px;grid-template-columns:1fr auto 46px}time{display:none}.connection{font-size:0}}
</style>
