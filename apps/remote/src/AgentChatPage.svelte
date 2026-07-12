<script lang="ts">
  import { onMount } from "svelte";
  import Bot from "lucide-svelte/icons/bot";
  import CalendarClock from "lucide-svelte/icons/calendar-clock";
  import Code2 from "lucide-svelte/icons/code-2";
  import MessageSquare from "lucide-svelte/icons/message-square";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import Plus from "lucide-svelte/icons/plus";
  import Send from "lucide-svelte/icons/send";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import X from "lucide-svelte/icons/x";
  import { tvServerUrl } from "../../../packages/protocol";

  type AgentReplyType = "text" | "status" | "action" | "list" | "error";
  type AgentReply = { type: AgentReplyType; title: string; text: string; data?: Record<string, unknown> };
  type ChatMessage = { id?: number; role: "user" | "assistant"; content?: string; reply?: AgentReply; tools?: string[] };
  type Schedule = { id: number; name: string; kind: "prompt" | "script"; task: string; timing: "manual" | "once" | "interval"; when: string; active: boolean; lastRun?: string };

  let messages: ChatMessage[] = [];
  let schedules: Schedule[] = [];
  let page: "chat" | "schedules" = "chat";
  let draft = "";
  let loading = false;
  let error = "";
  let modal = false;
  let scheduleName = "";
  let scheduleKind: Schedule["kind"] = "prompt";
  let scheduleTask = "";
  let scheduleTiming: Schedule["timing"] = "interval";
  let scheduleWhen = "30 mínútna fresti";

  function listItems(reply: AgentReply) {
    const items = reply.data?.items;
    if (!Array.isArray(items)) return [];
    return items.map(item => typeof item === "string" ? item : item && typeof item === "object" ? String((item as Record<string, unknown>).title ?? (item as Record<string, unknown>).name ?? "") : String(item)).filter(Boolean);
  }

  async function loadMessages() {
    try {
      const response = await fetch(`${tvServerUrl()}/agent/chat`);
      if (!response.ok) throw new Error("Ekki náðist í spjallið");
      const payload = await response.json() as { messages?: ChatMessage[] };
      messages = payload.messages ?? [];
    } catch (reason) { error = reason instanceof Error ? reason.message : "Ekki náðist í spjallið"; }
  }

  async function sendMessage() {
    const message = draft.trim();
    if (!message || loading) return;
    draft = ""; loading = true; error = "";
    try {
      const response = await fetch(`${tvServerUrl()}/agent/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: AgentReply; tools?: string[]; messages?: ChatMessage[] };
      if (!response.ok) throw new Error(payload.error || "Spjallið svaraði ekki");
      const next = payload.messages ?? [...messages, { role: "user" as const, content: message }, { role: "assistant" as const, reply: payload.message }];
      const last = next[next.length - 1];
      if (payload.tools?.length && last?.role === "assistant") next[next.length - 1] = { ...last, tools: payload.tools };
      messages = next;
    } catch (reason) { error = reason instanceof Error ? reason.message : "Spjallið svaraði ekki"; draft = message; }
    finally { loading = false; }
  }

  function saveSchedule() {
    if (!scheduleName.trim() || !scheduleTask.trim()) return;
    schedules = [...schedules, { id: Date.now(), name: scheduleName.trim(), kind: scheduleKind, task: scheduleTask.trim(), timing: scheduleTiming, when: scheduleTiming === "manual" ? "Handvirkt" : scheduleWhen.trim(), active: true }];
    modal = false; scheduleName = ""; scheduleTask = "";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  }

  onMount(() => { void loadMessages(); });
</script>

<section class="agent-chat panel">
  <div class="chat-heading">
    <div class="heading-icon">{#if page === "chat"}<Bot size={22}/>{:else}<CalendarClock size={22}/>{/if}</div>
    <div><h2>{page === "chat" ? "TV Kit spjall" : "Áætlanir"}</h2><p>{page === "chat" ? "Staðbundinn aðstoðarmaður á Titan" : "Sjálfvirk verk og handvirkar keyrslur"}</p></div>
    {#if page === "chat"}<Sparkles size={18}/>{:else}<button class="icon-button" on:click={() => modal = true} aria-label="Ný áætlun"><Plus size={19}/></button>{/if}
  </div>

  <nav class="view-tabs" aria-label="Spjall og áætlanir">
    <button class:active={page === "chat"} on:click={() => page = "chat"}><MessageSquare size={15}/> Spjall</button>
    <button class:active={page === "schedules"} on:click={() => page = "schedules"}><CalendarClock size={15}/> Áætlanir <span>{schedules.length}</span></button>
  </nav>

  {#if page === "chat"}
    <div class="chat-log" aria-live="polite">
      {#if !messages.length && !loading}<div class="welcome"><Bot size={30}/><strong>Hvað má ég gera?</strong><span>Spurðu um dagskrá eða biddu mig að stilla rás, spilun eða hljóðstyrk.</span></div>{/if}
      {#each messages as message (message.id ?? `${message.role}-${message.content}`)}
        <article class:from-user={message.role === "user"} class="message">
          <span class="message-role">{message.role === "user" ? "Þú" : "TV Kit"}</span>
          {#if message.role === "user"}<p>{message.content}</p>
          {:else if message.reply}<div class={`reply reply-${message.reply.type}`}><div class="reply-title"><strong>{message.reply.title}</strong><small>{message.reply.type}</small></div><p>{message.reply.text}</p>{#if message.reply.type === "list" && listItems(message.reply).length}<ul>{#each listItems(message.reply) as item}<li>{item}</li>{/each}</ul>{/if}</div>
          {:else}<p>{message.content}</p>{/if}
          {#if message.tools?.length}<small>Verkfæri: {message.tools.join(" · ")}</small>{/if}
        </article>
      {/each}
      {#if loading}<div class="typing" aria-label="TV Kit er að hugsa"><i></i><i></i><i></i></div>{/if}
    </div>
    {#if error}<div class="chat-error" role="alert">{error}</div>{/if}
    <form class="composer" on:submit|preventDefault={sendMessage}><textarea bind:value={draft} on:keydown={handleKeydown} rows="2" maxlength="2000" placeholder="Spyrðu TV Kit…" aria-label="Skilaboð"></textarea><button class="send" type="submit" disabled={!draft.trim() || loading} aria-label="Senda skilaboð"><Send size={19}/></button></form>
  {:else}
    <div class="schedule-page">
      <div class="schedule-summary"><div><strong>{schedules.filter(item => item.active).length}</strong><span>Virk</span></div><div><strong>{schedules.length}</strong><span>Alls</span></div><button on:click={() => modal = true}><Plus size={16}/> Ný áætlun</button></div>
      {#if !schedules.length}
        <div class="schedule-empty"><div><CalendarClock size={30}/></div><strong>Engar áætlanir enn</strong><p>Settu upp skipun eða skriftu sem keyrir einu sinni, reglulega eða handvirkt.</p><button on:click={() => modal = true}><Plus size={17}/> Búa til fyrstu áætlun</button></div>
      {:else}
        <div class="schedule-list">{#each schedules as schedule (schedule.id)}<article class:paused={!schedule.active}><div class="schedule-icon">{#if schedule.kind === "script"}<Code2 size={18}/>{:else}<Sparkles size={18}/>{/if}</div><div class="schedule-copy"><div><strong>{schedule.name}</strong><span class:active={schedule.active}>{schedule.active ? "Virk" : "Í bið"}</span></div><p>{schedule.task}</p><small>{schedule.when}{schedule.lastRun ? ` · Síðast ${schedule.lastRun}` : ""}</small></div><div class="schedule-actions"><button on:click={() => schedules = schedules.map(item => item.id === schedule.id ? {...item, lastRun: "núna"} : item)} aria-label={`Keyra ${schedule.name}`}><Play size={15}/></button><button on:click={() => schedules = schedules.map(item => item.id === schedule.id ? {...item, active: !item.active} : item)} aria-label={schedule.active ? `Setja ${schedule.name} í bið` : `Virkja ${schedule.name}`}>{#if schedule.active}<Pause size={15}/>{:else}<Play size={15}/>{/if}</button><button class="danger" on:click={() => schedules = schedules.filter(item => item.id !== schedule.id)} aria-label={`Eyða ${schedule.name}`}><Trash2 size={15}/></button></div></article>{/each}</div>
      {/if}
    </div>
  {/if}
</section>

{#if modal}
  <div class="modal-backdrop" role="presentation" on:click|self={() => modal = false}>
    <form class="schedule-modal" aria-labelledby="schedule-title" on:submit|preventDefault={saveSchedule}>
      <header><div><h2 id="schedule-title">Ný áætlun</h2><p>Segðu TV Kit hvað á að gera og hvenær.</p></div><button type="button" class="icon-button" on:click={() => modal = false} aria-label="Loka"><X size={19}/></button></header>
      <label>Heiti<input bind:value={scheduleName} placeholder="Til dæmis morgunfréttir" required/></label>
      <fieldset><legend>Tegund</legend><div class="choice-grid"><button type="button" class:active={scheduleKind === "prompt"} on:click={() => scheduleKind = "prompt"}><Sparkles size={18}/><span><strong>Náttúrulegt mál</strong><small>Lýstu verkinu einfaldlega</small></span></button><button type="button" class:active={scheduleKind === "script"} on:click={() => scheduleKind = "script"}><Code2 size={18}/><span><strong>Skrifta</strong><small>Keyrðu skipun eða skriftu</small></span></button></div></fieldset>
      <label>{scheduleKind === "prompt" ? "Hvað á að gera?" : "Skrifta eða skipun"}<textarea bind:value={scheduleTask} rows="4" placeholder={scheduleKind === "prompt" ? "Sýndu veðurspána og stilltu á RÚV…" : "/home/olafurbui/scripts/verk.sh"} required></textarea></label>
      <fieldset><legend>Keyrsla</legend><div class="timing"><button type="button" class:active={scheduleTiming === "manual"} on:click={() => scheduleTiming = "manual"}>Handvirkt</button><button type="button" class:active={scheduleTiming === "once"} on:click={() => scheduleTiming = "once"}>Einu sinni</button><button type="button" class:active={scheduleTiming === "interval"} on:click={() => scheduleTiming = "interval"}>Reglulega</button></div></fieldset>
      {#if scheduleTiming !== "manual"}<label>{scheduleTiming === "once" ? "Hvenær" : "Tíðni"}<input bind:value={scheduleWhen} placeholder={scheduleTiming === "once" ? "Í kvöld kl. 20:00" : "Á 30 mínútna fresti"} required/></label>{/if}
      <footer><button type="button" class="cancel" on:click={() => modal = false}>Hætta við</button><button class="primary" type="submit" disabled={!scheduleName.trim() || !scheduleTask.trim()}><Plus size={16}/> Búa til</button></footer>
    </form>
  </div>
{/if}

<style>
  .agent-chat{display:flex;min-height:0;flex:1;flex-direction:column;background:var(--header)}button,input,textarea{font:inherit}.chat-heading{min-height:68px;padding:12px 15px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);color:var(--primary)}.heading-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--primary);color:white}.chat-heading>div:nth-child(2){flex:1}.chat-heading h2{margin:0;font-size:16px;color:var(--ink)}.chat-heading p{margin:3px 0 0;font-size:10px;color:var(--muted)}.icon-button{width:38px;height:38px;border:1px solid var(--border);border-radius:11px;display:grid;place-items:center;background:var(--surface);color:var(--ink)}
  .view-tabs{padding:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:6px;border-bottom:1px solid var(--border);background:var(--surface)}.view-tabs button{height:38px;border:0;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:7px;background:transparent;color:var(--muted);font-size:12px;font-weight:750}.view-tabs button.active{background:var(--raised);color:var(--primary);box-shadow:var(--shadow-soft)}.view-tabs span{min-width:18px;padding:2px 5px;border-radius:8px;background:color-mix(in oklch,var(--primary),transparent 82%);font-size:9px}
  .chat-log{flex:1;min-height:0;padding:16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;scrollbar-width:none}.chat-log::-webkit-scrollbar,.schedule-page::-webkit-scrollbar{display:none}.welcome{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;color:var(--muted)}.welcome :global(svg){color:var(--primary)}.welcome strong{font-size:18px;color:var(--ink)}.welcome span{max-width:330px;font-size:12px;line-height:1.5}.message{max-width:86%;padding:10px 12px;border:1px solid var(--border);border-radius:14px 14px 14px 4px;background:var(--surface);align-self:flex-start}.message.from-user{border-radius:14px 14px 4px 14px;background:var(--primary);color:white;align-self:flex-end}.message-role{font-size:9px;font-weight:800;opacity:.72}.message p{margin:4px 0 0;font-size:14px;line-height:1.48;white-space:pre-wrap}.message small{display:block;margin-top:7px;font-size:9px;opacity:.72}.reply-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.reply-title strong{font-size:13px}.reply-title small{margin:0;text-transform:uppercase;color:var(--primary)}.reply p{margin-top:5px}.reply ul{margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.5}.reply-action,.reply-list{border-left:3px solid var(--presence-accent)}.reply-status{border-left:3px solid var(--primary)}.reply-error{border-left:3px solid #e56f6f}.typing{align-self:flex-start;padding:12px 14px;border-radius:14px;background:var(--surface);display:flex;gap:4px}.typing i{width:6px;height:6px;border-radius:50%;background:var(--primary);animation:blink 1s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}@keyframes blink{0%,80%,100%{opacity:.3}40%{opacity:1}}.chat-error{margin:0 14px 10px;padding:9px 11px;border-radius:9px;background:color-mix(in oklch,var(--primary),transparent 75%);font-size:11px;color:var(--ink)}.composer{flex-shrink:0;padding:11px;display:flex;align-items:flex-end;gap:8px;border-top:1px solid var(--border);background:var(--surface)}.composer textarea{flex:1;resize:none;padding:11px 12px;border:1px solid var(--border);border-radius:11px;outline:0;background:var(--raised);font-size:13px;line-height:1.35}.composer textarea:focus,input:focus,.schedule-modal textarea:focus{border-color:var(--primary);outline:0}.send{width:45px;height:45px;border:0;border-radius:11px;display:grid;place-items:center;background:var(--primary);color:white}.send:disabled,.primary:disabled{opacity:.35}
  .schedule-page{flex:1;min-height:0;padding:14px;overflow-y:auto;scrollbar-width:none;background:var(--header)}.schedule-summary{display:grid;grid-template-columns:72px 72px 1fr;gap:8px;margin-bottom:13px}.schedule-summary>div{padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--surface);text-align:center}.schedule-summary strong{display:block;font-size:18px;color:var(--ink)}.schedule-summary span{font-size:9px;color:var(--muted)}.schedule-summary>button,.schedule-empty button{border:0;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--primary);color:white;font-size:11px;font-weight:800}.schedule-empty{min-height:280px;padding:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.schedule-empty>div{width:62px;height:62px;margin-bottom:13px;border-radius:20px;display:grid;place-items:center;background:color-mix(in oklch,var(--primary),transparent 86%);color:var(--primary)}.schedule-empty strong{font-size:18px;color:var(--ink)}.schedule-empty p{max-width:290px;margin:7px 0 18px;color:var(--muted);font-size:12px;line-height:1.5}.schedule-empty button{padding:11px 15px}.schedule-list{display:flex;flex-direction:column;gap:9px}.schedule-list article{padding:12px;display:flex;align-items:flex-start;gap:10px;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow-soft)}.schedule-list article.paused{opacity:.64}.schedule-icon{width:38px;height:38px;flex:none;border-radius:11px;display:grid;place-items:center;background:color-mix(in oklch,var(--primary),transparent 86%);color:var(--primary)}.schedule-copy{min-width:0;flex:1}.schedule-copy>div{display:flex;align-items:center;gap:7px}.schedule-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--ink)}.schedule-copy span{padding:2px 6px;border-radius:7px;background:var(--raised);color:var(--muted);font-size:8px;font-weight:800}.schedule-copy span.active{background:color-mix(in oklch,var(--presence-accent),transparent 82%);color:var(--presence-accent)}.schedule-copy p{margin:4px 0;color:var(--ink);font-size:11px;line-height:1.4}.schedule-copy small{color:var(--muted);font-size:9px}.schedule-actions{display:flex;gap:4px}.schedule-actions button{width:31px;height:31px;border:1px solid var(--border);border-radius:9px;display:grid;place-items:center;background:var(--raised);color:var(--ink)}.schedule-actions .danger{color:#dc6767}
  .modal-backdrop{position:fixed;inset:0;z-index:50;padding:18px;display:flex;align-items:center;justify-content:center;background:rgba(10,14,24,.56);backdrop-filter:blur(7px)}.schedule-modal{width:min(100%,430px);max-height:calc(100vh - 36px);padding:17px;overflow-y:auto;border:1px solid var(--border);border-radius:20px;background:var(--surface);box-shadow:var(--shadow-card);color:var(--ink)}.schedule-modal header{display:flex;align-items:flex-start;gap:12px;margin-bottom:15px}.schedule-modal header>div{flex:1}.schedule-modal h2{margin:0;font-size:18px}.schedule-modal header p{margin:4px 0 0;color:var(--muted);font-size:11px}.schedule-modal label,.schedule-modal legend{display:block;margin:11px 0 5px;font-size:10px;font-weight:800;color:var(--muted)}.schedule-modal input,.schedule-modal textarea{box-sizing:border-box;width:100%;padding:10px 11px;border:1px solid var(--border);border-radius:10px;resize:none;background:var(--raised);color:var(--ink);font-size:12px}.schedule-modal fieldset{margin:11px 0 0;padding:0;border:0}.choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.choice-grid button{padding:11px;border:1px solid var(--border);border-radius:11px;display:flex;align-items:center;gap:8px;text-align:left;background:var(--raised);color:var(--muted)}.choice-grid button.active{border-color:var(--primary);background:color-mix(in oklch,var(--primary),transparent 90%);color:var(--primary)}.choice-grid span{min-width:0}.choice-grid strong,.choice-grid small{display:block}.choice-grid strong{font-size:11px;color:var(--ink)}.choice-grid small{margin-top:2px;font-size:8px}.timing{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.timing button{height:36px;border:1px solid var(--border);border-radius:9px;background:var(--raised);color:var(--muted);font-size:10px;font-weight:750}.timing button.active{border-color:var(--primary);color:var(--primary)}.schedule-modal footer{margin-top:18px;display:flex;justify-content:flex-end;gap:7px}.schedule-modal footer button{height:39px;padding:0 14px;border:0;border-radius:10px;font-size:11px;font-weight:800}.cancel{background:var(--raised);color:var(--muted)}.primary{display:flex;align-items:center;gap:6px;background:var(--primary);color:white}
</style>
