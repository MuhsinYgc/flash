import { MIN_FLASH_GAP_MS } from "./protocol";

export function createGovernor() {
  let lastStart = Number.NEGATIVE_INFINITY;

  return {
    allow(now: number) {
      if (now - lastStart < MIN_FLASH_GAP_MS) return false;
      lastStart = now;
      return true;
    },
    reset() {
      lastStart = Number.NEGATIVE_INFINITY;
    },
  };
}
