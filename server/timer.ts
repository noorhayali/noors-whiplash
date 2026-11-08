// Server-authoritative phase timer that can be paused (e.g. while the host screen reconnects).
// TIME_SCALE lets automated tests run whole games in seconds (TIME_SCALE=0.01).

export const TIME_SCALE = Number(process.env.TIME_SCALE ?? '1') || 1;

export class PhaseTimer {
  private handle: NodeJS.Timeout | null = null;
  private fn: (() => void) | null = null;
  deadline = 0;
  duration = 0;
  private remaining = 0;
  paused = false;

  /** seconds are "game seconds"; real time = seconds × TIME_SCALE */
  set(seconds: number, fn: () => void) {
    this.clear();
    this.duration = Math.max(1, Math.round(seconds * 1000 * TIME_SCALE));
    this.fn = fn;
    if (this.paused) {
      this.remaining = this.duration;
      this.deadline = Date.now() + this.remaining;
      return;
    }
    this.arm(this.duration);
  }

  private arm(ms: number) {
    this.deadline = Date.now() + ms;
    this.handle = setTimeout(() => {
      this.handle = null;
      const f = this.fn;
      this.fn = null;
      f?.();
    }, ms);
  }

  /** Fire immediately (e.g. everyone submitted, or host pressed skip). */
  fireNow() {
    if (!this.fn) return;
    const f = this.fn;
    this.clear();
    f();
  }

  get active() {
    return this.fn !== null;
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    if (this.handle) {
      clearTimeout(this.handle);
      this.handle = null;
      this.remaining = Math.max(0, this.deadline - Date.now());
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    // Give players a small grace period after the TV comes back.
    if (this.fn) this.arm(Math.max(this.remaining, 3000 * TIME_SCALE));
  }

  clear() {
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
    this.fn = null;
  }

  view() {
    if (!this.fn) return null;
    const deadline = this.paused ? Date.now() + this.remaining : this.deadline;
    return { deadline, duration: this.duration };
  }
}
