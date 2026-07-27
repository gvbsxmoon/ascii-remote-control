import { useCallback, useEffect, useRef, useState } from "react";
import { AsciiField } from "./AsciiField";
import { CameraInput } from "./CameraInput";
import { getWebSocketUrl, sendJson } from "../lib/realtime";

function formatScore(score) {
  const value = Math.trunc(Number(score) || 0);
  const digits = String(Math.abs(value));
  return value < 0 ? `-${digits.padStart(4, "0")}` : digits.padStart(5, "0");
}

export function DesktopExperience() {
  const inputRef = useRef({
    tracked: false,
    x: 0.5,
    y: 0.5,
    openness: 1,
    motionIntensity: 0,
    receivedAt: 0,
    source: "remote",
  });
  const socketRef = useRef(null);
  const modeRef = useRef("remote");
  const [inputMode, setInputMode] = useState("remote");
  const [room, setRoom] = useState("");
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [gameState, setGameState] = useState({
    score: 0,
    misses: 0,
    level: 1,
    levelProgress: 0,
    levelTarget: 5,
    maxMisses: 5,
    activeBugs: 0,
    status: "WAITING",
    gameOver: false,
    gameOverMessage: "",
  });

  useEffect(() => {
    document.title = "ASCII Remote / Display";
    let socket;
    let reconnectTimer;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setServerConnected(true);
        sendJson(socket, { type: "create-room" });
      });

      socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "room-created") {
          setRoom(message.room);
        } else if (message.type === "peer-status") {
          const connected = Boolean(message.remoteConnected);
          setRemoteConnected(connected);
          if (!connected) inputRef.current.tracked = false;
        } else if (message.type === "input") {
          if (modeRef.current !== "remote") return;
          inputRef.current = {
            tracked: true,
            x: message.x,
            y: message.y,
            openness: message.openness,
            motionIntensity: message.motionIntensity,
            receivedAt: performance.now(),
            source: "remote",
          };
        }
      });

      socket.addEventListener("close", () => {
        setServerConnected(false);
        setRemoteConnected(false);
        setRoom("");
        inputRef.current.tracked = false;
        if (!cancelled) reconnectTimer = window.setTimeout(connect, 1_000);
      });
    }

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  const handleGameState = useCallback((nextState) => {
    setGameState(nextState);
    sendJson(socketRef.current, { type: "game-state", ...nextState });
  }, []);

  const digits = (room || "------").split("");

  function selectInputMode(mode) {
    modeRef.current = mode;
    setInputMode(mode);
    inputRef.current.tracked = false;
  }

  return (
    <main className="desktop-experience">
      <AsciiField inputRef={inputRef} onGameStateChange={handleGameState} />
      {inputMode === "camera" && <CameraInput inputRef={inputRef} />}

      <section className="game-hud" aria-live="polite">
        <span>SCORE {formatScore(gameState.score)}</span>
        <strong className={`game-status game-status--${gameState.status.toLowerCase().replaceAll(" ", "-")}`}>
          {gameState.status}
        </strong>
        <span>
          LVL {String(gameState.level).padStart(2, "0")}{" "}
          {gameState.levelProgress}/{gameState.levelTarget}
        </span>
        <span>ERR {gameState.misses}/{gameState.maxMisses}</span>
      </section>

      {gameState.gameOver && (
        <section className="game-over" aria-live="assertive">
          <strong>GAME OVER</strong>
          <p>{gameState.gameOverMessage}</p>
          <span>CLOSE HAND TO REBOOT</span>
        </section>
      )}

      <section
        className={`desktop-pairing ${remoteConnected ? "is-connected" : ""} ${inputMode === "camera" ? "is-hidden" : ""}`}
        aria-live="polite"
      >
        <div className="desktop-pairing__status">
          <i />
          <span>
            {remoteConnected
              ? "REMOTE ONLINE"
              : serverConnected
                ? "PAIR REMOTE"
                : "CONNECTING"}
          </span>
        </div>
        <div className="desktop-code" aria-label={`Pairing code ${room}`}>
          {digits.map((digit, index) => (
            <span key={`${index}-${digit}`}>{digit}</span>
          ))}
        </div>
      </section>

      <div className="input-mode" role="group" aria-label="Input mode">
        <button
          type="button"
          className={inputMode === "remote" ? "is-active" : ""}
          onClick={() => selectInputMode("remote")}
        >
          REMOTE
        </button>
        <button
          type="button"
          className={inputMode === "camera" ? "is-active" : ""}
          onClick={() => selectInputMode("camera")}
        >
          CAMERA
        </button>
      </div>
    </main>
  );
}
