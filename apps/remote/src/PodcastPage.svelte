<script lang="ts">
  import Play from "lucide-svelte/icons/play";
  import Podcast from "lucide-svelte/icons/podcast";
  import type { PodcastSeries } from "../../../packages/protocol";

  export let podcasts: PodcastSeries[] = [];
  export let activeMediaId = "";
  export let command: (action: string, value?: unknown, label?: string) => void;

  const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  const date = (value: number) => { const day = new Date(value); return `${day.getDate()}.${day.getMonth() + 1}.${day.getFullYear()}`; };
</script>

<section class="podcast-browser">
  <div class="section-head"><div><Podcast size={21}/><h2>Hlaðvörp</h2></div><span>{podcasts.length} hlaðvörp</span></div>
  {#each podcasts as podcast (podcast.id)}
    <article class="podcast panel">
      <header>
        {#if podcast.imageUrl}<img src={podcast.imageUrl} alt=""/>{:else}<div class="art"><Podcast size={34}/></div>{/if}
        <div><span>{podcast.author}</span><h3>{podcast.title}</h3><p>{podcast.description}</p></div>
      </header>
      <div class="episodes">
        {#each podcast.episodes as episode (episode.id)}
          <button class:active={activeMediaId === `podcast-${episode.id}`} on:click={() => command("podcast-play", episode.id, `Spila ${episode.title}`)}>
            <span class="play"><Play size={18} fill="currentColor"/></span>
            <span class="copy"><strong>{episode.title}</strong><small>{episode.description}</small><time>{date(episode.publishedAt)} · {duration(episode.duration)}</time></span>
          </button>
        {/each}
      </div>
    </article>
  {:else}
    <div class="empty panel">Sæki hlaðvörp…</div>
  {/each}
</section>

<style>
  .podcast-browser{display:flex;flex-direction:column;gap:12px}.section-head{height:58px;display:flex;align-items:center;justify-content:space-between}.section-head>div{display:flex;align-items:center;gap:8px}.section-head h2{margin:0}.section-head span{font-size:10px;color:var(--muted)}.podcast{overflow:hidden}.podcast header{padding:16px;display:grid;grid-template-columns:120px 1fr;gap:16px;border-bottom:1px solid var(--border)}.podcast header img,.art{width:120px;height:120px;border-radius:12px;object-fit:contain;background:var(--raised)}.art{display:grid;place-items:center;color:var(--primary)}.podcast header>div:last-child{display:flex;min-width:0;flex-direction:column;justify-content:center}.podcast header span{font-size:10px;color:var(--primary);font-weight:800}.podcast h3{margin:4px 0;font-size:22px}.podcast p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.episodes{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border)}.episodes button{min-height:94px;padding:12px;border:0;background:var(--surface);display:grid;grid-template-columns:38px 1fr;gap:10px;text-align:left}.episodes button.active{background:var(--raised);box-shadow:inset 3px 0 var(--primary)}.play{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--primary);color:white}.copy{min-width:0;display:flex;flex-direction:column;gap:3px}.copy strong{font-size:12px}.copy small{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.copy time{font-size:9px;color:var(--faint)}.empty{padding:40px;text-align:center;color:var(--muted)}@media(max-width:760px){.podcast header{grid-template-columns:82px 1fr}.podcast header img,.art{width:82px;height:82px}.episodes{grid-template-columns:1fr}}
</style>
