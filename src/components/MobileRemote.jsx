import { useEffect, useRef, useState } from "react";
import { getWebSocketUrl, sendJson } from "../lib/realtime";

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

function initialDigits() {
  const room = new URLSearchParams(window.location.search).get("room") || "";
  return Array.from({ length: 6 }, (_, index) =>
    /^\d$/.test(room[index]) ? room[index] : "",
  );
}

function formatScore(score) {
  const value = Math.trunc(Number(score) || 0);
  const digits = String(Math.abs(value));
  return value < 0 ? `-${digits.padStart(4, "0")}` : digits.padStart(5, "0");
}

export function MobileRemote() {
  const [digits, setDigits] = useState(initialDigits);
  const [phase, setPhase] = useState("pairing");
  const [pressed, setPressed] = useState(false);
  const [motionState, setMotionState] = useState("idle");
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
  const inputRefs = useRef([]);
  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const holdRef = useRef(false);
  const sensorPermissionRef = useRef(null);
  const sensorRef = useRef({
    active: false,
    neutralBeta: null,
    neutralGamma: null,
    x: 0.5,
    y: 0.5,
    motionIntensity: 0,
  });

  const room = digits.join("");

  useEffect(() => {
    document.title = "ASCII Remote / Controller";
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (!/^\d{6}$/.test(room)) {
      joinedRef.current = false;
      socketRef.current?.close();
      socketRef.current = null;
      setPhase("pairing");
      return undefined;
    }

    let cancelled = false;
    let reconnectTimer;
    let rejected = false;

    function connect() {
      if (cancelled) return;
      setPhase("connecting");
      const socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        sendJson(socket, { type: "join-room", room });
      });

      socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "room-joined") {
          joinedRef.current = true;
          setPhase("ready");
          navigator.vibrate?.(18);
        } else if (message.type === "peer-status") {
          setPhase(message.displayConnected ? "ready" : "waiting");
        } else if (message.type === "room-not-found") {
          rejected = true;
          joinedRef.current = false;
          setPhase("invalid");
          socket.close();
        } else if (message.type === "room-closed") {
          rejected = true;
          joinedRef.current = false;
          setPhase("invalid");
        } else if (message.type === "game-state") {
          setGameState(message);
        }
      });

      socket.addEventListener("close", () => {
        joinedRef.current = false;
        if (!cancelled && !rejected) {
          setPhase("offline");
          reconnectTimer = window.setTimeout(connect, 1_000);
        }
      });
    }

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [room]);

  function sendInput(openness = holdRef.current ? 0 : 1) {
    const sensor = sensorRef.current;
    if (!joinedRef.current) return;
    sendJson(socketRef.current, {
      type: "input",
      x: sensor.x,
      y: sensor.y,
      openness,
      motionIntensity: sensor.motionIntensity,
    });
  }

  useEffect(() => {
    function onOrientation(event) {
      const sensor = sensorRef.current;
      if (!sensor.active || event.beta === null || event.gamma === null) return;

      if (sensor.neutralBeta === null || sensor.neutralGamma === null) {
        sensor.neutralBeta = event.beta;
        sensor.neutralGamma = event.gamma;
      }

      let horizontal = event.gamma - sensor.neutralGamma;
      let vertical = event.beta - sensor.neutralBeta;
      const legacyAngle = Number(window.orientation);
      const screenAngle =
        screen.orientation?.angle ??
        (Number.isFinite(legacyAngle) ? legacyAngle : 0);

      if (Math.abs(screenAngle) === 90) {
        const previousHorizontal = horizontal;
        horizontal = screenAngle === 90 ? vertical : -vertical;
        vertical = screenAngle === 90 ? -previousHorizontal : previousHorizontal;
      }

      sensor.x = clamp(0.5 + horizontal / 60, 0, 1);
      sensor.y = clamp(0.5 + vertical / 70, 0, 1);
    }

    function onMotion(event) {
      const sensor = sensorRef.current;
      if (!sensor.active) return;

      const acceleration = event.acceleration;
      const rotation = event.rotationRate;
      const accelerationMagnitude = acceleration
        ? Math.hypot(
            acceleration.x || 0,
            acceleration.y || 0,
            acceleration.z || 0,
          )
        : 0;
      const rotationMagnitude = rotation
        ? Math.hypot(
            rotation.alpha || 0,
            rotation.beta || 0,
            rotation.gamma || 0,
          )
        : 0;

      sensor.motionIntensity = clamp(
        accelerationMagnitude * 0.7 + rotationMagnitude / 90,
        0,
        20,
      );
    }

    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("devicemotion", onMotion);
    const sendTimer = window.setInterval(() => {
      if (!sensorRef.current.active) return;
      sendInput();
      sensorRef.current.motionIntensity *= 0.84;
    }, 33);

    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("devicemotion", onMotion);
      window.clearInterval(sendTimer);
    };
  }, []);

  async function enableSensors() {
    if (sensorRef.current.active) return true;
    if (sensorPermissionRef.current) return sensorPermissionRef.current;

    sensorPermissionRef.current = (async () => {
      try {
        setMotionState("requesting");
        const orientationApi = window.DeviceOrientationEvent;
        const motionApi = window.DeviceMotionEvent;

        if (!orientationApi && !motionApi) {
          throw new Error("Motion sensors are not available");
        }

        const permissionRequests = [];
        if (typeof orientationApi?.requestPermission === "function") {
          permissionRequests.push(orientationApi.requestPermission());
        }
        if (typeof motionApi?.requestPermission === "function") {
          permissionRequests.push(motionApi.requestPermission());
        }

        const permissions = await Promise.all(permissionRequests);
        if (permissions.some((permission) => permission !== "granted")) {
          throw new Error("Motion permission denied");
        }

        sensorRef.current.active = true;
        sensorRef.current.neutralBeta = null;
        sensorRef.current.neutralGamma = null;
        setMotionState("granted");
        navigator.wakeLock?.request("screen").catch(() => {});
        return true;
      } catch (error) {
        console.error("Unable to enable motion sensors:", error);
        setMotionState("denied");
        return false;
      }
    })();

    return sensorPermissionRef.current;
  }

  async function beginHold(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    holdRef.current = true;
    setPressed(true);
    sendInput(0);
    navigator.vibrate?.(10);
    const enabled = await enableSensors();
    if (enabled && holdRef.current) {
      sendInput(0);
    }
  }

  function endHold(event) {
    holdRef.current = false;
    setPressed(false);
    sendInput(1);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function updateDigit(index, value) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (phase === "invalid") setPhase("pairing");
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every(Boolean)) void enableSensors();
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event) {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    const next = Array.from(
      { length: 6 },
      (_, index) => pasted[index] || "",
    );
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    if (next.every(Boolean)) void enableSensors();
  }

  const paired = ["ready", "waiting", "offline"].includes(phase);

  return (
    <main className={`mobile-remote ${pressed ? "is-pressed" : ""}`}>
      {!paired ? (
        <section className={`code-entry code-entry--${phase}`}>
          <span className="remote-status">
            {phase === "connecting"
              ? "CONNECTING"
              : phase === "invalid"
                ? "INVALID CODE"
                : "ENTER CODE"}
          </span>
          <div className="code-inputs" onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength="1"
                value={digit}
                aria-label={`Digit ${index + 1}`}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          <header className="remote-header">
            <span>SCORE {formatScore(gameState.score)}</span>
            <strong
              className={`remote-game-status remote-game-status--${gameState.status.toLowerCase().replaceAll(" ", "-")}`}
            >
              {gameState.status}
            </strong>
            <i className={phase === "ready" ? "is-online" : ""} />
          </header>
          <button
            className="remote-pad"
            type="button"
            onPointerDown={beginHold}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span
              className={
                gameState.gameOver || gameState.gameWon
                  ? `remote-pad__end-state ${gameState.gameWon ? "is-complete" : ""}`
                  : ""
              }
            >
              {gameState.gameOver || gameState.gameWon
                ? gameState.gameOverMessage || gameState.gameWonMessage
                : pressed
                  ? "HOLDING"
                  : "HOLD"}
            </span>
          </button>
          <footer className="remote-footer">
            <span>{room}</span>
            <span>
              {motionState === "denied"
                ? "MOTION DENIED"
                : motionState === "requesting"
                  ? "ALLOW MOTION"
                  : gameState.gameOver || gameState.gameWon
                    ? "HOLD TO REBOOT"
                  : phase === "ready"
                    ? `LVL ${String(gameState.level).padStart(2, "0")}/${String(gameState.maxLevel).padStart(2, "0")} ${gameState.levelProgress}/${gameState.levelTarget}`
                    : "RECONNECTING"}
            </span>
          </footer>
        </>
      )}
    </main>
  );
}
