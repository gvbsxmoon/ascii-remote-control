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
  const gameStateRef = useRef(null);
  const introButtonRef = useRef(null);
  const introCursorRef = useRef(null);
  const [inputMode, setInputMode] = useState("remote");
  const [introOpen, setIntroOpen] = useState(true);
  const [room, setRoom] = useState("");
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [remoteWasConnected, setRemoteWasConnected] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [restartSignal, setRestartSignal] = useState(0);
  const [gameState, setGameState] = useState({
    score: 0,
    misses: 0,
    level: 1,
    maxLevel: 10,
    levelProgress: 0,
    levelTarget: 5,
    maxMisses: 5,
    activeBugs: 0,
    status: "WAITING",
    gameOver: false,
    gameOverMessage: "",
    gameWon: false,
    gameWonMessage: "",
  });
  gameStateRef.current = gameState;

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
        if (modeRef.current === "remote") {
          sendJson(socket, { type: "create-room" });
        }
      });

      socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "room-created") {
          if (modeRef.current === "remote") {
            setRoom(message.room);
            sendJson(socket, {
              type: "game-state",
              ...gameStateRef.current,
            });
          } else {
            sendJson(socket, { type: "close-room" });
          }
        } else if (message.type === "peer-status") {
          const connected = Boolean(message.remoteConnected);
          setRemoteConnected(connected);
          if (connected) {
            setRemoteWasConnected(true);
          }
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
        } else if (message.type === "restart-session") {
          setRestartSignal((signal) => signal + 1);
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
    gameStateRef.current = nextState;
    setGameState(nextState);
    sendJson(socketRef.current, { type: "game-state", ...nextState });
  }, []);

  const dismissIntro = useCallback(() => {
    setIntroOpen(false);
  }, []);

  const digits = (room || "------").split("");
  const remoteSessionPaused =
    inputMode === "remote" &&
    remoteWasConnected &&
    !remoteConnected &&
    !gameState.gameOver &&
    !gameState.gameWon;

  function selectInputMode(mode) {
    if (mode === modeRef.current) return;
    modeRef.current = mode;
    setInputMode(mode);
    inputRef.current.tracked = false;
    setRemoteWasConnected(false);

    if (mode === "camera") {
      setRoom("");
      setRemoteConnected(false);
      sendJson(socketRef.current, { type: "close-room" });
    } else {
      sendJson(socketRef.current, { type: "create-room" });
    }
  }

  return (
    <main className="desktop-experience">
      <AsciiField
        inputRef={inputRef}
        onGameStateChange={handleGameState}
        paused={introOpen || remoteSessionPaused}
        pausedInputEnabled={introOpen}
        restartSignal={restartSignal}
        interactionTargetRef={introButtonRef}
        cursorOverlayRef={introCursorRef}
        onDismiss={dismissIntro}
      />
      {inputMode === "camera" && <CameraInput inputRef={inputRef} />}

      <section className="game-hud" aria-live="polite">
        <span>SCORE {formatScore(gameState.score)}</span>
        <strong className={`game-status game-status--${gameState.status.toLowerCase().replaceAll(" ", "-")}`}>
          {gameState.status}
        </strong>
        <span>
          LVL {String(gameState.level).padStart(2, "0")}/
          {String(gameState.maxLevel).padStart(2, "0")}{" "}
          {gameState.levelProgress}/{gameState.levelTarget}
        </span>
        <span>ERR {gameState.misses}/{gameState.maxMisses}</span>
      </section>

      {gameState.gameOver && (
        <section className="system-modal game-over" aria-live="assertive">
          <strong>GAME OVER</strong>
          <p>{gameState.gameOverMessage}</p>
          <span>CLICK, TOUCH OR CLOSE HAND TO REBOOT</span>
        </section>
      )}

      {gameState.gameWon && (
        <section
          className="system-modal game-over game-complete"
          aria-live="assertive"
        >
          <strong>SYSTEM CLEAN</strong>
          <p>{gameState.gameWonMessage}</p>
          <span>CLICK, TOUCH OR CLOSE HAND TO RESTART</span>
        </section>
      )}

      {remoteSessionPaused && !introOpen && (
        <section className="system-modal remote-paused" aria-live="assertive">
          <strong>SESSION PAUSED</strong>
          <p>REMOTE DISCONNECTED</p>
          <span>RECONNECT TO CONTINUE</span>
        </section>
      )}

      {introOpen && (
        <div className="intro-layer" onClick={dismissIntro}>
          <section
            className="system-modal intro-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-title"
          >
            <strong id="intro-title">REMOVE THE BUGS</strong>
            <p>
              {inputMode === "camera"
                ? "MOVE YOUR HAND TO AIM. CLOSE YOUR FIST TO GRAB. OPEN TO THROW."
                : remoteConnected
                  ? "TILT TO AIM. HOLD TO GRAB. RELEASE TO THROW."
                  : "PAIR A REMOTE OR USE THE MOUSE. HOLD TO GRAB. RELEASE TO THROW."}
            </p>
            <button
              ref={introButtonRef}
              type="button"
              onClick={dismissIntro}
            >
              {inputMode === "camera"
                ? "AIM HERE + CLOSE FIST"
                : remoteConnected
                  ? "TOUCH REMOTE OR CLICK"
                  : "CLICK TO START"}
            </button>
          </section>
        </div>
      )}
      <div
        ref={introCursorRef}
        className="intro-hand-cursor"
        aria-hidden="true"
      />

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
          disabled={!introOpen}
          onClick={() => selectInputMode("remote")}
        >
          REMOTE
        </button>
        <button
          type="button"
          className={inputMode === "camera" ? "is-active" : ""}
          disabled={!introOpen}
          onClick={() => selectInputMode("camera")}
        >
          CAMERA
        </button>
      </div>
    </main>
  );
}
