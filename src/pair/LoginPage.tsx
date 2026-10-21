import { useState } from "react";
import { Mail } from "lucide-react";
import { t } from "@/lib/i18n";

export function LoginPage({ initialEmail = null, reason }: { initialEmail?: string | null; reason?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(reason ?? "");
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(sent ? "/api/auth/email/verify" : "/api/auth/email/start", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify(sent ? { email: email.trim(), code: code.trim() } : { email: email.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("login.failed"));
      if (sent) window.location.assign("/"); else setSent(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-app p-6 text-ink">
    <form className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-hairline bg-panel p-6" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <Mail size={28} /><h1 className="text-xl font-medium">{t("login.title")}</h1>
      <p className="text-sm text-ink-secondary">{t("login.description")}</p>
      <input aria-label={t("login.email")} type="email" autoComplete="email" required disabled={busy || sent} value={email} onChange={event => setEmail(event.target.value)} className="rounded-lg border border-hairline bg-inset px-3 py-2" />
      {sent && <input aria-label={t("login.code")} autoComplete="one-time-code" required value={code} onChange={event => setCode(event.target.value)} className="rounded-lg border border-hairline bg-inset px-3 py-2" />}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-accent-ink">{busy ? t("login.wait") : sent ? t("login.signIn") : t("login.sendCode")}</button>
    </form>
  </main>;
}
