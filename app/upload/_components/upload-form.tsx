"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  StageEnum,
  InstrumentEnum,
  TargetInvestorsEnum,
  normalizeRoundAmount,
} from "@/schemas/questionnaire";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

const FormSchema = z.object({
  stage: StageEnum,
  round_amount_raw: z
    .string()
    .min(1, "Required")
    .refine((v) => normalizeRoundAmount(v) !== null, {
      message: "Could not parse amount. Try formats like 1.5M, 500K, $2,000,000.",
    }),
  instrument: InstrumentEnum,
  // Note: optional radio/text inputs come through react-hook-form as "" rather
  // than undefined. We normalize those in onSubmit before posting so the
  // server sees `undefined` and downstream code (Pass 6 trigger especially)
  // correctly reads them as "not provided".
  target_investors: TargetInvestorsEnum.optional(),
  traction_oneline: z.string().max(100).optional(),
  biggest_worry: z.string().max(300).optional(),
  additional_context: z.string().max(300).optional(),
});

const stripEmpty = <T extends Record<string, unknown>>(values: T): T => {
  const out: Record<string, unknown> = { ...values };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v === "string" && v.trim() === "") {
      delete out[key];
    }
  }
  return out as T;
};

type FormValues = z.infer<typeof FormSchema>;

type Props = {
  sessionId: string;
  customerEmail: string | null;
};

export function UploadForm({ sessionId, customerEmail }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    setFileError(null);
    if (rejected.length > 0) {
      const reasons = rejected[0].errors.map((e) => e.message).join("; ");
      setFileError(reasons);
      return;
    }
    const f = accepted[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setFileError(`File is ${(f.size / 1024 / 1024).toFixed(1)} MB; max is 25 MB.`);
      return;
    }
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setFileError("PDF only. See the home page for how to export from PowerPoint/Keynote/Google Slides.");
      return;
    }
    setFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: MAX_FILE_BYTES,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: "onChange",
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    if (!file) {
      setFileError("Please attach a PDF.");
      return;
    }
    setSubmitting(true);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("session_id", sessionId);
    fd.append("questionnaire", JSON.stringify(stripEmpty(values)));

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: Record<string, string[]> };
          deckId?: string;
        };
        // If validation details are present (server-side Zod failure), surface
        // the first field message instead of opaque "validation failed".
        const fieldDetail = body.details?.fieldErrors
          ? Object.entries(body.details.fieldErrors)
              .map(([k, v]) => `${k}: ${v?.[0] ?? ""}`)
              .filter((s) => s.endsWith(": ") === false)
              .join("; ")
          : null;
        throw new Error(
          fieldDetail
            ? `${body.error ?? "validation failed"} — ${fieldDetail}`
            : (body.error ?? `upload failed (${res.status})`),
        );
      }
      const { deckId } = (await res.json()) as { deckId: string };
      window.location.href = `/processing/${deckId}`;
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "unknown error");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-neutral-900">
      <header className="border-b border-neutral-200 pb-6">
        <h1 className="text-3xl tracking-tight">Upload your deck</h1>
        <p className="mt-2 text-neutral-700">
          PDF only, up to 25 MB. We&rsquo;ll analyze it in under 5 minutes and email
          you the report.
          {customerEmail && (
            <>
              {" "}
              Report will be sent to{" "}
              <span className="font-medium">{customerEmail}</span>.
            </>
          )}
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-8">
        {/* FILE DROPZONE */}
        <section>
          <label className="block text-sm font-medium">Pitch deck (PDF)</label>
          <div
            {...getRootProps()}
            className={`mt-2 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${
              isDragActive
                ? "border-neutral-900 bg-neutral-50"
                : "border-neutral-300 hover:border-neutral-400"
            }`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="mt-1 text-sm text-neutral-600">
                  {(file.size / 1024 / 1024).toFixed(1)} MB — click or drop to replace
                </p>
              </div>
            ) : isDragActive ? (
              <p className="text-neutral-700">Drop the PDF here</p>
            ) : (
              <p className="text-neutral-700">
                Drag a PDF here, or click to select
              </p>
            )}
          </div>
          {fileError && <p className="mt-2 text-sm text-red-700">{fileError}</p>}
        </section>

        {/* Q1 — Stage */}
        <section>
          <label className="block text-sm font-medium">
            What stage are you raising?
          </label>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {StageEnum.options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-neutral-200 px-3 py-2 hover:border-neutral-400"
              >
                <input
                  type="radio"
                  value={opt}
                  {...register("stage")}
                  className="h-4 w-4"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          {errors.stage && (
            <p className="mt-2 text-sm text-red-700">{errors.stage.message}</p>
          )}
        </section>

        {/* Q2 — Round details */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="round_amount_raw" className="block text-sm font-medium">
              Round size
            </label>
            <div className="mt-2 flex items-center rounded-md border border-neutral-200 focus-within:border-neutral-400">
              <span className="pl-3 text-neutral-500">$</span>
              <input
                id="round_amount_raw"
                inputMode="text"
                placeholder="1.5M"
                {...register("round_amount_raw")}
                className="w-full bg-transparent px-2 py-2 outline-none"
              />
            </div>
            {errors.round_amount_raw && (
              <p className="mt-2 text-sm text-red-700">
                {errors.round_amount_raw.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="instrument" className="block text-sm font-medium">
              Instrument
            </label>
            <select
              id="instrument"
              {...register("instrument")}
              defaultValue=""
              className="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 focus:border-neutral-400 focus:outline-none"
            >
              <option value="" disabled>
                Select…
              </option>
              {InstrumentEnum.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {errors.instrument && (
              <p className="mt-2 text-sm text-red-700">{errors.instrument.message}</p>
            )}
          </div>
        </section>

        {/* Q3 — Target investors */}
        <section>
          <label className="block text-sm font-medium">
            Who is the deck for?{" "}
            <span className="text-neutral-500">(optional)</span>
          </label>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TargetInvestorsEnum.options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-neutral-200 px-3 py-2 hover:border-neutral-400"
              >
                <input
                  type="radio"
                  value={opt}
                  {...register("target_investors")}
                  className="h-4 w-4"
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Q4 — Traction */}
        <section>
          <label htmlFor="traction_oneline" className="block text-sm font-medium">
            What&rsquo;s your current traction in one line?{" "}
            <span className="text-neutral-500">(optional)</span>
          </label>
          <input
            id="traction_oneline"
            type="text"
            maxLength={100}
            placeholder="$8K MRR, 47 paying customers, 22% MoM growth"
            {...register("traction_oneline")}
            className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-2 focus:border-neutral-400 focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Even if your deck doesn&rsquo;t lead with this, tell us the real numbers.
          </p>
        </section>

        {/* Q5 — Biggest worry */}
        <section>
          <label htmlFor="biggest_worry" className="block text-sm font-medium">
            What objection are you most worried about hearing?{" "}
            <span className="text-neutral-500">(optional)</span>
          </label>
          <textarea
            id="biggest_worry"
            maxLength={300}
            rows={3}
            placeholder="We're worried investors think our market is too small."
            {...register("biggest_worry")}
            className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-2 focus:border-neutral-400 focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            If you answer this, we&rsquo;ll focus our deepest analysis here.
          </p>
        </section>

        {/* Q6 — Anything else */}
        <section>
          <label htmlFor="additional_context" className="block text-sm font-medium">
            Anything else we should know?{" "}
            <span className="text-neutral-500">(optional)</span>
          </label>
          <textarea
            id="additional_context"
            maxLength={300}
            rows={3}
            placeholder="We pivoted last month and the deck still has old positioning in places."
            {...register("additional_context")}
            className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-2 focus:border-neutral-400 focus:outline-none"
          />
        </section>

        <div className="border-t border-neutral-200 pt-6">
          <button
            type="submit"
            disabled={submitting || !file || !isValid}
            className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Uploading…" : "Submit deck"}
          </button>
          {serverError && (
            <p className="mt-3 text-sm text-red-700">{serverError}</p>
          )}
        </div>
      </form>
    </main>
  );
}
