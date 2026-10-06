import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRACK_FLASH_LEAD_MS, defaultShowState } from "./protocol";
import { isLit } from "./timeline-player";
import { parseYouTubeVideoId } from "./youtube";

describe("sync lock", () => {
  it("keeps the working playback flash lead", () => {
    assert.equal(TRACK_FLASH_LEAD_MS, 170);
  });

  it("does not light an idle empty timeline", () => {
    const state = defaultShowState();
    const result = isLit(state, Date.now(), []);
    assert.equal(result.on, false);
  });

  it("lights a timeline cue at the anchored show time", () => {
    const started = 1_000_000;
    const state = {
      ...defaultShowState(),
      playing: true,
      startedAtServerMs: started,
      pattern: "timeline" as const,
      timeline: [{ atMs: 500, onMs: 120 }],
    };
    assert.equal(isLit(state, started + 500, []).on, true);
    assert.equal(isLit(state, started + 640, []).on, false);
  });
});

describe("youtube parse", () => {
  it("reads watch, short, and raw ids", () => {
    assert.equal(parseYouTubeVideoId("dQw4w9wgGcQ"), "dQw4w9wgGcQ");
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9wgGcQ"),
      "dQw4w9wgGcQ",
    );
    assert.equal(parseYouTubeVideoId("https://youtu.be/dQw4w9wgGcQ"), "dQw4w9wgGcQ");
    assert.equal(parseYouTubeVideoId("not-a-link"), null);
  });
});
