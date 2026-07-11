<script lang="ts">
  import { onMount } from "svelte";
  import { crossfade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";
  import Heart from "lucide-svelte/icons/heart";
  import Radio from "lucide-svelte/icons/radio";
  import RadioTower from "lucide-svelte/icons/radio-tower";
  import Signal from "lucide-svelte/icons/signal";
  import type { HomeState, Station } from "../../../packages/protocol";
  import { currentAnalyser } from "./audioAnalysis";

  export let state: HomeState;
  export let stations: Station[];

  let barHost: HTMLDivElement | undefined;

  const [send, receive] = crossfade({ duration: 420, easing: quintOut, fallback: node => ({ duration: 220, css: t => `opacity:${t};transform:scale(${0.94 + t * 0.06})` }) });
  $: favouriteIds = new Set(state.radioFavorites ?? []);
  $: favourites = stations.filter(station => favouriteIds.has(station.id));
  $: others = stations.filter(station => !favouriteIds.has(station.id));

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const spectrum = new Uint8Array(128);
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const bars = barHost?.children;
      if (!bars?.length) return;
      const analyser = currentAnalyser();
      if (analyser && state.playing && state.media.kind === "radio") {
        analyser.getByteFrequencyData(spectrum);
        const usable = spectrum.length / 2; // musical range; top bins are mostly empty for radio
        for (let index = 0; index < bars.length; index++) {
          const start = Math.floor(index * usable / bars.length);
          const end = Math.max(start + 1, Math.floor((index + 1) * usable / bars.length));
          let peak = 0;
          for (let bin = start; bin < end; bin++) if (spectrum[bin] > peak) peak = spectrum[bin];
          const level = Math.min(1, Math.pow(peak / 255, 0.55) * 1.35);
          (bars[index] as HTMLElement).style.transform = `scaleY(${(0.04 + level * 0.96).toFixed(3)})`;
        }
      } else {
        for (const bar of bars) (bar as HTMLElement).style.transform = "scaleY(0.06)";
      }
    };
    render();
    return () => cancelAnimationFrame(frame);
  });

  $: activeId = state.media.kind === "radio" ? Number(state.media.id.replace("radio-", "")) : stations[0]?.id;
  $: active = stations.find(station => station.id === activeId) ?? stations[0];
  $: guide = state.media.kind === "radio" ? state.media.epg : [];
  const frequency = (station?: Station) => station ? station.terrestrial ? `${station.frequency.toFixed(1)} FM` : "Á netinu" : "Ekkert merki";
</script>

<main class="radio-page">
  {#if active}
    <section class="radio-stage">
      <div class="station-art"><img src={active.logoUrl} alt={`${active.name} logo`} />{#if state.media.kind === "radio"}<div bind:this={barHost} class="air-bars" aria-hidden="true">{#each Array(18) as _}<i></i>{/each}</div>{/if}</div>
      <div class="station-copy">
        <span><Signal size={16}/> {state.media.kind === "radio" ? "Í spilun" : "Tilbúið að stilla"}</span>
        <h2>{active.name}</h2>
        <p>{frequency(active)} <b>{active.terrestrial ? "FM og á netinu" : "Netstöð"}</b></p>
        <div class="broadcast-state"><RadioTower size={22}/><div><strong>{state.media.kind === "radio" ? state.media.epg[0]?.title ?? "Bein útsending" : "Veldu þessa stöð í spjaldtölvunni"}</strong><span>{state.media.kind === "radio" ? state.media.epg[0]?.detail : "Sjónvarpinu er stjórnað úr fjarstýringunni"}</span></div></div>
      </div>
      <div class="radio-epg">
        <header><Radio size={19}/><strong>Dagskrá</strong><span>Núna og næst</span></header>
        {#if guide.length}
          {#each guide as item}<article class:current={item.current}><time>{item.start}</time><div><strong>{item.title}</strong><span>{item.detail}</span></div>{#if item.current}<b>Í beinni</b>{/if}</article>{/each}
        {:else}
          <div class="empty-guide"><strong>Engin stöð valin</strong><span>Veldu stöð í fjarstýringunni.</span></div>
        {/if}
      </div>
    </section>
  {/if}

  <section class="station-catalog" aria-label="Útvarpsstöðvar">
    {#if favourites.length}
      <header><div><Heart size={19}/><h2>Uppáhaldsstöðvar</h2></div><span>{favourites.length}</span></header>
      <div class="station-grid">
        {#each favourites as station (station.id)}
          <article class:active={station.id === activeId} in:receive={{ key: station.id }} out:send={{ key: station.id }} animate:flip={{ duration: 420, easing: quintOut }}>
            <img src={station.logoUrl} alt="" />
            <div><strong>{station.name}</strong><span>{frequency(station)}</span></div>
            {#if station.id === activeId}<b>{state.playing && state.media.kind === "radio" ? "Í loftinu" : "Valin"}</b>{:else}<b class="fav-mark">♥</b>{/if}
          </article>
        {/each}
      </div>
    {/if}
    <header><div><Radio size={19}/><h2>Allar stöðvar</h2></div><span class="credit">Stöðvaskrá frá Spilarinn.is</span></header>
    {#if stations.length}
      <div class="station-grid">
        {#each others as station (station.id)}
          <article class:active={station.id === activeId} in:receive={{ key: station.id }} out:send={{ key: station.id }} animate:flip={{ duration: 420, easing: quintOut }}>
            <img src={station.logoUrl} alt="" />
            <div><strong>{station.name}</strong><span>{frequency(station)}</span></div>
            {#if station.id === activeId}<b>{state.playing && state.media.kind === "radio" ? "Í loftinu" : "Valin"}</b>{/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="catalog-empty"><RadioTower size={30}/><strong>Verið að uppfæra stöðvaskrána</strong><span>Dagleg staðfesting hefur ekki birt stöðvalista ennþá.</span></div>
    {/if}
  </section>
</main>

<style>
  .radio-page{flex:1;min-height:0;padding:18px 42px 16px;display:flex;flex-direction:column;gap:14px;overflow:hidden}.station-catalog>header .credit{font-size:10px;color:var(--muted);margin-left:auto}.radio-stage,.station-catalog{box-shadow:var(--shadow-card)}
  .radio-stage{height:250px;display:grid;grid-template-columns:250px 1fr 430px;overflow:hidden;border:1px solid var(--hero-border);border-radius:14px;background:var(--surface)}.station-art{position:relative;display:grid;place-items:center;overflow:hidden;background:var(--hero-tone)}.station-art img{width:82%;height:82%;object-fit:contain}.station-art::after{content:"";position:absolute;inset:auto 0 0;height:44%;background:linear-gradient(transparent,var(--hero-tone))}.air-bars{position:absolute;z-index:1;left:18px;right:18px;bottom:16px;height:42px;display:flex;align-items:end;gap:4px}.air-bars i{flex:1;height:100%;transform:scaleY(.06);transform-origin:bottom;background:var(--primary);border-radius:2px 2px 0 0;will-change:transform}
  .station-copy{padding:25px 30px;display:flex;flex-direction:column;justify-content:center}.station-copy>span{display:flex;align-items:center;gap:7px;color:var(--primary);font-size:11px;font-weight:700}.station-copy h2{font-size:36px;line-height:1;letter-spacing:-.035em;margin:9px 0 7px}.station-copy>p{font-size:12px;color:var(--muted);margin:0}.station-copy>p b{font-weight:450;margin-left:10px}.broadcast-state{display:flex;align-items:center;gap:11px;margin-top:20px}.broadcast-state>svg{color:var(--info-accent)}.broadcast-state div{display:flex;flex-direction:column}.broadcast-state strong{font-size:13px}.broadcast-state span{font-size:10px;color:var(--muted);margin-top:3px}
  .radio-epg{border-left:1px solid var(--border)}.radio-epg header,.station-catalog>header{height:52px;padding:0 16px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--border)}.radio-epg header svg,.station-catalog header svg{color:var(--primary)}.radio-epg header strong,.station-catalog h2{font-size:14px;margin:0}.radio-epg header span{font-size:10px;color:var(--muted);margin-left:auto}.radio-epg article{height:72px;padding:0 16px;display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:10px;border-bottom:1px solid var(--border)}.radio-epg article.current{background:var(--raised)}.radio-epg time,.radio-epg article>b{font-size:10px;color:var(--primary)}.radio-epg article div{display:flex;flex-direction:column}.radio-epg article strong{font-size:12px}.radio-epg article span{font-size:10px;color:var(--muted);margin-top:3px}.empty-guide,.catalog-empty{height:calc(100% - 52px);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--muted)}.empty-guide strong,.catalog-empty strong{font-size:13px;color:var(--ink)}.empty-guide span,.catalog-empty span{font-size:10px;margin-top:5px}
  .station-catalog{flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.station-catalog>header{flex:0 0 52px}.station-catalog>header>div{display:flex;align-items:center;gap:9px}.station-grid{padding:10px;display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:60px;gap:7px}.fav-mark{color:var(--primary)}.station-grid article{min-width:0;padding:7px 9px;display:grid;grid-template-columns:45px 1fr;align-items:center;gap:8px;position:relative;border:1px solid var(--border);border-radius:10px;background:var(--raised);transition:transform .2s cubic-bezier(.16,1,.3,1),border-color .2s ease-out,background-color .2s ease-out;box-shadow:var(--shadow-soft)}.station-grid article.active{border-color:var(--primary);background:color-mix(in oklch,var(--primary),var(--raised) 84%);transform:translateY(-2px)}.station-grid img{width:43px;height:43px;aspect-ratio:1/1;object-fit:contain;border-radius:7px;background:color-mix(in oklch,var(--surface),transparent 14%)}.station-grid article>div{display:flex;min-width:0;flex-direction:column}.station-grid strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.station-grid span{font-size:9px;color:var(--muted);margin-top:3px}.station-grid article>b{position:absolute;right:7px;top:6px;font-size:8px;color:var(--primary)}.catalog-empty svg{color:var(--primary);margin-bottom:12px}
  @media(max-width:1200px){.radio-page{padding-inline:20px}.radio-stage{grid-template-columns:190px 1fr}.radio-epg{display:none}.station-grid{grid-template-columns:repeat(5,1fr);grid-template-rows:auto;overflow:auto}}
  @media(prefers-reduced-motion:reduce){.air-bars i{transform:scaleY(.3)}.station-grid article{transition:none}}
</style>
