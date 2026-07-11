export type RuvJob = "daily" | "news";

export type ManagedRuvProcess = {
  exited: Promise<number>;
  output: Promise<string>;
  stop: () => void;
};

export function nextRuvJob(input: {
  now: number;
  lastDailySuccess?: number;
  lastNewsSuccess?: number;
  dailyIntervalMs: number;
  newsIntervalMs: number;
  childRunning: boolean;
}): RuvJob | null {
  if (input.childRunning) return null;
  if (!input.lastDailySuccess || input.now - input.lastDailySuccess >= input.dailyIntervalMs) return "daily";
  if (!input.lastNewsSuccess || input.now - input.lastNewsSuccess >= input.newsIntervalMs) return "news";
  return null;
}

type Timer = ReturnType<typeof setTimeout>;

export type RuvSchedulerOptions = {
  now?: () => number;
  dailyIntervalMs: number;
  newsIntervalMs: number;
  startDelayMs: number;
  pollMs: number;
  childTimeoutMs: number;
  lastSuccess: (job: RuvJob) => number | undefined;
  spawn: (job: RuvJob) => ManagedRuvProcess;
  recordStart: (job: RuvJob) => number;
  recordFinish: (id: number, result: { error?: string }) => void;
  setTimer?: (callback: () => void, delay: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  log?: (message: string) => void;
};

export class RuvScheduler {
  private readonly options: Required<Omit<RuvSchedulerOptions, "lastSuccess" | "spawn" | "recordStart" | "recordFinish">> & Pick<RuvSchedulerOptions, "lastSuccess" | "spawn" | "recordStart" | "recordFinish">;
  private timer?: Timer;
  private watchdog?: Timer;
  private child?: ManagedRuvProcess;
  private stopped = true;

  constructor(options: RuvSchedulerOptions) {
    this.options = {
      ...options,
      now: options.now ?? Date.now,
      setTimer: options.setTimer ?? setTimeout,
      clearTimer: options.clearTimer ?? clearTimeout,
      log: options.log ?? console.log
    };
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(this.options.startDelayMs);
  }

  async tick() {
    if (this.stopped || this.child) return;
    let runId: number | undefined;
    let finishAttempted = false;
    let job: RuvJob | null = null;
    try {
      const now = this.options.now();
      job = nextRuvJob({
        now,
        lastDailySuccess: this.options.lastSuccess("daily"),
        lastNewsSuccess: this.options.lastSuccess("news"),
        dailyIntervalMs: this.options.dailyIntervalMs,
        newsIntervalMs: this.options.newsIntervalMs,
        childRunning: false
      });
      if (!job) return;

      runId = this.options.recordStart(job);
      this.child = this.options.spawn(job);
      this.options.log(`tvserverd started RÚV ${job} background sync`);
      const outcome = await this.waitForChild(this.child);
      const summary = outcome.output.trim().slice(-2_000);
      const error = outcome.timedOut
        ? `RÚV ${job} child exceeded ${this.options.childTimeoutMs}ms and was terminated`
        : outcome.exitCode !== 0
          ? `RÚV ${job} child exited ${outcome.exitCode}${summary ? `: ${summary}` : ""}`
          : undefined;
      finishAttempted = true;
      this.options.recordFinish(runId, error ? { error } : {});
      this.options.log(error ?? `tvserverd completed RÚV ${job} background sync${summary ? `: ${summary}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = `RÚV ${job ?? "scheduler"} failed: ${message}`;
      if (runId !== undefined && !finishAttempted) {
        finishAttempted = true;
        try { this.options.recordFinish(runId, { error: failure }); }
        catch (finishError) { this.options.log(`${failure}; recording failure also failed: ${finishError instanceof Error ? finishError.message : String(finishError)}`); }
      } else {
        this.options.log(failure);
      }
    } finally {
      if (this.watchdog) this.options.clearTimer(this.watchdog);
      this.watchdog = undefined;
      this.child = undefined;
      if (!this.stopped) this.schedule(Math.min(5_000, this.options.pollMs));
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) this.options.clearTimer(this.timer);
    if (this.watchdog) this.options.clearTimer(this.watchdog);
    this.timer = undefined;
    this.watchdog = undefined;
    this.child?.stop();
  }

  get running() {
    return Boolean(this.child);
  }

  private async waitForChild(child: ManagedRuvProcess) {
    let resolveTimeout!: () => void;
    const timeout = new Promise<void>(resolve => resolveTimeout = resolve);
    this.watchdog = this.options.setTimer(() => {
      child.stop();
      resolveTimeout();
    }, this.options.childTimeoutMs);
    const completed = Promise.all([child.exited, child.output]).then(([exitCode, output]) => ({ timedOut: false as const, exitCode, output }));
    const outcome = await Promise.race([
      completed,
      timeout.then(() => ({ timedOut: true as const, exitCode: 124, output: "" }))
    ]);
    if (this.watchdog) this.options.clearTimer(this.watchdog);
    this.watchdog = undefined;
    return outcome;
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    try {
      if (this.timer) this.options.clearTimer(this.timer);
      this.timer = this.options.setTimer(() => {
        this.timer = undefined;
        void this.tick();
      }, delay);
    } catch (error) {
      this.options.log(`RÚV scheduler could not set timer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
