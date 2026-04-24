"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BoardUnlockForm({ boardId }: { boardId: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unlock failed");
        return;
      }
      if (!data.ok) {
        setError("Unlock failed");
        return;
      }
      router.push(`/board/${encodeURIComponent(boardId)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Unlock board
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{boardId}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the board password to continue.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="unlock-password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="unlock-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder="Board password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Unlocking…" : "Unlock"}
          </Button>
        </form>
      </div>
    </div>
  );
}
