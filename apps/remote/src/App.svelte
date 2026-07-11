<script lang="ts">
  import { onMount } from "svelte";
  import { crossfade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";
  import AudioLines from "lucide-svelte/icons/audio-lines";
  import Captions from "lucide-svelte/icons/captions";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import Expand from "lucide-svelte/icons/expand";
  import Gauge from "lucide-svelte/icons/gauge";
  import Heart from "lucide-svelte/icons/heart";
  import Home from "lucide-svelte/icons/home";
  import Minus from "lucide-svelte/icons/minus";
  import Newspaper from "lucide-svelte/icons/newspaper";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Plus from "lucide-svelte/icons/plus";
  import Power from "lucide-svelte/icons/power";
  import Radio from "lucide-svelte/icons/radio";
  import RadioTower from "lucide-svelte/icons/radio-tower";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import Search from "lucide-svelte/icons/search";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import SkipForward from "lucide-svelte/icons/skip-forward";
  import Speaker from "lucide-svelte/icons/volume-2";
  import SpeakerX from "lucide-svelte/icons/volume-x";
  import Sunrise from "lucide-svelte/icons/sunrise";
  import Tv from "lucide-svelte/icons/tv";
  import Wifi from "lucide-svelte/icons/wifi";
  import { startSolarTheme, type SolarTheme } from "../../../packages/protocol/solar";
  import { tvServerUrl, tvServerWebSocketUrl, type DashboardContent, type HomeState, type RuvProgramResponse, type Station } from "../../../packages/protocol";
  import { deriveRuvNow, EMPTY_DASHBOARD_CONTENT, eventProgress, fetchDashboardContent, formatClock, formatDate, formatDuration, formatTime, interpolateMediaTime, relativeTime } from "../../../packages/protocol/content";

  type Tab = "Heim" | "Fjarstýring" | "Útvarp" | "Sarpur" | "Fréttir";
  let state: HomeState | undefined;
  let connected = false;
  let socket: WebSocket;
  let feedback = "";
  let activeTab: Tab = "Fjarstýring";
  let solar: SolarTheme | undefined;
  let stations: Station[] = [];
  let content: DashboardContent = EMPTY_DASHBOARD_CONTENT;
  let contentError = "";
  let now = Date.now();
  let observedAt = now;
  let observedMedia = "";
  let observedTime = 0;
  let search = "";
  let selectedProgram: RuvProgramResponse | undefined;
  let detailLoading = false;
  let contentController: AbortController | undefined;
  const refreshMs = Math.max(15_000, Number(import.meta.env.VITE_CONTENT_REFRESH_MS || 30_000));
  const [send, receive] = crossfade({ duration: 320, easing: quintOut });

  $: channels = content.channels.map(channel => deriveRuvNow(channel, now));
  $: favouriteIds = new Set(state?.radioFavorites ?? []);
  $: favouriteStations = stations.filter(station => favouriteIds.has(station.id));
  $: otherStations = stations.filter(station => !favouriteIds.has(station.id));
  $: filteredPrograms = content.programs.filter(program => !search.trim() || `${program.title} ${program.description} ${program.categories.map(item => item.title).join(" ")}`.toLocaleLowerCase("is").includes(search.trim().toLocaleLowerCase("is")));
  $: if (state && (state.media.id !== observedMedia || state.media.currentTime !== observedTime)) { observedMedia = state.media.id; observedTime = state.media.currentTime; observedAt = now; }
  $: displayTime = state ? interpolateMediaTime(state.media, state.playing, observedAt, now) : 0;

  function command(action: string, value?: unknown, label?: string) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "command", action, value, label }));
    if (label) { feedback = label; window.setTimeout(() => feedback = "", 1_100); }
  }
  function openTab(tab: Tab) {
    activeTab = tab;
    const view = tab === "Útvarp" ? "radio" : tab === "Sarpur" ? "media" : tab === "Fréttir" ? "news" : tab === "Heim" ? "home" : "tv";
    command("view", view, tab);
  }
  function selectStation(station: Station) { activeTab = "Útvarp"; command("radio", station.id, `Spila ${station.name}`); }
  function toggleStation(station: Station) { command("radio-favorite", station.id, favouriteIds.has(station.id) ? "Fjarlægt úr uppáhaldi" : "Sett í uppáhald"); }
  function cycleRate() {
    if (!state) return;
    const rates = [1, 1.25, 1.5, 2];
    command("playback-rate", rates[(rates.indexOf(state.media.playbackRate) + 1) % rates.length], "Hraði");
  }
  async function openProgram(id: number) {
    detailLoading = true;
    selectedProgram = undefined;
    try {
      const response = await fetch(`${tvServerUrl()}/ruv/programs/${id}`);
      if (!response.ok) throw new Error();
      selectedProgram = await response.json() as RuvProgramResponse;
    } catch { feedback = "Ekki náðist í þættina"; }
    finally { detailLoading = false; }
  }
  async function refreshContent() {
    contentController?.abort(); contentController = new AbortController();
    try { content = await fetchDashboardContent(contentController.signal); contentError = ""; }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) contentError = "Gögn uppfærast ekki"; }
  }
  async function refreshStations() {
    try { const response = await fetch(`${tvServerUrl()}/radio/stations`); if (response.ok) stations = (await response.json()).stations; } catch { /* preserve cache */ }
  }
  const formatMediaTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

  onMount(() => {
    const clockTimer = window.setInterval(() => now = Date.now(), 1_000);
    const contentTimer = window.setInterval(refreshContent, refreshMs);
    const stationTimer = window.setInterval(refreshStations, 300_000);
    const stopSolar = startSolarTheme(theme => solar = theme);
    let retry: number;
    const connect = () => {
      socket = new WebSocket(tvServerWebSocketUrl());
      socket.onopen = () => { connected = true; void refreshContent(); };
      socket.onclose = () => { connected = false; retry = window.setTimeout(connect, 1_200); };
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "state") state = message.state;
      };
    };
    const visibility = () => { if (document.visibilityState === "visible") { now = Date.now(); void refreshContent(); } };
    document.addEventListener("visibilitychange", visibility);
    void refreshContent(); void refreshStations(); connect();
    return () => { clearInterval(clockTimer); clearInterval(contentTimer); clearInterval(stationTimer); clearTimeout(retry); contentController?.abort(); socket?.close(); stopSolar(); document.removeEventListener("visibilitychange", visibility); };
  });
</script>

<svelte:head><title>TV Kit fjarstýring</title></svelte:head>

{#if state}
<div class="app-shell">
  <header><div class="brand"><Home size={21}/><div><strong>TV Kit</strong><span>{formatDate(now)}</span></div></div><time>{formatClock(now)}</time><div class:offline={!connected} class="connection"><Wifi size={16}/>{connected ? contentError || "Tengt" : "Tengi"}</div><button class:off={!state.power} aria-label={state.power ? "Slökkva" : "Kveikja"} on:click={() => command("power", undefined, state.power ? "Slökkt" : "Kveikt")}><Power size={21}/></button></header>

  <main>
    <section class="now-playing panel">
      <div class="poster">{#if state.media.artwork}<img src={state.media.artwork} alt=""/>{:else}<Play size={28}/>{/if}</div>
      <div class="track"><span>{state.media.live ? "Í BEINNI" : state.media.source}</span><h1>{state.media.title}</h1><p>{state.media.subtitle}</p><div class="timeline"><i style={`width:${state.media.live ? 100 : Math.min(100,displayTime/Math.max(1,state.media.duration)*100)}%`}></i></div><div class="times"><span>{state.media.live ? "Í beinni" : formatMediaTime(displayTime)}</span><span>{state.media.live ? "" : formatMediaTime(state.media.duration)}</span></div></div>
      <div class="transport"><button aria-label="Fyrra" on:click={() => command("media-previous")}><SkipBack size={22}/></button><button class="primary" aria-label={state.playing ? "Pása" : "Spila"} on:click={() => command("toggle-play")}>{#if state.playing}<Pause size={27} fill="currentColor"/>{:else}<Play size={27} fill="currentColor"/>{/if}</button><button aria-label="Næsta" on:click={() => command("media-next")}><SkipForward size={22}/></button></div>
    </section>

    <section class="media-tools">
      <button class:active={state.media.panel === "epg"} on:click={() => command("player-panel", state.media.panel === "epg" ? "" : "epg", "Dagskrá")}><Radio size={20}/><span>Dagskrá</span></button>
      <button class:active={state.media.panel === "subtitles"} disabled={state.media.subtitles.length < 2} on:click={() => command("player-panel", state.media.panel === "subtitles" ? "" : "subtitles", "Skjátextar")}><Captions size={20}/><span>{state.media.subtitleTrack}</span></button>
      <button class:active={state.media.panel === "audio"} on:click={() => command("player-panel", state.media.panel === "audio" ? "" : "audio", "Hljóðrás")}><AudioLines size={20}/><span>{state.media.audioTrack}</span></button>
      <button disabled={state.media.live} on:click={cycleRate}><Gauge size={20}/><span>{state.media.playbackRate}x</span></button>
      <button class:active={state.media.favorite} on:click={() => command("toggle-favorite", undefined, "Uppáhald")}><Heart size={20} fill={state.media.favorite ? "currentColor" : "none"}/><span>Uppáhald</span></button>
      <button on:click={() => command("fullscreen", !state.media.fullscreen, "Fullskjár")}><Expand size={20}/><span>Fullskjár</span></button>
    </section>

    {#if state.media.panel === "subtitles"}<section class="option-sheet panel"><strong>Skjátextar</strong>{#each state.media.subtitles as track}<button class:selected={track === state.media.subtitleTrack} on:click={() => command("subtitle", track, track)}>{track}</button>{/each}</section>{/if}
    {#if state.media.panel === "audio"}<section class="option-sheet panel"><strong>Hljóðrás</strong>{#each state.media.audioTracks as track}<button class:selected={track === state.media.audioTrack} on:click={() => command("audio-track", track, track)}>{track}</button>{/each}</section>{/if}
    {#if state.media.panel === "epg"}<section class="epg-sheet panel"><strong>Dagskrá</strong>{#if state.media.epg.length}{#each state.media.epg as item}<article class:current={item.current}><time>{item.start}</time><div><strong>{item.title}</strong><span>{item.detail}</span></div></article>{/each}{:else}<p>Engin dagskrá tiltæk.</p>{/if}</section>{/if}

    {#if activeTab === "Heim"}
      {#if state.cast}<section class="cast-active panel"><div><Tv size={22}/><span><strong>{state.cast.source === "airplay" ? "AirPlay" : state.cast.source === "miracast" ? "Miracast" : "Android Cast"}</strong><small>{state.cast.deviceName}</small></span></div><button on:click={() => command("cast-stop", undefined, "Cast stöðvað")}>Stöðva</button></section>{/if}
      <section class="live-grid">{#each channels as item}<article class="panel"><div class="panel-heading"><div><Tv size={19}/><h2>{item.channel.name}</h2></div>{#if state.tvFavorites.includes(item.channel.slug)}<Heart size={16} fill="currentColor"/>{/if}</div><div class="live-copy"><span>Í BEINNI</span><strong>{item.current?.title ?? "Bein útsending"}</strong><small>{item.current?.category || item.current?.description}</small>{#if item.current}<i><b style={`width:${eventProgress(item.current,now)}%`}></b></i>{/if}</div><div class="card-actions"><button on:click={() => command("ruv-channel", item.channel.slug, `Spila ${item.channel.name}`)}><Play size={18}/> Spila</button><button aria-label="Uppáhald" on:click={() => command("tv-favorite", item.channel.slug)}><Heart size={18} fill={state.tvFavorites.includes(item.channel.slug) ? "currentColor" : "none"}/></button></div></article>{/each}</section>
      <section class="news-strip panel"><div class="panel-heading"><div><Newspaper size={19}/><h2>Nýjustu fréttir</h2></div><button on:click={() => openTab("Fréttir")}>Allar <ChevronRight size={17}/></button></div>{#each content.news.slice(0,4) as article}<article>{#if article.mainImageUrl}<img src={article.mainImageUrl} alt=""/>{/if}<div><strong>{article.title}</strong><span>{relativeTime(article.firstPublishedAt,now)}</span></div></article>{/each}</section>
      {#if solar}<section class="solar panel"><div><Sunrise size={20}/><strong>{solar.location}</strong></div><span>Sólarupprás {new Date(solar.sunrise*1000).toLocaleTimeString("is-IS",{hour:"2-digit",minute:"2-digit"})} · sólsetur {new Date(solar.sunset*1000).toLocaleTimeString("is-IS",{hour:"2-digit",minute:"2-digit"})}</span></section>{/if}
    {:else if activeTab === "Fjarstýring"}
      <section class="remote-grid">
        <div class="remote-panel panel"><div class="panel-heading"><div><Radio size={19}/><h2>Fjarstýring</h2></div><button on:click={() => command("back", undefined, "Til baka")}><RotateCcw size={19}/> Til baka</button></div><div class="controls"><div class="rocker"><button aria-label="Hækka" on:click={() => command("volume", Math.min(100,state.volume+5))}><Plus/></button><span>{state.muted ? "Þaggað" : `${state.volume}%`}</span><button aria-label="Lækka" on:click={() => command("volume", Math.max(0,state.volume-5))}><Minus/></button></div><div class="center"><button class="primary" on:click={() => command("toggle-play")}>{#if state.playing}<Pause size={28}/>{:else}<Play size={28}/>{/if}</button><button on:click={() => command("toggle-mute")}>{#if state.muted}<SpeakerX/>{:else}<Speaker/>{/if}</button></div><div class="rocker"><button aria-label="Næsta rás" on:click={() => command("channel", Math.min(2,state.channel+1))}><ChevronRight/></button><span>Rás {state.channel}</span><button aria-label="Fyrri rás" on:click={() => command("channel", Math.max(1,state.channel-1))}><ChevronLeft/></button></div></div></div>
        <aside class="channel-list panel"><div class="panel-heading"><div><Tv size={19}/><h2>RÚV rásir</h2></div></div>{#each channels as item}<article><div><strong>{item.channel.name}</strong><span>{item.current?.title ?? "Bein útsending"}</span></div><button on:click={() => command("ruv-channel",item.channel.slug,`Spila ${item.channel.name}`)}><Play size={18}/></button></article>{/each}</aside>
      </section>
    {:else if activeTab === "Útvarp"}
      <section class="radio-browser panel"><div class="panel-heading"><div><RadioTower size={20}/><h2>Íslenskt útvarp</h2></div><span>{stations.length} stöðvar</span></div>{#if favouriteStations.length}<h3><Heart size={15} fill="currentColor"/> Uppáhaldsstöðvar</h3><div class="radio-grid">{#each favouriteStations as station (station.id)}<article in:receive={{key:station.id}} out:send={{key:station.id}} animate:flip={{duration:320}}><button class="tune" on:click={() => selectStation(station)}>{#if station.logoUrl}<img src={station.logoUrl} alt=""/>{/if}<span><strong>{station.name}</strong><small>{station.terrestrial?`${station.frequency.toFixed(1)} FM`:"Á netinu"}</small></span></button><button class="heart" on:click={() => toggleStation(station)}><Heart size={17} fill="currentColor"/></button></article>{/each}</div>{/if}<h3><RadioTower size={15}/> Allar stöðvar</h3><div class="radio-grid">{#each otherStations as station (station.id)}<article in:receive={{key:station.id}} out:send={{key:station.id}} animate:flip={{duration:320}}><button class="tune" on:click={() => selectStation(station)}>{#if station.logoUrl}<img src={station.logoUrl} alt=""/>{/if}<span><strong>{station.name}</strong><small>{station.terrestrial?`${station.frequency.toFixed(1)} FM`:"Á netinu"}</small></span></button><button class="heart" on:click={() => toggleStation(station)}><Heart size={17}/></button></article>{/each}</div></section>
    {:else if activeTab === "Sarpur"}
      <section class="program-browser panel"><div class="panel-heading"><div><Tv size={20}/><h2>Sarpurinn</h2></div><label><Search size={17}/><input bind:value={search} placeholder="Leita að þætti" aria-label="Leita í Sarpinum"/></label></div>{#if detailLoading}<div class="empty">Sæki þætti…</div>{:else if selectedProgram}<div class="program-detail"><button class="back" on:click={() => selectedProgram=undefined}><ChevronLeft size={18}/> Til baka</button><h2>{selectedProgram.program.title}</h2><p>{selectedProgram.program.description || selectedProgram.program.shortDescription}</p><div class="episode-list">{#each selectedProgram.episodes.filter(item=>item.available).slice(0,30) as episode}<article>{#if episode.image}<img src={episode.image} alt=""/>{/if}<div><strong>{episode.title}</strong><span>{formatDuration(episode.duration)} · {episode.firstRun ? new Date(episode.firstRun).toLocaleDateString("is-IS") : ""}</span></div><button on:click={() => command("ruv-episode",episode.id,`Spila ${episode.title}`)}><Play size={18}/></button></article>{/each}</div></div>{:else}<div class="program-grid">{#each filteredPrograms as program}<button on:click={() => openProgram(program.id)}>{#if program.image||program.portraitImage}<img src={program.image||program.portraitImage} alt=""/>{:else}<Tv size={25}/>{/if}<span><strong>{program.title}</strong><small>{program.latestEpisode?.title??"Enginn þáttur tiltækur"}</small></span></button>{/each}</div>{/if}</section>
    {:else}
      <section class="news-browser"><div class="section-head"><div><Newspaper size={21}/><h2>Fréttir RÚV</h2></div><span>{content.news.length} fréttir</span></div><div class="news-grid">{#each content.news as article}<article class="panel">{#if article.mainImageUrl}<img src={article.mainImageUrl} alt=""/>{:else}<div class="news-placeholder"><Newspaper size={28}/></div>{/if}<div><span>{article.categoryTitle||article.topicName||"RÚV"}</span><strong>{article.title}</strong><p>{article.subtitle}</p><time>{relativeTime(article.firstPublishedAt,now)}</time></div></article>{/each}</div></section>
    {/if}
  </main>

  <nav aria-label="Aðalvalmynd">{#each [{name:"Heim",icon:Home},{name:"Fjarstýring",icon:Radio},{name:"Útvarp",icon:RadioTower},{name:"Sarpur",icon:Tv},{name:"Fréttir",icon:Newspaper}] as tab}<button class:active={activeTab===tab.name} on:click={() => openTab(tab.name as Tab)}><svelte:component this={tab.icon} size={20}/><span>{tab.name}</span></button>{/each}</nav>
  {#if feedback}<div class="toast" aria-live="polite">{feedback}</div>{/if}
</div>
{:else}<div class="loading"><Home size={34}/><strong>Tengist tvserverd…</strong></div>{/if}

<style>
  :global(*){box-sizing:border-box}:global(html,body,#app){margin:0;min-height:100%;background:oklch(.105 0 0);color:oklch(.95 0 0);font-family:ui-sans-serif,system-ui,sans-serif}:global(button),:global(input){font:inherit;color:inherit}:global(button){cursor:pointer;touch-action:manipulation}
  .app-shell{--bg:color-mix(in oklch,var(--solar-bg-from,oklch(.16 .012 36)),var(--solar-bg-to,oklch(.16 .012 36)) var(--solar-progress,0%));--header:color-mix(in oklch,var(--solar-header-from,oklch(.19 .015 36)),var(--solar-header-to,oklch(.19 .015 36)) var(--solar-progress,0%));--surface:color-mix(in oklch,var(--solar-surface-from,oklch(.22 .015 36)),var(--solar-surface-to,oklch(.22 .015 36)) var(--solar-progress,0%));--raised:color-mix(in oklch,var(--solar-raised-from,oklch(.26 .018 36)),var(--solar-raised-to,oklch(.26 .018 36)) var(--solar-progress,0%));--border:color-mix(in oklch,var(--solar-border-from,oklch(.34 .02 36)),var(--solar-border-to,oklch(.34 .02 36)) var(--solar-progress,0%));--ink:color-mix(in oklch,var(--solar-ink-from,oklch(.96 0 0)),var(--solar-ink-to,oklch(.96 0 0)) var(--solar-progress,0%));--muted:color-mix(in oklch,var(--solar-muted-from,oklch(.7 .01 36)),var(--solar-muted-to,oklch(.7 .01 36)) var(--solar-progress,0%));--primary:color-mix(in oklch,var(--solar-primary-from,oklch(.72 .14 36)),var(--solar-primary-to,oklch(.72 .14 36)) var(--solar-progress,0%));--presence-accent:color-mix(in oklch,var(--solar-presence-accent-from,oklch(.74 .11 155)),var(--solar-presence-accent-to,oklch(.74 .11 155)) var(--solar-progress,0%));--shadow-card:0 8px 22px oklch(0 0 0/.28);--shadow-soft:0 3px 10px oklch(0 0 0/.2);--type-title:clamp(20px,1.35vw,26px);--type-section:clamp(17px,1.05vw,21px);--type-body:clamp(15px,.92vw,17px);--type-meta:clamp(12px,.75vw,14px);--type-label:clamp(11px,.7vw,13px);min-height:100dvh;padding-bottom:86px;background:var(--bg);color:var(--ink)}
  header{height:76px;padding:env(safe-area-inset-top) 18px 0;position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1fr auto auto 48px;align-items:center;gap:15px;border-bottom:1px solid var(--border);background:var(--header)}.brand{display:flex;align-items:center;gap:10px}.brand>svg{color:var(--primary)}.brand div{display:flex;flex-direction:column}.brand strong{font-size:15px}.brand span{font-size:10px;color:var(--muted);text-transform:capitalize}.connection{display:flex;align-items:center;gap:6px;color:var(--presence-accent);font-size:10px}.connection.offline{color:var(--primary)}header time{font-size:16px;font-variant-numeric:tabular-nums}header>button{width:46px;height:46px;border:0;border-radius:11px;background:var(--raised);display:grid;place-items:center}header>button.off{color:var(--primary)}
  main{max-width:1060px;margin:auto;padding:16px 20px 30px;display:flex;flex-direction:column;gap:14px}.panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--shadow-card)}.panel-heading{height:52px;padding:0 15px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.panel-heading>div{display:flex;align-items:center;gap:8px}.panel-heading h2{font-size:14px;margin:0}.panel-heading>span{font-size:10px;color:var(--muted)}.panel-heading button{height:44px;border:0;background:none;display:flex;align-items:center;gap:4px;color:var(--primary);font-size:11px}
  .now-playing{position:sticky;top:84px;z-index:15;padding:13px;display:grid;grid-template-columns:98px 1fr auto;align-items:center;gap:14px;background:var(--header)}.poster{width:96px;height:76px;border-radius:9px;overflow:hidden;background:var(--raised);display:grid;place-items:center}.poster img{width:100%;height:100%;object-fit:contain}.track{min-width:0}.track>span{font-size:9px;color:var(--primary);font-weight:800}.track h1{font-size:var(--type-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:3px 0}.track p{font-size:var(--type-meta);color:var(--muted);margin:0}.timeline{height:3px;background:var(--border);margin-top:9px}.timeline i{display:block;height:100%;background:var(--primary)}.times{display:flex;justify-content:space-between;font-size:8px;color:var(--muted);margin-top:3px}.transport{display:flex;gap:6px}.transport button{width:44px;height:44px;border:0;border-radius:50%;background:var(--raised);display:grid;place-items:center}.transport .primary{width:54px;height:54px;background:var(--primary);color:white}
  .media-tools{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}.media-tools button{min-height:56px;border:1px solid var(--border);border-radius:10px;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:9px;color:var(--muted);box-shadow:var(--shadow-soft)}.media-tools button.active{border-color:var(--primary);color:var(--primary)}.media-tools button:disabled{opacity:.35}.option-sheet{padding:12px;display:flex;flex-wrap:wrap;gap:7px}.option-sheet>strong{width:100%}.option-sheet button{min-height:44px;padding:0 14px;border:1px solid var(--border);border-radius:9px;background:var(--raised)}.option-sheet button.selected{border-color:var(--primary);color:var(--primary)}.epg-sheet{padding:12px}.epg-sheet>strong{display:block;margin-bottom:7px}.epg-sheet article{min-height:54px;display:grid;grid-template-columns:56px 1fr;align-items:center;border-top:1px solid var(--border)}.epg-sheet article.current{background:var(--raised)}.epg-sheet time{font-size:10px;color:var(--primary)}.epg-sheet article div{display:flex;flex-direction:column}.epg-sheet article strong{font-size:11px}.epg-sheet article span,.epg-sheet p{font-size:9px;color:var(--muted)}
  .live-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.live-copy{padding:15px;display:flex;flex-direction:column}.live-copy>span{font-size:9px;color:var(--primary);font-weight:800}.live-copy>strong{font-size:var(--type-title);margin:5px 0}.live-copy>small{font-size:var(--type-meta);color:var(--muted)}.live-copy i{height:3px;background:var(--border);margin-top:12px}.live-copy i b{display:block;height:100%;background:var(--primary)}.card-actions{padding:0 12px 12px;display:grid;grid-template-columns:1fr 48px;gap:7px}.card-actions button{height:46px;border:1px solid var(--border);border-radius:9px;background:var(--raised);display:flex;align-items:center;justify-content:center;gap:6px}.news-strip article{min-height:67px;padding:8px 13px;display:grid;grid-template-columns:70px 1fr;gap:10px;border-top:1px solid var(--border)}.news-strip img{width:70px;height:50px;object-fit:cover;border-radius:7px}.news-strip article div{display:flex;min-width:0;flex-direction:column}.news-strip strong{font-size:11px}.news-strip span{font-size:9px;color:var(--muted);margin-top:4px}.solar{padding:15px}.solar div{display:flex;align-items:center;gap:7px}.solar>span{display:block;font-size:10px;color:var(--muted);margin-top:7px}.cast-active{padding:12px;display:flex;align-items:center;justify-content:space-between}.cast-active>div{display:flex;align-items:center;gap:10px}.cast-active span{display:flex;flex-direction:column}.cast-active small{color:var(--muted)}.cast-active button{height:44px;padding:0 16px;border:0;border-radius:9px;background:var(--primary);color:white}
  .remote-grid{display:grid;grid-template-columns:1.4fr .8fr;gap:12px}.controls{padding:17px;display:grid;grid-template-columns:72px 1fr 72px;align-items:center;gap:15px}.rocker{height:190px;display:grid;grid-template-rows:55px 1fr 55px;border:1px solid var(--border);border-radius:99px;overflow:hidden;background:var(--raised)}.rocker button{border:0;background:none;display:grid;place-items:center}.rocker span{display:grid;place-items:center;font-size:10px;color:var(--muted)}.center{display:flex;align-items:center;justify-content:center;gap:10px}.center button{width:58px;height:58px;border:0;border-radius:50%;background:var(--raised);display:grid;place-items:center}.center .primary{background:var(--primary);color:white}.channel-list article{min-height:68px;padding:9px 12px;display:grid;grid-template-columns:1fr 46px;align-items:center;border-top:1px solid var(--border)}.channel-list article div{display:flex;flex-direction:column}.channel-list article span{font-size:var(--type-meta);color:var(--muted);margin-top:4px}.channel-list article button{width:44px;height:44px;border:0;border-radius:9px;background:var(--raised);display:grid;place-items:center}
  .radio-browser h3{padding:12px 14px 0;margin:0;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--primary)}.radio-grid{padding:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.radio-grid article{position:relative;min-height:64px;border:1px solid var(--border);border-radius:10px;background:var(--raised)}.radio-grid .tune{width:100%;height:64px;padding:7px 33px 7px 8px;border:0;background:none;display:grid;grid-template-columns:44px 1fr;align-items:center;gap:7px;text-align:left}.radio-grid img{width:42px;height:42px;object-fit:contain}.radio-grid .tune span{display:flex;min-width:0;flex-direction:column}.radio-grid strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.radio-grid small{font-size:8px;color:var(--muted)}.heart{position:absolute;right:1px;top:10px;width:32px;height:44px;border:0;background:none;color:var(--primary)}
  .program-browser .panel-heading label{height:36px;padding:0 9px;display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:8px;background:var(--raised)}.program-browser input{width:170px;border:0;outline:0;background:none;font-size:10px}.program-grid{padding:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.program-grid>button{min-height:142px;padding:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--raised);text-align:left}.program-grid img{width:100%;height:90px;object-fit:cover}.program-grid>button>svg{width:100%;height:90px;padding:30px}.program-grid button span{padding:8px;display:flex;flex-direction:column}.program-grid strong{font-size:11px}.program-grid small{font-size:8px;color:var(--muted);margin-top:3px}.program-detail{padding:14px}.program-detail .back{height:42px;border:0;background:none;color:var(--primary);display:flex;align-items:center}.program-detail h2{font-size:24px}.program-detail>p{font-size:11px;color:var(--muted);line-height:1.5}.episode-list article{min-height:70px;display:grid;grid-template-columns:90px 1fr 46px;align-items:center;gap:10px;border-top:1px solid var(--border)}.episode-list img{width:90px;height:58px;object-fit:cover}.episode-list article div{display:flex;flex-direction:column}.episode-list strong{font-size:11px}.episode-list span{font-size:9px;color:var(--muted)}.episode-list button{width:44px;height:44px;border:0;border-radius:9px;background:var(--raised);display:grid;place-items:center}
  .section-head{height:58px;display:flex;align-items:center;justify-content:space-between}.section-head>div{display:flex;align-items:center;gap:8px}.section-head h2{margin:0}.section-head span{font-size:10px;color:var(--muted)}.news-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.news-grid article>img,.news-placeholder{width:100%;height:130px;object-fit:cover}.news-placeholder{display:grid;place-items:center;background:var(--raised)}.news-grid article>div:last-child{padding:11px;display:flex;flex-direction:column}.news-grid span,.news-grid time{font-size:8px;color:var(--primary)}.news-grid strong{font-size:12px;line-height:1.3;margin:4px 0}.news-grid p{font-size:9px;color:var(--muted);line-height:1.4}.empty,.loading{min-height:170px;display:grid;place-items:center;color:var(--muted)}
  nav{height:76px;padding-bottom:env(safe-area-inset-bottom);position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;justify-content:center;background:var(--header);border-top:1px solid var(--border);box-shadow:0 -8px 22px oklch(0 0 0/.22)}nav button{width:120px;border:0;background:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:9px}nav button.active{color:var(--primary)}.toast{position:fixed;bottom:88px;left:50%;z-index:40;transform:translateX(-50%);padding:10px 15px;border-radius:99px;background:oklch(.92 0 0);color:oklch(.16 0 0);font-size:11px;font-weight:700}.loading{min-height:100dvh;display:flex;flex-direction:column;justify-content:center;gap:8px}button:focus-visible,input:focus-visible{outline:3px solid var(--primary);outline-offset:2px}
  @media(max-width:760px){header{padding-inline:12px;grid-template-columns:1fr auto 46px}header time{display:none}.connection{font-size:0}.connection svg{display:block}.now-playing{grid-template-columns:76px 1fr}.poster{width:76px;height:66px}.transport{grid-column:1/3;justify-content:center}.media-tools{grid-template-columns:repeat(3,1fr)}.live-grid,.remote-grid,.news-grid{grid-template-columns:1fr}.radio-grid,.program-grid{grid-template-columns:repeat(2,1fr)}nav button{width:auto;flex:1}.controls{grid-template-columns:62px 1fr 62px}.rocker{height:170px}}
  @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
