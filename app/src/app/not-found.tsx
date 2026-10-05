import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      {/* Illustration slot: app/public/illustrations/not-found.svg */}
      <Image
        src="/illustrations/not-found.svg"
        alt=""
        width={640}
        height={480}
        unoptimized
        className="h-auto w-64"
      />
      <h1 className="font-stencil text-4xl uppercase">Lost at sea</h1>
      <p className="text-ink-muted">We couldn&apos;t find that page.</p>
      <Link href="/" className="font-semibold text-accent underline">
        Back to the harbour
      </Link>
    </main>
  );
}
