import data from "../../data/vendors.json";

// Sample contacts only: every address is on the reserved .example domain.
const slugByBrand = new Map(data.vendors.map((v) => [v.brand, v.slug]));

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vendor";

export function vendorInbox(brand: string) {
  return data.inboxTemplate.replace("<slug>", slugByBrand.get(brand) ?? slugify(brand));
}

export const emailSubject = (c: { id: string; vendor: string }) =>
  `Credit claim ${c.id} for ${c.vendor}`;
