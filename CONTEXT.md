# ASCII Remote - Project Context

Use this document as the handoff for a new Codex thread.

## Repository

- Local path: `/Users/natalelu/Developer/discoveries/AsciiRemote`
- GitHub: `git@github.com:gvbsxmoon/ascii-remote-control.git`
- Main branch: `main`
- Baseline feature commit: `d601f11`
- This is a standalone project. Do not mix it with the neighboring `PinchMe`
  discovery.

## Product

ASCII Remote is a browser game displayed on desktop or Fire TV and controlled
either by a paired phone or by webcam hand tracking.

The screen is a pure black canvas filled with small, low-opacity monospace ASCII
characters. Sparse characters briefly flash neon green. Bright red ASCII
"bugs" appear in the field and must be grabbed and thrown away before they
expire.

The intended interaction is:

1. Open the display and choose `REMOTE` (default) or `CAMERA`.
2. In remote mode, enter the display's six-digit room code on a phone.
3. Move the phone to move the cursor.
4. Hold the touch control to close the hand and grab a nearby bug.
5. Release to throw it. Throw velocity follows the controller movement.

In camera mode, MediaPipe maps the palm center to the cursor and estimates hand
openness. A closed fist grabs; an open hand releases.

## Current Experience

- Full-screen ASCII canvas with a `#000` background.
- 9px Share Tech Mono characters at low white opacity.
- Sparse random neon-green character flashes.
- 32px black cursor with a thin white border.
- Bright red bug blocks with a six-second lifetime.
- A glowing red line oscillates between the cursor and a bug within grab range.
- The cursor grows from a 32px to a 48px radius only while directly over a bug,
  and becomes translucent so the bug remains visible beneath it.
- Thrown characters use velocity-based physics and fade out as particles.
- Score, misses, level, active bugs, and game status are tracked.
- Bugs begin spawning after 1.2 seconds, with shorter intervals at higher
  levels.
- A level requires five consecutive bug fixes. Missing a bug resets level
  progress and deducts 100 points.
- Five missed bugs trigger game over with a random hostile message. Mouse
  click, remote touch, or closing the tracked hand restarts the game.
- Status values include `WAITING`, `HEALTHY`, `BUG DETECTED`,
  `BUG CAPTURED`, `BUG MISSED`, `LEVEL UP`, and `GAME OVER`.
- Game state, level progress, misses, and game over are mirrored on the paired
  phone.
- The phone UI has a six-cell code input and one large hold surface. Keep it
  visually minimal and do not restore the old overlapping center dot.
- Mobile browsers automatically show the remote UI.
- Desktop input mode is a segmented `REMOTE` / `CAMERA` control, with remote as
  the default.
- An intro modal pauses the game until mouse click, paired remote touch, or a
  camera-tracked fist closes over its start button.
- Switching to camera closes and invalidates the pairing room. Switching back
  to remote creates a new room and pairing code.
- Camera mode shows a small webcam preview in the bottom-right corner.

## Architecture

The app uses React 19 and Vite. A custom Node server serves the production build
and owns the WebSocket relay so HTTP and realtime traffic share one origin.

### Server

`server.mjs`:

- Runs Vite in middleware mode with `npm run dev`.
- Serves `dist` with `npm start`.
- Exposes `GET /health`.
- Hosts a WebSocket server at `/ws`.
- Creates ephemeral six-digit rooms in memory.
- Allows one display and one remote per room.
- Relays normalized controller input from remote to display.
- Relays the latest game state from display to remote.
- Sends heartbeat pings and removes disconnected peers.

Rooms are not persistent. A server restart or display disconnect invalidates
the room code.

### WebSocket Messages

Display to server:

- `{ "type": "create-room" }`
- `{ "type": "close-room" }`
- `{ "type": "game-state", "score": 0, "misses": 0, "level": 1,
  "activeBugs": 0, "status": "HEALTHY" }`

Remote to server:

- `{ "type": "join-room", "room": "123456" }`
- `{ "type": "input", "x": 0.5, "y": 0.5, "openness": 1,
  "motionIntensity": 0 }`

Server messages include `room-created`, `room-joined`, `room-not-found`,
`room-closed`, `peer-status`, `input`, and `game-state`.

### Main Files

- `src/App.jsx`: mobile detection and desktop/remote routing.
- `src/components/DesktopExperience.jsx`: pairing UI, HUD, input selector, and
  WebSocket display client.
- `src/components/MobileRemote.jsx`: PIN entry, motion permission, phone
  sensors, hold/release control, and mobile game state.
- `src/components/AsciiField.jsx`: canvas rendering, game loop, bugs,
  proximity, grabbing, scoring, particles, and throw physics.
- `src/components/CameraInput.jsx`: webcam lifecycle and camera preview.
- `src/hooks/useCameraHand.js`: MediaPipe Hand Landmarker setup, palm center,
  and openness estimation.
- `src/lib/realtime.js`: same-origin WebSocket URL and JSON send helper.
- `src/index.css`: all desktop and mobile styling.
- `render.yaml`: Render Blueprint for the Node web service.

## Input Details

Phone input uses `deviceorientation` for normalized cursor coordinates and
`devicemotion` for throw intensity. Touch hold sends `openness: 0`; release
sends `openness: 1`.

On iOS, motion permission must be requested from a user gesture. The app asks
when the sixth code digit is entered and retries on the first hold. Motion APIs
require HTTPS outside localhost.

Camera input uses `@mediapipe/tasks-vision@0.10.35`. The WASM runtime is loaded
from jsDelivr and the hand model from Google Storage, so the first camera use
requires network access. Tracking uses one hand and the GPU delegate.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

- Force desktop: `?demo=desktop`
- Force phone remote: `?demo=remote`

Before committing:

```bash
npm run lint
npm run build
```

## Deployment

Deploy `render.yaml` as a Render Blueprint/Web Service, not a Static Site.
Render builds with `npm ci && npm run build`, starts with `npm start`, and checks
`/health`. WebSockets use the same host at `/ws`, automatically switching from
`ws` to `wss` under HTTPS.

Connecting the GitHub repository to Render still requires access to the owner's
Render account.

## Design Constraints

- Keep the visual language black, hacker-mono, restrained neon green, and red
  for bugs and alerts.
- Keep the controller UI extremely simple.
- Remote pairing remains the default input.
- Preserve the full-screen canvas and avoid card-heavy UI.
- Do not add a second display/window experience.
- Maintain the physical grab/throw feeling and velocity-sensitive particles.

## Working Agreement

- Inspect the current worktree and Git history before editing.
- Work with existing uncommitted changes; never discard them.
- Keep changes scoped to this project.
- Run lint and build after implementation.
- Commit completed changes to `main` and push them to `origin` unless explicitly
  asked not to.

## New Thread Prompt

Start a new Codex thread from this directory and say:

> Read `CONTEXT.md`, inspect the current Git status and relevant source files,
> then continue working on ASCII Remote. Preserve the existing design and input
> behavior. After changes, run lint and build, commit, and push.
