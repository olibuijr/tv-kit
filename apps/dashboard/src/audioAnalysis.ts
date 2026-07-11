let context: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

/** Route a media element through a shared AnalyserNode (audio keeps flowing to the speakers). */
export function attachAnalyser(element: HTMLMediaElement) {
  context ??= new AudioContext({ latencyHint: "interactive" });
  if (!analyser) {
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    analyser.connect(context.destination);
  }
  if (!sources.has(element)) {
    const source = context.createMediaElementSource(element);
    sources.set(element, source);
    source.connect(analyser);
  }
  if (context.state === "suspended") void context.resume();
  return analyser;
}

/** The live analyser, if any media element has been attached yet. */
export function currentAnalyser() {
  return analyser;
}
