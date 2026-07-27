import { useCallback, useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const TIP_INDICES = [8, 12, 16, 20];
const PIP_INDICES = [6, 10, 14, 18];

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function getPalmCenter(landmarks) {
  const indices = [0, 5, 9, 13, 17];
  const total = indices.reduce(
    (sum, index) => ({
      x: sum.x + landmarks[index].x,
      y: sum.y + landmarks[index].y,
    }),
    { x: 0, y: 0 },
  );
  return { x: total.x / indices.length, y: total.y / indices.length };
}

function getOpenness(landmarks) {
  const wrist = landmarks[0];
  const palmSize = Math.max(distance(wrist, landmarks[9]), 0.001);
  const scores = TIP_INDICES.map((tipIndex, index) => {
    const extension =
      (distance(wrist, landmarks[tipIndex]) -
        distance(wrist, landmarks[PIP_INDICES[index]])) /
      palmSize;
    return Math.max(0, Math.min(1, (extension + 0.04) / 0.32));
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export function useCameraHand(videoRef) {
  const [hand, setHand] = useState(null);
  const landmarkerRef = useRef(null);
  const frameRef = useRef(null);
  const lastTimestampRef = useRef(-1);

  const detect = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(detect);
      return;
    }

    const timestamp = performance.now();
    if (timestamp > lastTimestampRef.current) {
      lastTimestampRef.current = timestamp;
      const result = landmarker.detectForVideo(video, timestamp);
      const landmarks = result.landmarks?.[0];
      if (landmarks) {
        const center = getPalmCenter(landmarks);
        setHand({
          x: 1 - center.x,
          y: center.y,
          openness: getOpenness(landmarks),
        });
      } else {
        setHand(null);
      }
    }
    frameRef.current = requestAnimationFrame(detect);
  }, [videoRef]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        frameRef.current = requestAnimationFrame(detect);
      } catch (error) {
        console.error("Unable to initialize hand tracking:", error);
      }
    }

    initialize();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
      landmarkerRef.current?.close();
    };
  }, [detect]);

  return hand;
}
