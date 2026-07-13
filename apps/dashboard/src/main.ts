import { mount } from "svelte";
import pino from "pino";
import App from "./App.svelte";

const log = pino({ name: "tv-kit-dashboard", level: "trace", browser: { asObject: true, write: entry => console.log(entry) } });
window.addEventListener("error", event => log.error({ message: event.message, source: event.filename, line: event.lineno, column: event.colno, stack: event.error instanceof Error ? event.error.stack : undefined }, "window error"));
window.addEventListener("unhandledrejection", event => log.error({ reason: String(event.reason), stack: event.reason instanceof Error ? event.reason.stack : undefined }, "unhandled rejection"));
mount(App, { target: document.getElementById("app")! });
log.info("app mounted");
