import { tvServerUrl } from "./index";

export type SolarTheme = {
  location: string;
  source: string;
  from: "morning" | "day" | "evening" | "night";
  to: "morning" | "day" | "evening" | "night";
  progress: number;
  sunrise: number;
  sunset: number;
  solarNoon: number;
  dayLength: number;
  solarNoonAltitude: number;
  moonPhase: string;
  moonIllumination: number;
  nextTheme: "morning" | "day" | "evening" | "night";
  nextChangeAt: number;
};

const palettes = {
  morning: { bg: "oklch(.88 .018 55)", header: "oklch(.94 .014 55)", surface: "oklch(.98 .008 55)", raised: "oklch(.91 .016 55)", border: "oklch(.76 .02 55)", ink: "oklch(.18 .012 55)", muted: "oklch(.38 .018 55)", primary: "oklch(.58 .17 36)", info: "oklch(.38 .105 220)", occasion: "oklch(.43 .14 36)", presence: "oklch(.33 .075 155)", "info-accent": "oklch(.40 .14 220)", "presence-accent": "oklch(.36 .12 155)", hero: "oklch(.15 .025 48)", "hero-border": "oklch(.68 .035 55)" },
  day: { bg: "oklch(.94 .012 240)", header: "oklch(.99 .005 240)", surface: "oklch(1 0 0)", raised: "oklch(.90 .016 240)", border: "oklch(.76 .02 240)", ink: "oklch(.16 .012 240)", muted: "oklch(.36 .018 240)", primary: "oklch(.56 .18 36)", info: "oklch(.36 .11 225)", occasion: "oklch(.41 .15 32)", presence: "oklch(.31 .08 155)", "info-accent": "oklch(.38 .15 225)", "presence-accent": "oklch(.34 .13 155)", hero: "oklch(.13 .02 240)", "hero-border": "oklch(.72 .028 240)" },
  evening: { bg: "oklch(.16 .012 36)", header: "oklch(.19 .015 36)", surface: "oklch(.22 .015 36)", raised: "oklch(.26 .018 36)", border: "oklch(.34 .02 36)", ink: "oklch(.96 0 0)", muted: "oklch(.70 .01 36)", primary: "oklch(.68 .133 36)", info: "oklch(.28 .075 220)", occasion: "oklch(.39 .12 36)", presence: "oklch(.24 .055 155)", "info-accent": "oklch(.72 .105 220)", "presence-accent": "oklch(.72 .10 155)", hero: "oklch(.075 .014 36)", "hero-border": "oklch(.34 .025 36)" },
  night: { bg: "oklch(.075 0 0)", header: "oklch(.095 0 0)", surface: "oklch(.12 .004 36)", raised: "oklch(.15 .005 36)", border: "oklch(.23 .006 36)", ink: "oklch(.90 0 0)", muted: "oklch(.62 0 0)", primary: "oklch(.58 .12 36)", info: "oklch(.18 .045 220)", occasion: "oklch(.27 .07 36)", presence: "oklch(.16 .035 155)", "info-accent": "oklch(.62 .08 220)", "presence-accent": "oklch(.62 .07 155)", hero: "oklch(.035 .004 36)", "hero-border": "oklch(.22 .012 36)" }
} as const;
const backgroundLightness = { morning: .88, day: .94, evening: .16, night: .075 } as const;

export function startSolarTheme(onUpdate?: (theme: SolarTheme) => void) {
  let stopped = false;
  const update = async () => {
    try {
      let theme: SolarTheme = await fetch(`${tvServerUrl()}/solar`).then(response => response.json());
      if (stopped) return;
      const preview = new URLSearchParams(location.search).get("theme") as keyof typeof palettes | null;
      if (preview && preview in palettes) theme = { ...theme, from: preview, to: preview, progress: 0 };
      const root = document.documentElement;
      const from = palettes[theme.from];
      const to = palettes[theme.to];
      const sameContrastMode = (backgroundLightness[theme.from] > .55) === (backgroundLightness[theme.to] > .55);
      const blendedLightness = backgroundLightness[theme.from] + (backgroundLightness[theme.to] - backgroundLightness[theme.from]) * theme.progress;
      const safeText = blendedLightness > .55
        ? { ink: "oklch(.16 .012 240)", muted: "oklch(.36 .018 240)" }
        : { ink: "oklch(.96 0 0)", muted: "oklch(.70 .01 36)" };
      for (const role of Object.keys(from) as (keyof typeof from)[]) {
        if (!sameContrastMode && (role === "ink" || role === "muted")) {
          root.style.setProperty(`--solar-${role}-from`, safeText[role]);
          root.style.setProperty(`--solar-${role}-to`, safeText[role]);
        } else {
          root.style.setProperty(`--solar-${role}-from`, from[role]);
          root.style.setProperty(`--solar-${role}-to`, to[role]);
        }
      }
      root.style.setProperty("--solar-progress", `${Math.round(theme.progress * 1000) / 10}%`);
      root.dataset.solarTheme = theme.from === theme.to ? theme.from : `${theme.from}-to-${theme.to}`;
      onUpdate?.(theme);
    } catch {
      // Keep the last successful palette when the local service is unavailable.
    }
  };
  void update();
  const timer = window.setInterval(update, 60_000);
  return () => { stopped = true; window.clearInterval(timer); };
}
