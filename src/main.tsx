import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { readSessionState, SERVICE_TRUST_REASON, takeInvitedEmailFromLocation } from "./lib/session";
import { bootstrapBrand } from "./lib/brand";
import { applySkin, readSkin } from "./lib/skins";
import { applyChatWidth, readChatWidth } from "./lib/chat-width";
import { applyFont, readFont } from "./lib/fonts";

import { LoginPage } from "./pair/LoginPage";
import { setLocale } from "./lib/i18n";
import { languageChoice } from "./lib/language-preference";
import "./styles.css";

// Apply display preferences before first paint.
setLocale(languageChoice() || navigator.language);
applySkin(readSkin());
applyFont(readFont());
applyChatWidth(readChatWidth());

async function chooseRoot(): Promise<React.ReactNode> {
  if (location.pathname === "/login" || location.pathname === "/pair") return <LoginPage initialEmail={takeInvitedEmailFromLocation()} />;
  const session = await readSessionState();
  if (session.kind === "unauthenticated") return <LoginPage reason={session.error} />;
  if (session.kind === "loopback" && session.trust === "service") return <LoginPage reason={SERVICE_TRUST_REASON} />;
  return <App />;
}

void Promise.all([bootstrapBrand(), chooseRoot()]).then(([, root]) => {
  createRoot(document.getElementById("root")!).render(<StrictMode>{root}</StrictMode>);
});
