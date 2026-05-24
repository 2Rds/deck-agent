"use client";

import { useState } from "react";

type Props = {
  deckId: string;
  privateToken: string;
  initialPublicUrl: string | null;
};

export function ShareButton({ deckId, privateToken, initialPublicUrl }: Props) {
  const [publicUrl, setPublicUrl] = useState(initialPublicUrl);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${deckId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ privateToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `share failed (${res.status})`);
      }
      const { publicUrl } = (await res.json()) as { publicUrl: string };
      setPublicUrl(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "share failed");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!publicUrl) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
        >
          {loading ? "Generating…" : "Share this report"}
        </button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={copy}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
      >
        {copied ? "Copied!" : "Copy share link"}
      </button>
      <span className="text-xs text-neutral-500">Personal context hidden</span>
    </div>
  );
}
