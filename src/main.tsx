import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { readSessionState, SERVICE_TRUST_REASON, takeInvitedEmailFromLocation } from "./lib/session";
import { bootstrapBrand } from "./lib/brand";
import { applySkin, readSkin } from "./lib/skins";
import { applyChatWidth, readChatWidth } from "./lib/chat-width";
import { applyFont, readFont } from "./lib/fonts";
import { settleAdvancedModeDefault } from "./lib/interface-mode";

import { LoginPage } from "./pair/LoginPage";
import { setLocale } from "./lib/i18n";
import { languageChoice } from "./lib/language-preference";
import "./styles.css";

// Before first paint; settleAdvancedModeDefault must run before applySkin writes omb-skin.
setLocale(languageChoice() || navigator.language);
settleAdvancedModeDefault();
applySkin(readSkin());
applyFont(readFont());
applyChatWidth(readChatWidth());

async function chooseRoot(): Promise<React.ReactNode> {
  if (location.pathname === "/login" || location.pathname === "/pair") return <LoginPage initialEmail={takeInvitedEmailFromLocation()} />;
  const session = await readSessionState();
  if (session.kind === "unauthenticated") return <LoginPage reason={session.error} />;
  if (session.kind === "loopback" && session.trust === "service") return <LoginPage reason={SERVICE_TRUST_REASON} />;
  if (location.pathname === "/desktop-viewer") {
    const { DesktopViewer } = await import("./components/DesktopViewer");
    return <DesktopViewer />;
  }
  return <App />;
}

void Promise.all([bootstrapBrand(), chooseRoot()]).then(([, root]) => {
  createRoot(document.getElementById("root")!).render(<StrictMode>{root}</StrictMode>);
});
