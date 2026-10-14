import { MIN_FLASH_GAP_MS } from "./protocol";

export function createGovernor() {
  let lastStart = Number.NEGATIVE_INFINITY;

  return {
    allow(markMs: number) {
      if (markMs - lastStart < MIN_FLASH_GAP_MS) return false;
      lastStart = markMs;
      return true;
    },
    reset() {
      lastStart = Number.NEGATIVE_INFINITY;
    },
  };
}
