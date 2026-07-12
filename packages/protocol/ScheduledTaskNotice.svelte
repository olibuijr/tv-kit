<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { tvServerUrl } from ".";

  type Task = { running: boolean; phase: string; current: number; total: number; message: string };
  let task: Task | undefined;
  let timer: ReturnType<typeof setInterval>;

  async function refresh() {
    try {
      const response = await fetch(`${tvServerUrl()}/agent/tasks/deildu-import`);
      if (!response.ok) return;
      const payload = await response.json() as { task: Task; scrape: { running: boolean; completedPages: number; totalPages: number; message: string } };
      task = payload.task.running ? payload.task : payload.scrape.running ? { running: true, phase: "import", current: payload.scrape.completedPages, total: payload.scrape.totalPages, message: payload.scrape.message } : undefined;
    } catch { /* retry without replacing the last known state */ }
  }

  onMount(() => { void refresh(); timer = setInterval(refresh, 1000); });
  onDestroy(() => clearInterval(timer));
</script>

{#if task}
  <aside class="task-notice" in:fly={{ y: 120, duration: 280 }} out:fly={{ y: 120, duration: 280 }} aria-live="polite">
    <span>ÁÆTLAÐ VERK · KEYRIR</span>
    <strong>Skanna skrár og hreinsa heiti</strong>
    <p>{task.message}</p>
    {#if task.total}<div><i style={`width:${Math.min(100, task.current / task.total * 100)}%`}></i></div><small>{task.current} / {task.total}</small>{/if}
  </aside>
{/if}

<style>
  .task-notice{position:fixed;right:18px;bottom:112px;z-index:45;width:min(360px,calc(100vw - 36px));padding:15px;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow-card);color:var(--ink)}
  span{display:block;color:var(--primary);font-size:9px;font-weight:800}strong{display:block;margin-top:5px;font-size:14px}p{margin:5px 0;color:var(--muted);font-size:11px;line-height:1.4}div{height:6px;overflow:hidden;border-radius:6px;background:var(--raised)}i{display:block;height:100%;background:var(--primary);transition:width .3s ease}small{display:block;margin-top:5px;text-align:right;color:var(--muted)}
  @media(prefers-reduced-motion:reduce){i{transition:none}}
</style>
