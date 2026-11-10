export const STATUSES = [
  "new",
  "needs_invoice",
  "vendor_contacted",
  "verified",
  "deducted",
  "rejected",
  "internal",
] as const;
export type Status = (typeof STATUSES)[number];

export const REASONS = [
  "damaged",
  "short",
  "mispick",
  "quality",
  "expired",
  "wrong_item",
  "sales_error",
  "over_ordered",
  "other",
] as const;
export type Reason = (typeof REASONS)[number];

export type HistoryEntry = { at: string; status: Status; note: string };

export type Claim = {
  id: string;
  createdAt: string;
  source: "seed" | "paste" | "email";
  reporter: "warehouse" | "customer" | "other";
  vendor: string;
  itemCode: string | null;
  itemName: string;
  qty: number;
  uom: string;
  reason: Reason;
  recoverable: boolean;
  triageNote: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  customer: string | null;
  unitPrice: number | null;
  creditAmount: number | null;
  status: Status;
  vendorEmailDraft?: string | null;
  intakeLabel?: string;
  history: HistoryEntry[];
};

export type ClaimsFile = { label: string; claims: Claim[] };

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  needs_invoice: "Needs invoice",
  vendor_contacted: "Vendor contacted",
  verified: "Verified",
  deducted: "Deducted",
  rejected: "Rejected",
  internal: "Internal",
};

export const STATUS_STYLE: Record<Status, string> = {
  new: "bg-status-new text-black border-transparent",
  needs_invoice: "bg-status-needs-invoice text-black border-transparent",
  vendor_contacted: "bg-status-contacted text-black border-transparent",
  verified: "bg-status-verified text-status-verified-foreground border-transparent",
  deducted: "bg-primary text-primary-foreground border-transparent",
  rejected: "bg-status-rejected text-black border-transparent",
  internal: "bg-secondary text-secondary-foreground border-transparent",
};

export const REASON_LABEL: Record<Reason, string> = {
  damaged: "Damaged",
  short: "Short",
  mispick: "Mispick",
  quality: "Quality",
  expired: "Short-dated",
  wrong_item: "Wrong item",
  sales_error: "Sales error",
  over_ordered: "Over-ordered",
  other: "Other",
};

export const money = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
