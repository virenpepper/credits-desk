"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type Claim,
  type Status,
  STATUSES,
  STATUS_LABEL,
  STATUS_STYLE,
  REASON_LABEL,
  money,
} from "@/lib/claims";
import { emailSubject, vendorInbox } from "@/lib/vendors";

type Triage = "all" | "recoverable" | "internal";
type Action = "draft" | "send" | "deduct";

export function ClaimsDashboard({ initialClaims }: { initialClaims: Claim[] }) {
  const [claims, setClaims] = useState(initialClaims);
  const [live, setLive] = useState(true);
  const [view, setView] = useState<"log" | "accounting">("log");
  const [status, setStatus] = useState<Status | "all">("all");
  const [triage, setTriage] = useState<Triage>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/claims", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { claims: Claim[] };
      setClaims(data.claims);
      setLive(true);
    } catch {
      setLive(false); // shown in the header; the next poll retries
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const every = setInterval(refresh, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [refresh]);

  async function act(id: string, action: Action) {
    setBusy(`${id}:${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${id}/${action}`, { method: "POST" });
      const data = (await res.json()) as { claim?: Claim; error?: string };
      if (!res.ok || !data.claim) throw new Error(data.error ?? `Request failed (${res.status})`);
      const updated = data.claim;
      setClaims((cs) => cs.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const sorted = useMemo(
    () => [...claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)),
    [claims],
  );

  const shown = sorted.filter(
    (c) =>
      (status === "all" || c.status === status) &&
      (triage === "all" || (triage === "recoverable") === c.recoverable),
  );

  const recoverable = claims.filter((c) => c.recoverable);
  const internal = claims.filter((c) => !c.recoverable);
  const sum = (cs: Claim[]) => cs.reduce((t, c) => t + (c.creditAmount ?? 0), 0);

  function logged(created: Claim[]) {
    setClaims((cs) => [...created, ...cs.filter((c) => !created.some((n) => n.id === c.id))]);
    setStatus("all");
    setTriage("all");
    setOpenId(created[0]?.id ?? null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {(["log", "accounting"] as const).map((v) => (
          <Button
            key={v}
            size="lg"
            variant={view === v ? "default" : "outline"}
            className="h-12 px-5 text-xl"
            onClick={() => setView(v)}
          >
            {v === "log" ? "Claims log" : "Accounting"}
          </Button>
        ))}
      </div>

      {view === "accounting" ? (
        <AccountingView claims={claims} busy={busy} error={error} onAct={act} />
      ) : (
      <>
      <IntakeBox onLogged={logged} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Claims logged" value={String(claims.length)} sub={live ? "Live" : "Live updates paused"} />
        <Stat
          label="Recoverable from vendors"
          value={money(sum(recoverable))}
          sub={`${recoverable.length} claims`}
          accent
        />
        <Stat label="Our own mistakes" value={money(sum(internal))} sub={`${internal.length} claims`} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "recoverable", "internal"] as const).map((t) => (
            <Button
              key={t}
              size="lg"
              variant={triage === t ? "default" : "outline"}
              className="h-11 px-4 text-lg"
              onClick={() => setTriage(t)}
            >
              {t === "all" ? "All" : t === "recoverable" ? "Recoverable" : "Internal"}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            variant={status === "all" ? "default" : "outline"}
            className="h-11 px-4 text-lg"
            onClick={() => setStatus("all")}
          >
            Any status ({claims.length})
          </Button>
          {STATUSES.map((s) => {
            const n = claims.filter((c) => c.status === s).length;
            if (n === 0) return null;
            return (
              <Button
                key={s}
                size="lg"
                variant={status === s ? "default" : "outline"}
                className="h-11 px-4 text-lg"
                onClick={() => setStatus(s)}
              >
                {STATUS_LABEL[s]} ({n})
              </Button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-lg">
          <thead className="bg-muted text-base text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Claim</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 text-right font-medium">Credit</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <Fragment key={c.id}>
                <tr
                  className="cursor-pointer border-t align-top hover:bg-muted/40"
                  aria-expanded={openId === c.id}
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{c.itemName}</div>
                    <div className="text-base text-muted-foreground">
                      {c.vendor} · {c.qty} {c.uom}
                      {c.invoiceNumber ? ` · ${c.invoiceNumber}` : ""} · {c.id}
                      {c.intakeLabel ? ` · ${c.intakeLabel}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{REASON_LABEL[c.reason]}</div>
                    <div
                      className={
                        c.recoverable
                          ? "text-base font-medium text-primary"
                          : "text-base font-medium text-muted-foreground"
                      }
                    >
                      {c.recoverable ? "Recoverable" : "Internal"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(c.creditAmount)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`h-auto px-3 py-1 text-base ${STATUS_STYLE[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </td>
                </tr>
                {openId === c.id && (
                  <tr className="bg-muted/40">
                    <td colSpan={4} className="px-4 py-4">
                      <ClaimDetail claim={c} busy={busy} error={error} onAct={act} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No claims match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
}

function ClaimDetail({
  claim: c,
  busy,
  error,
  onAct,
}: {
  claim: Claim;
  busy: string | null;
  error: string | null;
  onAct: (id: string, action: Action) => void;
}) {
  const drafting = busy === `${c.id}:draft`;
  const sending = busy === `${c.id}:send`;
  const deducting = busy === `${c.id}:deduct`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-8 gap-y-1 text-base sm:grid-cols-2">
        <div>{c.triageNote}</div>
        <div className="text-muted-foreground">
          Invoice {c.invoiceNumber ?? "missing"}
          {c.invoiceDate ? ` (${c.invoiceDate})` : ""} · {c.customer ?? "No customer"} · unit{" "}
          {money(c.unitPrice)}
        </div>
      </div>

      {c.recoverable && c.status === "needs_invoice" ? (
        <div className="text-base">
          Recoverable, but no invoice line matched. Add the invoice number before contacting the vendor.
        </div>
      ) : c.recoverable ? (
        <div className="flex flex-col gap-3">
          {c.vendorEmailDraft ? (
            <div className="rounded-lg border bg-card p-4 text-base">
              <div className="text-muted-foreground">
                To: {vendorInbox(c.vendor)} (sample contact)
              </div>
              <div className="mb-3 font-medium">Subject: {emailSubject(c)}</div>
              <p className="whitespace-pre-wrap">{c.vendorEmailDraft}</p>
            </div>
          ) : (
            <Button
              size="lg"
              className="h-11 w-fit px-4 text-lg"
              disabled={drafting}
              onClick={(e) => {
                e.stopPropagation();
                onAct(c.id, "draft");
              }}
            >
              {drafting ? "Drafting…" : "Draft vendor email"}
            </Button>
          )}
          {c.vendorEmailDraft && c.status === "new" && (
            <Button
              size="lg"
              className="h-11 w-fit px-4 text-lg"
              disabled={sending}
              onClick={(e) => {
                e.stopPropagation();
                onAct(c.id, "send");
              }}
            >
              {sending ? "Sending…" : "Send to vendor"}
            </Button>
          )}
          {(c.status === "vendor_contacted" || c.status === "verified") && (
            <Button
              size="lg"
              className="h-11 w-fit px-4 text-lg"
              disabled={deducting}
              onClick={(e) => {
                e.stopPropagation();
                onAct(c.id, "deduct");
              }}
            >
              {deducting ? "Saving…" : "Mark deducted"}
            </Button>
          )}
        </div>
      ) : (
        <div className="text-base text-muted-foreground">
          Internal claim: no vendor email. It goes to coaching, not to the vendor.
        </div>
      )}

      {error && busy === null && <div className="text-base text-destructive">{error}</div>}

      <ol className="flex flex-col gap-1 text-base text-muted-foreground">
        {c.history.map((h, i) => (
          <li key={i}>
            {format(new Date(h.at), "MMM d, h:mm a")} · {STATUS_LABEL[h.status]} · {h.note}
          </li>
        ))}
      </ol>
    </div>
  );
}

const OPEN: Status[] = ["new", "needs_invoice", "vendor_contacted", "verified"];
const total = (cs: Claim[]) => cs.reduce((t, c) => t + (c.creditAmount ?? 0), 0);

function AccountingView({
  claims,
  busy,
  error,
  onAct,
}: {
  claims: Claim[];
  busy: string | null;
  error: string | null;
  onAct: (id: string, action: Action) => void;
}) {
  const rec = claims.filter((c) => c.recoverable);
  const own = claims.filter((c) => !c.recoverable);
  const all = total(claims) || 1;
  const recPct = Math.round((total(rec) / all) * 100);

  const vendors = Object.values(
    rec.reduce<Record<string, { vendor: string; n: number; open: number; deducted: number }>>((acc, c) => {
      const v = (acc[c.vendor] ??= { vendor: c.vendor, n: 0, open: 0, deducted: 0 });
      v.n++;
      if (OPEN.includes(c.status)) v.open += c.creditAmount ?? 0;
      if (c.status === "deducted") v.deducted += c.creditAmount ?? 0;
      return acc;
    }, {}),
  ).sort((a, b) => b.open + b.deducted - (a.open + a.deducted));

  const ready = rec.filter((c) => c.status === "vendor_contacted" || c.status === "verified");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-hero-surface p-5 text-hero-foreground">
          <div className="text-lg">Money you can get back from vendors</div>
          <div className="font-heading text-5xl font-semibold tabular-nums text-hero-accent">
            {money(total(rec))}
          </div>
          <div className="text-lg">
            {recPct}% of credits · {rec.length} claims
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="text-lg text-muted-foreground">Money your own mistakes give away</div>
          <div className="font-heading text-5xl font-semibold tabular-nums">{money(total(own))}</div>
          <div className="text-lg text-muted-foreground">
            {100 - recPct}% of credits · {own.length} claims: warehouse, sales and customer coaching
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Open with vendors" value={money(total(rec.filter((c) => OPEN.includes(c.status))))} />
        <Stat label="Deducted" value={money(total(rec.filter((c) => c.status === "deducted")))} accent />
        <Stat label="Rejected" value={money(total(rec.filter((c) => c.status === "rejected")))} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a href="/api/export" className={buttonVariants({ size: "lg", className: "h-11 px-4 text-lg" })}>
          Export CSV for the ERP
        </a>
        <span className="text-base text-muted-foreground">Recoverable claims, one row per claim.</span>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Ready to deduct ({ready.length})</h2>
        {ready.length === 0 ? (
          <p className="text-base text-muted-foreground">
            Nothing yet. Claims land here once the vendor has been contacted.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-lg">
              <tbody>
                {ready.map((c) => (
                  <tr key={c.id} className="border-t first:border-t-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{c.vendor}</div>
                      <div className="text-base text-muted-foreground">
                        {c.itemName} · {c.id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(c.creditAmount)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="lg"
                        className="h-11 px-4 text-lg"
                        disabled={busy === `${c.id}:deduct`}
                        onClick={() => onAct(c.id, "deduct")}
                      >
                        {busy === `${c.id}:deduct` ? "Saving…" : "Mark deducted"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && busy === null && <div className="text-base text-destructive">{error}</div>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">By vendor (recoverable)</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-lg">
              <thead className="bg-muted text-base text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 text-right font-medium">Open</th>
                  <th className="px-4 py-3 text-right font-medium">Deducted</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.vendor} className="border-t">
                    <td className="px-4 py-3">
                      {v.vendor} <span className="text-base text-muted-foreground">({v.n})</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(v.open)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(v.deducted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">By status</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-lg">
              <thead className="bg-muted text-base text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Claims</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {STATUSES.map((s) => {
                  const cs = claims.filter((c) => c.status === s);
                  if (!cs.length) return null;
                  return (
                    <tr key={s} className="border-t">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`h-auto px-3 py-1 text-base ${STATUS_STYLE[s]}`}>
                          {STATUS_LABEL[s]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{cs.length}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(total(cs))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

const MAX_CHARS = 2000;

function IntakeBox({ onLogged }: { onLogged: (claims: Claim[]) => void }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { claims?: Claim[]; ignored?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setSent(text);
      setText("");
      if (data.ignored || !data.claims?.length) {
        setMessage({ ok: true, text: data.message ?? "Not a credit claim, so nothing was logged." });
        return;
      }
      const created = data.claims;
      setMessage({
        ok: true,
        text: `Logged ${created
          .map((c) => `${c.id} (${c.recoverable ? "recoverable" : "internal"}, ${STATUS_LABEL[c.status].toLowerCase()})`)
          .join(", ")}`,
      });
      onLogged(created);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <label htmlFor="intake" className="font-heading text-2xl font-semibold">
        Paste an issue
      </label>
      <Textarea
        id="intake"
        value={text}
        maxLength={MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Got 4 cases of boneless chicken breast Tuesday. Two smelled off when we opened them. Need a credit."
        className="min-h-28 text-lg md:text-lg"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          className="h-11 px-4 text-lg"
          disabled={busy || text.trim().length < 10}
          onClick={submit}
        >
          {busy ? "Reading…" : "Log issue"}
        </Button>
        <span className="text-base text-muted-foreground">
          {text.length}/{MAX_CHARS} · Claude extracts and triages it. The text you paste isn&apos;t stored.
        </span>
      </div>
      {message && (
        <div className={message.ok ? "text-base text-primary" : "text-base text-destructive"}>{message.text}</div>
      )}
      {sent && (
        <details className="text-base text-muted-foreground">
          <summary className="cursor-pointer">What you pasted</summary>
          <p className="mt-2 whitespace-pre-wrap">{sent}</p>
        </details>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-base text-muted-foreground">{label}</div>
      <div className={`font-heading text-3xl font-semibold tabular-nums ${accent ? "text-accent-strong" : ""}`}>
        {value}
      </div>
      {sub && <div className="text-base text-muted-foreground">{sub}</div>}
    </div>
  );
}
