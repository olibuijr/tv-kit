<script lang="ts">
  import Film from "lucide-svelte/icons/film";
  import Headphones from "lucide-svelte/icons/headphones";
  import Package from "lucide-svelte/icons/package";
  import Tv from "lucide-svelte/icons/tv";
  import Users from "lucide-svelte/icons/users";
  import type { DeilduCategory, DeilduItem, DeilduScrapeState } from "../../../packages/protocol";

  export let categories: DeilduCategory[] = [];
  export let items: DeilduItem[] = [];
  export let scrape: DeilduScrapeState;
  export let selectedCategoryId = 0;

  $: selectedCategory = categories.find(category => category.id === selectedCategoryId);
  $: displayedCategories = selectedCategory ? [selectedCategory] : categories;

  const icon = (kind: DeilduCategory["mediaKind"]) => kind === "movie" ? Film : kind === "tv" ? Tv : kind === "audio" ? Headphones : Package;
  const formatBytes = (bytes: number) => bytes >= 1_073_741_824 ? `${(bytes / 1_073_741_824).toFixed(1)} GB` : bytes >= 1_048_576 ? `${Math.round(bytes / 1_048_576)} MB` : "Stærð óþekkt";
  const status = (item: DeilduItem) => item.status === "ready" ? "Tilbúið" : item.status === "downloading" || item.status === "starting" ? "Sækist" : item.status === "paused" ? "Ólokið" : item.status === "error" ? "Villa" : item.playable ? "Tilbúið til straums" : "Skráasafn";
  const categoryItems = (categoryId: number) => items.filter(item => item.categoryId === categoryId);
</script>

<main class="deildu-page">
  <div class="heading">
    <div><span>DEILDU</span><h1>{selectedCategory?.name ?? "Kvikmyndir, þættir og deildir"}</h1></div>
    <div><strong>{selectedCategory ? `${selectedCategory.itemCount} færslur` : `${items.length} nýjustu færslur`}</strong><small>{scrape.running ? scrape.message : scrape.lastRun ? "Gagnagrunnur uppfærður" : "Bíður eftir fyrstu samstillingu"}</small></div>
  </div>

  <section class="sync" class:running={scrape.running} aria-live="polite">
    <div><strong>{scrape.running ? "Samstilli Deildu" : scrape.status === "error" ? "Samstilling mistókst" : "Deildu-gagnagrunnur"}</strong><span>{scrape.lastError || scrape.message || `${categories.length} deildir · ${categories.reduce((sum, category) => sum + category.itemCount, 0)} færslur`}</span></div>
    {#if scrape.running}<progress max={Math.max(1, scrape.totalPages)} value={scrape.completedPages}></progress>{/if}
  </section>

  {#if !selectedCategory}
    <section class="category-overview" aria-label="Deildu-flokkar">
      {#each categories as category}
        <article>
          <svelte:component this={icon(category.mediaKind)} size={20}/>
          <div><strong>{category.name}</strong><span>{category.itemCount} færslur</span></div>
        </article>
      {/each}
    </section>
  {/if}

  {#if !items.length}
    <section class="empty">Engar Deildu-færslur eru komnar í gagnagrunninn.</section>
  {:else}
    {#each displayedCategories as category}
      {@const entries = categoryItems(category.id)}
      {#if entries.length}
        <section class="category-section">
          <header><div><svelte:component this={icon(category.mediaKind)} size={20}/><h2>{category.name}</h2></div><span>{category.itemCount} færslur</span></header>
          <div class="item-grid">
            {#each entries as item (item.id)}
              <article>
                <div class="art">{#if item.artwork}<img src={item.artwork} alt="" loading="lazy"/>{:else}<svelte:component this={icon(item.mediaKind)} size={30}/>{/if}<b class:ready={item.status === "ready"} class:active={item.status === "downloading" || item.status === "starting"}>{status(item)}</b></div>
                <div class="copy"><strong>{item.title}</strong><span>{formatBytes(item.totalBytes || item.sizeBytes)}</span><small><Users size={12}/>{item.seeders} deila · {item.leechers} sækja</small></div>
              </article>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  {/if}
</main>

<style>
  .deildu-page{flex:1;min-height:0;padding:20px 42px;overflow:auto}.heading{height:72px;display:flex;align-items:center;justify-content:space-between}.heading>div:first-child>span{font-size:10px;color:var(--primary);font-weight:800}.heading h1{font-size:var(--type-page-title);margin:3px 0}.heading>div:last-child{display:flex;flex-direction:column;text-align:right}.heading small{font-size:10px;color:var(--muted);margin-top:3px}.sync{min-height:64px;padding:12px 16px;display:grid;grid-template-columns:1fr minmax(180px,320px);align-items:center;gap:20px;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow-soft)}.sync.running{border-color:var(--primary)}.sync div{display:flex;flex-direction:column}.sync strong{font-size:13px}.sync span{font-size:10px;color:var(--muted);margin-top:4px}.sync progress{width:100%;accent-color:var(--primary)}.category-overview{margin:14px 0 24px;display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.category-overview article{min-height:62px;padding:10px;display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:10px;background:var(--raised);box-shadow:var(--shadow-soft)}.category-overview :global(svg){flex:0 0 auto;color:var(--primary)}.category-overview div{display:flex;min-width:0;flex-direction:column}.category-overview strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.category-overview span{font-size:8px;color:var(--muted);margin-top:3px}.category-section{margin-bottom:24px}.category-section>header{height:42px;display:flex;align-items:center;justify-content:space-between}.category-section>header div{display:flex;align-items:center;gap:8px}.category-section h2{font-size:var(--type-section);margin:0}.category-section>header :global(svg){color:var(--primary)}.category-section>header span{font-size:10px;color:var(--muted)}.item-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.item-grid article{min-width:0;border:1px solid var(--border);border-radius:11px;overflow:hidden;background:var(--surface);box-shadow:var(--shadow-soft)}.art{aspect-ratio:2 / 3;position:relative;display:grid;place-items:center;background:linear-gradient(135deg,var(--raised),var(--hero-tone));color:var(--primary)}.art img{width:100%;height:100%;object-fit:cover}.art b{position:absolute;right:8px;bottom:7px;padding:4px 6px;border-radius:5px;background:var(--header);color:var(--muted);font-size:8px}.art b.ready{color:var(--presence-accent,var(--primary))}.art b.active{color:var(--primary)}.copy{padding:10px;display:flex;min-width:0;flex-direction:column}.copy strong{font-size:12px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.copy span{font-size:9px;color:var(--muted);margin-top:5px}.copy small{margin-top:6px;display:flex;align-items:center;gap:4px;font-size:8px;color:var(--primary)}.empty{min-height:220px;display:grid;place-items:center;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--muted)}
  @media(max-width:1200px){.deildu-page{padding-inline:20px}.category-overview{grid-template-columns:repeat(4,1fr)}.item-grid{grid-template-columns:repeat(4,1fr)}}
</style>
