# ascii-remote-control

An interactive ASCII field controlled by a phone's orientation, motion sensors,
and touch input.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` on the display. On a phone, open the same public
URL, enter the six-digit pairing code, then hold and release the central control
to grab and throw ASCII characters.

## Render

The included `render.yaml` creates a Node web service that serves the Vite build
and hosts the WebSocket relay on the same origin.
