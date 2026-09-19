# Daily5 30–60 second demo script

The official demo requirement is a short screen recording of the running build with live/provider-backed Nansen data visible. Silence is acceptable; a clean sequence is more important than narration.

## Before recording

1. Start from `daily5/` with the saved provider pack present.
2. Start the app in live mode without enabling a new download:

   ```bash
   cd /home/hekatlon/hekatlon/hackathlon/daily5
   DATA_MODE=live npm run dev
   ```

3. Open `http://127.0.0.1:8311` and log in with `demo` / `demo`.
4. Close unrelated windows and browser tabs. Keep the terminal, API key, browser profile, and personal notifications out of frame.
5. Use a 16:9 desktop window if possible. A 1,280×720 or 1,440×900 capture is adequate.

## Shot list

| Time | Action | What the viewer should understand |
| --- | --- | --- |
| 0–5s | Show the Daily5 landing/board and the live/provider-backed source status. | This is a real working Daily5 board, not a static mockup. |
| 5–14s | Open one mystery asset and inspect its chart, volume, and clue/evidence cards. | Nansen evidence changes what the player can learn. |
| 14–25s | Allocate the virtual wallet across several assets; leave a small cash position if useful. | The player makes a measured market call rather than clicking a quiz answer. |
| 25–35s | Lock the round. Move through the reveal/cutoff state. | The decision is frozen before the result is known. |
| 35–47s | Show the revealed outcome, return, cost-adjusted score, and shareable scorecard. | The game turns the market move into an auditable result. |
| 47–58s | Open the Daily and All-time leaderboard controls. | Players can compare today’s read and the longer-running competition. |

If the app needs more than 60 seconds to load, prepare it first and start recording on the board. Do not speed up a broken flow or hide an error screen.

## Debian capture with ffmpeg

This workspace has `ffmpeg` installed. The command below captures an X11 desktop at 30 fps. Replace `1440:900` with the actual desktop size if needed.

In a second terminal, run:

```bash
ffmpeg -f x11grab -video_size 1440x900 -framerate 30 -i "${DISPLAY:-:0}+0,0" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -movflags +faststart \
  /tmp/daily5-meridian-demo.mp4
```

Perform the shot list, then return to that terminal and press `q` to finish. Check the duration and file:

```bash
ffprobe -v error -show_entries format=duration,size \
  -of default=noprint_wrappers=1 /tmp/daily5-meridian-demo.mp4
```

If Debian is using Wayland and `x11grab` cannot capture the screen, use the desktop’s built-in screen recorder or install/open OBS Studio, choose the display/window capture source, record at 30 fps, and export MP4. The content requirements are the same.

## Review before upload

- Duration is between 30 and 60 seconds.
- The Daily5 board, an evidence view, one locked decision, reveal, scorecard, and both leaderboard views are visible.
- The source is visibly provider-backed/live; the recording does not imply synthetic data is Nansen data.
- No API key, terminal environment, cookies, wallet data, email, or private dashboard content appears.
- Text is readable at normal playback size and no browser notification interrupts the recording.
- Keep the MP4 outside the public repository unless the user deliberately chooses to publish it there.
