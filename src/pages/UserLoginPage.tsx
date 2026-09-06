import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginUser, registerUser } from "@/lib/api";
import { useUserAuth } from "@/lib/user-auth-context";
import { useAuth } from "@/lib/auth-context";

export default function UserLoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUserAuth();
  const { setAuth } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        await registerUser({ email, username, password, termsAccepted, website: honeypot, startedAt });
      } else {
        const result = await loginUser({ identifier, password, website: honeypot, startedAt });
        if (result.admin) setAuth(null, result.user.email);
      }
      await refreshUser();
      navigate("/compare", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete authentication.");
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
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="email" required />
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
          <button
            type="button"
            className="mt-5 w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          >
            {mode === "login" ? "Create a user account" : "Already have an account? Sign in"}
          </button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Administrator? <Link className="text-foreground underline underline-offset-4" to="/login">Use the admin sign in</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
