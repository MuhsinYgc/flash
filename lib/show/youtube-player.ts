export const YT_ENDED = 0;
export const YT_PLAYING = 1;
export const YT_PAUSED = 2;
export const YT_BUFFERING = 3;

type YouTubePlayer = {
  destroy: () => void;
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  getVideoData: () => { video_id?: string };
};

type YouTubeNamespace = {
  Player: new (
    elementId: string,
    options: {
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YouTubePlayer }) => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type BoothPlayer = {
  load: (videoId: string) => void;
  cue: (videoId: string) => void;
  play: () => void;
  pause: () => void;
  currentTimeMs: () => number;
  state: () => number;
  videoId: () => string;
  destroy: () => void;
};

let mountGeneration = 0;

const noopPlayer: BoothPlayer = {
  load() {},
  cue() {},
  play() {},
  pause() {},
  currentTimeMs: () => 0,
  state: () => -1,
  videoId: () => "",
  destroy() {},
};

function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
}

export function mountYouTubePlayer(elementId: string, onState: (state: number) => void) {
  const generation = ++mountGeneration;
  return loadApi().then(
    () =>
      new Promise<BoothPlayer>((resolve) => {
        if (generation !== mountGeneration) {
          resolve(noopPlayer);
          return;
        }
        const player = new window.YT!.Player(elementId, {
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => resolve(asBooth(player)),
            onStateChange: (event) => onState(event.data),
          },
        });
      }),
  );
}

function asBooth(player: YouTubePlayer): BoothPlayer {
  return {
    load(videoId) {
      player.loadVideoById(videoId);
    },
    cue(videoId) {
      player.cueVideoById(videoId);
    },
    play() {
      player.playVideo();
    },
    pause() {
      player.pauseVideo();
    },
    currentTimeMs() {
      try {
        return Math.max(0, Math.round(player.getCurrentTime() * 1000));
      } catch {
        return 0;
      }
    },
    state() {
      try {
        return player.getPlayerState();
      } catch {
        return -1;
      }
    },
    videoId() {
      try {
        return player.getVideoData()?.video_id ?? "";
      } catch {
        return "";
      }
    },
    destroy() {
      player.destroy();
    },
  };
}
