import Image from "next/image";
import Link from "next/link";
import { ClaimsDashboard } from "@/components/claims-dashboard";
import type { ClaimsFile } from "@/lib/claims";
import config from "../../desk.config.json";
import data from "../../data/claims.json";

// Set "logo" in desk.config.json to a file in public/ (e.g. "/logo.svg") to show it in the header.
const logo: string | null = config.logo;

export default function Home() {
  const { label, claims } = data as ClaimsFile;

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 text-lg">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            {logo && (
              <>
                <Image src={logo} alt={config.companyName} width={130} height={30} priority />
                <span className="h-8 w-px bg-border" aria-hidden />
              </>
            )}
            <h1 className="text-4xl">{config.deskName}</h1>
          </div>
          <p className="text-xl">
            Report an issue: email{" "}
            <a
              href={`mailto:${config.intakeEmail}?subject=Credit%20request`}
              className="font-semibold text-primary underline underline-offset-4"
            >
              {config.intakeEmail}
            </a>
          </p>
          <Link href="/prompt" className="w-fit text-xl font-semibold text-primary underline underline-offset-4">
            Build this at your company →
          </Link>
          <p className="w-fit rounded-md bg-status-needs-invoice px-3 py-1 text-base text-black">{label}</p>
        </header>

        <ClaimsDashboard initialClaims={claims} />
      </main>

      <footer className="border-t px-4 py-4 text-center text-base text-muted-foreground">{config.footer}</footer>
    </>
  );
}
