import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { BUILD_PROMPT, NEXT_STEPS } from "@/content/build-prompt";
import config from "../../../desk.config.json";

const logo: string | null = config.logo;

export const metadata: Metadata = {
  title: `Build this at your company · ${config.deskName}`,
  description: "The copy-paste prompt to build a credits desk from your own exports",
};

export default function PromptPage() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 text-lg">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            {logo && (
              <>
                <Image src={logo} alt={config.companyName} width={130} height={30} priority />
                <span className="h-8 w-px bg-border" aria-hidden />
              </>
            )}
            <Link href="/" className="font-heading text-2xl font-semibold underline-offset-4 hover:underline">
              {config.deskName}
            </Link>
          </div>
          <h1 className="text-4xl">Build this at your company</h1>
          <p className="text-xl">
            Open Claude Code in an empty folder, put your three exports in <code>./data</code>, and paste this.
            It builds the same desk you watched today, one deployed step at a time.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <CopyButton text={BUILD_PROMPT} />
          <pre className="whitespace-pre-wrap rounded-xl border bg-card p-5 font-sans text-lg leading-relaxed">
            {BUILD_PROMPT}
          </pre>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-3xl">Three steps to production</h2>
          <ol className="flex flex-col gap-4">
            {NEXT_STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border bg-card p-5">
                <div className="font-heading text-2xl font-semibold">
                  {i + 1}. {s.title}
                </div>
                <p className="mt-1">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="text-xl font-medium">Each of those is one more file.</p>
        </section>
      </main>

      <footer className="border-t px-4 py-4 text-center text-base text-muted-foreground">
        {config.footer}
      </footer>
    </>
  );
}
