<script lang="ts">
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import Film from "lucide-svelte/icons/film";
  import Play from "lucide-svelte/icons/play";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Search from "lucide-svelte/icons/search";
  import Star from "lucide-svelte/icons/star";
  import type { DeilduCategory, DeilduScrapeState, DeilduShow, TmdbToday } from "../../../packages/protocol";

  export let categories: DeilduCategory[] = [];
  export let shows: DeilduShow[] = [];
  export let show: DeilduShow | null = null;
  export let scrape: DeilduScrapeState;
  export let loading = false;
  export let command: (action: string, value?: unknown, label?: string) => void;
  export let selectedCategoryId = 0;
  export let tmdbToday: TmdbToday | null = null;
  let query = "";

  $: normalizedQuery = query.trim().toLocaleLowerCase("is");
  $: visibleShows = shows.filter((entry) => !normalizedQuery || entry.title.toLocaleLowerCase("is").includes(normalizedQuery));
  $: selectedCategory = categories.find((category) => category.id === selectedCategoryId);
	$: latestSeason = show ? Math.max(...show.seasons) : 0;
	$: olderSeasons = show ? show.seasons.filter((season) => season !== latestSeason).sort((a, b) => b - a) : [];
  const formatYear = (year: number | null) => year ? String(year) : "";
  const selectCategory = (id: number, name: string) => command("deildu-category", id, id ? `Deildu: ${name}` : "Allar Deildu-færslur");
</script>

<section class="deildu-browser panel" aria-busy={scrape.running || loading}>
  <header class="panel-heading">
    <div><Film size={20}/><h2>{show ? show.title : "Deildu"}</h2></div>
    {#if show}
      <button class="back" on:click={() => command("deildu-show", "", "Til baka í þætti")} aria-label="Til baka í þætti"><ChevronLeft size={18}/>Til baka</button>
    {:else}
      <button disabled={scrape.running} on:click={() => command("deildu-scrape", undefined, "Samstilli Deildu")}><span class:spinning={scrape.running}><RefreshCw size={17}/></span>{scrape.running ? "Samstilli" : "Uppfæra"}</button>
    {/if}
  </header>

  {#if show}
    <article class="show-detail" class:has-art={Boolean(show.backdrop)} style={show.backdrop ? `--art:url(${show.backdrop})` : ""}>
      <div class="detail-stage">
        <div class="episode-pane">
		<header class="hero-copy">
			<h3>{show.title}</h3>
			<div class="show-facts" aria-label="Upplýsingar um þáttinn">
				{#if show.year}<span>{formatYear(show.year)}</span>{/if}
				{#if show.rating !== null}<strong>★ {show.rating.toFixed(1)}</strong>{/if}
				{#if show.votes}<span>{show.votes.toLocaleString("is-IS")} einkunnir</span>{/if}
				<span>{show.seasons.length} {show.seasons.length === 1 ? "sería" : "seríur"}</span><span>{show.episodes.length} þættir</span>
			</div>
			{#if show.description}<p>{show.description}</p>{/if}
		</header>
      <div class="season-list">
		<section class="season-block latest"><h4>Nýjasta serían</h4><h5>Sería {latestSeason}</h5><div class="episodes">
			{#each show.episodes.filter((episode) => episode.season === latestSeason) as episode (episode.season + ":" + (episode.episode ?? "archive"))}
				<button class="episode" on:click={() => command("deildu-play", episode.itemId, `Spila ${show.title}`)}>
					<div class="episode-art">{#if episode.artwork}<img src={episode.artwork} alt="" loading="lazy"/>{:else}<Film size={18}/>{/if}</div>
					<span>{episode.episode === null ? "Öll serían" : `Þáttur ${episode.episode}`}</span><strong>{episode.episode === null ? `Sería ${latestSeason}` : episode.title}</strong><i><Play size={15} fill="currentColor"/>Spila</i>
				</button>
			{/each}
		</div></section>
		{#if olderSeasons.length}<h4 class="older-heading">Fyrri seríur</h4>{/if}
		{#each olderSeasons as season}
          <section>
				<h5>Sería {season}</h5>
            <div class="episodes">
              {#each show.episodes.filter((episode) => episode.season === season) as episode (episode.season + ":" + (episode.episode ?? "archive"))}
                <button class="episode" on:click={() => command("deildu-play", episode.itemId, `Spila ${show.title}`)}>
						<div class="episode-art">{#if episode.artwork}<img src={episode.artwork} alt="" loading="lazy"/>{:else}<Film size={18}/>{/if}</div>
                  <span>{episode.episode === null ? "Öll serían" : `Þáttur ${episode.episode}`}</span>
                  <strong>{episode.episode === null ? `Sería ${season}` : episode.title}</strong>
                  <i><Play size={15} fill="currentColor"/>Spila</i>
                </button>
              {/each}
            </div>
          </section>
        {/each}
		</div></div>
		<aside class="poster-pane">{#if show.artwork}<img src={show.artwork} alt={`Plakat fyrir ${show.title}`}/>{:else}<Film size={42}/>{/if}</aside>
		</div>
    </article>
  {:else}
    {#if tmdbToday}
      <div class="tmdb-strips">
        {#if tmdbToday.movies.length}
          <section class="tmdb-strip">
            <h3>Nýjar kvikmyndir í dag</h3>
            <div class="marquee">
              {#each tmdbToday.movies as item (item.id)}
                <article class="marquee-card">
                  <div class="marquee-poster">{#if item.posterPath}<img src={item.posterPath} alt={item.title} loading="lazy"/>{:else}<Film size={28}/>{/if}</div>
                  <strong>{item.title}</strong>
                  {#if item.rating !== null}<span><Star size={11} fill="currentColor"/> {item.rating.toFixed(1)}</span>{/if}
                </article>
              {/each}
            </div>
          </section>
        {/if}
        {#if tmdbToday.tvShows.length}
          <section class="tmdb-strip">
            <h3>Nýir sjónvarpsþættir í dag</h3>
            <div class="marquee">
              {#each tmdbToday.tvShows as item (item.id)}
                <article class="marquee-card">
                  <div class="marquee-poster">{#if item.posterPath}<img src={item.posterPath} alt={item.title} loading="lazy"/>{:else}<Film size={28}/>{/if}</div>
                  <strong>{item.title}</strong>
                  {#if item.rating !== null}<span><Star size={11} fill="currentColor"/> {item.rating.toFixed(1)}</span>{/if}
                </article>
              {/each}
            </div>
          </section>
        {/if}
      </div>
    {/if}
    <div class="scrape-state" aria-live="polite"><strong>{scrape.lastError || scrape.message || "Deildu-gagnagrunnur tilbúinn"}</strong><span>{categories.length} deildir, {categories.reduce((sum, category) => sum + category.itemCount, 0)} færslur</span></div>
    <label class="search"><Search size={17}/><input bind:value={query} placeholder="Leita að þætti" aria-label="Leita að þætti"/></label>
    <nav class="categories" aria-label="Deildu-flokkar">
      {#each categories as category}
        <button class:active={selectedCategoryId === category.id} aria-pressed={selectedCategoryId === category.id} on:click={() => selectCategory(category.id, category.name)}><span>{category.name}</span><small>{category.itemCount}</small></button>
      {/each}
    </nav>
    {#if selectedCategory?.mediaKind === "tv" && visibleShows.length}
      <div class="show-grid">
        {#each visibleShows as entry (entry.id)}
          <button class="show-card" on:click={() => command("deildu-show", entry.id, entry.title)} aria-label={`Opna ${entry.title}`}>
            <div class="poster">{#if entry.artwork}<img src={entry.artwork} alt="" loading="lazy"/>{:else}<Film size={30}/>{/if}{#if entry.progress !== null}<b class="watch-progress" style={`--progress:${entry.progress * 100}%`}></b>{/if}</div>
            <strong>{entry.title}</strong><span>{entry.seasons.length} {entry.seasons.length === 1 ? "sería" : "seríur"}</span>
          </button>
        {/each}
      </div>
    {:else if !selectedCategoryId}
      <div class="empty">Veldu flokk til að skoða efnið.</div>
    {:else}
      <div class="empty">Engir þættir fundust.</div>
    {/if}
  {/if}
</section>

<style>
.deildu-browser{overflow:visible}.panel-heading{height:58px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.panel-heading>div,.panel-heading button{display:flex;align-items:center;gap:8px}.panel-heading h2{margin:0;font-size:17px}.panel-heading button{min-height:44px;border:0;background:none;color:var(--primary);font-size:13px}.panel-heading button:disabled{opacity:.55}.spinning{animation:spin 1s linear infinite}.tmdb-strips{padding:0}.tmdb-strip{padding:14px 0;border-bottom:1px solid var(--border)}.tmdb-strip h3{margin:0 14px 10px;font-size:15px;font-weight:700}.marquee{display:flex;gap:10px;overflow-x:auto;padding:0 14px 4px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}.marquee::-webkit-scrollbar{height:0}.marquee-card{flex:0 0 110px;scroll-snap-align:start;text-align:left}.marquee-poster{width:110px;aspect-ratio:2/3;display:grid;place-items:center;overflow:hidden;border-radius:10px;background:var(--raised);color:var(--primary);box-shadow:var(--shadow-soft);margin-bottom:6px}.marquee-poster img{width:100%;height:100%;object-fit:cover}.marquee-card strong{display:block;font-size:12px;line-height:1.25}.marquee-card span{display:flex;align-items:center;gap:3px;margin-top:2px;font-size:11px;color:var(--muted)}.scrape-state{padding:11px 14px;display:flex;flex-direction:column;border-bottom:1px solid var(--border)}.scrape-state strong{font-size:13px}.scrape-state span{margin-top:3px;font-size:11px;color:var(--muted)}.search{height:48px;margin:12px;padding:0 13px;display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:9px;background:var(--raised)}.search input{width:100%;border:0;outline:0;background:none;font-size:14px}.categories{padding:0 12px 12px;display:flex;gap:8px;overflow:auto}.categories button{min-width:max-content;height:42px;padding:0 12px;border:1px solid var(--border);border-radius:999px;background:var(--raised);font-size:11px}.categories button.active{border-color:var(--primary);color:var(--primary)}.categories small{margin-left:5px;color:var(--muted)}.show-grid{padding:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.show-card{padding:0;border:0;background:none;text-align:left;min-width:0;transition:transform .2s ease}.show-card:active{transform:scale(.98)}.poster{position:relative;aspect-ratio:2/3;display:grid;place-items:center;overflow:hidden;border-radius:10px;background:var(--raised);color:var(--primary);box-shadow:var(--shadow-soft)}.poster img{width:100%;height:100%;object-fit:cover}.watch-progress{position:absolute;right:0;bottom:0;left:0;height:5px;background:linear-gradient(90deg,var(--primary) var(--progress),rgba(0,0,0,.35) var(--progress))}.show-card strong{display:block;margin-top:8px;font-size:13px;line-height:1.3}.show-card span{display:block;margin-top:3px;font-size:11px;color:var(--muted)}.show-detail{position:relative;min-height:620px;padding:18px;background:linear-gradient(90deg,var(--surface) 0%,color-mix(in srgb,var(--surface) 88%,transparent) 54%,color-mix(in srgb,var(--surface) 46%,transparent)),var(--art);background-size:cover;background-position:center;overflow:hidden}.detail-stage{display:grid;grid-template-columns:minmax(0,1fr) 160px;gap:18px;align-items:start}.episode-pane{min-width:0}.hero-copy{padding:12px 6px 18px;max-width:78%;text-shadow:0 1px 12px rgba(0,0,0,.5)}.hero-copy h3{margin:0;font-size:31px;line-height:1.1;text-wrap:balance}.show-facts{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.show-facts span,.show-facts strong{margin:0!important;padding:3px 7px;border-radius:5px;background:color-mix(in srgb,var(--surface) 84%,transparent);font-size:11px!important;line-height:1.25;color:var(--ink)!important}.show-facts strong{color:var(--primary)!important}.hero-copy p{max-width:62ch;margin:12px 0 0;font-size:14px;line-height:1.6;text-wrap:pretty}.season-list{padding:0 6px 18px}.season-list section+section{margin-top:24px}.season-list h4{margin:0 0 4px;font-size:18px}.season-list h5{margin:0 0 10px;font-size:15px}.older-heading{margin-top:32px!important}.episodes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.episode{min-height:70px;padding:8px;display:grid;grid-template-columns:74px 1fr auto;gap:9px;align-items:center;border:1px solid var(--border);border-radius:10px;background:color-mix(in srgb,var(--raised) 92%,transparent);text-align:left}.episode-art{height:54px;display:grid;place-items:center;overflow:hidden;border-radius:7px;background:var(--surface);color:var(--primary)}.episode-art img{width:100%;height:100%;object-fit:cover}.episode span{font-size:11px;color:var(--muted)}.episode strong{font-size:13px}.episode i{display:flex;align-items:center;gap:5px;color:var(--primary);font-size:12px;font-style:normal}.poster-pane{position:sticky;top:12px;aspect-ratio:2/3;overflow:hidden;border-radius:12px;background:var(--raised);box-shadow:var(--shadow-card);color:var(--primary);display:grid;place-items:center}.poster-pane img{width:100%;height:100%;object-fit:cover}.empty{min-height:180px;display:grid;place-items:center;color:var(--muted);font-size:13px}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:760px){.show-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-stage{grid-template-columns:minmax(0,1fr) 112px}.episodes{grid-template-columns:1fr}.episode{grid-template-columns:62px 1fr auto}.episode-art{height:48px}}@media(prefers-reduced-motion:reduce){.spinning{animation:none}.show-card{transition:none}}
</style>
