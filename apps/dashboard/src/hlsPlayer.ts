import Hls from "hls.js";
import type { MediaTextTrack } from "../../../packages/protocol";

export type PlayerTracks = { subtitles: MediaTextTrack[]; audioTracks: string[] };

type Callbacks = {
  ready: () => void;
  error: () => void;
  tracks: (tracks: PlayerTracks) => void;
};

export class HlsPlayer {
  private hls?: Hls;
  private source = "";
  private recoveries = 0;

  constructor(private readonly media: HTMLMediaElement, private readonly callbacks: Callbacks) {}

  load(source: string, live: boolean) {
    if (source === this.source) return;
    this.destroySource();
    this.source = source;
    this.media.dataset.source = source;
    if (!source) {
      this.media.removeAttribute("src");
      this.media.load();
      return;
    }
    if (/\.m3u8(?:$|\?)/i.test(source) && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: live,
        backBufferLength: live ? 30 : 90,
        maxBufferLength: live ? 30 : 60
      });
      this.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.publishTracks();
        this.callbacks.ready();
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => this.publishTracks());
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => this.publishTracks());
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (this.recoveries++ >= 2) {
          this.callbacks.error();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else this.callbacks.error();
      });
      hls.loadSource(source);
      hls.attachMedia(this.media);
      return;
    }
    this.media.src = source;
    this.media.load();
  }

  selectSubtitle(label: string) {
    if (this.hls) {
      this.hls.subtitleTrack = label === "Slökkt" ? -1 : this.hls.subtitleTracks.findIndex(track => (track.name || track.lang) === label);
      return;
    }
    for (const track of Array.from(this.media.textTracks)) track.mode = track.label === label ? "showing" : "disabled";
  }

  selectAudio(label: string) {
    if (this.hls) {
      const index = this.hls.audioTracks.findIndex(track => (track.name || track.lang) === label);
      if (index >= 0) this.hls.audioTrack = index;
      return;
    }
    const tracks = (this.media as HTMLMediaElement & { audioTracks?: { length: number; [index: number]: { label: string; language?: string; enabled: boolean } } }).audioTracks;
    if (tracks) for (let index = 0; index < tracks.length; index++) tracks[index].enabled = (tracks[index].label || tracks[index].language) === label;
  }

  destroy() {
    this.destroySource();
    this.source = "";
  }

  private publishTracks() {
    const subtitles = this.hls?.subtitleTracks.map(track => ({
      label: track.name || track.lang || "Skjátextar",
      language: track.lang || "",
      src: this.absoluteUrl(track.url)
    })) ?? Array.from(this.media.textTracks).map(track => ({ label: track.label || track.language || "Skjátextar", language: track.language || "", src: "" }));
    const audioTracks = this.hls?.audioTracks.map(track => track.name || track.lang || "Aðalhljóð") ?? ["Aðalhljóð"];
    this.callbacks.tracks({
      subtitles: subtitles.filter((track, index, tracks) => tracks.findIndex(item => item.label === track.label) === index).slice(0, 16),
      audioTracks: [...new Set(audioTracks)].slice(0, 16)
    });
  }

  private absoluteUrl(value: string) {
    try { return new URL(value, this.source).href; }
    catch { return ""; }
  }

  private destroySource() {
    this.hls?.destroy();
    this.hls = undefined;
    this.recoveries = 0;
    this.media.pause();
    this.media.removeAttribute("src");
    this.media.load();
  }
}
