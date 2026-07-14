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
  <div class="brand"><span>{formatDate(now)}</span></div>
  <time>{formatClock(now)}</time>
  <div class:offline={!connected} class="connection"><Wifi size={16}/>{connected ? contentError || "Tengt" : "Tengi"}</div>
  <button class:off={!state.power} aria-label={state.power ? "Slökkva" : "Kveikja"} on:click={() => command("power", undefined, state.power ? "Slökkt" : "Kveikt")}><Power size={21}/></button>
</header>
