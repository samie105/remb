"use server";

import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { generateSecret, generateURI, verify as verifyOtp } from "otplib";
import QRCode from "qrcode";

/* ─── Helpers ─── */

function getRpConfig() {
  const url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return {
    rpID: new URL(url).hostname,
    rpName: "Remb",
    origin: url,
  };
}

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

/* ─── Types ─── */

export interface PasskeyInfo {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface TwoFactorStatus {
  enabled: boolean;
  passkeys: PasskeyInfo[];
  totpConfigured: boolean;
}

export interface TotpSetupData {
  qrDataUrl: string;
  secret: string;
}

/* ─── Read status ─── */

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  const user = await requireUser();
  const db = createAdminClient();

  const [{ data: passkeys }, { data: totp }] = await Promise.all([
    db
      .from("user_passkeys")
      .select("id, device_name, created_at, last_used_at")
      .eq("user_id", user.id)
      .order("created_at"),
    db
      .from("user_totp_secrets")
      .select("verified")
      .eq("user_id", user.id)
      .single(),
  ]);

  return {
    enabled: user.two_factor_enabled,
    passkeys: (passkeys ?? []).map((pk) => ({
      id: pk.id,
      device_name: pk.device_name,
      created_at: pk.created_at,
      last_used_at: pk.last_used_at,
    })),
    totpConfigured: totp?.verified ?? false,
  };
}

/* ─── Master toggle ─── */

export async function toggleTwoFactor(enabled: boolean): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  await db
    .from("users")
    .update({ two_factor_enabled: enabled })
    .eq("id", user.id);
}

/* ─── Passkeys — WebAuthn registration ─── */

export async function getPasskeyRegistrationOptions() {
  const user = await requireUser();
  const db = createAdminClient();
  const { rpID, rpName } = getRpConfig();

  const { data: existingPasskeys } = await db
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", user.id);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.github_login,
    attestationType: "none",
    excludeCredentials: (existingPasskeys ?? []).map((pk) => ({
      id: pk.credential_id,
      transports: pk.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "discouraged",
    },
  });

  // Store challenge in httpOnly cookie (5-minute TTL)
  const cookieStore = await cookies();
  cookieStore.set("webauthn_challenge", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });

  return options;
}

export async function verifyPasskeyRegistration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
  deviceName: string
): Promise<boolean> {
  const user = await requireUser();
  const db = createAdminClient();
  const { rpID, origin } = getRpConfig();

  const cookieStore = await cookies();
  const challenge = cookieStore.get("webauthn_challenge")?.value;
  cookieStore.delete("webauthn_challenge");

  if (!challenge) throw new Error("Registration challenge expired");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) return false;

  const { credential } = verification.registrationInfo;

  await db.from("user_passkeys").insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: (response.response?.transports as string[]) ?? [],
    device_name:
      deviceName || `Passkey · ${new Date().toLocaleDateString()}`,
  });

  return true;
}

/* ─── Passkey removal ─── */

export async function removePasskey(passkeyId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { error } = await db
    .from("user_passkeys")
    .delete()
    .eq("id", passkeyId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  // Auto-disable 2FA if no methods remain
  const status = await getTwoFactorStatus();
  if (status.enabled && status.passkeys.length === 0 && !status.totpConfigured) {
    await db
      .from("users")
      .update({ two_factor_enabled: false })
      .eq("id", user.id);
  }
}

/* ─── TOTP — Authenticator app ─── */

export async function generateTotpSetup(): Promise<TotpSetupData> {
  const user = await requireUser();
  const db = createAdminClient();

  const secret = generateSecret();
  const otpauthUri = generateURI({
    issuer: "Remb",
    label: user.github_login,
    secret,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    width: 200,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });

  // Upsert unverified secret
  await db.from("user_totp_secrets").upsert(
    {
      user_id: user.id,
      secret,
      verified: false,
    },
    { onConflict: "user_id" }
  );

  return { qrDataUrl, secret };
}

export async function verifyTotpSetup(token: string): Promise<boolean> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: totpRecord } = await db
    .from("user_totp_secrets")
    .select("secret")
    .eq("user_id", user.id)
    .single();

  if (!totpRecord) throw new Error("No TOTP setup in progress");

  const result = await verifyOtp({ token, secret: totpRecord.secret });

  if (result.valid) {
    await db
      .from("user_totp_secrets")
      .update({ verified: true })
      .eq("user_id", user.id);
  }

  return result.valid;
}

export async function disableTotp(): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  await db.from("user_totp_secrets").delete().eq("user_id", user.id);

  // Auto-disable 2FA if no methods remain
  const status = await getTwoFactorStatus();
  if (status.enabled && status.passkeys.length === 0 && !status.totpConfigured) {
    await db
      .from("users")
      .update({ two_factor_enabled: false })
      .eq("id", user.id);
  }
}

/* ─── Login-time 2FA verification ─── */

export interface TwoFactorChallenge {
  hasPasskeys: boolean;
  hasTotp: boolean;
}

/** Read pending 2FA cookie and return available methods. */
export async function getTwoFactorChallenge(): Promise<TwoFactorChallenge | null> {
  const cookieStore = await cookies();
  const pendingUserId = cookieStore.get("2fa_pending_user")?.value;
  if (!pendingUserId) return null;

  const db = createAdminClient();

  const [{ data: passkeys }, { data: totp }] = await Promise.all([
    db
      .from("user_passkeys")
      .select("id")
      .eq("user_id", pendingUserId),
    db
      .from("user_totp_secrets")
      .select("verified")
      .eq("user_id", pendingUserId)
      .eq("verified", true)
      .single(),
  ]);

  return {
    hasPasskeys: (passkeys?.length ?? 0) > 0,
    hasTotp: !!totp,
  };
}

/** Generate WebAuthn authentication options for login challenge. */
export async function getPasskeyAuthOptions() {
  const cookieStore = await cookies();
  const pendingUserId = cookieStore.get("2fa_pending_user")?.value;
  if (!pendingUserId) throw new Error("No pending 2FA session");

  const db = createAdminClient();
  const { rpID } = getRpConfig();

  const { data: passkeys } = await db
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", pendingUserId);

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: (passkeys ?? []).map((pk) => ({
      id: pk.credential_id,
      transports: pk.transports as AuthenticatorTransport[],
    })),
    userVerification: "discouraged",
  });

  cookieStore.set("webauthn_challenge", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });

  return options;
}

/** Verify a passkey assertion during login. */
export async function verifyPasskeyAuth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any
): Promise<{ verified: boolean; returnTo: string | null }> {
  const cookieStore = await cookies();
  const pendingUserId = cookieStore.get("2fa_pending_user")?.value;
  if (!pendingUserId) throw new Error("No pending 2FA session");

  const challenge = cookieStore.get("webauthn_challenge")?.value;
  cookieStore.delete("webauthn_challenge");
  if (!challenge) throw new Error("Authentication challenge expired");

  const db = createAdminClient();
  const { rpID, origin } = getRpConfig();

  // Find the credential used
  const { data: passkey } = await db
    .from("user_passkeys")
    .select("credential_id, public_key, counter, transports")
    .eq("user_id", pendingUserId)
    .eq("credential_id", response.id)
    .single();

  if (!passkey) throw new Error("Unknown passkey");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: passkey.credential_id,
      publicKey: Buffer.from(passkey.public_key, "base64url"),
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransport[],
    },
  });

  if (!verification.verified) return { verified: false, returnTo: null };

  // Update counter
  await db
    .from("user_passkeys")
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq("credential_id", passkey.credential_id);

  const returnTo = await complete2faLogin();
  return { verified: true, returnTo };
}

/** Verify a TOTP code during login. */
export async function verifyTotpLogin(token: string): Promise<{ verified: boolean; returnTo: string | null }> {
  const cookieStore = await cookies();
  const pendingUserId = cookieStore.get("2fa_pending_user")?.value;
  if (!pendingUserId) throw new Error("No pending 2FA session");

  const db = createAdminClient();

  const { data: totpRecord } = await db
    .from("user_totp_secrets")
    .select("secret")
    .eq("user_id", pendingUserId)
    .eq("verified", true)
    .single();

  if (!totpRecord) throw new Error("TOTP not configured");

  const result = await verifyOtp({ token, secret: totpRecord.secret });
  if (!result.valid) return { verified: false, returnTo: null };

  const returnTo = await complete2faLogin();
  return { verified: true, returnTo };
}

/** Promote pending 2FA session to a full login. Returns the return-to URL if any. */
async function complete2faLogin(): Promise<string | null> {
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get("2fa_pending_token")?.value;
  if (!pendingToken) throw new Error("No pending token");

  // Promote to full session
  cookieStore.set("gh_token", pendingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  const returnTo = cookieStore.get("2fa_return_to")?.value ?? null;

  // Clean up pending cookies
  cookieStore.delete("2fa_pending_user");
  cookieStore.delete("2fa_pending_token");
  cookieStore.delete("2fa_return_to");

  return returnTo;
}
