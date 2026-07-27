import { DesktopExperience } from "./components/DesktopExperience";
import { MobileRemote } from "./components/MobileRemote";

function isMobileBrowser() {
  const userAgent = navigator.userAgent || "";
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function App() {
  const url = new URL(window.location.href);
  const requestedDemo = url.searchParams.get("demo");
  const mobile = isMobileBrowser();
  const showRemote =
    requestedDemo === "remote" ||
    (mobile && requestedDemo !== "desktop");

  if (showRemote && requestedDemo !== "remote") {
    url.searchParams.set("demo", "remote");
    window.history.replaceState(null, "", url);
  }

  return showRemote ? <MobileRemote /> : <DesktopExperience />;
}
