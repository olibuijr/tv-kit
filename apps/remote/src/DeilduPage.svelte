<script lang="ts">
  import Download from "lucide-svelte/icons/download";
  import Film from "lucide-svelte/icons/film";
  import Headphones from "lucide-svelte/icons/headphones";
  import Package from "lucide-svelte/icons/package";
  import Play from "lucide-svelte/icons/play";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Search from "lucide-svelte/icons/search";
  import Tv from "lucide-svelte/icons/tv";
  import Users from "lucide-svelte/icons/users";
  import type { DeilduCategory, DeilduItem, DeilduPagination, DeilduScrapeState } from "../../../packages/protocol";

  export let categories: DeilduCategory[] = [];
  export let items: DeilduItem[] = [];
  export let scrape: DeilduScrapeState;
  export let pagination: DeilduPagination = { categoryId: 0, page: 1, pageSize: 24, totalItems: 0, totalPages: 0 };
  export let loading = false;
  export let loadPage: (page: number) => void = () => {};
  export let command: (action: string, value?: unknown, label?: string) => void;
  export let selectedCategoryId = 0;
  let query = "";

  $: normalizedQuery = query.trim().toLocaleLowerCase("is");
  $: visibleItems = items.filter(item =>
    (!selectedCategoryId || item.categoryId === selectedCategoryId) &&
    (!normalizedQuery || `${item.title} ${item.categoryName}`.toLocaleLowerCase("is").includes(normalizedQuery))
  );

  const icon = (kind: DeilduCategory["mediaKind"]) => kind === "movie" ? Film : kind === "tv" ? Tv : kind === "audio" ? Headphones : Package;
  const formatBytes = (bytes: number) => bytes >= 1_073_741_824 ? `${(bytes / 1_073_741_824).toFixed(1)} GB` : bytes >= 1_048_576 ? `${Math.round(bytes / 1_048_576)} MB` : "Stærð óþekkt";
  const status = (item: DeilduItem) => item.status === "ready" ? "Tilbúið" : item.status === "downloading" || item.status === "starting" ? "Sækist" : item.status === "paused" ? "Ólokið" : item.status === "error" ? item.error || "Villa" : item.playable ? "Straumspilun" : "Ekki spilunarflokkur";
  const busy = (item: DeilduItem) => item.status === "starting" || item.status === "downloading";
  const progress = (item: DeilduItem) => item.totalBytes ? Math.min(100, item.downloadedBytes / item.totalBytes * 100) : 0;
  const selectCategory = (id: number, name: string) => command("deildu-category", id, id ? `Deildu: ${name}` : "Allar Deildu-færslur");
</script>

<section class="deildu-browser panel" aria-busy={scrape.running}>
  <header class="panel-heading">
    <div><Film size={20}/><h2>Deildu</h2></div>
    <button disabled={scrape.running} on:click={() => command("deildu-scrape", undefined, "Samstilli Deildu")}><span class="sync-icon" class:spinning={scrape.running}><RefreshCw size={17}/></span>{scrape.running ? "Samstilli" : "Uppfæra"}</button>
  </header>

  <div class="scrape-state" class:error={scrape.status === "error"} aria-live="polite">
    <div><strong>{scrape.running ? scrape.message : scrape.lastError || scrape.message || "Deildu-gagnagrunnur tilbúinn"}</strong><span>{categories.length} deildir · {categories.reduce((sum, category) => sum + category.itemCount, 0)} færslur</span></div>
    {#if scrape.running}<progress max={Math.max(1, scrape.totalPages)} value={scrape.completedPages}></progress>{/if}
  </div>

  <label class="search"><Search size={17}/><input bind:value={query} placeholder="Leita á Deildu" aria-label="Leita í Deildu-færslum"/></label>

  <nav class="categories" aria-label="Deildu-flokkar">
    <button class:active={selectedCategoryId === 0} aria-pressed={selectedCategoryId === 0} on:click={() => selectCategory(0, "Allt")}><Package size={16}/><span>Allt</span><small>{pagination.totalItems}</small></button>
    {#each categories as category}
      <button class:active={selectedCategoryId === category.id} aria-pressed={selectedCategoryId === category.id} on:click={() => selectCategory(category.id, category.name)}>
        <svelte:component this={icon(category.mediaKind)} size={16}/><span>{category.name}</span><small>{category.itemCount}</small>
      </button>
    {/each}
  </nav>

  {#if !visibleItems.length}
    <div class="empty">Engar Deildu-færslur passa við valið.</div>
  {:else}
    <div class="items">
      {#each visibleItems as item (item.id)}
        <button disabled={!item.playable || busy(item)} aria-label={item.playable ? `Spila ${item.title}` : `${item.title} er ekki spilunarhæft`} on:click={() => command("deildu-play", item.id, `Spila af Deildu: ${item.title}`)}>
          <div class="art">{#if item.artwork}<img src={item.artwork} alt="" loading="lazy"/>{:else}<svelte:component this={icon(item.mediaKind)} size={26}/>{/if}{#if item.playable}<span class="play"><Play size={18} fill="currentColor"/></span>{/if}</div>
          <div class="copy"><strong>{item.title}</strong><span>{item.categoryName} · {formatBytes(item.totalBytes || item.sizeBytes)}</span><small><Users size={12}/>{item.seeders} deila · {item.leechers} sækja</small><em>{status(item)}</em>{#if busy(item) || item.status === "paused"}<i><b style={`width:${progress(item)}%`}></b></i>{/if}</div>
          {#if item.status === "ready"}<span class="ready"><Download size={17}/></span>{/if}
        </button>
      {/each}
    </div>
    {#if pagination.page < pagination.totalPages}
      <button class="load-more" disabled={loading} on:click={() => loadPage(pagination.page + 1)}>{loading ? "Sæki fleiri…" : `Sækja fleiri · ${pagination.page}/${pagination.totalPages}`}</button>
    {/if}
  {/if}
</section>

<style>
  .deildu-browser{overflow:visible}.panel-heading{height:52px;padding:0 15px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.panel-heading>div{display:flex;align-items:center;gap:8px}.panel-heading h2{font-size:14px;margin:0}.panel-heading button{height:44px;padding:0 8px;border:0;background:none;display:flex;align-items:center;gap:5px;color:var(--primary);font-size:11px}.panel-heading button:disabled{opacity:.55}.scrape-state{min-height:54px;padding:10px 14px;display:grid;grid-template-columns:1fr minmax(130px,250px);align-items:center;gap:12px;border-bottom:1px solid var(--border);background:var(--raised)}.scrape-state.error{color:var(--primary)}.scrape-state div{display:flex;min-width:0;flex-direction:column}.scrape-state strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.scrape-state span{font-size:8px;color:var(--muted);margin-top:3px}.scrape-state progress{width:100%;accent-color:var(--primary)}.search{height:44px;margin:10px 10px 0;padding:0 11px;display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:9px;background:var(--raised)}.search input{width:100%;border:0;outline:0;background:none;font-size:11px}.categories{padding:10px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;overflow:visible}.categories button{min-width:0;height:54px;padding:6px 9px;border:1px solid var(--border);border-radius:9px;background:var(--raised);display:grid;grid-template-columns:20px 1fr;align-items:center;text-align:left}.categories button.active{border-color:var(--primary);color:var(--primary)}.categories span{font-size:9px;white-space:nowrap}.categories small{grid-column:2;font-size:7px;color:var(--muted)}.items{padding:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.items>button{min-height:0;padding:0;position:relative;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--raised);text-align:left}.items>button:disabled{opacity:.55;cursor:not-allowed}.art{width:100%;aspect-ratio:2 / 3;position:relative;display:grid;place-items:center;background:linear-gradient(135deg,var(--surface),var(--header));color:var(--primary)}.art img{width:100%;height:100%;object-fit:cover}.play{position:absolute;right:7px;bottom:7px;display:flex}.copy{padding:9px;display:flex;min-width:0;flex-direction:column}.copy strong{font-size:10px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.copy span{font-size:8px;color:var(--muted);margin-top:4px}.copy small{display:flex;align-items:center;gap:4px;font-size:8px;color:var(--primary);margin-top:5px}.copy em{font-size:8px;color:var(--muted);font-style:normal;margin-top:auto}.copy i{height:3px;background:var(--border);margin-top:5px}.copy i b{display:block;height:100%;background:var(--primary)}.ready{position:absolute;right:7px;top:7px;display:flex;color:var(--presence-accent)}.empty{min-height:180px;display:grid;place-items:center;color:var(--muted)}.load-more{width:calc(100% - 20px);min-height:44px;margin:0 10px 10px;border:1px solid var(--border);border-radius:9px;background:var(--raised);color:var(--primary);font-size:10px}.load-more:disabled{opacity:.55;cursor:wait}.sync-icon{display:flex}.spinning{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:760px){.items{grid-template-columns:repeat(2,minmax(0,1fr))}.scrape-state{grid-template-columns:1fr}.categories{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(prefers-reduced-motion:reduce){.spinning{animation:none}}
</style>
