"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserCircleIcon,
  GithubIcon,
  Delete02Icon,
  LinkSquare01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGitHubStore } from "@/lib/github-store";
import { SectionHeading } from "../_components/section-heading";

export default function AccountSettingsPage() {
  const { account, isConnected, linkedRepos, connectAccount, disconnectAccount, unlinkRepo } =
    useGitHubStore();

  return (
    <section>
      <SectionHeading
        icon={UserCircleIcon}
        title="Account"
        description="Your identity and connected services."
      />

      {isConnected && account ? (
        <div className="space-y-4">
          {/* Connected user card */}
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card p-4">
            <div className="flex items-center gap-3">
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.avatarUrl}
                  alt={account.username}
                  width={40}
                  height={40}
                  className="size-10 rounded-full ring-2 ring-border/30"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-foreground/6 border border-border/40">
                  <HugeiconsIcon
                    icon={GithubIcon}
                    strokeWidth={1.8}
                    className="size-5 text-foreground/60"
                  />
                </div>
              )}
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {account.username}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="size-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[11px] text-muted-foreground">
                    Connected via GitHub
                    {account.connectedAt &&
                      ` · ${new Date(account.connectedAt).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive text-[12px]"
              onClick={disconnectAccount}
            >
              Disconnect
            </Button>
          </div>

          {/* Linked repos */}
          {linkedRepos.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-muted-foreground flex items-center gap-1.5">
                <HugeiconsIcon
                  icon={LinkSquare01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                Linked Repositories
              </p>
              <div className="rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden">
                {linkedRepos.map((repo) => (
                  <div
                    key={repo.fullName}
                    className="flex items-center justify-between px-4 py-2.5 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground">
                        {repo.fullName}
                      </span>
                      {repo.isPrivate && (
                        <Badge
                          variant="outline"
                          className="h-4 text-[9px] px-1.5"
                        >
                          Private
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        → {repo.projectSlug}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => unlinkRepo(repo.fullName)}
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
            </div>
          )}

          {linkedRepos.length === 0 && (
            <p className="text-[12px] text-muted-foreground text-center py-4">
              No repositories linked yet. Go to{" "}
              <span className="font-medium text-foreground">Projects</span>{" "}
              to import repositories.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-10 text-center rounded-xl border border-dashed border-border/60">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/5 border border-border/40">
            <HugeiconsIcon
              icon={GithubIcon}
              strokeWidth={1.6}
              className="size-6 text-foreground/60"
            />
          </div>
          <div className="space-y-1 max-w-xs">
            <p className="text-[13px] font-medium text-foreground">
              Not connected
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Link your GitHub account to import repositories and enable
              auto-scanning.
            </p>
          </div>
          <Button size="sm" className="gap-2" onClick={connectAccount}>
            <HugeiconsIcon
              icon={GithubIcon}
              strokeWidth={2}
              className="size-4"
            />
            Connect with GitHub
          </Button>
        </div>
      )}
    </section>
  );
}
