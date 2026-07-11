import type { Station } from "../../../packages/protocol";
import {
  db,
  finishRadioSync,
  listRadioStations,
  radioCatalogCheckedAt,
  replaceRadioStations,
  startRadioSync
} from "./db";
import { config } from "./config";

type SourceStation = {
  id: number;
  name: string;
  frequency: number;
  radio: boolean;
  stream_url: string;
  logos: { type: string; url: string }[];
};

function normalize(station: SourceStation): Station {
  const logo = station.logos.find(item => item.type === "atv") ?? station.logos.at(-1);
  const sourceOrigin = new URL(config.radioSourceUrl).origin;
  return {
    id: Number(station.id),
    name: station.name,
    frequency: Number(station.frequency),
    terrestrial: Boolean(station.radio),
    streamUrl: station.stream_url.replace("http://ice-11.spilarinn.is/", "https://ice-11.spilarinn.is/"),
    logoUrl: `${sourceOrigin}${logo?.url ?? ""}`
  };
}

async function returns200(station: Station) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.radioStreamTimeoutMs);
  try {
    const response = await fetch(station.streamUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "Icy-MetaData": "0", "User-Agent": "tvserverd-radioscraper/1.0" }
    });
    const healthy = response.status === 200;
    await response.body?.cancel();
    return healthy;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function validate(stations: Station[]) {
  const healthy: Station[] = [];
  for (let index = 0; index < stations.length; index += config.radioScrapeConcurrency) {
    const batch = stations.slice(index, index + config.radioScrapeConcurrency);
    const results = await Promise.all(batch.map(async station => ({ station, healthy: await returns200(station) })));
    healthy.push(...results.filter(result => result.healthy).map(result => result.station));
  }
  return healthy;
}

export async function scrapeRadioStations() {
  const runId = startRadioSync();
  const existing = listRadioStations();
  try {
    const response = await fetch(config.radioSourceUrl, { headers: { "User-Agent": "tvserverd-radioscraper/1.0" } });
    if (response.status !== 200) throw new Error(`Station catalog returned HTTP ${response.status}`);
    const payload = await response.json() as { objects: SourceStation[] };
    const source = payload.objects.filter(station => !station.name.startsWith("temp")).map(normalize);
    const healthy = await validate(source);
    if (source.length && !healthy.length) throw new Error("All station checks failed; preserving the previous catalog");

    const previousIds = new Set(existing.map(station => station.id));
    const healthyIds = new Set(healthy.map(station => station.id));
    const added = healthy.filter(station => !previousIds.has(station.id)).length;
    const removed = existing.filter(station => !healthyIds.has(station.id)).length;
    const checkedAt = Date.now();
    replaceRadioStations(healthy, checkedAt, config.radioSourceName);
    finishRadioSync(runId, { source: source.length, healthy: healthy.length, added, removed });
    return { source: source.length, healthy: healthy.length, added, removed, checkedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishRadioSync(runId, { source: 0, healthy: existing.length, added: 0, removed: 0, error: message });
    throw error;
  }
}

export async function scrapeRadioStationsIfDue(maxAge = config.radioSyncIntervalMs) {
  const checkedAt = radioCatalogCheckedAt();
  if (checkedAt && Date.now() - checkedAt < maxAge) {
    return { skipped: true, healthy: listRadioStations().length, checkedAt };
  }
  return scrapeRadioStations();
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await scrapeRadioStations()));
    db.close();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    db.close();
    process.exit(1);
  }
}
