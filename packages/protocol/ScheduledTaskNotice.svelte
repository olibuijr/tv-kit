<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { tvServerUrl } from ".";

  type Task = { title?: string; running: boolean; phase: string; current: number; total: number; message: string };
  let task: Task | undefined;
  let timer: ReturnType<typeof setInterval>;

  async function refresh() {
    try {
      const [deilduResponse, golfboxResponse, publicResponse] = await Promise.all([
        fetch(`${tvServerUrl()}/agent/tasks/deildu-import`),
        fetch(`${tvServerUrl()}/agent/tasks/golfbox-sync`),
        fetch(`${tvServerUrl()}/agent/tasks/public-torrent-import`),
      ]);
      if (!deilduResponse.ok || !golfboxResponse.ok || !publicResponse.ok) return;
      const deildu = await deilduResponse.json() as { task: Task; scrape: { running: boolean; completedPages: number; totalPages: number; message: string } };
      const golfbox = await golfboxResponse.json() as { task: Task };
      const publicTorrents = await publicResponse.json() as { task: Task; scrape: { running: boolean; inserted: number; updated: number; itemCount: number; message: string } };
      task = golfbox.task.running
        ? golfbox.task
        : deildu.task.running
          ? { ...deildu.task, title: "Skanna skrár og hreinsa heiti" }
          : deildu.scrape.running
            ? { title: "Flytja inn Deildu", running: true, phase: "import", current: deildu.scrape.completedPages, total: deildu.scrape.totalPages, message: deildu.scrape.message }
            : publicTorrents.scrape.running
              ? { title: "Sæki opinbera torrenta", running: true, phase: "scrape", current: publicTorrents.scrape.inserted, total: 0, message: publicTorrents.scrape.message }
              : publicTorrents.task.running
                ? { ...publicTorrents.task, title: "Hreinsa og auðga torrent-titla" }
                : undefined;
    } catch { /* retry without replacing the last known state */ }
  }

  onMount(() => { void refresh(); timer = setInterval(refresh, 1000); });
  onDestroy(() => clearInterval(timer));
</script>

{#if task}
  <aside class="task-notice" in:fly={{ y: 120, duration: 280 }} out:fly={{ y: 120, duration: 280 }} aria-live="polite">
    <span>ÁÆTLAÐ VERK · KEYRIR</span>
    <strong>{task.title ?? "Áætlað verk"}</strong>
    <p>{task.message}</p>
    {#if task.total}<div><i style={`width:${Math.min(100, task.current / task.total * 100)}%`}></i></div><small>{task.current} / {task.total}</small>{/if}
  </aside>
{/if}

<style>
  .task-notice{position:fixed;right:18px;bottom:112px;z-index:45;width:min(360px,calc(100vw - 36px));padding:15px;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow-card);color:var(--ink)}
  span{display:block;color:var(--primary);font-size:9px;font-weight:800}strong{display:block;margin-top:5px;font-size:14px}p{margin:5px 0;color:var(--muted);font-size:11px;line-height:1.4}div{height:6px;overflow:hidden;border-radius:6px;background:var(--raised)}i{display:block;height:100%;background:var(--primary);transition:width .3s ease}small{display:block;margin-top:5px;text-align:right;color:var(--muted)}
  @media(prefers-reduced-motion:reduce){i{transition:none}}
</style>
