"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ShieldKeyIcon,
  FingerPrintIcon,
  SmartPhone01Icon,
  CheckmarkCircle01Icon,
  PlusSignIcon,
  Copy01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SectionHeading } from "../_components/section-heading";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getTwoFactorStatus,
  toggleTwoFactor,
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  removePasskey,
  generateTotpSetup,
  verifyTotpSetup,
  disableTotp,
  type TwoFactorStatus,
  type TotpSetupData,
} from "@/lib/two-factor-actions";

export default function SecuritySettingsPage() {
  const [status, setStatus] = React.useState<TwoFactorStatus | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [masterEnabled, setMasterEnabled] = React.useState(false);
  const [isTogglingMaster, setIsTogglingMaster] = React.useState(false);

  // Passkey state
  const [isRegisteringPasskey, setIsRegisteringPasskey] = React.useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = React.useState<string | null>(null);

  // TOTP state
  const [totpSetup, setTotpSetup] = React.useState<TotpSetupData | null>(null);
  const [totpCode, setTotpCode] = React.useState("");
  const [isSettingUpTotp, setIsSettingUpTotp] = React.useState(false);
  const [isVerifyingTotp, setIsVerifyingTotp] = React.useState(false);
  const [isDisablingTotp, setIsDisablingTotp] = React.useState(false);
  const [confirmDisable2FA, setConfirmDisable2FA] = React.useState(false);
  const [confirmDisableTotp, setConfirmDisableTotp] = React.useState(false);
  const [confirmRemovePasskeyId, setConfirmRemovePasskeyId] = React.useState<string | null>(null);

  async function loadStatus() {
    try {
      const data = await getTwoFactorStatus();
      setStatus(data);
      setMasterEnabled(data.enabled);
    } catch {
      toast.error("Failed to load 2FA status");
    } finally {
      setIsLoading(false);
    }
  }

  React.useEffect(() => {
    loadStatus();
  }, []);

  /* ── Master toggle ── */
  async function handleToggleMaster(enabled: boolean) {
    if (!status) return;

    // Disabling 2FA is destructive — confirm first
    if (!enabled) {
      setConfirmDisable2FA(true);
      return;
    }

    setMasterEnabled(enabled);
    setIsTogglingMaster(true);
    try {
      await toggleTwoFactor(enabled);
      await loadStatus();
      toast.success("Two-factor authentication enabled");
    } catch {
      setMasterEnabled(!enabled);
      toast.error("Failed to update 2FA");
    } finally {
      setIsTogglingMaster(false);
    }
  }

  async function confirmDisable2FAAction() {
    setConfirmDisable2FA(false);
    setMasterEnabled(false);
    setIsTogglingMaster(true);
    try {
      await toggleTwoFactor(false);
      await loadStatus();
      toast.success("Two-factor authentication disabled");
    } catch {
      setMasterEnabled(true);
      toast.error("Failed to update 2FA");
    } finally {
      setIsTogglingMaster(false);
    }
  }

  /* ── Passkey registration ── */
  async function handleRegisterPasskey() {
    if (!window.PublicKeyCredential) {
      toast.error("WebAuthn is not supported in this browser");
      return;
    }

    setIsRegisteringPasskey(true);
    try {
      const options = await getPasskeyRegistrationOptions();
      const { startRegistration } = await import("@simplewebauthn/browser");
      const attestation = await startRegistration({ optionsJSON: options });
      const deviceName = `Passkey · ${new Date().toLocaleDateString()}`;
      const verified = await verifyPasskeyRegistration(attestation, deviceName);
      if (verified) {
        toast.success("Passkey registered successfully");
        await loadStatus();
      } else {
        toast.error("Passkey verification failed");
      }
    } catch (e: unknown) {
      const err = e as Error;
      if (err.name !== "NotAllowedError") {
        toast.error("Failed to register passkey");
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  }

  async function handleRemovePasskey(id: string) {
    setRemovingPasskeyId(id);
    try {
      await removePasskey(id);
      await loadStatus();
      toast.success("Passkey removed");
    } catch {
      toast.error("Failed to remove passkey");
    } finally {
      setRemovingPasskeyId(null);
      setConfirmRemovePasskeyId(null);
    }
  }

  /* ── TOTP setup ── */
  async function handleStartTotpSetup() {
    setIsSettingUpTotp(true);
    try {
      const setup = await generateTotpSetup();
      setTotpSetup(setup);
      setTotpCode("");
    } catch {
      toast.error("Failed to generate authenticator setup");
    } finally {
      setIsSettingUpTotp(false);
    }
  }

  async function handleVerifyTotp() {
    if (totpCode.length !== 6) {
      toast.error("Enter a 6-digit code");
      return;
    }
    setIsVerifyingTotp(true);
    try {
      const valid = await verifyTotpSetup(totpCode);
      if (valid) {
        setTotpSetup(null);
        setTotpCode("");
        toast.success("Authenticator app configured");
        await loadStatus();
      } else {
        toast.error("Invalid code — try again");
      }
    } catch {
      toast.error("Verification failed");
    } finally {
      setIsVerifyingTotp(false);
    }
  }

  async function handleDisableTotp() {
    setConfirmDisableTotp(false);
    setIsDisablingTotp(true);
    try {
      await disableTotp();
      await loadStatus();
      toast.success("Authenticator app disabled");
    } catch {
      toast.error("Failed to disable authenticator");
    } finally {
      setIsDisablingTotp(false);
    }
  }

  function handleCopySecret() {
    if (totpSetup?.secret) {
      navigator.clipboard.writeText(totpSetup.secret);
      toast.success("Secret copied to clipboard");
    }
  }

  if (isLoading) {
    return (
      <section className="space-y-10">
        <SectionHeading
          icon={ShieldKeyIcon}
          title="Security"
          description="Protect your account with additional authentication methods."
        />
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            className="size-5 text-muted-foreground animate-spin"
          />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <SectionHeading
        icon={ShieldKeyIcon}
        title="Security"
        description="Protect your account with additional authentication methods."
      />

      {/* ── Master 2FA Toggle ── */}
      <div className="rounded-xl border border-border/40 bg-card px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-foreground/5 border border-border/40">
              <HugeiconsIcon
                icon={ShieldKeyIcon}
                strokeWidth={2}
                className="size-3.5 text-foreground/70"
              />
            </div>
            <div>
              <p className="text-[13px] font-medium text-foreground">
                Two-factor authentication
              </p>
              <p className="text-[11px] text-muted-foreground">
                {masterEnabled
                  ? "Configure your authentication methods below."
                  : "Add an extra layer of security to your account."}
              </p>
            </div>
          </div>
          <Switch
            checked={masterEnabled}
            onCheckedChange={handleToggleMaster}
            disabled={isTogglingMaster}
          />
        </div>
      </div>

      {/* ── When 2FA is OFF — description only ── */}
      {!masterEnabled && (
        <div className="flex flex-col items-center gap-3 py-10 text-center rounded-xl border border-dashed border-border/60">
          <div className="flex size-10 items-center justify-center rounded-xl bg-foreground/5 border border-border/40">
            <HugeiconsIcon
              icon={ShieldKeyIcon}
              strokeWidth={1.6}
              className="size-5 text-foreground/50"
            />
          </div>
          <div className="space-y-1 max-w-sm">
            <p className="text-[13px] font-medium text-foreground">
              Keep your account secure
            </p>
            <p className="text-[12px] text-muted-foreground">
              When enabled, you&apos;ll need to verify your identity with a passkey or authenticator app each time you sign in. Toggle the switch above to get started.
            </p>
          </div>
        </div>
      )}

      {/* ── When 2FA is ON — show passkey + authenticator sections ── */}
      {masterEnabled && (
        <>
          <Separator />

          {/* ── Passkeys ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-foreground/5 border border-border/40">
                  <HugeiconsIcon
                    icon={FingerPrintIcon}
                    strokeWidth={2}
                    className="size-3.5 text-foreground/70"
                  />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-foreground">Passkeys</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Use biometrics, security keys, or your device to sign in.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-[12px]"
                onClick={handleRegisterPasskey}
                disabled={isRegisteringPasskey}
              >
                {isRegisteringPasskey ? (
                  <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3 animate-spin" />
                ) : (
                  <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3" />
                )}
                Add passkey
              </Button>
            </div>

            {(status?.passkeys.length ?? 0) > 0 ? (
              <div className="rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden">
                {status!.passkeys.map((pk) => (
                  <div
                    key={pk.id}
                    className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-foreground/5">
                        <HugeiconsIcon
                          icon={FingerPrintIcon}
                          strokeWidth={2}
                          className="size-3.5 text-foreground/60"
                        />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{pk.device_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Added {new Date(pk.created_at).toLocaleDateString()}
                          {pk.last_used_at
                            ? ` · Last used ${new Date(pk.last_used_at).toLocaleDateString()}`
                            : " · Never used"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[12px] text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmRemovePasskeyId(pk.id)}
                      disabled={removingPasskeyId === pk.id}
                    >
                      {removingPasskeyId === pk.id ? "Removing…" : "Remove"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center rounded-xl border border-dashed border-border/60">
                <div className="flex size-10 items-center justify-center rounded-xl bg-foreground/5 border border-border/40">
                  <HugeiconsIcon
                    icon={FingerPrintIcon}
                    strokeWidth={1.6}
                    className="size-5 text-foreground/50"
                  />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[13px] font-medium text-foreground">No passkeys registered</p>
                  <p className="text-[12px] text-muted-foreground max-w-xs">
                    Passkeys are the most secure way to sign in. They use your device&apos;s biometrics or security key.
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* ── Authenticator App ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-foreground/5 border border-border/40">
                  <HugeiconsIcon
                    icon={SmartPhone01Icon}
                    strokeWidth={2}
                    className="size-3.5 text-foreground/70"
                  />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-foreground">Authenticator App</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Use a TOTP app like Google Authenticator or 1Password.
                  </p>
                </div>
              </div>
            </div>

            {status?.totpConfigured ? (
              <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    strokeWidth={2}
                    className="size-4 text-emerald-500"
                  />
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      Authenticator app enabled
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      You&apos;ll be asked for a verification code when signing in.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[12px] text-destructive hover:text-destructive"
                  onClick={() => setConfirmDisableTotp(true)}
                  disabled={isDisablingTotp}
                >
                  {isDisablingTotp ? "Disabling…" : "Disable"}
                </Button>
              </div>
            ) : totpSetup ? (
              <div className="rounded-xl border border-border/40 bg-card p-5 space-y-5">
                <div className="flex flex-col items-center gap-4">
                  <p className="text-[12px] text-muted-foreground text-center max-w-sm">
                    Scan this QR code with your authenticator app, then enter the 6-digit verification code below.
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={totpSetup.qrDataUrl}
                    alt="TOTP QR Code"
                    width={200}
                    height={200}
                    className="rounded-lg border border-border/40"
                  />
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] font-mono bg-muted/50 px-2.5 py-1.5 rounded-md border border-border/40 select-all">
                      {totpSetup.secret}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0"
                      onClick={handleCopySecret}
                    >
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center gap-3 max-w-xs mx-auto">
                  <Input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="text-center font-mono text-[15px] tracking-[0.3em]"
                    maxLength={6}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyTotp();
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleVerifyTotp}
                    disabled={isVerifyingTotp || totpCode.length !== 6}
                    className="shrink-0"
                  >
                    {isVerifyingTotp ? "Verifying…" : "Verify"}
                  </Button>
                </div>

                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[12px] text-muted-foreground"
                    onClick={() => {
                      setTotpSetup(null);
                      setTotpCode("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center rounded-xl border border-dashed border-border/60">
                <div className="flex size-10 items-center justify-center rounded-xl bg-foreground/5 border border-border/40">
                  <HugeiconsIcon
                    icon={SmartPhone01Icon}
                    strokeWidth={1.6}
                    className="size-5 text-foreground/50"
                  />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[13px] font-medium text-foreground">Not configured</p>
                  <p className="text-[12px] text-muted-foreground max-w-xs">
                    Add an extra layer of security by requiring a time-based code from your authenticator app.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 mt-1"
                  onClick={handleStartTotpSetup}
                  disabled={isSettingUpTotp}
                >
                  {isSettingUpTotp ? (
                    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3.5 animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={SmartPhone01Icon} strokeWidth={2} className="size-3.5" />
                  )}
                  Set up authenticator
                </Button>
              </div>
            )}
          </div>

          {/* ── Status summary ── */}
          <div className="rounded-xl border border-border/40 bg-card p-4">
            <p className="text-[12px] font-medium text-muted-foreground mb-3">
              Authentication methods
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-foreground">Passkeys</span>
                {(status?.passkeys.length ?? 0) > 0 ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  >
                    {status!.passkeys.length} registered
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Not set up
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-foreground">Authenticator app</span>
                {status?.totpConfigured ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  >
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Not set up
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Confirmation dialogs */}
      <AlertDialog open={confirmDisable2FA} onOpenChange={setConfirmDisable2FA}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all registered passkeys and disable your authenticator app. Your account will only be protected by your GitHub login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisable2FAAction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisableTotp} onOpenChange={setConfirmDisableTotp}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable authenticator app?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer be able to use your authenticator app to verify your identity. Make sure you have another authentication method configured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableTotp}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRemovePasskeyId} onOpenChange={(open) => !open && setConfirmRemovePasskeyId(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              This passkey will be permanently removed. You won&apos;t be able to use it to sign in anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemovePasskeyId) handleRemovePasskey(confirmRemovePasskeyId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
