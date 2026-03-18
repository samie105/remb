"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Key01Icon,
  Delete02Icon,
  Copy01Icon,
  CheckmarkCircle01Icon,
  Loading03Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyInfo,
} from "@/lib/api-keys";
import { addNotification } from "@/components/dashboard/notification-center";
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={copy}
      className="text-muted-foreground hover:text-foreground shrink-0"
    >
      <HugeiconsIcon
        icon={copied ? CheckmarkCircle01Icon : Copy01Icon}
        strokeWidth={2}
        className="size-3.5"
      />
    </Button>
  );
}

export function ApiKeysSection() {
  const [keys, setKeys] = React.useState<ApiKeyInfo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = React.useState<string | null>(null);

  const loadKeys = React.useCallback(async () => {
    try {
      const data = await listApiKeys();
      setKeys(data);
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    const name = newKeyName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const { key, info } = await createApiKey(name);
      setRevealedKey(key);
      setKeys((prev) => [info, ...prev]);
      setNewKeyName("");
      addNotification({
        type: "success",
        title: "API key created",
        message: `Key "${name}" is ready. Copy it now — it won't be shown again.`,
      });
    } catch {
      addNotification({
        type: "error",
        title: "Key creation failed",
        message: "Could not create the API key. Please try again.",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      addNotification({
        type: "info",
        title: "API key revoked",
        message: "The key has been permanently revoked.",
      });
    } catch {
      addNotification({
        type: "error",
        title: "Revoke failed",
        message: "Could not revoke the API key. Please try again.",
      });
    }
  };

  return (
    <Card className="border-border/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={Key01Icon}
            strokeWidth={2}
            className="size-4 text-muted-foreground"
          />
          <CardTitle>API Keys</CardTitle>
        </div>
        <CardDescription>
          Create keys for CLI and API access. Keys are shown once on creation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create key form */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="keyName" className="text-xs sr-only">
              Key Name
            </Label>
            <Input
              id="keyName"
              placeholder="Key name (e.g. dev-laptop)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="h-8"
            />
          </div>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isCreating || !newKeyName.trim()}
            className="gap-1.5"
          >
            {isCreating ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="size-3.5 animate-spin"
              />
            ) : (
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
            )}
            Generate
          </Button>
        </div>

        {/* Revealed key (shown once) */}
        {revealedKey && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
            <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
              Copy this key now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-foreground bg-muted/40 rounded px-2 py-1.5 break-all select-all">
                {revealedKey}
              </code>
              <CopyButton text={revealedKey} />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6"
              onClick={() => setRevealedKey(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Keys list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="size-4 animate-spin text-muted-foreground"
            />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-[13px] text-muted-foreground text-center py-4">
            No API keys yet. Create one to use the CLI.
          </p>
        ) : (
          <div className="space-y-1.5">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/50">
                    <HugeiconsIcon
                      icon={Key01Icon}
                      strokeWidth={2}
                      className="size-3.5 text-muted-foreground"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {k.name}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        remb_...{k.key_preview}
                      </span>
                      {k.last_used_at ? (
                        <span>
                          Used{" "}
                          {new Date(k.last_used_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <Badge
                          variant="outline"
                          className="h-4 text-[9px] px-1.5"
                        >
                          Never used
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => setRevokingKeyId(k.id)}
                  aria-label={`Revoke key ${k.name}`}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Revoke confirmation */}
        <AlertDialog open={!!revokingKeyId} onOpenChange={(open) => !open && setRevokingKeyId(null)}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
              <AlertDialogDescription>
                This key will stop working immediately. Any CLI sessions or integrations using it will lose access. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (revokingKeyId) {
                    handleRevoke(revokingKeyId);
                    setRevokingKeyId(null);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Revoke Key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
