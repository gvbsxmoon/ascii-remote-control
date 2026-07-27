import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const isDevelopment = process.argv.includes("--dev");
const port = Number(process.env.PORT) || 5173;
const rootDirectory = fileURLToPath(new URL(".", import.meta.url));
const distDirectory = join(rootDirectory, "dist");
const rooms = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

let vite;
if (isDevelopment) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
}

function sendFile(response, filePath, fileStat) {
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Content-Length": fileStat.size,
    "Cache-Control": filePath.endsWith("index.html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(response);
}

async function serveProduction(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  const requestedPath =
    requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(distDirectory, normalizedPath);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
    sendFile(response, filePath, await stat(filePath));
  } catch {
    const fallbackPath = join(distDirectory, "index.html");
    sendFile(response, fallbackPath, await stat(fallbackPath));
  }
}

const server = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }

  if (vite) {
    vite.middlewares(request, response, () => {
      response.writeHead(404);
      response.end();
    });
    return;
  }

  try {
    await serveProduction(request, response);
  } catch (error) {
    console.error("Static file error:", error);
    response.writeHead(500);
    response.end("Internal server error");
  }
});

const webSocketServer = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 8 * 1024,
});

function send(client, payload) {
  if (client?.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(payload));
  }
}

function createRoomCode() {
  let code;
  do {
    code = String(Math.floor(100_000 + Math.random() * 900_000));
  } while (rooms.has(code));
  return code;
}

function reportRoom(room) {
  send(room.display, {
    type: "peer-status",
    remoteConnected: room.remote?.readyState === WebSocket.OPEN,
  });
  send(room.remote, {
    type: "peer-status",
    displayConnected: room.display?.readyState === WebSocket.OPEN,
  });
}

function detach(client) {
  if (!client.roomCode) return;

  const room = rooms.get(client.roomCode);
  if (!room) return;

  if (client.role === "display" && room.display === client) {
    send(room.remote, { type: "room-closed" });
    if (room.remote) {
      room.remote.roomCode = null;
      room.remote.role = null;
    }
    rooms.delete(client.roomCode);
  } else if (client.role === "remote" && room.remote === client) {
    room.remote = null;
    reportRoom(room);
  }

  client.roomCode = null;
  client.role = null;
}

function createRoom(client) {
  detach(client);
  const code = createRoomCode();
  rooms.set(code, {
    code,
    display: client,
    remote: null,
    gameState: null,
  });
  client.roomCode = code;
  client.role = "display";
  send(client, { type: "room-created", room: code });
  reportRoom(rooms.get(code));
}

function joinRoom(client, code) {
  if (!/^\d{6}$/.test(code)) {
    send(client, { type: "room-not-found" });
    return;
  }

  const room = rooms.get(code);
  if (!room?.display || room.display.readyState !== WebSocket.OPEN) {
    send(client, { type: "room-not-found" });
    return;
  }

  detach(client);
  if (room.remote && room.remote !== client) {
    send(room.remote, { type: "replaced" });
    room.remote.close(4001, "Controller replaced");
  }

  room.remote = client;
  client.roomCode = code;
  client.role = "remote";
  send(client, { type: "room-joined", room: code });
  reportRoom(room);
  if (room.gameState) send(client, room.gameState);
}

function forwardInput(client, message) {
  if (client.role !== "remote" || !client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (room?.remote !== client) return;

  const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, Number(value) || 0));

  send(room.display, {
    type: "input",
    x: clamp(message.x, 0, 1),
    y: clamp(message.y, 0, 1),
    openness: clamp(message.openness, 0, 1),
    motionIntensity: clamp(message.motionIntensity, 0, 20),
  });
}

function forwardGameState(client, message) {
  if (client.role !== "display" || !client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (room?.display !== client) return;

  room.gameState = {
    type: "game-state",
    score: Math.max(0, Math.floor(Number(message.score) || 0)),
    misses: Math.max(0, Math.floor(Number(message.misses) || 0)),
    level: Math.max(1, Math.floor(Number(message.level) || 1)),
    activeBugs: Math.max(0, Math.floor(Number(message.activeBugs) || 0)),
    status: String(message.status || "WAITING").slice(0, 24),
  };
  send(room.remote, room.gameState);
}

webSocketServer.on("connection", (client) => {
  client.isAlive = true;
  client.on("pong", () => {
    client.isAlive = true;
  });

  client.on("message", (buffer) => {
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch {
      send(client, { type: "invalid-message" });
      return;
    }

    if (message.type === "create-room") {
      createRoom(client);
    } else if (message.type === "join-room") {
      joinRoom(client, String(message.room || ""));
    } else if (message.type === "input") {
      forwardInput(client, message);
    } else if (message.type === "game-state") {
      forwardGameState(client, message);
    }
  });

  client.on("close", () => detach(client));
  client.on("error", () => detach(client));
});

const heartbeat = setInterval(() => {
  webSocketServer.clients.forEach((client) => {
    if (!client.isAlive) {
      client.terminate();
      return;
    }
    client.isAlive = false;
    client.ping();
  });
}, 25_000);

webSocketServer.on("close", () => clearInterval(heartbeat));

server.listen(port, "0.0.0.0", () => {
  console.log(
    `ASCII Remote ${isDevelopment ? "development" : "production"} server on http://localhost:${port}`,
  );
});
