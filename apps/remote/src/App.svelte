<script lang="ts">
  import { onMount } from "svelte";
  import pino from "pino";
  import { crossfade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";
  import AudioLines from "lucide-svelte/icons/audio-lines";
  import Captions from "lucide-svelte/icons/captions";
  import MessageCircle from "lucide-svelte/icons/message-circle";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import Clock from "lucide-svelte/icons/clock";
  import Expand from "lucide-svelte/icons/expand";
  import Film from "lucide-svelte/icons/film";
  import Flag from "lucide-svelte/icons/flag";
  import Gauge from "lucide-svelte/icons/gauge";
  import Heart from "lucide-svelte/icons/heart";
  import Minus from "lucide-svelte/icons/minus";
  import Home from "lucide-svelte/icons/home";
  import Newspaper from "lucide-svelte/icons/newspaper";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Plus from "lucide-svelte/icons/plus";
  import Radio from "lucide-svelte/icons/radio";
  import Podcast from "lucide-svelte/icons/podcast";
  import RadioTower from "lucide-svelte/icons/radio-tower";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import Search from "lucide-svelte/icons/search";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import SkipForward from "lucide-svelte/icons/skip-forward";
  import Speaker from "lucide-svelte/icons/volume-2";
  import SpeakerX from "lucide-svelte/icons/volume-x";
  import Sunrise from "lucide-svelte/icons/sunrise";
  import Tv from "lucide-svelte/icons/tv";
  import ScheduledTaskNotice from "../../../packages/protocol/ScheduledTaskNotice.svelte";
  import { startSolarTheme, type SolarTheme } from "../../../packages/protocol/solar";
  import { browserClientId, tvServerUrl, tvServerWebSocketUrl, type DashboardContent, type GolfFriend, type GolfPersonDetail, type HomeState, type RuvNewsArticle, type RuvProgramResponse, type Station } from "../../../packages/protocol";
  import { articleImages, articleParagraphs, deriveRuvNow, EMPTY_DASHBOARD_CONTENT, eventProgress, fetchDashboardContent, fetchNewsArticle, formatClock, formatDate, formatDuration, formatTime, interpolateMediaTime, relativeTime } from "../../../packages/protocol/content";
  import DeilduPage from "./DeilduPage.svelte";
  import AgentChatPage from "./AgentChatPage.svelte";
  import PodcastPage from "./PodcastPage.svelte";
  import Header from "./Header.svelte";

  type Tab = "Heim" | "Útvarp" | "Hlaðvörp" | "Deildu" | "Sarpur" | "Fréttir" | "Spjall";
  let state: HomeState | undefined;
  let connected = false;
  let socket: WebSocket;
  let feedback = "";
  let activeTab: Tab = "Heim";
  let playerExpanded = false;
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
  let selectedNewsArticle: RuvNewsArticle | undefined;
  let selectedNewsArticleId = 0;
  let newsArticleLoading = false;
  let newsArticleError = "";
  let newsParagraphs: string[] = [];
  let newsImages: string[] = [];
  let contentController: AbortController | undefined;
  let contentGeneration = 0;
  let deilduPage = 1;
  let deilduCategoryId = 0;
  let deilduLoading = false;
  let personDetail: GolfPersonDetail | null = null;
  let personDetailLoading = false;
  let personDetailError = "";
  let friendDetail: GolfFriend | null = null;
  let golfFriends: GolfFriend[] = [];
  let scrollFrame = 0;
  const remoteClientId = browserClientId("remote");
  const log = pino({ name: "tv-kit-remote", level: "trace", browser: { asObject: true } });
  const refreshMs = Math.max(15_000, Number(import.meta.env.VITE_CONTENT_REFRESH_MS || 30_000));
  const [send, receive] = crossfade({ duration: 320, easing: quintOut });

  $: channels = content.channels.map(channel => deriveRuvNow(channel, now));
  $: favouriteIds = new Set(state?.radioFavorites ?? []);
  $: favouriteStations = stations.filter(station => favouriteIds.has(station.id));
  $: otherStations = stations.filter(station => !favouriteIds.has(station.id));
  $: movies = content.movies ?? [];
  $: categories = content.sarpurCategories ?? [];
  $: torrentMovies = content.torrentMovies ?? [];
  $: catalogPrograms = [...new Map([...movies, ...content.programs].map(program => [program.id, program])).values()];
  $: shows = catalogPrograms.filter(program => program.kind !== "movie");
  $: filteredPrograms = catalogPrograms.filter(program => !search.trim() || `${program.title} ${program.description} ${program.categories.map(item => item.title).join(" ")}`.toLocaleLowerCase("is").includes(search.trim().toLocaleLowerCase("is")));
  $: visiblePrograms = search.trim() ? filteredPrograms : shows;
  $: continueItems = content.continueWatching ?? [];
  $: myListPrograms = content.myList ?? [];
  $: programFavoriteIds = new Set(state?.programFavorites ?? []);
  $: if (state && (state.media.id !== observedMedia || state.media.currentTime !== observedTime)) { observedMedia = state.media.id; observedTime = state.media.currentTime; observedAt = now; }
  $: displayTime = state ? interpolateMediaTime(state.media, state.playing, observedAt, now) : 0;

  function command(action: string, value?: unknown, label?: string) {
    if (socket?.readyState === WebSocket.OPEN) {
      log.debug({ action, readyState: socket.readyState }, "ws command sent");
      socket.send(JSON.stringify({ type: "command", action, value, label }));
    } else log.warn({ action, readyState: socket?.readyState }, "ws command skipped while disconnected");
    if (label) { feedback = label; window.setTimeout(() => feedback = "", 3_000); }
  }
  async function fetchPersonDetail() {
    if (personDetail) return;
    personDetailLoading = true;
    personDetailError = "";
    try {
      const res = await fetch(tvServerUrl() + "/golfbox/rounds");
      if (!res.ok) throw new Error(`server svaraði ${res.status}`);
      personDetail = (await res.json()) as GolfPersonDetail;
    } catch (e) {
      personDetailError = e instanceof Error ? e.message : "mistókst";
    } finally {
      personDetailLoading = false;
    }
  }
  async function fetchGolfFriends() {
    if (golfFriends.length) return;
    try {
      const res = await fetch(tvServerUrl() + "/golfbox/friends");
      if (!res.ok) throw new Error(`server svaraði ${res.status}`);
      golfFriends = (await res.json()) as GolfFriend[];
    } catch { /* friends optional */ }
  }
  function openPersonDetail() { void fetchPersonDetail(); void fetchGolfFriends(); }
  function closePersonDetail() { personDetail = null; personDetailError = ""; }
  function openFriendDetail(friend: GolfFriend) { friendDetail = friend; }
  function closeFriendDetail() { friendDetail = null; }
  function openTab(tab: Tab) {
    activeTab = tab;
    void loadNewsArticle(0);
    window.scrollTo(0, 0);
    const view = tab === "Útvarp" ? "radio" : tab === "Hlaðvörp" ? "podcasts" : tab === "Deildu" ? "deildu" : tab === "Sarpur" ? "media" : tab === "Fréttir" ? "news" : tab === "Heim" ? "home" : "tv";
    if (tab !== "Spjall") command("view", view, tab);
    if (tab === "Fréttir") command("news-scroll", 0);
    if (tab === "Deildu") void refreshContent();
  }
  function syncNewsScroll() {
    if (activeTab !== "Fréttir" || scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      const page = document.scrollingElement;
      if (page) command("news-scroll", page.scrollTop / Math.max(1, page.scrollHeight - page.clientHeight));
    });
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
  function selectNewsArticle(id: number) {
    if (id) activeTab = "Fréttir";
    window.scrollTo(0, 0);
    command("news-article", id, id ? "Frétt opnuð" : "Allar fréttir");
    command("news-scroll", 0);
    void loadNewsArticle(id);
  }
  function selectStation(station: Station) { activeTab = "Útvarp"; command("radio", station.id, `Spila ${station.name}`); }
  function toggleStation(station: Station) { command("radio-favorite", station.id, favouriteIds.has(station.id) ? "Fjarlægt úr uppáhaldi" : "Sett í uppáhald"); }
  function cycleRate() {
    if (!state) return;
    const rates = [1, 1.25, 1.5, 2];
    command("playback-rate", rates[(rates.indexOf(state.media.playbackRate) + 1) % rates.length], "Hraði");
  }
  function toggleProgramFavorite(id: number) {
    command("program-favorite", id, programFavoriteIds.has(id) ? "Fjarlægt af mínum lista" : "Sett á minn lista");
    window.setTimeout(() => void refreshContent(), 400);
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
  async function refreshContent(page?: number, append = false) {
    const request = ++contentGeneration;
    const categoryId = state?.deilduCategoryId ?? 0;
    const sameCategory = categoryId === deilduCategoryId;
    const requestedPage = page ?? 1;
    const preserveLoadedPages = sameCategory && !append && deilduPage > 1;
    deilduLoading = append;
    contentController?.abort(); contentController = new AbortController();
    try {
		const next = await fetchDashboardContent(contentController.signal, categoryId, requestedPage, undefined, state?.deilduShowId ?? "");
      if (request !== contentGeneration) return;
      const items = append || preserveLoadedPages
        ? [...new Map([...next.deilduItems, ...content.deilduItems].map(item => [item.id, item])).values()]
        : next.deilduItems;
      const currentPage = append || preserveLoadedPages ? Math.max(deilduPage, next.deilduPagination.page) : next.deilduPagination.page;
      content = {
        ...next,
        deilduItems: items,
        deilduPagination: { ...next.deilduPagination, page: currentPage },
      };
      deilduPage = currentPage;
      deilduCategoryId = categoryId;
      contentError = "";
    } catch (error) {
      if (request !== contentGeneration || (error instanceof DOMException && error.name === "AbortError")) return;
      contentError = "Gögn uppfærast ekki";
    } finally {
      if (request === contentGeneration) deilduLoading = false;
    }
  }
  async function refreshStations() {
    try { const response = await fetch(`${tvServerUrl()}/radio/stations`); if (response.ok) stations = (await response.json()).stations; } catch { /* preserve cache */ }
  }
  const formatMediaTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  const golfDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("is-IS", { weekday: "short", day: "numeric", month: "short" });
  const torrentStatus = (status: string) => status === "ready" ? "Torrent · tilbúið" : status === "downloading" ? "Torrent · sækist" : status === "incomplete" ? "Torrent · ófullgert" : "Torrent · ekki sótt";

  onMount(() => {
    const clockTimer = window.setInterval(() => now = Date.now(), 1_000);
    const contentTimer = window.setInterval(refreshContent, refreshMs);
    const stationTimer = window.setInterval(refreshStations, 300_000);
    const stopSolar = startSolarTheme(theme => solar = theme);
    let retry: number;
    let lastMessage = Date.now();
    let disposed = false;
    const connect = () => {
      if (disposed || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
      clearTimeout(retry);
      const nextSocket = new WebSocket(tvServerWebSocketUrl(remoteClientId));
      socket = nextSocket;
      log.debug({ clientId: remoteClientId }, "ws connecting");
      nextSocket.onopen = () => {
        if (disposed || socket !== nextSocket) return;
        connected = true; lastMessage = Date.now(); log.info({ clientId: remoteClientId }, "ws open"); void refreshContent();
      };
      nextSocket.onerror = () => log.warn({ clientId: remoteClientId }, "ws error");
      nextSocket.onclose = ({ code, reason }) => {
        if (disposed || socket !== nextSocket) return;
        connected = false; log.warn({ clientId: remoteClientId, code, reason }, "ws close; reconnect scheduled"); retry = window.setTimeout(connect, 1_200);
      };
      nextSocket.onmessage = ({ data }) => {
        if (disposed || socket !== nextSocket) return;
        lastMessage = Date.now();
        const message = JSON.parse(data);
        log.trace({ type: message.type }, "ws message received");
        if (message.type === "state") {
          const previousCategoryId = state?.deilduCategoryId;
			const previousShowId = state?.deilduShowId;
          const changedAction = message.state.lastAction !== state?.lastAction;
          state = message.state;
			if (activeTab === "Deildu" && (changedAction || state.deilduCategoryId !== previousCategoryId || state.deilduShowId !== previousShowId)) void refreshContent();
          if (activeTab === "Fréttir" && state.newsArticleId !== selectedNewsArticleId) void loadNewsArticle(state.newsArticleId);
        } else if (message.type === "content-refresh" && (message.resource === "deildu" || message.resource === "podcasts")) {
          log.debug({ resource: message.resource }, "catalog refreshed");
          void refreshContent();
        }
      };
    };
    const heartbeatTimer = window.setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessage > 30_000) { log.warn({ lastMessage }, "ws heartbeat stale; closing"); socket.close(); }
      else { log.trace("ws ping sent"); socket.send(JSON.stringify({ type: "ping" })); }
    }, 10_000);
    const visibility = () => {
      if (document.visibilityState !== "visible") return;
      now = Date.now(); void refreshContent();
      if (socket?.readyState === WebSocket.OPEN && Date.now() - lastMessage > 30_000) { log.warn({ lastMessage }, "ws stale on visibility; closing"); socket.close(); }
    };
    document.addEventListener("visibilitychange", visibility);
    void refreshContent(); void refreshStations(); connect();
    return () => { disposed = true; clearInterval(clockTimer); clearInterval(contentTimer); clearInterval(stationTimer); clearInterval(heartbeatTimer); clearTimeout(retry); cancelAnimationFrame(scrollFrame); contentController?.abort(); socket?.close(); stopSolar(); document.removeEventListener("visibilitychange", visibility); };
  });
</script>

<svelte:head><title>TV Kit fjarstýring</title></svelte:head>
<svelte:window on:scroll={syncNewsScroll}/>

{#if state}
<div class="app-shell" class:chat-active={activeTab === "Spjall"}>
  <Header {state} {now} {connected} {contentError} {command}/>

  <main class:chat-mode={activeTab === "Spjall"}>
    {#if activeTab !== "Spjall"}
    <section class="now-playing panel">
      <div class="poster">{#if state.media.artwork}<img src={state.media.artwork} alt=""/>{:else}<Play size={28}/>{/if}</div>
      <div class="track"><span>{state.media.live ? "Í BEINNI" : state.media.source}</span><h1>{state.media.title}</h1><p>{state.media.subtitle}</p><div class="timeline"><i style={`width:${state.media.live ? 100 : Math.min(100,displayTime/Math.max(1,state.media.duration)*100)}%`}></i></div><div class="times"><span>{state.media.live ? "Í beinni" : formatMediaTime(displayTime)}</span><span>{state.media.live ? "" : formatMediaTime(state.media.duration)}</span></div></div>
      <div class="transport"><button aria-label="Fyrra" on:click={() => command("media-previous")}><SkipBack size={22}/></button><button class="primary" aria-label={state.playing ? "Pása" : "Spila"} on:click={() => command("toggle-play")}>{#if state.playing}<Pause size={27} fill="currentColor"/>{:else}<Play size={27} fill="currentColor"/>{/if}</button><button aria-label="Næsta" on:click={() => command("media-next")}><SkipForward size={22}/></button><button class:active={playerExpanded} aria-label={playerExpanded ? "Loka ítarlegri fjarstýringu" : "Opna ítarlega fjarstýringu"} on:click={() => playerExpanded = !playerExpanded}><SlidersHorizontal size={22}/></button><button class:active={state.media.fullscreen} aria-label="Fullskjár" on:click={() => command("fullscreen", !state.media.fullscreen, "Fullskjár")}><Expand size={22}/></button></div>
    </section>

    {#if playerExpanded}<div class="player-details panel">
    <section class="media-tools">
      <button class:active={state.media.panel === "epg"} on:click={() => command("player-panel", state.media.panel === "epg" ? "" : "epg", "Dagskrá")}><Radio size={20}/><span>Dagskrá</span></button>
      <button class:active={state.media.panel === "subtitles"} disabled={state.media.subtitles.length < 2} on:click={() => command("player-panel", state.media.panel === "subtitles" ? "" : "subtitles", "Skjátextar")}><Captions size={20}/><span>{state.media.subtitleTrack}</span></button>
      <button class:active={state.media.panel === "audio"} on:click={() => command("player-panel", state.media.panel === "audio" ? "" : "audio", "Hljóðrás")}><AudioLines size={20}/><span>{state.media.audioTrack}</span></button>
      <button disabled={state.media.live} on:click={cycleRate}><Gauge size={20}/><span>{state.media.playbackRate}x</span></button>
      <button class:active={state.media.favorite} on:click={() => command("toggle-favorite", undefined, "Uppáhald")}><Heart size={20} fill={state.media.favorite ? "currentColor" : "none"}/><span>Uppáhald</span></button>
    </section>

    {#if state.media.panel === "subtitles"}<section class="option-sheet panel"><strong>Skjátextar</strong>{#each state.media.subtitles as track}<button class:selected={track === state.media.subtitleTrack} on:click={() => command("subtitle", track, track)}>{track}</button>{/each}</section>{/if}
    {#if state.media.panel === "audio"}<section class="option-sheet panel"><strong>Hljóðrás</strong>{#each state.media.audioTracks as track}<button class:selected={track === state.media.audioTrack} on:click={() => command("audio-track", track, track)}>{track}</button>{/each}</section>{/if}
    {#if state.media.panel === "epg"}<section class="epg-sheet panel"><strong>Dagskrá</strong>{#if state.media.epg.length}{#each state.media.epg as item}<article class:current={item.current}><time>{item.start}</time><div><strong>{item.title}</strong><span>{item.detail}</span></div></article>{/each}{:else}<p>Engin dagskrá tiltæk.</p>{/if}</section>{/if}
    </div>{/if}
    {/if}

    {#if activeTab === "Heim"}
      {#if state.cast}<section class="cast-active panel"><div><Tv size={22}/><span><strong>{state.cast.source === "airplay" ? "AirPlay" : state.cast.source === "miracast" ? "Miracast" : "Android Cast"}</strong><small>{state.cast.deviceName}</small></span></div><button on:click={() => command("cast-stop", undefined, "Cast stöðvað")}>Stöðva</button></section>{/if}
      <section class="live-grid">{#each channels as item}<article class="panel"><div class="panel-heading"><div><Tv size={19}/><h2>{item.channel.name}</h2></div>{#if state.tvFavorites.includes(item.channel.slug)}<Heart size={16} fill="currentColor"/>{/if}</div><div class="live-copy"><span>Í BEINNI</span><strong>{item.current?.title ?? "Bein útsending"}</strong><small>{item.current?.category || item.current?.description}</small>{#if item.current}<i><b style={`width:${eventProgress(item.current,now)}%`}></b></i>{/if}</div><div class="card-actions"><button on:click={() => command("ruv-channel", item.channel.slug, `Spila ${item.channel.name}`)}><Play size={18}/> Spila</button><button aria-label="Uppáhald" on:click={() => command("tv-favorite", item.channel.slug)}><Heart size={18} fill={state.tvFavorites.includes(item.channel.slug) ? "currentColor" : "none"}/></button></div></article>{/each}</section>
      <section class="home-programs panel"><div class="panel-heading"><div><Play size={19}/><h2>Nýtt í Sarpinum</h2></div><button on:click={() => openTab("Sarpur")}>Allt <ChevronRight size={17}/></button></div>{#if catalogPrograms.length}<div class="home-program-grid">{#each catalogPrograms.slice(0,6) as program (program.id)}<button class="home-program" on:click={() => { openTab("Sarpur"); void openProgram(program.id); }}>{#if program.image||program.portraitImage}<img src={program.image||program.portraitImage} alt=""/>{:else}<div class="home-program-ph"><Tv size={22}/></div>{/if}<span><strong>{program.title}</strong><small>{program.latestEpisode?.title ?? program.foreignTitle ?? ""}</small></span></button>{/each}</div>{:else}<div class="empty">Sæki Sarpinn…</div>{/if}</section>
      <section class="tee-times panel"><div class="panel-heading"><div><Flag size={19}/><h2>Lausir rástímar í dag</h2></div><span>{content.golfTeeTimes ? `${content.golfTeeTimes.course} · ${content.golfTeeTimes.slots.length}` : "Ekki tiltækt"}</span></div>{#if content.golfPerson}<div class="person-bookings"><button class="person-name" on:click={() => openFriendDetail(golfFriends.find(f => f.name === content.golfPerson) || {name: content.golfPerson, memberNumber: "", handicap: null, club: ""})}><strong>{content.golfPerson}</strong><ChevronRight size={14}/></button>{#if content.golfBookings.length}{#each content.golfBookings as booking}<span><b>{golfDate(booking.date)}</b>{booking.time}</span>{/each}{:else}<span>Enginn skráður rástími næstu daga</span>{/if}</div>{/if}<div class="person-bookings"><button class="person-name" on:click={openPersonDetail}><strong>Ólafur Búi Ólafsson</strong><ChevronRight size={14}/></button>{#if personDetail}<span>Forgjöf {personDetail.handicap}</span><span>{personDetail.totalRounds} hringir</span>{:else}<span>…</span>{/if}</div>{#if content.golfTeeTimes?.slots.length}<div class="tee-grid">{#each content.golfTeeTimes.slots.slice(0,18) as slot}<article><strong>{slot.time}</strong><span>{slot.openSeats === 1 ? "1 laust sæti" : `${slot.openSeats} laus sæti`}</span></article>{/each}</div>{#if content.golfTeeTimes.slots.length > 18}<p>+{content.golfTeeTimes.slots.length - 18} tímar síðar í dag</p>{/if}{:else}<div class="empty">{content.golfTeeTimes ? "Engir lausir rástímar eftir í dag." : "Ekki tókst að sækja rástíma."}</div>{/if}{#if content.golfTeeTimes?.stale}<small class="stale">Sýni síðustu þekktu gögn.</small>{/if}</section>

{#if personDetail}<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions --><div class="detail-overlay" on:click={closePersonDetail}><!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions --><div class="detail-sheet" on:click|stopPropagation><div class="detail-header"><h3>{personDetail.name}</h3><span class="detail-club">{personDetail.club}</span><button class="detail-close" on:click={closePersonDetail}><Minus size={20}/></button></div><div class="detail-stats"><span><b>Forgjöf</b><strong>{personDetail.handicap ?? "—"}</strong></span><span><b>Skráðir hringir</b><strong>{personDetail.totalRounds}</strong></span></div>{#each Object.entries(personDetail.byCourse) as [course, rounds]}{#if course !== "Artificial"}<div class="detail-course"><h4>{course}</h4><span>{rounds.length} hringir</span></div><div class="detail-rounds">{#each rounds as round}<article class="detail-round"><span class="round-date">{round.date.slice(0,4)}.{round.date.slice(4,6)}.{round.date.slice(6,8)}</span><span class="round-score"><b>{round.gross}</b><small>/{round.par}</small></span><span class="round-diff">{round.differential > 0 ? "+" : ""}{round.differential?.toFixed(1)}</span><span class="round-hcp">{round.hcpBefore}→{round.hcpAfter}</span><span class="round-tee">{round.tee.replace("_"," ")}</span><span class="round-marker">{round.marker}</span></article>{/each}</div>{/if}{/each}</div></div>{/if}

{#if friendDetail}<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions --><div class="detail-overlay" on:click={closeFriendDetail}><!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions --><div class="detail-sheet" on:click|stopPropagation><div class="detail-header"><h3>{friendDetail.name}</h3><span class="detail-club">{friendDetail.club}</span><button class="detail-close" on:click={closeFriendDetail}><Minus size={20}/></button></div><div class="detail-stats"><span><b>Forgjöf</b><strong>{friendDetail.handicap ?? "—"}</strong></span><span><b>Meðlimanúmer</b><strong>{friendDetail.memberNumber || "—"}</strong></span></div></div></div>{/if}
      <section class="news-strip panel"><div class="panel-heading"><div><Newspaper size={19}/><h2>Nýjustu fréttir</h2></div><button on:click={() => openTab("Fréttir")}>Allar <ChevronRight size={17}/></button></div>{#each content.news.slice(0,4) as article}<button class="home-news" on:click={() => selectNewsArticle(article.id)}>{#if article.mainImageUrl}<img src={article.mainImageUrl} alt=""/>{/if}<div><strong>{article.title}</strong><span>{relativeTime(article.firstPublishedAt,now)}</span></div></button>{/each}</section>
      <section class="home-facts"><article><Clock size={20}/><div><span>Klukkan</span><strong>{formatClock(now)}</strong><small>{formatDate(now)}</small></div></article>{#if solar}<article><Sunrise size={20}/><div><span>Dagsbirta</span><strong>{new Date(solar.sunrise*1000).toLocaleTimeString("is-IS",{hour:"2-digit",minute:"2-digit"})} → {new Date(solar.sunset*1000).toLocaleTimeString("is-IS",{hour:"2-digit",minute:"2-digit"})}</strong><small>{solar.location}</small></div></article>{/if}<article><RadioTower size={20}/><div><span>Útvarp</span><strong>{stations.length} stöðvar</strong><small>Veldu í fjarstýringunni</small></div></article></section>
    {:else if activeTab === "Útvarp"}
      <section class="radio-browser panel"><div class="panel-heading"><div><RadioTower size={20}/><h2>Íslenskt útvarp</h2></div><span>{stations.length} stöðvar</span></div>{#if favouriteStations.length}<h3><Heart size={15} fill="currentColor"/> Uppáhaldsstöðvar</h3><div class="radio-grid">{#each favouriteStations as station (station.id)}<article in:receive={{key:station.id}} out:send={{key:station.id}} animate:flip={{duration:320}}><button class="tune" on:click={() => selectStation(station)}>{#if station.logoUrl}<img src={station.logoUrl} alt=""/>{/if}<span><strong>{station.name}</strong><small>{station.terrestrial?`${station.frequency.toFixed(1)} FM`:"Á netinu"}</small></span></button><button class="heart" aria-label={`Fjarlægja ${station.name} úr uppáhaldi`} on:click={() => toggleStation(station)}><Heart size={17} fill="currentColor"/></button></article>{/each}</div>{/if}<h3><RadioTower size={15}/> Allar stöðvar</h3><div class="radio-grid">{#each otherStations as station (station.id)}<article in:receive={{key:station.id}} out:send={{key:station.id}} animate:flip={{duration:320}}><button class="tune" on:click={() => selectStation(station)}>{#if station.logoUrl}<img src={station.logoUrl} alt=""/>{/if}<span><strong>{station.name}</strong><small>{station.terrestrial?`${station.frequency.toFixed(1)} FM`:"Á netinu"}</small></span></button><button class="heart" aria-label={`Setja ${station.name} í uppáhald`} on:click={() => toggleStation(station)}><Heart size={17}/></button></article>{/each}</div></section>
    {:else if activeTab === "Hlaðvörp"}
      <PodcastPage podcasts={content.podcasts} activeMediaId={state.media.id} {command}/>
    {:else if activeTab === "Deildu"}
		<DeilduPage categories={content.deilduCategories} items={content.deilduItems} shows={content.deilduShows} show={content.deilduShow} pagination={content.deilduPagination} scrape={content.deilduScrape} selectedCategoryId={state.deilduCategoryId} loading={deilduLoading} loadPage={(page) => void refreshContent(page, true)} {command}/>
    {:else if activeTab === "Spjall"}
      <AgentChatPage />
    {:else if activeTab === "Sarpur"}
      <section class="program-browser panel"><div class="panel-heading"><div><Tv size={20}/><h2>Kvikmyndir og þættir</h2></div><label><Search size={17}/><input bind:value={search} placeholder="Leita að þætti" aria-label="Leita í Sarpinum"/></label></div>{#if detailLoading}<div class="empty">Sæki þætti…</div>{:else if selectedProgram}<div class="program-detail"><div class="detail-head"><button class="back" on:click={() => selectedProgram=undefined}><ChevronLeft size={18}/> Til baka</button><button class="list-toggle" class:active={programFavoriteIds.has(selectedProgram.program.id)} on:click={() => toggleProgramFavorite(selectedProgram.program.id)}><Heart size={16} fill={programFavoriteIds.has(selectedProgram.program.id) ? "currentColor" : "none"}/>{programFavoriteIds.has(selectedProgram.program.id) ? "Á mínum lista" : "Setja á minn lista"}</button></div><h2>{selectedProgram.program.title}</h2><p>{selectedProgram.program.description || selectedProgram.program.shortDescription}</p><div class="episode-list">{#each selectedProgram.episodes.filter(item=>item.available).slice(0,30) as episode}<article>{#if episode.image}<img src={episode.image} alt=""/>{/if}<div><strong>{episode.title}</strong><span>{formatDuration(episode.duration)} · {episode.firstRun ? new Date(episode.firstRun).toLocaleDateString("is-IS") : ""}{#if episode.progress?.finished} · Séð{/if}</span>{#if episode.progress && !episode.progress.finished && episode.progress.position >= 10}<i class="ep-progress"><b style={`width:${Math.min(100,Math.round(episode.progress.position/Math.max(1,episode.progress.duration||episode.duration)*100))}%`}></b></i>{/if}</div><button aria-label={episode.progress && !episode.progress.finished && episode.progress.position >= 10 ? `Halda áfram með ${episode.title}` : `Spila ${episode.title}`} on:click={() => command("ruv-episode",episode.id,episode.progress && !episode.progress.finished && episode.progress.position >= 10 ? `Halda áfram: ${episode.title}` : `Spila ${episode.title}`)}><Play size={18}/></button></article>{/each}</div></div>{:else}{#if !search.trim() && content.sarpurCategories && content.sarpurCategories.length}{#each content.sarpurCategories.filter(c => c.programs && c.programs.length) as category}<h3 class="rail-title"><Tv size={15}/> {category.title}</h3><div class="rail">{#each category.programs.slice(0,7) as program}<button class="list-card" on:click={() => openProgram(program.id)}>{#if program.image||program.portraitImage}<img src={program.image||program.portraitImage} alt=""/>{:else}<Tv size={22}/>{/if}<span>{program.title}</span></button>{/each}</div>{/each}{/if}{#if search.trim() && visiblePrograms.length}<h3 class="rail-title"><Search size={15}/> Leitarniðurstöður</h3><div class="rail">{#each visiblePrograms as program}<button class="list-card" on:click={() => openProgram(program.id)}>{#if program.image||program.portraitImage}<img src={program.image||program.portraitImage} alt=""/>{:else}<Tv size={22}/>{/if}<span>{program.title}</span></button>{/each}</div>{:else if search.trim()}<div class="empty">Engar niðurstöður fundust</div>{/if}{#if !categories.length && !visiblePrograms.length}<div class="empty">Ekkert myndefni er tiltækt.</div>{/if}{/if}</section>
    {:else}
      {#if selectedNewsArticleId}
        <section class="news-reader panel">
          <div class="reader-toolbar"><button on:click={() => selectNewsArticle(0)}><ChevronLeft size={18}/> Allar fréttir</button><span>Lestrarhamur</span></div>
          {#if newsArticleLoading}<div class="empty">Sæki frétt…</div>
          {:else if selectedNewsArticle}<article><div class="reader-copy"><div class="reader-meta"><span>{selectedNewsArticle.categoryTitle||selectedNewsArticle.topicName||"RÚV"}</span><time>{relativeTime(selectedNewsArticle.firstPublishedAt,now)}</time></div><h2>{selectedNewsArticle.title}</h2>{#if selectedNewsArticle.subtitle}<p class="reader-lead">{selectedNewsArticle.subtitle}</p>{/if}</div>{#if selectedNewsArticle.mainImageUrl}<img src={selectedNewsArticle.mainImageUrl} alt=""/>{/if}<div class="reader-body">{#each newsParagraphs as paragraph}<p>{paragraph}</p>{/each}{#each newsImages as image}<img src={image} alt="" loading="lazy"/>{/each}</div>{#if selectedNewsArticle.authors.length}<footer>{selectedNewsArticle.authors.map(author=>author.name).join(" · ")}</footer>{/if}</article>
          {:else}<div class="empty">{newsArticleError||"Fréttin fannst ekki"}</div>{/if}
        </section>
      {:else}
        <section class="news-browser"><div class="section-head"><div><Newspaper size={21}/><h2>Fréttir RÚV</h2></div><span>{content.news.length} fréttir</span></div><div class="news-grid">{#each content.news as article}<button class="panel news-card" aria-label={`Lesa ${article.title}`} on:click={() => selectNewsArticle(article.id)}>{#if article.mainImageUrl}<img src={article.mainImageUrl} alt=""/>{:else}<div class="news-placeholder"><Newspaper size={28}/></div>{/if}<div><span>{article.categoryTitle||article.topicName||"RÚV"}</span><strong>{article.title}</strong><p>{article.subtitle}</p><time>{relativeTime(article.firstPublishedAt,now)}</time></div></button>{/each}</div></section>
      {/if}
    {/if}
  </main>

  <nav aria-label="Aðalvalmynd">{#each [{name:"Heim",icon:Home},{name:"Útvarp",icon:RadioTower},{name:"Hlaðvörp",icon:Podcast},{name:"Deildu",icon:Film},{name:"Sarpur",icon:Tv},{name:"Fréttir",icon:Newspaper},{name:"Spjall",icon:MessageCircle}] as tab}<button class:active={activeTab===tab.name} on:click={() => openTab(tab.name as Tab)}><svelte:component this={tab.icon} size={20}/><span>{tab.name}</span></button>{/each}</nav>
  <ScheduledTaskNotice />
  {#if feedback}<div class="toast" role="status" aria-live="polite"><span>{feedback}</span><button aria-label="Loka tilkynningu" on:click={() => feedback = ""}>×</button></div>{/if}
</div>
{:else}<div class="loading"><Home size={34}/><strong>Tengist tvserverd…</strong></div>{/if}

<style>
  :global(*){box-sizing:border-box}:global(html,body,#app){margin:0;min-height:100%;background:oklch(.105 0 0);color:oklch(.95 0 0);font-family:ui-sans-serif,system-ui,sans-serif}:global(button),:global(input){font:inherit;color:inherit}:global(button){cursor:pointer;touch-action:manipulation}
  .app-shell{--bg:color-mix(in oklch,var(--solar-bg-from,oklch(.16 .012 36)),var(--solar-bg-to,oklch(.16 .012 36)) var(--solar-progress,0%));--header:color-mix(in oklch,var(--solar-header-from,oklch(.19 .015 36)),var(--solar-header-to,oklch(.19 .015 36)) var(--solar-progress,0%));--surface:color-mix(in oklch,var(--solar-surface-from,oklch(.22 .015 36)),var(--solar-surface-to,oklch(.22 .015 36)) var(--solar-progress,0%));--raised:color-mix(in oklch,var(--solar-raised-from,oklch(.26 .018 36)),var(--solar-raised-to,oklch(.26 .018 36)) var(--solar-progress,0%));--border:color-mix(in oklch,var(--solar-border-from,oklch(.34 .02 36)),var(--solar-border-to,oklch(.34 .02 36)) var(--solar-progress,0%));--ink:color-mix(in oklch,var(--solar-ink-from,oklch(.96 0 0)),var(--solar-ink-to,oklch(.96 0 0)) var(--solar-progress,0%));--muted:color-mix(in oklch,var(--solar-muted-from,oklch(.7 .01 36)),var(--solar-muted-to,oklch(.7 .01 36)) var(--solar-progress,0%));--primary:color-mix(in oklch,var(--solar-primary-from,oklch(.72 .14 36)),var(--solar-primary-to,oklch(.72 .14 36)) var(--solar-progress,0%));--presence-accent:color-mix(in oklch,var(--solar-presence-accent-from,oklch(.74 .11 155)),var(--solar-presence-accent-to,oklch(.74 .11 155)) var(--solar-progress,0%));--shadow-card:0 8px 22px oklch(0 0 0/.28);--shadow-soft:0 3px 10px oklch(0 0 0/.2);--type-title:clamp(20px,1.35vw,26px);--type-section:clamp(17px,1.05vw,21px);--type-body:clamp(15px,.92vw,17px);--type-reading:clamp(19px,1.35vw,24px);--type-meta:clamp(12px,.75vw,14px);--type-label:clamp(11px,.7vw,13px);min-height:100dvh;padding-bottom:86px;background:var(--bg);color:var(--ink)}
    .app-shell.chat-active{height:100dvh;min-height:0;overflow:hidden;padding-bottom:0}
  header{height:76px;padding:env(safe-area-inset-top) 18px 0;position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1fr auto auto 48px;align-items:center;gap:15px;border-bottom:1px solid var(--border);background:var(--header)}.brand{display:flex;align-items:center;gap:10px}.brand > :global(svg){color:var(--primary)}.brand div{display:flex;flex-direction:column}.brand strong{font-size:15px}.brand span{font-size:10px;color:var(--muted);text-transform:capitalize}.connection{display:flex;align-items:center;gap:6px;color:var(--presence-accent);font-size:10px}.connection.offline{color:var(--primary)}header time{font-size:16px;font-variant-numeric:tabular-nums}header>button{width:46px;height:46px;border:0;border-radius:11px;background:var(--raised);display:grid;place-items:center}header>button.off{color:var(--primary)}
  main{max-width:1060px;margin:auto;padding:16px 20px 106px;display:flex;flex-direction:column;gap:14px}.chat-mode{height:calc(100dvh - 76px);min-height:0;overflow:hidden;padding-bottom:90px}.panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--shadow-card)}.panel-heading{height:52px;padding:0 15px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.panel-heading>div{display:flex;align-items:center;gap:8px}.panel-heading h2{font-size:14px;margin:0}.panel-heading>span{font-size:10px;color:var(--muted)}.panel-heading button{height:44px;border:0;background:none;display:flex;align-items:center;gap:4px;color:var(--primary);font-size:11px}
  .now-playing{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:29;max-width:1036px;margin:auto;padding:13px;display:grid;grid-template-columns:98px 1fr auto;align-items:center;gap:14px;background:color-mix(in oklch,var(--header),transparent 20%);backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%)}.poster{width:96px;height:76px;border-radius:9px;overflow:hidden;background:var(--raised);display:grid;place-items:center}.poster img{width:100%;height:100%;object-fit:contain}.track{min-width:0}.track>span{font-size:9px;color:var(--primary);font-weight:800}.track h1{font-size:var(--type-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:3px 0}.track p{font-size:var(--type-meta);color:var(--muted);margin:0}.timeline{height:3px;background:var(--border);margin-top:9px}.timeline i{display:block;height:100%;background:var(--primary)}.times{display:flex;justify-content:space-between;font-size:8px;color:var(--muted);margin-top:3px}.transport{display:flex;gap:6px}.transport button{width:44px;height:44px;border:0;border-radius:50%;background:var(--raised);display:grid;place-items:center}.transport .primary{width:54px;height:54px;background:var(--primary);color:white}.transport button.active{border:1px solid var(--primary);color:var(--primary)}
  /* ponytail: offset must clear the .now-playing bar height (tall on tablet/
     desktop where title+timeline show, short on phone where they are hidden). */
  .player-details{position:fixed;left:12px;right:12px;bottom:calc(210px + env(safe-area-inset-bottom));z-index:28;max-width:1036px;max-height:calc(100dvh - 250px);margin:auto;padding:10px;overflow:auto;background:color-mix(in oklch,var(--header),transparent 12%);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.media-tools{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.media-tools button{min-height:56px;border:1px solid var(--border);border-radius:10px;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:9px;color:var(--muted);box-shadow:var(--shadow-soft)}.media-tools button.active{border-color:var(--primary);color:var(--primary)}.media-tools button:disabled{opacity:.35}.option-sheet{padding:12px;display:flex;flex-wrap:wrap;gap:7px}.option-sheet>strong{width:100%}.option-sheet button{min-height:44px;padding:0 14px;border:1px solid var(--border);border-radius:9px;background:var(--raised)}.option-sheet button.selected{border-color:var(--primary);color:var(--primary)}.epg-sheet{padding:12px}.epg-sheet>strong{display:block;margin-bottom:7px}.epg-sheet article{min-height:54px;display:grid;grid-template-columns:56px 1fr;align-items:center;border-top:1px solid var(--border)}.epg-sheet article.current{background:var(--raised)}.epg-sheet time{font-size:10px;color:var(--primary)}.epg-sheet article div{display:flex;flex-direction:column}.epg-sheet article strong{font-size:11px}.epg-sheet article span,.epg-sheet p{font-size:9px;color:var(--muted)}
  .live-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.live-copy{padding:15px;display:flex;flex-direction:column}.live-copy>span{font-size:9px;color:var(--primary);font-weight:800}.live-copy>strong{font-size:var(--type-title);margin:5px 0}.live-copy>small{font-size:var(--type-meta);color:var(--muted)}.live-copy i{height:3px;background:var(--border);margin-top:12px}.live-copy i b{display:block;height:100%;background:var(--primary)}.card-actions{padding:0 12px 12px;display:grid;grid-template-columns:1fr 48px;gap:7px}.card-actions button{height:46px;border:1px solid var(--border);border-radius:9px;background:var(--raised);display:flex;align-items:center;justify-content:center;gap:6px}.person-bookings{padding:10px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);background:var(--raised)}.person-bookings strong{font-size:12px;margin-right:auto}.person-bookings>button{margin-right:auto;display:flex;align-items:center;gap:4px;border:0;background:none;cursor:pointer;padding:0;color:inherit}.person-bookings>button strong{font-size:12px}.person-bookings>button :global(svg){color:var(--primary)}.person-bookings span{display:flex;flex-direction:column;gap:2px;font-size:10px;color:var(--muted)}.person-bookings b{color:var(--primary);font-size:9px}.detail-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.5);display:flex;align-items:flex-end}.detail-sheet{width:100%;max-height:80vh;overflow-y:auto;background:var(--surface);border-radius:16px 16px 0 0;padding:0 0 20px}.detail-header{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);z-index:1}.detail-header h3{margin:0;font-size:15px}.detail-header .detail-club{font-size:10px;color:var(--muted);margin-left:auto;margin-right:12px}.detail-close{width:36px;height:36px;flex:0 0 auto;border:0;border-radius:50%;background:var(--raised);display:grid;place-items:center;cursor:pointer;color:var(--muted)}.detail-stats{display:flex;gap:0;margin:0}.detail-stats span{flex:1;padding:14px;text-align:center;border-bottom:1px solid var(--border)}.detail-stats span+span{border-left:1px solid var(--border)}.detail-stats b{display:block;font-size:9px;color:var(--muted);font-weight:400;margin-bottom:3px}.detail-stats strong{font-size:20px;color:var(--primary)}.detail-course{display:flex;align-items:baseline;gap:8px;padding:14px 16px 6px}.detail-course h4{margin:0;font-size:13px}.detail-course span{font-size:9px;color:var(--muted)}.detail-rounds{display:flex;flex-direction:column;gap:1px;padding:0 16px}.detail-round{display:grid;grid-template-columns:60px 1fr 50px 70px 60px 1fr;gap:6px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:10px}.detail-round:last-child{border:0}.detail-round .round-date{font-size:9px;color:var(--muted)}.detail-round .round-score{display:flex;align-items:baseline;gap:2px}.detail-round .round-score b{font-size:13px;color:var(--primary)}.detail-round .round-score small{font-size:9px;color:var(--muted)}.detail-round .round-diff{text-align:right;font-size:10px;color:var(--muted)}.detail-round .round-hcp{font-size:9px;color:var(--muted);text-align:center}.detail-round .round-tee{font-size:9px;color:var(--muted)}.detail-round .round-marker{font-size:9px;color:var(--muted);text-align:right}.tee-grid{padding:10px;display:grid;grid-template-columns:repeat(6,1fr);gap:7px}.tee-grid article{min-height:58px;padding:8px;display:flex;flex-direction:column;justify-content:center;border-radius:9px;background:var(--raised);box-shadow:var(--shadow-soft)}.tee-grid strong{font-size:14px;color:var(--primary)}.tee-grid span,.tee-times>p,.stale{font-size:9px;color:var(--muted)}.tee-times>p,.stale{display:block;margin:0;padding:0 12px 10px}.home-news{width:100%;min-height:67px;padding:8px 13px;display:grid;grid-template-columns:70px 1fr;gap:10px;border:0;border-top:1px solid var(--border);background:none;text-align:left}.news-strip img{width:70px;height:50px;object-fit:cover;border-radius:7px}.news-strip article div{display:flex;min-width:0;flex-direction:column}.news-strip strong{font-size:11px}.news-strip span{font-size:9px;color:var(--muted);margin-top:4px}.solar{padding:15px}.home-program-grid{padding:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.home-program{border:0;text-align:left;background:var(--raised);border-radius:11px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-soft)}.home-program img,.home-program-ph{width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--surface)}.home-program-ph{display:grid;place-items:center;color:var(--primary)}.home-program span{padding:10px;display:flex;flex-direction:column;min-width:0}.home-program strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.home-program small{font-size:10px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.home-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.home-facts article{padding:14px 16px;display:flex;align-items:center;gap:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow-soft)}.home-facts :global(svg){color:var(--primary);flex:0 0 auto}.home-facts div{display:flex;flex-direction:column;min-width:0}.home-facts span,.home-facts small{font-size:10px;color:var(--muted)}.home-facts strong{font-size:16px;margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.solar div{display:flex;align-items:center;gap:7px}.solar>span{display:block;font-size:10px;color:var(--muted);margin-top:7px}.cast-active{padding:12px;display:flex;align-items:center;justify-content:space-between}.cast-active>div{display:flex;align-items:center;gap:10px}.cast-active span{display:flex;flex-direction:column}.cast-active small{color:var(--muted)}.cast-active button{height:44px;padding:0 16px;border:0;border-radius:9px;background:var(--primary);color:white}
  .remote-grid{display:grid;grid-template-columns:1.4fr .8fr;gap:12px}.controls{padding:17px;display:grid;grid-template-columns:72px 1fr 72px;align-items:center;gap:15px}.rocker{height:190px;display:grid;grid-template-rows:55px 1fr 55px;border:1px solid var(--border);border-radius:99px;overflow:hidden;background:var(--raised)}.rocker button{border:0;background:none;display:grid;place-items:center}.rocker span{display:grid;place-items:center;font-size:10px;color:var(--muted)}.center{display:flex;align-items:center;justify-content:center;gap:10px}.center button{width:58px;height:58px;border:0;border-radius:50%;background:var(--raised);display:grid;place-items:center}.center .primary{background:var(--primary);color:white}.channel-list article{min-height:68px;padding:9px 12px;display:grid;grid-template-columns:1fr 46px;align-items:center;border-top:1px solid var(--border)}.channel-list article div{display:flex;flex-direction:column}.channel-list article span{font-size:var(--type-meta);color:var(--muted);margin-top:4px}.channel-list article button{width:44px;height:44px;border:0;border-radius:9px;background:var(--raised);display:grid;place-items:center}
  .radio-browser h3{padding:12px 14px 0;margin:0;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--primary)}.radio-grid{padding:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.radio-grid article{position:relative;min-height:64px;border:1px solid var(--border);border-radius:10px;background:var(--raised)}.radio-grid .tune{width:100%;height:64px;padding:7px 33px 7px 8px;border:0;background:none;display:grid;grid-template-columns:44px 1fr;align-items:center;gap:7px;text-align:left}.radio-grid img{width:42px;height:42px;object-fit:contain}.radio-grid .tune span{display:flex;min-width:0;flex-direction:column}.radio-grid strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.radio-grid small{font-size:8px;color:var(--muted)}.heart{position:absolute;right:1px;top:10px;width:32px;height:44px;border:0;background:none;color:var(--primary)}
  .rail-title{padding:12px 14px 0;margin:0;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--primary)}.rail{padding:10px;display:flex;gap:9px;overflow-x:auto;scrollbar-width:thin}.rail>button{flex:0 0 auto;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--raised);text-align:left;padding:0}.continue-card{position:relative;width:196px;min-height:118px;display:flex;flex-direction:column}.continue-card img{width:100%;height:70px;object-fit:cover}.continue-card > :global(svg){width:100%;height:70px;padding:22px}.continue-card span{padding:7px 8px 10px;display:flex;min-width:0;flex-direction:column}.continue-card strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.continue-card small{font-size:8px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.continue-card i{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--border)}.continue-card i b{display:block;height:100%;background:var(--primary)}.list-card{width:120px;min-height:112px;display:flex;flex-direction:column}.list-card img{width:100%;height:76px;object-fit:cover}.list-card > :global(svg){width:100%;height:76px;padding:24px}.list-card span{padding:7px 8px;display:flex;min-width:0;flex-direction:column;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.list-card small{font-size:8px;color:var(--muted);margin-top:2px}.list-card:disabled{opacity:.5;cursor:not-allowed}.detail-head{display:flex;align-items:center;justify-content:space-between}.list-toggle{height:42px;padding:0 13px;display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:9px;background:var(--raised);font-size:10px}.list-toggle.active{border-color:var(--primary);color:var(--primary)}.ep-progress{display:block;width:130px;height:3px;background:var(--border);margin-top:5px}.ep-progress b{display:block;height:100%;background:var(--primary)}
  .program-browser .panel-heading label{height:36px;padding:0 9px;display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:8px;background:var(--raised)}.program-browser input{width:170px;border:0;outline:0;background:none;font-size:10px}.program-grid{padding:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.program-grid>button{min-height:142px;padding:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--raised);text-align:left}.program-grid img{width:100%;height:90px;object-fit:cover}.program-grid>button > :global(svg){width:100%;height:90px;padding:30px}.program-grid button span{padding:8px;display:flex;flex-direction:column}.program-grid strong{font-size:11px}.program-grid small{font-size:8px;color:var(--muted);margin-top:3px}.program-detail{padding:14px}.program-detail .back{height:42px;border:0;background:none;color:var(--primary);display:flex;align-items:center}.program-detail h2{font-size:24px}.program-detail>p{font-size:11px;color:var(--muted);line-height:1.5}.episode-list article{min-height:70px;display:grid;grid-template-columns:90px 1fr 46px;align-items:center;gap:10px;border-top:1px solid var(--border)}.episode-list img{width:90px;height:58px;object-fit:cover}.episode-list article div{display:flex;flex-direction:column}.episode-list strong{font-size:11px}.episode-list span{font-size:9px;color:var(--muted)}.episode-list button{width:44px;height:44px;border:0;border-radius:9px;background:var(--raised);display:grid;place-items:center}
  .section-head{height:58px;display:flex;align-items:center;justify-content:space-between}.section-head>div{display:flex;align-items:center;gap:8px}.section-head h2{margin:0}.section-head span{font-size:10px;color:var(--muted)}.news-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.news-card{width:100%;padding:0;color:inherit;text-align:left}.news-card>img,.news-placeholder{width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;background:var(--raised)}.news-placeholder{display:grid;place-items:center}.news-card>div:last-child{padding:11px;display:flex;flex-direction:column}.news-grid span,.news-grid time{font-size:var(--type-body);color:var(--primary)}.news-grid strong{font-size:var(--type-title);line-height:1.3;margin:4px 0}.news-grid p{font-size:var(--type-section);color:var(--muted);line-height:1.4}.reader-toolbar{height:58px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.reader-toolbar button{height:44px;padding:0;border:0;background:none;display:flex;align-items:center;gap:5px;color:var(--primary)}.reader-toolbar span,.reader-meta{font-size:var(--type-body);color:var(--primary)}.reader-copy,.reader-body{padding:18px}.reader-meta{display:flex;justify-content:space-between;gap:12px}.reader-copy h2{font-size:var(--type-title);line-height:1.15;margin:10px 0}.reader-lead{font-size:var(--type-section);line-height:1.45;color:var(--muted)}.news-reader article>img{width:100%;max-height:60vh;aspect-ratio:16/9;object-fit:contain;background:var(--raised)}.reader-body{max-width:850px;margin:auto}.reader-body p{font-size:var(--type-reading);line-height:1.65;margin:0 0 1.15em}.reader-body img{display:block;width:100%;height:auto;margin:24px 0;border-radius:12px;background:var(--raised);object-fit:contain}.news-reader footer{padding:0 18px 24px;color:var(--muted);font-size:var(--type-body)}.empty,.loading{min-height:170px;display:grid;place-items:center;color:var(--muted)}
  nav{height:76px;padding-bottom:env(safe-area-inset-bottom);position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;justify-content:center;background:var(--header);border-top:1px solid var(--border);box-shadow:0 -8px 22px oklch(0 0 0/.22)}nav button{width:120px;border:0;background:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:9px}nav button.active{color:var(--primary)}.toast{position:fixed;right:16px;bottom:88px;z-index:40;max-width:min(360px,calc(100vw - 32px));padding:10px 10px 10px 15px;border-radius:12px;background:oklch(.92 0 0);color:oklch(.16 0 0);font-size:11px;font-weight:700;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow-card)}.toast button{width:28px;height:28px;border:0;border-radius:8px;background:oklch(.82 0 0);color:inherit}.loading{min-height:100dvh;display:flex;flex-direction:column;justify-content:center;gap:8px}button:focus-visible,input:focus-visible{outline:3px solid var(--primary);outline-offset:2px}
  @media(max-width:760px){header{padding-inline:12px;grid-template-columns:1fr auto 46px}header time{display:none}.connection{font-size:0}.connection :global(svg){display:block}.now-playing{left:8px;right:8px;padding:7px 9px;grid-template-columns:54px minmax(0,1fr) auto;gap:8px}.poster{width:54px;height:46px}.track h1{font-size:14px}.track p,.timeline,.times,.track>span{display:none}.transport{gap:3px}.transport button{width:36px;height:36px}.transport .primary{width:40px;height:40px}.transport button:first-child,.transport button:nth-child(3){display:none}.media-tools{grid-template-columns:repeat(3,1fr)}.player-details{bottom:calc(144px + env(safe-area-inset-bottom))}.live-grid,.remote-grid,.news-grid,.home-facts{grid-template-columns:1fr}.tee-grid{grid-template-columns:repeat(3,1fr)}.radio-grid,.program-grid,.home-program-grid{grid-template-columns:repeat(2,1fr)}nav button{width:auto;flex:1}.controls{grid-template-columns:62px 1fr 62px}.rocker{height:170px}}
  @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
