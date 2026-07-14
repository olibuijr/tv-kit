<script lang="ts">
  import Heart from "lucide-svelte/icons/heart";
  import Play from "lucide-svelte/icons/play";
  import Tv from "lucide-svelte/icons/tv";
  import type { RuvNow } from "../../../packages/protocol";
  import { eventProgress } from "../../../packages/protocol/content";

  export let channels: RuvNow[] = [];
  export let favoriteSlugs: string[] = [];
  export let activeMediaId = "";
  export let now = Date.now();
  export let command: (action: string, value?: unknown, label?: string) => void;
</script>

<section class="tv-page" aria-labelledby="tv-page-title">
  <div class="page-heading">
    <div><Tv size={22}/><h2 id="tv-page-title">Sjónvarp</h2></div>
    <span>{channels.length} stöðvar</span>
  </div>

  {#if channels.length}
    <div class="channel-grid">
      {#each channels as item (item.channel.slug)}
        <article class:active={activeMediaId === `ruv-${item.channel.slug}`}>
          <header>
            <div><span class="live-dot"></span><strong>{item.channel.name}</strong></div>
            <button
              class:favorite={favoriteSlugs.includes(item.channel.slug)}
              aria-label={favoriteSlugs.includes(item.channel.slug) ? `Fjarlægja ${item.channel.name} úr uppáhaldi` : `Setja ${item.channel.name} í uppáhald`}
              on:click={() => command("tv-favorite", item.channel.slug)}
            ><Heart size={18} fill={favoriteSlugs.includes(item.channel.slug) ? "currentColor" : "none"}/></button>
          </header>

          <div class="current">
            <span>Í BEINNI</span>
            <h3>{item.current?.title ?? "Bein útsending"}</h3>
            <p>{item.current?.category || item.current?.description || "Dagskrá stöðvarinnar"}</p>
            {#if item.current}<i><b style={`width:${eventProgress(item.current, now)}%`}></b></i>{/if}
          </div>

          {#if item.upcoming.length}
            <div class="upcoming">
              {#each item.upcoming.slice(0, 2) as event}
                <div><time>{new Date(event.startTime).toLocaleTimeString("is-IS", {hour:"2-digit", minute:"2-digit"})}</time><span>{event.title}</span></div>
              {/each}
            </div>
          {/if}

          <button class="tune" on:click={() => command("ruv-channel", item.channel.slug, `Spila ${item.channel.name}`)}>
            <Play size={18} fill="currentColor"/> {activeMediaId === `ruv-${item.channel.slug}` ? "Í spilun" : `Spila ${item.channel.name}`}
          </button>
        </article>
      {/each}
    </div>
  {:else}
    <div class="empty" role="status">Sæki sjónvarpsstöðvar…</div>
  {/if}
</section>

<style>
  .tv-page{display:grid;gap:12px}.page-heading{display:flex;align-items:center;justify-content:space-between;padding:2px 3px}.page-heading>div{display:flex;align-items:center;gap:8px}.page-heading h2{margin:0;font-size:18px}.page-heading>span{font-size:11px;color:var(--muted)}.channel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.channel-grid article{overflow:hidden;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow-card)}.channel-grid article.active{border-color:var(--primary)}article>header{height:52px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);background:var(--raised)}article>header>div{display:flex;align-items:center;gap:9px}.live-dot{width:8px;height:8px;border-radius:50%;background:var(--primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--primary) 16%,transparent)}article>header button{width:38px;height:38px;border:0;border-radius:9px;background:none;color:var(--muted)}article>header button.favorite{color:var(--primary)}.current{min-height:126px;padding:16px;display:flex;flex-direction:column}.current>span{font-size:9px;font-weight:800;letter-spacing:.08em;color:var(--primary)}.current h3{margin:6px 0 4px;font-size:18px}.current p{min-height:30px;margin:0;color:var(--muted);font-size:11px;line-height:1.4}.current i{height:3px;margin-top:auto;background:var(--border)}.current i b{display:block;height:100%;background:var(--primary)}.upcoming{padding:0 16px 12px;display:grid;gap:6px}.upcoming div{display:grid;grid-template-columns:42px 1fr;gap:8px;font-size:10px}.upcoming time{color:var(--primary);font-variant-numeric:tabular-nums}.upcoming span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tune{width:calc(100% - 24px);min-height:44px;margin:0 12px 12px;border:0;border-radius:9px;background:var(--primary);color:var(--bg);font-weight:800;display:flex;align-items:center;justify-content:center;gap:7px}.empty{min-height:180px;display:grid;place-items:center;color:var(--muted)}@media(max-width:640px){.channel-grid{grid-template-columns:1fr}.current{min-height:108px}}
</style>
