// Video memes. With ffmpeg (installed in the GitHub workflow) every video is re-encoded to
// a small, silent, 720p H.264 MP4 that any screen's browser can play, cut to max seconds.
// Without ffmpeg (e.g. a Windows PC) only MP4 and WebM files are kept, as they are.

import { spawnSync } from 'node:child_process';

export function hasFfmpeg() {
  try {
    return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

export function ffmpegArgs(input, output, { maxSeconds, width = 1280, height = 720 }) {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', input,
    '-t', String(maxSeconds),
    '-an',                                   // no sound: the store has its own music
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '26',
    '-movflags', '+faststart',
    output,
  ];
}

export function transcode(input, output, opts) {
  const r = spawnSync('ffmpeg', ffmpegArgs(input, output, opts), { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').trim().slice(0, 300)}`);
}

/** Without ffmpeg: which extension to keep the original under, or null to skip it. */
export function passThroughExt(filename) {
  const m = String(filename).toLowerCase().match(/\.(mp4|webm)$/);
  return m ? m[1] : null;
}
