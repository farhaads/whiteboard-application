"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "create" | "open";

export function BoardLanding() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [createPassword, setCreatePassword] = useState("");
  const [openBoardId, setOpenBoardId] = useState("");
  const [openPassword, setOpenPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: createPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { boardId?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create board");
        return;
      }
      if (!data.boardId) {
        setError("Invalid response");
        return;
      }
      router.push(`/board/${encodeURIComponent(data.boardId)}/unlock`);
    } finally {
      setLoading(false);
    }
  }

  async function onOpen(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const id = openBoardId.trim();
      if (!id) {
        setError("Board ID is required");
        return;
      }
      const res = await fetch(`/api/board/${encodeURIComponent(id)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: openPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not unlock board");
        return;
      }
      if (!data.ok) {
        setError("Unlock failed");
        return;
      }
      router.push(`/board/${encodeURIComponent(id)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Whiteboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new board or open an existing one with its password.
        </p>

        <div
          className="mt-6 flex gap-0.5 rounded-lg border border-border bg-muted/60 p-1"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            className={cn(
              "flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              tab === "create"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
            onClick={() => {
              setTab("create");
              setError(null);
            }}
          >
            Create board
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "open"}
            className={cn(
              "flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              tab === "open"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
            onClick={() => {
              setTab("open");
              setError(null);
            }}
          >
            Open board
          </button>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {tab === "create" ? (
          <form className="mt-4 space-y-4" onSubmit={onCreate}>
            <div className="space-y-2">
              <label htmlFor="create-password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="create-password"
                type="password"
                autoComplete="new-password"
                required
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="Choose a board password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating…" : "Create board"}
            </Button>
          </form>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={onOpen}>
            <div className="space-y-2">
              <label htmlFor="open-id" className="text-sm font-medium text-foreground">
                Board ID
              </label>
              <input
                id="open-id"
                type="text"
                autoComplete="username"
                required
                value={openBoardId}
                onChange={(e) => setOpenBoardId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 font-mono text-sm text-foreground shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="e.g. a7k2m9xq1"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="open-password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="open-password"
                type="password"
                autoComplete="current-password"
                required
                value={openPassword}
                onChange={(e) => setOpenPassword(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="Board password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Opening…" : "Open board"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
