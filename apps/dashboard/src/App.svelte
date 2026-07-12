<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import Clock3 from "lucide-svelte/icons/clock-3";
  import Home from "lucide-svelte/icons/home";
  import Newspaper from "lucide-svelte/icons/newspaper";
  import Play from "lucide-svelte/icons/play";
  import Radio from "lucide-svelte/icons/radio";
  import Sunrise from "lucide-svelte/icons/sunrise";
  import Tv from "lucide-svelte/icons/tv";
  import Wifi from "lucide-svelte/icons/wifi";
  import ScheduledTaskNotice from "../../../packages/protocol/ScheduledTaskNotice.svelte";
  import { startSolarTheme, type SolarTheme } from "../../../packages/protocol/solar";
  import { tvServerUrl, tvServerWebSocketUrl, type DashboardContent, type HomeState, type RuvNewsArticle, type RuvProgram, type Station } from "../../../packages/protocol";
  import { articleImages, articleParagraphs, contentIsStale, deriveRuvNow, EMPTY_DASHBOARD_CONTENT, eventProgress, fetchDashboardContent, fetchNewsArticle, formatClock, formatDate, formatDuration, formatScheduleTime, formatTime, relativeTime } from "../../../packages/protocol/content";
  import DeilduPage from "./DeilduPage.svelte";
  import GlobalPlayer from "./GlobalPlayer.svelte";
  import RadioPage from "./RadioPage.svelte";

  let state: HomeState | undefined;
  let connected = false;
  let now = Date.now();
  let solar: SolarTheme | undefined;
  let stations: Station[] = [];
  let content: DashboardContent = EMPTY_DASHBOARD_CONTENT;
  let contentError = "";
  let contentLoading = true;
  let socket: WebSocket;
  let contentController: AbortController | undefined;
  let newsPage: HTMLElement | undefined;
  let selectedNewsArticle: RuvNewsArticle | undefined;
  let selectedNewsArticleId = 0;
  let newsArticleLoading = false;
  let newsArticleError = "";
  let newsParagraphs: string[] = [];
  let newsImages: string[] = [];
  let generation = 0;
  const refreshMs = Math.max(15_000, Number(import.meta.env.VITE_CONTENT_REFRESH_MS || 30_000));

  $: clockText = formatClock(now);
  $: dateText = formatDate(now);
  $: channels = content.channels.map(channel => deriveRuvNow(channel, now));
  $: liveProgramme = channels.find(item => state?.media.id === `ruv-channel-${item.channel.slug}`)?.current ?? null;
  $: torrentMovies = content.torrentMovies ?? [];
  $: sarpurPrograms = [...new Map([...content.movies, ...content.programs].map(program => [program.id, program])).values()];
  $: sarpurFeatured = sarpurPrograms.filter(program => program.featured);
  $: sarpurSections = (() => {
    const byCategory = new Map<string, { title: string; slug: string; items: RuvProgram[] }>();
    for (const program of sarpurPrograms) {
      for (const category of program.categories) {
        const section = byCategory.get(category.slug) ?? { title: category.title, slug: category.slug, items: [] };
        if (!section.items.some(item => item.id === program.id)) section.items.push(program);
        byCategory.set(category.slug, section);
      }
    }
    return [{ title: "Síðast á dagskrá", slug: "sidast-a-dagskra", items: sarpurPrograms.slice(0, 12) }, ...byCategory.values()];
  })();
  $: sarpurHero = sarpurFeatured[0] ?? sarpurPrograms[0];
  $: stale = contentIsStale(content, now, refreshMs * 3);

  async function refreshContent() {
    const request = ++generation;
    contentController?.abort();
    contentController = new AbortController();
    try {
      const next = await fetchDashboardContent(contentController.signal, state?.deilduCategoryId ?? 0);
      if (request !== generation) return;
      content = next;
      contentError = "";
    } catch (error) {
      if (request !== generation || (error instanceof DOMException && error.name === "AbortError")) return;
      contentError = error instanceof Error ? error.message : "Ekki náðist í efni";
    } finally {
      if (request === generation) contentLoading = false;
    }
  }

  async function refreshStations() {
    try {
      const response = await fetch(`${tvServerUrl()}/radio/stations`);
      if (!response.ok) throw new Error();
      stations = (await response.json()).stations as Station[];
    } catch { /* Keep the last successful station list. */ }
  }

  async function loadNewsArticle(id: number) {
    selectedNewsArticleId = id;
    selectedNewsArticle = undefined;
    newsParagraphs = [];
    newsImages = [];
    newsArticleError = "";
    newsArticleLoading = Boolean(id);
    if (!id) return;
    try {
      const article = await fetchNewsArticle(id);
      if (id !== selectedNewsArticleId) return;
      selectedNewsArticle = article;
      newsParagraphs = articleParagraphs(article.bodyHtml);
      newsImages = articleImages(article.bodyHtml).filter(image => image !== article.mainImageUrl);
    } catch {
      if (id === selectedNewsArticleId) newsArticleError = "Ekki náðist í fréttina";
    } finally {
      if (id === selectedNewsArticleId) newsArticleLoading = false;
    }
  }

  onMount(() => {
    const clockTimer = window.setInterval(() => now = Date.now(), 1_000);
    const contentTimer = window.setInterval(refreshContent, refreshMs);
    const stationTimer = window.setInterval(refreshStations, 300_000);
    const stopSolar = startSolarTheme(theme => solar = theme);
    let retry: number;
    let lastMessage = Date.now();
    const connect = () => {
      socket = new WebSocket(tvServerWebSocketUrl());
      socket.onopen = () => { connected = true; lastMessage = Date.now(); void refreshContent(); };
      socket.onclose = () => { connected = false; retry = window.setTimeout(connect, 1_500); };
      socket.onmessage = ({ data }) => {
        lastMessage = Date.now();
        const message = JSON.parse(data);
        if (message.type === "state") {
          const previousCategoryId = state?.deilduCategoryId;
          state = message.state;
          if (state.deilduCategoryId !== previousCategoryId) void refreshContent();
          if (state.newsArticleId !== selectedNewsArticleId) void loadNewsArticle(state.newsArticleId);
        } else if (message.type === "news-scroll" && typeof message.value === "number" && newsPage) newsPage.scrollTop = message.value * Math.max(0, newsPage.scrollHeight - newsPage.clientHeight);
      };
    };
    const heartbeatTimer = window.setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessage > 30_000) socket.close();
      else socket.send(JSON.stringify({ type: "ping" }));
    }, 10_000);
    const visibility = () => {
      if (document.visibilityState !== "visible") return;
      now = Date.now(); void refreshContent();
      if (socket?.readyState === WebSocket.OPEN && Date.now() - lastMessage > 30_000) socket.close();
    };
    document.addEventListener("visibilitychange", visibility);
    void refreshContent();
    void refreshStations();
    connect();
    return () => {
      clearInterval(clockTimer); clearInterval(contentTimer); clearInterval(stationTimer); clearInterval(heartbeatTimer); clearTimeout(retry);
      document.removeEventListener("visibilitychange", visibility);
      contentController?.abort(); socket?.close(); stopSolar();
    };
  });

  function command(action: string, value?: unknown, label?: string) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "command", action, value, label }));
  }

  const solarTime = (value?: number) => value ? new Intl.DateTimeFormat("is-IS", { hour: "2-digit", minute: "2-digit", timeZone: "Atlantic/Reykjavik" }).format(new Date(value * 1_000)) : "—";
  const torrentStatus = (status: string) => status === "ready" ? "Torrent tilbúið" : status === "downloading" ? "Torrent sækist" : status === "incomplete" ? "Torrent ófullgert" : "Torrent ekki sótt";
</script>

<svelte:head><title>TV Kit · RÚV</title></svelte:head>

{#if state}
<div class="shell">
  {#if state.power}
    <header>
      <div class="identity"><Home size={25}/><div><strong>TV Kit</strong><span>RÚV · Sarpurinn · Útvarp</span></div></div>
      <div class="date"><strong>{dateText}</strong><span>{solar?.location ?? "Akureyri"}</span></div>
      <div class="sync" class:warning={Boolean(contentError) || stale}><Wifi size={17}/><span>{connected ? contentError ? "Samband · gömul gögn" : stale ? "Uppfæri efni" : "Tengt" : "Tengi aftur"}</span></div>
      <time datetime={new Date(now).toISOString()}>{clockText}</time>
    </header>
  {/if}

  {#if !state.power}
    <main class="standby"><Home size={40}/><time>{clockText}</time><p>{dateText}</p><span>Kveiktu með fjarstýringunni</span></main>
  {:else if state.view === "radio"}
    <RadioPage {state} {stations}/>
  {:else if state.view === "tv"}
    <main class="page tv-page">
      <div class="heading"><div><span>Í BEINNI</span><h1>Sjónvarpsdagskrá RÚV</h1></div><div><strong>{channels.length} rásir</strong><small>Uppfærist sjálfkrafa</small></div></div>
      <section class="channel-focus-grid">
        {#each channels as item}
          <article class:active={state.media.id === `ruv-channel-${item.channel.slug}`} class="channel-focus">
            <div class="channel-art" class:has-image={Boolean(item.current?.watchFromStart?.image)} style={item.current?.watchFromStart?.image || (state.media.id === `ruv-channel-${item.channel.slug}` ? state.media.artwork : "") ? `background-image:url('${item.current?.watchFromStart?.image || state.media.artwork}')` : undefined}>
              <span>{item.channel.name}</span>
              <div><b>Í BEINNI</b><h2>{item.current?.title ?? item.channel.name}</h2><p>{item.current?.category || item.current?.description || "Bein útsending"}</p></div>
            </div>
            {#if item.current}<div class="event-progress"><i style={`width:${eventProgress(item.current, now)}%`}></i></div>{/if}
            <div class="upcoming"><h3>Næst</h3>{#if item.upcoming.length}{#each item.upcoming.slice(0,4) as event}<div><time>{formatScheduleTime(event.startTime, now)}</time><span><strong>{event.title}</strong><small>{event.category || (event.endTime ? formatDuration((event.endTime-event.startTime)/1000) : "")}</small></span></div>{/each}{:else}<p>Engin næstu atriði skráð.</p>{/if}</div>
          </article>
        {/each}
      </section>
    </main>
  {:else if state.view === "deildu"}
    <DeilduPage categories={content.deilduCategories} items={content.deilduItems} scrape={content.deilduScrape} selectedCategoryId={state.deilduCategoryId}/>
  {:else if state.view === "media"}
    <main class="sarpur-page">
      {#if contentLoading && !sarpurPrograms.length && !torrentMovies.length}
        <section class="empty">Sæki efni úr gagnagrunni…</section>
      {:else if !sarpurPrograms.length && !torrentMovies.length}
        <section class="empty">Ekkert myndefni er tiltækt.</section>
      {:else}
        {#if sarpurHero}
          {@const heroImage = sarpurHero.image || sarpurHero.latestEpisode?.image || sarpurHero.portraitImage}
          <section class="sarpur-featured" aria-label="Sarpurinn">
            <article class="sarpur-hero">
              <div class="sarpur-hero-media">{#if heroImage}<img src={heroImage} alt=""/>{:else}<Play size={48}/>{/if}</div>
              <div class="sarpur-hero-copy"><span>SARPURINN</span><h1>{sarpurHero.title}</h1><p>{sarpurHero.description || sarpurHero.shortDescription || sarpurHero.latestEpisode?.title || "Efni úr gagnagrunni RÚV"}</p></div>
            </article>
            <div class="sarpur-rail-window"><div class="sarpur-rail featured-rail">
              {#each sarpurFeatured.slice(0, 15) as program (program.id)}
                {@const image = program.image || program.latestEpisode?.image || program.portraitImage}
                <article class="sarpur-card"><div class="sarpur-card-media">{#if image}<img src={image} alt=""/>{:else}<Play size={34}/>{/if}</div><div class="sarpur-card-copy"><h3>{program.title}</h3>{#if program.foreignTitle}<p>{program.foreignTitle}</p>{/if}</div></article>
              {/each}
            </div></div>
          </section>
        {/if}

        {#each sarpurSections as section (section.slug)}
          {#if section.items.length}
            <section class="sarpur-section" data-slug={section.slug}>
              <h2>{section.title}</h2>
              <div class="sarpur-rail-window"><div class="sarpur-rail">
                {#each section.items.slice(0, 15) as program (program.id)}
                  {@const image = program.image || program.latestEpisode?.image || program.portraitImage}
                  <article class="sarpur-card"><div class="sarpur-card-media">{#if image}<img src={image} alt=""/>{:else}<Play size={34}/>{/if}</div><div class="sarpur-card-copy"><h3>{program.title}</h3><p>{program.latestEpisode?.title || program.foreignTitle || program.shortDescription}</p></div></article>
                {/each}
              </div></div>
            </section>
          {/if}
        {/each}

        {#if torrentMovies.length}
          <section class="sarpur-section" data-slug="sott-efni">
            <h2>Sótt efni</h2>
            <div class="sarpur-rail-window"><div class="sarpur-rail">
              {#each torrentMovies as item (item.id)}
                <article class="sarpur-card"><div class="sarpur-card-media">{#if item.artwork}<img src={item.artwork} alt=""/>{:else}<Play size={34}/>{/if}</div><div class="sarpur-card-copy"><h3>{item.title}</h3><p>{item.source}</p><small>{torrentStatus(item.status)} · {item.license}</small></div></article>
              {/each}
            </div></div>
          </section>
        {/if}
      {/if}
    </main>
  {:else if state.view === "news"}
    {#if state.newsArticleId}
      <main class="article-page" bind:this={newsPage}>
        {#if newsArticleLoading}<section class="empty">Sæki frétt…</section>
        {:else if selectedNewsArticle}<article class="article-reader"><div class="article-meta"><span>{selectedNewsArticle.categoryTitle || selectedNewsArticle.topicName || "RÚV"}</span><time>{relativeTime(selectedNewsArticle.firstPublishedAt, now)}</time></div><h1>{selectedNewsArticle.title}</h1>{#if selectedNewsArticle.subtitle}<p class="article-lead">{selectedNewsArticle.subtitle}</p>{/if}{#if selectedNewsArticle.mainImageUrl}<img src={selectedNewsArticle.mainImageUrl} alt=""/>{/if}<div class="article-body">{#each newsParagraphs as paragraph}<p>{paragraph}</p>{/each}{#each newsImages as image}<img src={image} alt="" loading="lazy"/>{/each}</div>{#if selectedNewsArticle.authors.length}<footer>{selectedNewsArticle.authors.map(author => author.name).join(" · ")}</footer>{/if}</article>
        {:else}<section class="empty">{newsArticleError || "Fréttin fannst ekki"}</section>{/if}
      </main>
    {:else}
      <main class="page" bind:this={newsPage}>
        <div class="heading"><div><span>FRÉTTIR</span><h1>Nýjustu fréttir RÚV</h1></div><div><strong>{content.news.length} fréttir</strong><small>Uppfærist á klukkustundar fresti</small></div></div>
        {#if !content.news.length}<section class="empty">Engar fréttir eru tiltækar.</section>{:else}<section class="news-grid large">{#each content.news as article}<article>{#if article.mainImageUrl}<img src={article.mainImageUrl} alt=""/>{:else}<div class="news-placeholder"><Newspaper size={28}/></div>{/if}<div><span>{article.categoryTitle || article.topicName || "RÚV"}</span><strong>{article.title}</strong><p>{article.subtitle}</p><time>{relativeTime(article.firstPublishedAt, now)}</time></div></article>{/each}</section>{/if}
      </main>
    {/if}
  {:else}
    <main class="home-page">
      <section class="hero" class:has-image={Boolean(state.media.artwork)} style={state.media.artwork ? `background-image:url('${state.media.artwork}')` : undefined}>
        <div class="shade"></div><div class="hero-copy"><span>{state.media.live ? "Í BEINNI" : state.media.kind === "video" || state.media.kind === "movie" ? "SARPURINN" : "Í SPILUN"}</span><h1>{state.media.title}</h1><p>{state.media.subtitle} · {state.media.source}</p></div>
      </section>
      <section class="live panel"><div class="section-title"><div><Tv size={20}/><h2>Í beinni á RÚV</h2></div><span>{channels.length} rásir</span></div>{#if channels.length}<div class="live-list">{#each channels as item}<article><div class="channel-logo">{item.channel.name}</div><div><strong>{item.current?.title ?? "Bein útsending"}</strong><span>{item.current?.category || item.channel.name}</span>{#if item.current}<i style={`width:${eventProgress(item.current,now)}%`}></i>{/if}</div><time>{item.upcoming[0] ? `${formatTime(item.upcoming[0].startTime)} ${item.upcoming[0].title}` : ""}</time></article>{/each}</div>{:else}<div class="empty compact">Sæki sjónvarpsdagskrá…</div>{/if}</section>
      <section class="programs panel"><div class="section-title"><div><Play size={20}/><h2>Nýtt í Sarpinum</h2></div><span>Raunverulegt efni</span></div><div class="program-grid">{#each content.programs.slice(0,6) as program}<article><div class="art">{#if program.image}<img src={program.image} alt=""/>{:else}<Play size={22}/>{/if}</div><div><strong>{program.title}</strong><span>{program.latestEpisode?.title ?? ""}</span></div></article>{/each}</div></section>
      <section class="news panel"><div class="section-title"><div><Newspaper size={20}/><h2>Fréttir</h2></div><span>{contentError ? "Gömul gögn" : "Nýjast"}</span></div><div class="news-list">{#each content.news.slice(0,4) as article}<article>{#if article.mainImageUrl}<img src={article.mainImageUrl} alt=""/>{:else}<Newspaper size={22}/>{/if}<div><span>{article.categoryTitle || "RÚV"}</span><strong>{article.title}</strong><time>{relativeTime(article.firstPublishedAt, now)}</time></div></article>{/each}</div></section>
      <section class="facts"><article><Clock3 size={22}/><div><span>Klukkan</span><strong>{clockText}</strong><small>{dateText}</small></div></article><article><Sunrise size={22}/><div><span>Dagsbirta</span><strong>{solarTime(solar?.sunrise)} → {solarTime(solar?.sunset)}</strong><small>{solar?.location ?? "Akureyri"}</small></div></article><article><Radio size={22}/><div><span>Útvarp</span><strong>{state.media.kind === "radio" ? state.media.title : `${stations.length} stöðvar`}</strong><small>{state.media.kind === "radio" ? state.media.subtitle : "Veldu í fjarstýringunni"}</small></div></article></section>
    </main>
  {/if}

  <ScheduledTaskNotice />
  {#if state.power && state.playing}<div transition:fly={{ y: 96, duration: 220 }}><GlobalPlayer {state} {now} {command} {liveProgramme}/></div>{/if}
</div>
{:else}<div class="loading"><Home size={36}/><strong>Tengist tvserverd…</strong></div>{/if}

<style>
  :global(*){box-sizing:border-box;scrollbar-width:none}:global(*::-webkit-scrollbar){display:none}:global(html,body,#app){margin:0;min-height:100%;background:oklch(.105 0 0);color:oklch(.96 0 0);font-family:ui-sans-serif,system-ui,sans-serif}:global(body){overflow:hidden}
  .shell{--bg:color-mix(in oklch,var(--solar-bg-from,oklch(.16 .012 36)),var(--solar-bg-to,oklch(.16 .012 36)) var(--solar-progress,0%));--header:color-mix(in oklch,var(--solar-header-from,oklch(.19 .015 36)),var(--solar-header-to,oklch(.19 .015 36)) var(--solar-progress,0%));--surface:color-mix(in oklch,var(--solar-surface-from,oklch(.22 .015 36)),var(--solar-surface-to,oklch(.22 .015 36)) var(--solar-progress,0%));--raised:color-mix(in oklch,var(--solar-raised-from,oklch(.26 .018 36)),var(--solar-raised-to,oklch(.26 .018 36)) var(--solar-progress,0%));--border:color-mix(in oklch,var(--solar-border-from,oklch(.34 .02 36)),var(--solar-border-to,oklch(.34 .02 36)) var(--solar-progress,0%));--ink:color-mix(in oklch,var(--solar-ink-from,oklch(.96 0 0)),var(--solar-ink-to,oklch(.96 0 0)) var(--solar-progress,0%));--muted:color-mix(in oklch,var(--solar-muted-from,oklch(.72 .01 36)),var(--solar-muted-to,oklch(.72 .01 36)) var(--solar-progress,0%));--primary:color-mix(in oklch,var(--solar-primary-from,oklch(.72 .14 36)),var(--solar-primary-to,oklch(.72 .14 36)) var(--solar-progress,0%));--occasion:color-mix(in oklch,var(--solar-occasion-from,oklch(.42 .14 36)),var(--solar-occasion-to,oklch(.42 .14 36)) var(--solar-progress,0%));--hero-tone:color-mix(in oklch,var(--solar-hero-from,oklch(.10 .015 36)),var(--solar-hero-to,oklch(.10 .015 36)) var(--solar-progress,0%));--hero-border:color-mix(in oklch,var(--solar-hero-border-from,oklch(.35 .025 36)),var(--solar-hero-border-to,oklch(.35 .025 36)) var(--solar-progress,0%));--shadow-card:0 8px 22px oklch(0 0 0/.28);--shadow-soft:0 3px 10px oklch(0 0 0/.2);--type-display:clamp(32px,2.25vw,44px);--type-page-title:clamp(26px,1.7vw,34px);--type-section:clamp(18px,1.15vw,22px);--type-body:clamp(15px,.95vw,18px);--type-reading:clamp(24px,1.55vw,32px);--type-meta:clamp(12px,.78vw,14px);--type-label:clamp(11px,.72vw,13px);height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--ink)}
  header{height:88px;flex:0 0 88px;padding:0 42px;display:grid;grid-template-columns:1.3fr 1fr auto auto;align-items:center;gap:30px;border-bottom:1px solid var(--border);background:var(--header)}.identity,.identity>div,.date{display:flex}.identity{align-items:center;gap:12px}.identity>div,.date{flex-direction:column}.identity :global(svg){color:var(--primary)}.identity strong{font-size:20px}.identity span,.date span{font-size:11px;color:var(--muted);margin-top:3px}.date strong{font-size:15px;text-transform:capitalize}.sync{height:34px;padding:0 12px;border-radius:999px;display:flex;align-items:center;gap:7px;background:color-mix(in oklch,var(--primary),var(--surface) 82%);color:var(--primary);font-size:11px}.sync.warning{color:oklch(.82 .13 75)}header>time{font-size:31px;font-weight:680;font-variant-numeric:tabular-nums}
  .panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--shadow-card)}.section-title{height:54px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.section-title>div{display:flex;align-items:center;gap:8px}.section-title h2{font-size:15px;margin:0}.section-title>span{font-size:10px;color:var(--muted)}
  .home-page{flex:1;min-height:0;padding:22px 42px 18px;display:grid;grid-template-columns:1.35fr 1fr .9fr;grid-template-rows:1.2fr .9fr 72px;gap:16px}.hero{grid-column:1/3;position:relative;overflow:hidden;border:1px solid var(--hero-border);border-radius:14px;background:linear-gradient(135deg,var(--hero-tone),var(--raised));background-size:cover;background-position:center;box-shadow:var(--shadow-card)}.shade{position:absolute;inset:0;background:linear-gradient(90deg,var(--hero-tone),transparent 80%)}.hero-copy{position:absolute;left:28px;bottom:24px;max-width:620px;color:white}.hero-copy>span{font-size:10px;font-weight:800;color:var(--primary)}.hero-copy h1{font-size:38px;line-height:1.05;margin:7px 0}.hero-copy p{font-size:13px;color:var(--muted)}.live{grid-column:3;grid-row:1/3}.live-list article{min-height:104px;padding:13px;display:grid;grid-template-columns:56px 1fr;gap:10px;border-bottom:1px solid var(--border)}.channel-logo{width:54px;height:54px;display:grid;place-items:center;border-radius:9px;background:var(--raised);font-size:12px;font-weight:800;color:var(--primary)}.live-list article>div:nth-child(2){display:flex;min-width:0;flex-direction:column}.live-list strong,.live-list time{font-size:11px}.live-list span{font-size:9px;color:var(--muted);margin-top:4px}.live-list i,.event-progress i{display:block;height:3px;background:var(--primary);margin-top:9px}.live-list time{grid-column:2;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.programs{grid-column:1}.program-grid{padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.program-grid article{min-width:0;background:var(--raised);border-radius:9px;overflow:hidden}.program-grid .art{height:68px;display:grid;place-items:center;background:color-mix(in oklch,var(--surface),black 8%)}.program-grid img{width:100%;height:100%;object-fit:cover}.program-grid article>div:last-child{padding:7px;display:flex;min-width:0;flex-direction:column}.program-grid strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.program-grid span{font-size:8px;color:var(--muted);margin-top:3px}.news{grid-column:2}.news-list{display:grid;grid-template-columns:1fr 1fr}.news-list article{min-width:0;padding:9px;display:grid;grid-template-columns:54px 1fr;gap:8px;border-bottom:1px solid var(--border)}.news-list img{width:54px;height:48px;object-fit:cover;border-radius:6px}.news-list div{display:flex;min-width:0;flex-direction:column}.news-list span,.news-list time{font-size:8px;color:var(--primary)}.news-list strong{font-size:9px;line-height:1.25;margin:2px 0;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.facts{grid-column:1/4;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.facts article{padding:0 16px;display:flex;align-items:center;gap:11px;border:1px solid var(--border);border-radius:11px;background:var(--raised);box-shadow:var(--shadow-soft)}.facts :global(svg){color:var(--primary)}.facts div{display:flex;min-width:0;flex-direction:column}.facts span,.facts small{font-size:9px;color:var(--muted)}.facts strong{font-size:14px;margin:2px 0}
  .page{flex:1;min-height:0;padding:20px 42px;overflow:auto}.sarpur-page{flex:1;min-height:0;overflow:auto;padding:20px 0 110px}.sarpur-featured{margin:0}.sarpur-hero{width:min(1050px,calc(100% - 40px));min-height:330px;margin:0 auto;display:grid;grid-template-columns:56% 44%;overflow:hidden;border-radius:8px;background:var(--surface);box-shadow:var(--shadow-card)}.sarpur-hero-media{min-height:330px;display:grid;place-items:center;overflow:hidden;background:var(--hero-tone);color:var(--primary)}.sarpur-hero-media img{width:100%;height:100%;object-fit:cover}.sarpur-hero-copy{padding:32px 44px;display:flex;flex-direction:column;justify-content:center;background:color-mix(in oklch,var(--surface),white 3%)}.sarpur-hero-copy>span{font-size:var(--type-label);font-weight:800;letter-spacing:.12em;color:var(--primary)}.sarpur-hero-copy h1{font-size:clamp(30px,2.25vw,44px);line-height:1.08;margin:10px 0 14px}.sarpur-hero-copy p{max-width:32ch;margin:0;color:var(--muted);font-size:var(--type-body);line-height:1.5}.sarpur-rail-window{width:100%;overflow:hidden}.sarpur-rail{display:flex;gap:24px;width:100%;overflow-x:auto;padding:8px max(20px,calc((100% - 1050px)/2)) 16px;scroll-snap-type:x proximity}.sarpur-card{flex:0 0 236px;min-width:0;overflow:hidden;scroll-snap-align:start;border-radius:8px;background:var(--surface);box-shadow:var(--shadow-soft)}.sarpur-card-media{aspect-ratio:16/9;display:grid;place-items:center;overflow:hidden;background:var(--raised);color:var(--primary)}.sarpur-card-media img{width:100%;height:100%;object-fit:cover}.sarpur-card-copy{min-height:100px;padding:12px;display:flex;min-width:0;flex-direction:column}.sarpur-card-copy h3{display:-webkit-box;overflow:hidden;margin:0;font-size:clamp(16px,1.15vw,20px);line-height:1.25;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}.sarpur-card-copy p,.sarpur-card-copy small{display:-webkit-box;overflow:hidden;margin:7px 0 0;color:var(--muted);font-size:var(--type-meta);line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}.sarpur-card-copy small{color:var(--primary)}.sarpur-section{margin-top:26px}.sarpur-section>h2{width:min(1050px,calc(100% - 40px));margin:0 auto 4px;font-size:clamp(22px,1.5vw,30px);line-height:1.2;letter-spacing:.02em}.sarpur-section .sarpur-rail{padding-top:8px}.channel-focus-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.channel-focus{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--surface);box-shadow:var(--shadow-card)}.channel-focus.active{border-color:var(--primary)}.channel-art{height:250px;position:relative;background:var(--hero-tone);background-size:cover;background-position:center}.channel-art::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,var(--hero-tone),transparent 75%)}.channel-art>span{position:absolute;z-index:1;top:18px;left:18px;padding:6px 9px;border-radius:6px;background:var(--raised);font-weight:800}.channel-art>div{position:absolute;z-index:1;left:20px;right:20px;bottom:17px;color:white}.channel-art b{font-size:9px;color:var(--primary)}.channel-art h2{font-size:var(--type-display);margin:5px 0}.channel-art p{font-size:var(--type-body);color:var(--muted)}.event-progress{height:3px;background:var(--border)}.event-progress i{margin:0}.upcoming{padding:14px 18px}.upcoming h3{font-size:13px}.upcoming>div{min-height:48px;display:grid;grid-template-columns:55px 1fr;align-items:center;border-top:1px solid var(--border)}.upcoming time{font-size:var(--type-meta);color:var(--primary)}.upcoming span{display:flex;flex-direction:column}.upcoming strong{font-size:var(--type-body)}.upcoming small{font-size:var(--type-meta);color:var(--muted);margin-top:3px}.news-grid.large{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.news-grid.large article{border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--surface);box-shadow:var(--shadow-soft)}.news-grid.large img,.news-placeholder{width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;background:var(--raised)}.news-placeholder{display:grid;place-items:center}.news-grid.large article>div:last-child{padding:12px;display:flex;flex-direction:column}.news-grid.large span,.news-grid.large time{font-size:var(--type-body);color:var(--primary)}.news-grid.large strong{font-size:var(--type-page-title);line-height:1.3;margin:5px 0}.news-grid.large p{font-size:var(--type-section);line-height:1.4;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.article-page{flex:1;min-height:0;padding:34px 8vw 130px;overflow:auto}.article-reader{max-width:1180px;margin:auto}.article-meta{display:flex;justify-content:space-between;gap:24px;color:var(--primary);font-size:var(--type-body)}.article-reader h1{font-size:var(--type-display);line-height:1.12;margin:14px 0}.article-lead{font-size:var(--type-page-title);line-height:1.4;color:var(--muted);margin:0 0 24px}.article-reader>img{width:100%;max-height:60vh;aspect-ratio:16/9;object-fit:contain;background:var(--raised);border-radius:14px}.article-body{max-width:1000px;margin:32px auto}.article-body p{font-size:var(--type-reading);line-height:1.65;margin:0 0 1.15em}.article-body img{display:block;width:100%;height:auto;margin:28px 0;border-radius:14px;background:var(--raised);object-fit:contain}.article-reader footer{max-width:1000px;margin:auto;color:var(--muted);font-size:var(--type-body)}.empty{min-height:220px;display:grid;place-items:center;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--muted)}.empty.compact{min-height:140px}.standby,.loading{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--muted)}.standby{flex:1;min-height:0}.standby time{font-size:86px;color:var(--ink);font-weight:700}.standby p{font-size:18px;text-transform:capitalize}
  @media(max-width:1200px){header{grid-template-columns:1fr auto auto}.date{display:none}.home-page{padding:18px 20px;grid-template-columns:1.2fr .9fr;grid-template-rows:1.1fr 1fr 72px}.hero{grid-column:1}.live{grid-column:2}.programs{grid-column:1}.news{display:none}.facts{grid-column:1/3}.page{padding-inline:20px}}
  @media(max-width:760px){.sarpur-page{padding-top:12px}.sarpur-hero{width:calc(100% - 24px);grid-template-columns:1fr;min-height:0}.sarpur-hero-media{min-height:210px}.sarpur-hero-copy{padding:24px}.sarpur-card{flex-basis:210px}.sarpur-section>h2{width:calc(100% - 24px)}.sarpur-rail{gap:16px;padding-inline:12px}}
  @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
