<script lang="ts">
  import { onMount } from "svelte";
  import AudioLines from "lucide-svelte/icons/audio-lines";
  import Captions from "lucide-svelte/icons/captions";
  import Gauge from "lucide-svelte/icons/gauge";
  import Heart from "lucide-svelte/icons/heart";
  import LoaderCircle from "lucide-svelte/icons/loader-circle";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Radio from "lucide-svelte/icons/radio";
  import SkipBack from "lucide-svelte/icons/skip-back";
  import SkipForward from "lucide-svelte/icons/skip-forward";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import VolumeX from "lucide-svelte/icons/volume-x";
  import type { HomeState, PlayerTrackReport, RuvEpgEvent } from "../../../packages/protocol";
  import { interpolateMediaTime } from "../../../packages/protocol/content";
  import { attachAnalyser } from "./audioAnalysis";
  import { HlsPlayer } from "./hlsPlayer";

  export let state: HomeState;
  export let now: number;
  export let command: (action: string, value?: unknown, label?: string) => void;
  export let liveProgramme: RuvEpgEvent | null = null;

  const kindLabel: Record<string, string> = { radio: "Útvarp", tv: "Sjónvarp", music: "Tónlist", podcast: "Hlaðvarp", video: "Myndefni", movie: "Kvikmynd" };
  let mediaElement: HTMLMediaElement | undefined;
  let player: HlsPlayer | undefined;
  let localError = "";
  let lastProgress = 0;
  let trackSignature = "";
  let observedId = "";
  let observedCurrent = 0;
  let observedAt = now;
  $: media = state.media;
  $: displayTitle = liveProgramme?.title || media.title;
  $: displaySubtitle = liveProgramme?.category || (media.subtitle === displayTitle ? "" : media.subtitle) || (media.live ? "Bein útsending" : "");
  $: displaySource = [displayTitle, displaySubtitle].includes(media.source) ? "" : media.source;
  $: videoSource = ["video", "movie", "tv"].includes(media.kind) && Boolean(media.src);
  $: audioSource = ["radio", "music", "podcast"].includes(media.kind) && Boolean(media.src);
  $: if (media.id !== observedId || media.currentTime !== observedCurrent) {
    observedId = media.id;
    observedCurrent = media.currentTime;
    observedAt = now;
  }
  $: displayTime = interpolateMediaTime(media, state.playing, observedAt, now);
  $: progress = media.live || !media.duration ? 100 : Math.min(100, displayTime / media.duration * 100);
  $: if (mediaElement && media.src) syncPlayback();

  function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
    return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
  }

  function ensurePlayer() {
    if (!mediaElement || player) return;
    player = new HlsPlayer(mediaElement, {
      ready,
      error: failed,
      tracks: tracks => {
        const report: PlayerTrackReport = { source: media.src, ...tracks };
        const signature = JSON.stringify(report);
        if (signature === trackSignature) return;
        trackSignature = signature;
        command("player-tracks", report);
      }
    });
  }

  function syncPlayback() {
    if (!mediaElement) return;
    ensurePlayer();
    player?.load(media.src, media.live);
    mediaElement.volume = state.volume / 100;
    mediaElement.muted = state.muted;
    mediaElement.playbackRate = media.playbackRate;
    if (!media.live && mediaElement.readyState && Math.abs(mediaElement.currentTime - media.currentTime) > 3) mediaElement.currentTime = media.currentTime;
    player?.selectSubtitle(media.subtitleTrack);
    player?.selectAudio(media.audioTrack);
    if (state.playing && mediaElement.paused) void mediaElement.play().catch(() => localError = "Spilun var stöðvuð af vafranum. Ýttu aftur á spila í fjarstýringunni.");
    if (!state.playing && !mediaElement.paused) mediaElement.pause();
    updateMediaSession();
  }

  function updateMediaSession() {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: displayTitle, artist: displaySubtitle, album: displaySource, artwork: media.artwork ? [{ src: media.artwork }] : [] });
    navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
  }

  function ready() {
    localError = "";
    if (mediaElement) try { attachAnalyser(mediaElement); } catch { /* optional */ }
    command("player-status", "ready");
  }

  function failed() {
    localError = "Straumurinn er ekki tiltækur. Veldu annað efni í fjarstýringunni.";
    command("player-status", "error");
  }

  function timeUpdate() {
    if (!mediaElement || media.live || Date.now() - lastProgress < 3_000) return;
    lastProgress = Date.now();
    command("media-progress", mediaElement.currentTime);
  }

  onMount(() => {
    if (!("mediaSession" in navigator)) return () => player?.destroy();
    navigator.mediaSession.setActionHandler("play", () => command("toggle-play"));
    navigator.mediaSession.setActionHandler("pause", () => command("toggle-play"));
    navigator.mediaSession.setActionHandler("previoustrack", () => command("media-previous"));
    navigator.mediaSession.setActionHandler("nexttrack", () => command("media-next"));
    return () => {
      player?.destroy();
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  });
</script>

<section class:fullscreen={media.fullscreen} class:has-video={videoSource} class="global-player" aria-label="Alþjóðlegur spilari">
  <div class:audio-art={!videoSource} class="player-visual">
    {#if videoSource}
      <video bind:this={mediaElement} poster={media.artwork || undefined} playsinline crossorigin="anonymous" on:canplay={ready} on:error={failed} on:timeupdate={timeUpdate} on:ended={() => command("media-next")}></video>
    {:else if audioSource}
      <audio bind:this={mediaElement} crossorigin="anonymous" on:canplay={ready} on:error={failed} on:timeupdate={timeUpdate} on:ended={() => command("media-next")}></audio>
      {#if media.artwork}<img src={media.artwork} alt="" />{:else}<Radio size={32}/>{/if}
    {:else}
      {#if media.artwork}<img src={media.artwork} alt="" />{:else}<Play size={30}/>{/if}
    {/if}
    {#if media.status === "loading"}<LoaderCircle class="loading" size={24}/>{/if}
  </div>

  <div class="player-copy" aria-live="polite">
    <span>{kindLabel[media.kind] ?? media.kind}{media.live ? " · Í BEINNI" : ""}</span>
    <strong>{displayTitle}</strong>
    <small>{displaySubtitle}{#if displaySource}<b>&nbsp;· {displaySource}</b>{/if}</small>
    <div class="timeline"><time>{media.live ? "Í beinni" : formatTime(displayTime)}</time><i><b style={`width:${progress}%`}></b></i><time>{media.live ? "Í loftinu" : formatTime(media.duration)}</time></div>
  </div>

  <div class="transport" aria-hidden="true">
    <span><SkipBack size={20}/></span>
    <span class="play">{#if state.playing}<Pause size={24} fill="currentColor"/>{:else}<Play size={24} fill="currentColor"/>{/if}</span>
    <span><SkipForward size={20}/></span>
  </div>

  <div class="player-tools" aria-hidden="true">
    <span>{#if state.muted}<VolumeX size={19}/>{:else}<Volume2 size={19}/>{/if}<b>{state.volume}%</b></span>
    <span class:active={media.panel === "epg"}><Radio size={19}/><b>Dagskrá</b></span>
    {#if media.subtitles.length > 1}<span class:active={media.panel === "subtitles"}><Captions size={20}/><b>{media.subtitleTrack}</b></span>{/if}
    <span class:active={media.panel === "audio"}><AudioLines size={20}/><b>{media.audioTrack}</b></span>
    {#if !media.live}<span><Gauge size={20}/><b>{media.playbackRate}x</b></span>{/if}
    <span class:active={media.favorite}><Heart size={20} fill={media.favorite ? "currentColor" : "none"}/></span>
  </div>

  {#if media.panel}
    <section class="player-panel">
      <header><strong>{media.panel === "epg" ? "Dagskrá" : media.panel === "subtitles" ? "Skjátextar" : media.panel === "audio" ? "Hljóðrás" : "Næst"}</strong></header>
      {#if media.panel === "epg"}
        {#if media.epg.length}{#each media.epg as item}<article class:current={item.current}><time>{item.start}</time><div><strong>{item.title}</strong><span>{item.detail}</span></div></article>{/each}{:else}<p>Engin dagskrá tiltæk.</p>{/if}
      {:else if media.panel === "subtitles"}
        {#each media.subtitles as track}<div class:selected={track === media.subtitleTrack} class="option"><Captions size={18}/><span>{track}</span></div>{/each}
      {:else if media.panel === "audio"}
        {#each media.audioTracks as track}<div class:selected={track === media.audioTrack} class="option"><AudioLines size={18}/><span>{track}</span></div>{/each}
      {:else}<p>Næsta atriði fylgir valinni veitu.</p>{/if}
    </section>
  {/if}
  {#if localError}<div class="player-error" role="alert">{localError}</div>{/if}
</section>

<style>
  .global-player{height:96px;flex:0 0 96px;padding:11px 42px;position:sticky;bottom:0;z-index:20;display:grid;grid-template-columns:74px minmax(240px,1fr) auto minmax(380px,auto);align-items:center;gap:16px;border-top:1px solid var(--border);background:var(--surface);box-shadow:0 -8px 22px oklch(0 0 0/.22)}
  .global-player.has-video{grid-template-columns:117px minmax(240px,1fr) auto minmax(380px,auto)}
  .player-visual{width:72px;height:72px;position:relative;overflow:hidden;border:1px solid var(--hero-border);border-radius:10px;background:var(--raised);display:grid;place-items:center}.has-video .player-visual{width:115px;aspect-ratio:16/10;height:auto}.player-visual video,.player-visual img{width:100%;height:100%;object-fit:cover}.player-visual.audio-art img{object-fit:contain;padding:5px}.loading{position:absolute;animation:spin .8s linear infinite;color:white}
  .player-copy{min-width:0;display:grid;grid-template-columns:1fr auto}.player-copy>span{font-size:10px;color:var(--primary);font-weight:750}.player-copy>strong{grid-column:1/3;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:2px 0}.player-copy>small{grid-column:1/3;color:var(--muted);font-size:10px}.player-copy>small b{font-weight:500}.timeline{grid-column:1/3;margin-top:8px;display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;font-size:9px;color:var(--muted)}.timeline i{height:3px;background:var(--border);border-radius:99px;overflow:hidden}.timeline i b{display:block;height:100%;background:var(--primary)}
  .transport,.player-tools{display:flex;align-items:center;gap:7px}.transport span,.player-tools>span{height:43px;min-width:43px;padding:0 9px;border:1px solid var(--border);border-radius:9px;background:var(--raised);display:flex;align-items:center;justify-content:center;gap:5px;color:var(--muted);font-size:9px}.transport .play{width:50px;height:50px;border-radius:50%;background:var(--primary);color:white}.player-tools{justify-content:flex-end}.player-tools span.active{border-color:var(--primary);color:var(--primary)}
  .player-panel{position:absolute;right:42px;bottom:calc(100% + 9px);width:410px;max-height:420px;overflow:auto;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow-card)}.player-panel header{height:48px;padding:0 14px;display:flex;align-items:center;border-bottom:1px solid var(--border)}.player-panel article{min-height:62px;padding:10px 14px;display:grid;grid-template-columns:52px 1fr;align-items:center;gap:10px;border-bottom:1px solid var(--border)}.player-panel article.current,.player-panel .selected{background:var(--raised)}.player-panel article time{font-size:10px;color:var(--primary)}.player-panel article div{display:flex;flex-direction:column}.player-panel article strong{font-size:12px}.player-panel article span,.player-panel p{font-size:10px;color:var(--muted)}.option{height:50px;padding:0 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)}.player-error{position:absolute;left:128px;bottom:8px;padding:6px 10px;border-radius:7px;background:var(--occasion);color:white;font-size:10px}
  .global-player.fullscreen{position:fixed;inset:0;width:auto;height:100dvh;padding:36px 42px;z-index:50;grid-template-columns:minmax(340px,1fr) auto minmax(430px,auto);align-content:end;background:transparent}.global-player.fullscreen::after{content:'';position:absolute;inset:auto 0 0 0;height:160px;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,.18) 55%,transparent);backdrop-filter:blur(28px) saturate(200%);-webkit-backdrop-filter:blur(28px) saturate(200%);pointer-events:none}.fullscreen .player-visual{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:0;z-index:-1}.fullscreen .player-visual video{object-fit:contain}.fullscreen .player-copy,.fullscreen .transport,.fullscreen .player-tools{position:relative;z-index:1}.fullscreen .player-copy>strong{font-size:31px;text-shadow:0 1px 4px rgba(0,0,0,.5)}.fullscreen .player-panel{bottom:120px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:1200px){.global-player{padding-inline:20px;grid-template-columns:64px minmax(180px,1fr) auto}.global-player.has-video{grid-template-columns:101px minmax(180px,1fr) auto}.player-tools{display:none}.player-visual{width:62px;height:62px}.has-video .player-visual{width:99px;aspect-ratio:16/10;height:auto}}
  @media(prefers-reduced-motion:reduce){.loading{animation:none}}
</style>
