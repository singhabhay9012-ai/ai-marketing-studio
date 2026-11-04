import { Suspense } from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-canvas lg:flex">
        <span className="font-mono text-xs tracking-[0.2em] uppercase opacity-70">Marketing Workspace</span>
        <div>
          <p className="font-display text-5xl leading-tight">
            One product photo.
            <br />
            A complete marketing kit.
          </p>
          <p className="mt-6 max-w-md text-canvas/70">
            Brand-aware strategy, channel-ready copy and editable creatives — reviewed by you before anything goes out.
          </p>
        </div>
        <span className="text-xs text-canvas/50">Download first; connect and publish when ready.</span>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Suspense>{children}</Suspense>
        </div>
      </section>
    </main>
  );
}
