import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginUser, registerUser, sendTwoFactorEmail, verifyRegistrationEmail, verifyTwoFactor } from "@/lib/api";
import { useUserAuth } from "@/lib/user-auth-context";
import { useAuth } from "@/lib/auth-context";

export default function UserLoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUserAuth();
  const { setAuth } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [verificationMethod, setVerificationMethod] = useState<"totp" | "email">("totp");
  const [verificationCode, setVerificationCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [registrationCode, setRegistrationCode] = useState("");

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const result = await registerUser({ email, username, fullName, studentCode, password, termsAccepted, website: honeypot, startedAt });
        if (result.emailVerificationRequired && result.verificationToken) {
          setRegistrationToken(result.verificationToken);
          return;
        }
      } else {
        const result = await loginUser({ identifier, password, website: honeypot, startedAt });
        if (result.twoFactorRequired && result.challengeToken) {
          setChallengeToken(result.challengeToken);
          return;
        }
        if (result.admin && result.user) setAuth(null, result.user.email);
      }
      await refreshUser();
      navigate("/compare", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete authentication.");
    } finally {
      setLoading(false);
    }
  };

  const onVerifyRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!registrationToken) return;
    setLoading(true);
    setError("");
    try {
      await verifyRegistrationEmail(registrationToken, registrationCode);
      await refreshUser();
      navigate("/compare", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify your email.");
    } finally {
      setLoading(false);
    }
  };

  const onVerifyTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!challengeToken) return;
    setLoading(true);
    setError("");
    try {
      await verifyTwoFactor(challengeToken, verificationMethod, verificationCode);
      setChallengeToken(null);
      await refreshUser();
      navigate("/compare", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify the code.");
    } finally {
      setLoading(false);
    }
  };

  const requestEmailCode = async () => {
    if (!challengeToken) return;
    setLoading(true);
    setError("");
    try {
      await sendTwoFactorEmail(challengeToken);
      setEmailSent(true);
      setVerificationMethod("email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the email code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === "login" ? "User Login" : "Create an account"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Use your email or username to continue." : "Create a secure account for your schedule tools."}
          </p>
        </CardHeader>
        <CardContent>
          {registrationToken ? (
            <form onSubmit={onVerifyRegistration} className="space-y-4" noValidate>
              <p className="text-sm text-muted-foreground">We sent a six-digit verification code to {email}. It expires in 5 minutes. Your account will be created after verification.</p>
              <Input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={registrationCode} onChange={(event) => setRegistrationCode(event.target.value.replace(/\D/g, ""))} placeholder="Email verification code" autoComplete="one-time-code" required />
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || registrationCode.length !== 6}>{loading ? "Verifying..." : "Verify email and create account"}</Button>
              <button type="button" className="w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => { setRegistrationToken(null); setRegistrationCode(""); setError(""); }}>Back to registration</button>
            </form>
          ) : challengeToken ? (
            <form onSubmit={onVerifyTwoFactor} className="space-y-4" noValidate>
              <p className="text-sm text-muted-foreground">Your password was accepted. Enter the six-digit code from your authenticator app, or use email recovery.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={verificationMethod === "totp" ? "default" : "outline"} onClick={() => setVerificationMethod("totp")}>Authenticator</Button>
                <Button type="button" variant={verificationMethod === "email" ? "default" : "outline"} onClick={() => void requestEmailCode()} disabled={loading}>Email code</Button>
              </div>
              {verificationMethod === "email" && <p className="text-xs text-muted-foreground">{emailSent ? "A code was sent to your university email." : "Select Email code to send a verification code."}</p>}
              <Input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" autoComplete="one-time-code" required />
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || verificationCode.length !== 6}>{loading ? "Verifying..." : "Verify and continue"}</Button>
              <button type="button" className="w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => { setChallengeToken(null); setVerificationCode(""); setError(""); }}>Back to sign in</button>
            </form>
          ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <input
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
              className="absolute -left-[9999px] h-px w-px opacity-0"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            {mode === "register" ? (
              <>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="University email (@eng-st.cu.edu.eg)" autoComplete="email" required />
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Full name" autoComplete="name" minLength={2} maxLength={100} required />
                <Input value={studentCode} onChange={(event) => setStudentCode(event.target.value)} placeholder="Student code" autoComplete="off" pattern="[A-Za-z0-9-]{3,24}" required />
                <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" minLength={3} maxLength={24} required />
              </>
            ) : (
              <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Email or username" autoComplete="username" required />
            )}
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} required />
            {mode === "register" && (
              <>
                <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" autoComplete="new-password" minLength={12} required />
                <label className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Checkbox checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked === true)} required />
                  <span>I agree to the <Link className="text-foreground underline underline-offset-4" to="/terms">Terms and Conditions</Link>.</span>
                </label>
              </>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          )}
          {!challengeToken && !registrationToken && <button
            type="button"
            className="mt-5 w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          >
            {mode === "login" ? "Create a user account" : "Already have an account? Sign in"}
          </button>}
          {!challengeToken && !registrationToken && <p className="mt-4 text-center text-xs text-muted-foreground">
            Administrator? <Link className="text-foreground underline underline-offset-4" to="/login">Use the admin sign in</Link>.
          </p>}
        </CardContent>
      </Card>
    </div>
  );
}
