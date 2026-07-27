import { useEffect, useRef, useState } from "react";
import { useCameraHand } from "../hooks/useCameraHand";

export function CameraInput({ inputRef }) {
  const videoRef = useRef(null);
  const [cameraState, setCameraState] = useState("starting");
  const hand = useCameraHand(videoRef);

  useEffect(() => {
    let stream;
    let cancelled = false;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraState("ready");
      } catch (error) {
        console.error("Unable to start camera:", error);
        setCameraState("error");
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (inputRef.current.source === "camera") {
        inputRef.current.tracked = false;
      }
    };
  }, [inputRef]);

  useEffect(() => {
    if (!hand) {
      if (inputRef.current.source === "camera") {
        inputRef.current.tracked = false;
      }
      return;
    }
    inputRef.current = {
      tracked: true,
      x: hand.x,
      y: hand.y,
      openness: hand.openness,
      motionIntensity: 0,
      receivedAt: performance.now(),
      source: "camera",
    };
  }, [hand, inputRef]);

  return (
    <aside className={`camera-preview camera-preview--${cameraState}`}>
      <video ref={videoRef} muted playsInline />
      <span>{cameraState === "error" ? "CAMERA ERROR" : "CAMERA"}</span>
    </aside>
  );
}
