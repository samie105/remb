"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FingerPrintIcon,
  SmartPhone01Icon,
  ShieldKeyIcon,
  ArrowLeft01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getTwoFactorChallenge,
  getPasskeyAuthOptions,
  verifyPasskeyAuth,
  verifyTotpLogin,
  type TwoFactorChallenge,
} from "@/lib/two-factor-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Mode = "choose" | "passkey" | "totp";

export function TwoFactorClient() {
  const router = useRouter();
  const [challenge, setChallenge] = React.useState<TwoFactorChallenge | null>(
    null
  );
  const [mode, setMode] = React.useState<Mode>("choose");
  const [isLoading, setIsLoading] = React.useState(false);
  const [totpCode, setTotpCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [passkeyAttempted, setPasskeyAttempted] = React.useState(false);

  React.useEffect(() => {
    getTwoFactorChallenge().then((c) => {
      if (!c) {
        router.replace("/auth");
        return;
      }
      setChallenge(c);
      // Auto-select if only one method
      if (c.hasPasskeys && !c.hasTotp) setMode("passkey");
      else if (!c.hasPasskeys && c.hasTotp) setMode("totp");
    });
  }, [router]);

  async function handlePasskey() {
    setIsLoading(true);
    setError(null);
    setPasskeyAttempted(true);
    try {
      const options = await getPasskeyAuthOptions();

      const { startAuthentication } = await import(
        "@simplewebauthn/browser"
      );
      const assertion = await startAuthentication({ optionsJSON: options });

      const result = await verifyPasskeyAuth(assertion);
      if (result.verified) {
        router.replace(result.returnTo ?? "/dashboard");
      } else {
        setError("Passkey verification failed. Please try again.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Passkey authentication failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    if (totpCode.length !== 6) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await verifyTotpLogin(totpCode);
      if (result.verified) {
        router.replace(result.returnTo ?? "/dashboard");
      } else {
        setError("Invalid code. Please try again.");
        setTotpCode("");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  if (!challenge) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          className="size-5 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-size-[64px_64px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,var(--background)_70%)]" />
      </div>

      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 mx-auto w-full max-w-95 px-6"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-border/40 bg-foreground/5">
            <HugeiconsIcon
              icon={ShieldKeyIcon}
              className="size-6 text-foreground"
            />
          </div>
          <h1 className="text-[17px] font-semibold tracking-[-0.025em]">
            Two-factor authentication
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Verify your identity to continue signing in.
          </p>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive"
          >
            {error}
          </motion.div>
        )}

        {/* Method choice */}
        {mode === "choose" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            {challenge.hasPasskeys && (
              <button
                onClick={() => setMode("passkey")}
                className="flex w-full items-center gap-3 rounded-lg border border-border/40 px-4 py-3.5 text-left transition-colors hover:bg-foreground/3"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-foreground/5 border border-border/40">
                  <HugeiconsIcon
                    icon={FingerPrintIcon}
                    className="size-4.5 text-foreground"
                  />
                </div>
                <div>
                  <div className="text-[13px] font-medium">Passkey</div>
                  <div className="text-[12px] text-muted-foreground">
                    Use your device biometrics or security key
                  </div>
                </div>
              </button>
            )}
            {challenge.hasTotp && (
              <button
                onClick={() => setMode("totp")}
                className="flex w-full items-center gap-3 rounded-lg border border-border/40 px-4 py-3.5 text-left transition-colors hover:bg-foreground/3"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-foreground/5 border border-border/40">
                  <HugeiconsIcon
                    icon={SmartPhone01Icon}
                    className="size-4.5 text-foreground"
                  />
                </div>
                <div>
                  <div className="text-[13px] font-medium">
                    Authenticator app
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    Enter a 6-digit code from your app
                  </div>
                </div>
              </button>
            )}
          </motion.div>
        )}

        {/* Passkey mode */}
        {mode === "passkey" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border/40 px-4 py-6 text-center">
              {isLoading ? (
                <>
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    className="size-8 animate-spin text-muted-foreground"
                    aria-label="Waiting for passkey"
                  />
                  <p className="text-[13px] text-muted-foreground">
                    Waiting for your passkey...
                  </p>
                </>
              ) : passkeyAttempted ? (
                <>
                  <HugeiconsIcon
                    icon={FingerPrintIcon}
                    className="size-8 text-muted-foreground"
                  />
                  <p className="text-[13px] text-muted-foreground">
                    Passkey prompt was dismissed or failed.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePasskey}
                    className="mt-1"
                  >
                    Try again
                  </Button>
                </>
              ) : (
                <>
                  <HugeiconsIcon
                    icon={FingerPrintIcon}
                    className="size-8 text-foreground/60"
                  />
                  <p className="text-[13px] text-muted-foreground">
                    Use your device biometrics or security key to verify your identity.
                  </p>
                  <Button
                    size="sm"
                    onClick={handlePasskey}
                    className="mt-1"
                  >
                    Verify with passkey
                  </Button>
                </>
              )}
            </div>

            {challenge.hasTotp && (
              <button
                onClick={() => {
                  setMode("totp");
                  setError(null);
                }}
                className="flex w-full items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
                Use authenticator app instead
              </button>
            )}
          </motion.div>
        )}

        {/* TOTP mode */}
        {mode === "totp" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <form onSubmit={handleTotp} className="space-y-3">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) =>
                  setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="text-center text-lg tracking-[0.3em] font-mono"
                autoFocus
                autoComplete="one-time-code"
              />
              <Button
                type="submit"
                className="w-full"
                disabled={totpCode.length !== 6 || isLoading}
              >
                {isLoading ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    className="size-4 animate-spin"
                  />
                ) : (
                  "Verify"
                )}
              </Button>
            </form>

            {challenge.hasPasskeys && (
              <button
                onClick={() => {
                  setMode("passkey");
                  setError(null);
                  setTotpCode("");
                }}
                className="flex w-full items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
                Use passkey instead
              </button>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
