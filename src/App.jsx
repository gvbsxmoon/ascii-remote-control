import { DesktopExperience } from "./components/DesktopExperience";
import { MobileRemote } from "./components/MobileRemote";
import { detectDevice } from "./lib/device";

export function App() {
  const url = new URL(window.location.href);
  const requestedDemo = url.searchParams.get("demo");
  const detectedDevice = detectDevice({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  const fireTv =
    requestedDemo === "firetv" || detectedDevice === "fire-tv";
  const mobile = detectedDevice === "mobile";
  const showRemote =
    requestedDemo === "remote" ||
    (mobile && !fireTv && requestedDemo !== "desktop");

  if (showRemote && requestedDemo !== "remote") {
    url.searchParams.set("demo", "remote");
    window.history.replaceState(null, "", url);
  }

  return showRemote ? (
    <MobileRemote />
  ) : (
    <DesktopExperience isFireTv={fireTv} />
  );
}
