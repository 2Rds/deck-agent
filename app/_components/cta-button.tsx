"use client";

import { useState } from "react";

type Props = {
  priceLabel: string;
  className?: string;
  children?: React.ReactNode;
};

export function CtaButton({ priceLabel, className, children }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `checkout failed (${res.status})`);
      }
      const { url } = await res.json();
      if (!url) throw new Error("no checkout URL returned");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={start}
        disabled={loading}
        className={
          className ??
          "inline-flex items-center justify-center rounded-md bg-neutral-900 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {loading ? (
          "Redirecting to Stripe…"
        ) : (
          <>
            {children ?? "Get Your Red Team"} <span className="ml-2">— {priceLabel}</span>
          </>
        )}
      </button>
      {error && (
        <span className="text-sm text-red-700">
          {error}. Email support if this keeps happening.
        </span>
      )}
    </div>
  );
}
