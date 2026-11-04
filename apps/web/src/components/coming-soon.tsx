import { PageHeader } from './ui';

export function ComingSoon({ title, sprint, items }: { title: string; sprint: string; items: string[] }) {
  return (
    <>
      <PageHeader title={title} subtitle={`Planned for ${sprint} in the delivery roadmap.`} />
      <div className="card max-w-2xl p-6">
        <span className="label">What this area will do</span>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </div>
    </>
  );
}
