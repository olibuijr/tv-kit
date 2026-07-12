<script lang="ts">
  import { onMount } from "svelte";
  import Bot from "lucide-svelte/icons/bot";
  import Send from "lucide-svelte/icons/send";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import { tvServerUrl } from "../../../packages/protocol";

  type ChatMessage = { id?: number; role: "user" | "assistant"; content: string; tools?: string[] };
  let messages: ChatMessage[] = [];
  let draft = "";
  let loading = false;
  let error = "";

  async function loadMessages() {
    try {
      const response = await fetch(`${tvServerUrl()}/agent/chat`);
      if (!response.ok) throw new Error("Ekki náðist í spjallið");
      messages = (await response.json()).messages ?? [];
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Ekki náðist í spjallið";
    }
  }

  async function sendMessage() {
    const message = draft.trim();
    if (!message || loading) return;
    draft = "";
    loading = true;
    error = "";
    try {
      const response = await fetch(`${tvServerUrl()}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Spjallið svaraði ekki");
      const nextMessages = payload.messages ?? [...messages, { role: "user", content: message }, { role: "assistant", content: payload.message }];
      const lastMessage = nextMessages[nextMessages.length - 1];
      if (payload.tools?.length && lastMessage?.role === "assistant") {
        nextMessages[nextMessages.length - 1] = { ...lastMessage, tools: payload.tools };
      }
      messages = nextMessages;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Spjallið svaraði ekki";
      draft = message;
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  onMount(() => { void loadMessages(); });
</script>

<section class="agent-chat panel">
  <div class="chat-heading">
    <div class="heading-icon"><Bot size={22}/></div>
    <div><h2>TV Kit spjall</h2><p>Staðbundinn aðstoðarmaður á Titan</p></div>
    <Sparkles size={18}/>
  </div>

  <div class="chat-log" aria-live="polite">
    {#if !messages.length && !loading}
      <div class="welcome"><Bot size={30}/><strong>Hvað má ég gera?</strong><span>Spurðu um dagskrá eða biddu mig að stilla rás, spilun eða hljóðstyrk.</span></div>
    {/if}
    {#each messages as message (message.id ?? `${message.role}-${message.content}`)}
      <article class:from-user={message.role === "user"} class="message">
        <span class="message-role">{message.role === "user" ? "Þú" : "TV Kit"}</span>
        <p>{message.content}</p>
        {#if message.tools?.length}<small>Verkfæri: {message.tools.join(" · ")}</small>{/if}
      </article>
    {/each}
    {#if loading}<div class="typing" aria-label="TV Kit er að hugsa"><i></i><i></i><i></i></div>{/if}
  </div>

  {#if error}<div class="chat-error" role="alert">{error}</div>{/if}
  <form class="composer" on:submit|preventDefault={sendMessage}>
    <textarea bind:value={draft} on:keydown={handleKeydown} rows="2" maxlength="2000" placeholder="Spyrðu TV Kit…" aria-label="Skilaboð"></textarea>
    <button class="send" type="submit" disabled={!draft.trim() || loading} aria-label="Senda skilaboð"><Send size={19}/></button>
  </form>
</section>

<style>
  .agent-chat{display:flex;min-height:calc(100dvh - 210px);flex-direction:column;background:var(--header)}
  .chat-heading{min-height:68px;padding:12px 15px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);color:var(--primary)}
  .heading-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--primary);color:white}.chat-heading div:nth-child(2){flex:1}.chat-heading h2{margin:0;font-size:16px;color:var(--ink)}.chat-heading p{margin:3px 0 0;font-size:10px;color:var(--muted)}
  .chat-log{flex:1;min-height:260px;max-height:calc(100dvh - 370px);padding:16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;scrollbar-width:none}.chat-log::-webkit-scrollbar{display:none}
  .welcome{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;color:var(--muted)}.welcome :global(svg){color:var(--primary)}.welcome strong{font-size:18px;color:var(--ink)}.welcome span{max-width:330px;font-size:12px;line-height:1.5}
  .message{max-width:86%;padding:10px 12px;border:1px solid var(--border);border-radius:14px 14px 14px 4px;background:var(--surface);align-self:flex-start}.message.from-user{border-radius:14px 14px 4px 14px;background:var(--primary);color:white;align-self:flex-end}.message-role{font-size:9px;font-weight:800;opacity:.72}.message p{margin:4px 0 0;font-size:14px;line-height:1.48;white-space:pre-wrap}.message small{display:block;margin-top:7px;font-size:9px;opacity:.72}.typing{align-self:flex-start;padding:12px 14px;border-radius:14px;background:var(--surface);display:flex;gap:4px}.typing i{width:6px;height:6px;border-radius:50%;background:var(--primary);animation:blink 1s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}@keyframes blink{0%,80%,100%{opacity:.3}40%{opacity:1}}
  .chat-error{margin:0 14px 10px;padding:9px 11px;border-radius:9px;background:color-mix(in oklch,var(--primary),transparent 75%);font-size:11px;color:var(--ink)}
  .composer{padding:11px;display:flex;align-items:flex-end;gap:8px;border-top:1px solid var(--border);background:var(--surface)}textarea{flex:1;resize:none;padding:11px 12px;border:1px solid var(--border);border-radius:11px;outline:0;background:var(--raised);font-size:13px;line-height:1.35}textarea:focus{border-color:var(--primary)}.send{width:45px;height:45px;border:0;border-radius:11px;display:grid;place-items:center;background:var(--primary);color:white}.send:disabled{opacity:.35;cursor:not-allowed}
</style>
