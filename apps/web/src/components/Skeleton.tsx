// First load: grey blocks shaped like the real cards, so nothing jumps when data arrives.
const block = 'rounded-lg bg-[#E6ECF5]';
const card = 'flex flex-col rounded-2xl border border-line bg-white';

export function Skeleton({ failing }: { failing: boolean }) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading sale"
      data-testid="skeleton"
      className="grid gap-4 p-5 md:grid-cols-2 md:gap-10 md:p-12"
    >
      <section className={`${card} animate-pulse gap-6 p-3.5 motion-reduce:animate-none md:p-8`}>
        <div className={`${block} h-21 md:h-auto md:min-h-90 md:grow`} />
        <div className="flex flex-col gap-3">
          <div className={`${block} h-3 w-30`} />
          <div className={`${block} h-9 w-4/5`} />
          <div className={`${block} h-6.5 w-45`} />
        </div>
      </section>
      <section className="flex animate-pulse flex-col gap-4 motion-reduce:animate-none md:gap-5">
        <div className={`${card} gap-5 p-5 md:px-8 md:py-7`}>
          <div className={`${block} h-8 w-28 rounded-full`} />
          <div className={`${block} h-3.5 w-18`} />
          <div className={`${block} h-14 w-3/4`} />
          <div className={`${block} h-3.5 w-35`} />
          <div className={`${block} h-2.5 rounded-full`} />
        </div>
        <div className={`${card} gap-3.5 p-5 md:px-8 md:py-7`}>
          <div className={`${block} h-3.5 w-38`} />
          <div className={`${block} h-13 rounded-xl`} />
        </div>
      </section>
      {/* Only if the first load failed: say why the page is still grey. */}
      {failing && (
        <p role="status" className="text-sm text-muted md:col-span-2">
          Cannot reach the sale right now. Retrying…
        </p>
      )}
    </main>
  );
}
