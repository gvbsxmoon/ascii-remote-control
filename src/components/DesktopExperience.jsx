import { useEffect, useRef, useState } from "react";
import { AsciiField } from "./AsciiField";
import { getWebSocketUrl, sendJson } from "../lib/realtime";

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
  const [room, setRoom] = useState("");
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);

  useEffect(() => {
    document.title = "ASCII Remote / Display";
    let socket;
    let reconnectTimer;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(getWebSocketUrl());

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

  const digits = (room || "------").split("");

  return (
    <main className="desktop-experience">
      <AsciiField inputRef={inputRef} />

      <section
        className={`desktop-pairing ${remoteConnected ? "is-connected" : ""}`}
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
    </main>
  );
}
