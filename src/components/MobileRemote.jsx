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

export function MobileRemote() {
  const [digits, setDigits] = useState(initialDigits);
  const [phase, setPhase] = useState("pairing");
  const [pressed, setPressed] = useState(false);
  const inputRefs = useRef([]);
  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const holdRef = useRef(false);
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

    try {
      const permissionRequests = [];
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        permissionRequests.push(DeviceOrientationEvent.requestPermission());
      }
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        permissionRequests.push(DeviceMotionEvent.requestPermission());
      }

      const permissions = await Promise.all(permissionRequests);
      if (permissions.some((permission) => permission !== "granted")) {
        throw new Error("Motion permission denied");
      }

      sensorRef.current.active = true;
      sensorRef.current.neutralBeta = null;
      sensorRef.current.neutralGamma = null;
      navigator.wakeLock?.request("screen").catch(() => {});
      return true;
    } catch (error) {
      console.error("Unable to enable motion sensors:", error);
      setPhase("sensor-error");
      return false;
    }
  }

  async function beginHold(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    holdRef.current = true;
    setPressed(true);
    const enabled = await enableSensors();
    if (enabled && holdRef.current) {
      sendInput(0);
      navigator.vibrate?.(10);
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
    setDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    if (phase === "invalid") setPhase("pairing");
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
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
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] || ""));
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  const paired = ["ready", "waiting", "offline", "sensor-error"].includes(phase);

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
            <span>{room}</span>
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
            <span>{pressed ? "HOLDING" : "HOLD"}</span>
          </button>
          <footer className="remote-footer">
            {phase === "sensor-error"
              ? "MOTION DENIED"
              : phase === "ready"
                ? "REMOTE ONLINE"
                : "RECONNECTING"}
          </footer>
        </>
      )}
    </main>
  );
}
