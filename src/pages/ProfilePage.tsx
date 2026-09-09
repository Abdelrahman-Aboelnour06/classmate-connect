import { UserCircle, SignOut } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import { enableTwoFactor, getTwoFactorSetup, logoutUser } from "@/lib/api";
import { useUserAuth } from "@/lib/user-auth-context";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, clearUser } = useUserAuth();
  const [twoFactor, setTwoFactor] = useState<{ enabled: boolean; secret?: string; qrCode?: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorMessage, setTwoFactorMessage] = useState("");

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      clearUser();
      navigate("/", { replace: true });
    }
  };

  const beginTwoFactorSetup = async () => {
    setTwoFactorMessage("");
    try {
      setTwoFactor(await getTwoFactorSetup());
    } catch (error) {
      setTwoFactorMessage(error instanceof Error ? error.message : "Unable to start 2FA setup.");
    }
  };

  const confirmTwoFactorSetup = async () => {
    if (!twoFactor?.secret) return;
    try {
      await enableTwoFactor(twoFactor.secret, twoFactorCode);
      setTwoFactor({ enabled: true });
      setTwoFactorMessage("Authenticator 2FA is enabled for your account.");
    } catch (error) {
      setTwoFactorMessage(error instanceof Error ? error.message : "Unable to enable 2FA.");
    }
  };

  if (!user) return null;

  return (
    <PageLayout title="Profile">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <section className="border-b border-border pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Account</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Your profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your account details for Classmate Connect.</p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="profile-details">
          <div className="flex items-center gap-4 border-b border-border pb-5">
            <div className="brand-mark flex h-14 w-14 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
              <UserCircle weight="bold" className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <h2 id="profile-details" className="truncate font-display text-xl font-semibold">{user.username}</h2>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <dl className="grid gap-4 py-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</dt>
              <dd className="mt-1 break-words text-sm font-medium text-foreground">{user.fullName || user.username}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student code</dt>
              <dd className="mt-1 break-words text-sm font-medium text-foreground">{user.studentCode || "Not provided"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Username</dt>
              <dd className="mt-1 break-words text-sm font-medium text-foreground">{user.username}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</dt>
              <dd className="mt-1 break-words text-sm font-medium text-foreground">{user.email}</dd>
            </div>
          </dl>

          <Button type="button" variant="outline" onClick={() => void handleLogout()}>
            <SignOut weight="bold" aria-hidden="true" />
            Sign out
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="two-factor-heading">
          <h2 id="two-factor-heading" className="font-display text-lg font-semibold">Two-factor authentication</h2>
          <p className="mt-1 text-sm text-muted-foreground">Protect your account with an authenticator app. Email recovery is available when SMTP is configured.</p>
          {twoFactor?.enabled ? (
            <p className="mt-4 text-sm font-medium text-green-700 dark:text-green-300" role="status">Authenticator 2FA is enabled.</p>
          ) : !twoFactor ? (
            <Button type="button" className="mt-4" onClick={() => void beginTwoFactorSetup()}>Set up authenticator</Button>
          ) : (
            <div className="mt-4 space-y-4">
              {twoFactor.qrCode && <img src={twoFactor.qrCode} alt="QR code for authenticator setup" className="h-48 w-48 rounded-md border border-border bg-white p-2" />}
              <p className="text-sm text-muted-foreground">Scan the QR code, then enter the six-digit code shown by your authenticator app.</p>
              <p className="break-all rounded-md bg-muted p-2 font-mono text-xs">Manual key: {twoFactor.secret}</p>
              <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs" aria-label="Authenticator verification code" />
              <Button type="button" onClick={() => void confirmTwoFactorSetup()} disabled={twoFactorCode.length !== 6}>Enable 2FA</Button>
            </div>
          )}
          {twoFactorMessage && <p className="mt-3 text-sm text-destructive" role="alert">{twoFactorMessage}</p>}
        </section>
      </div>
    </PageLayout>
  );
}