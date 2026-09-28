import { useState } from 'react';
import type { Sale } from '../api';

/** Name, price and image come from GET /api/sale (rule 12: one product, from config). */
export function ProductCard({ product }: { product: Sale['product'] }) {
  return (
    <section
      aria-label="Product"
      className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3.5 md:flex-col md:items-stretch md:gap-6 md:p-8"
    >
      <ProductImage url={product.imageUrl} name={product.name} />
      <div className="flex flex-col gap-1 md:gap-2">
        <span className="text-xs font-bold tracking-[0.08em] text-primary uppercase md:text-[13px]">
          Limited edition
        </span>
        <h1 className="text-xl leading-tight font-extrabold tracking-tight md:text-4xl">
          {product.name}
        </h1>
        <div className="flex items-baseline gap-2 md:gap-3">
          <span className="text-base font-bold md:text-[28px]">{product.price}</span>
          <span className="text-[13px] text-muted md:text-[15px]">Limit 1 per person</span>
        </div>
      </div>
    </section>
  );
}

/** The image is optional. If missing or broken, show a plain placeholder. */
function ProductImage({ url, name }: { url: string; name: string }) {
  const [broken, setBroken] = useState(false);
  const box =
    'size-21 shrink-0 rounded-[10px] md:h-auto md:min-h-90 md:w-full md:grow md:rounded-xl';
  if (!url || broken) {
    return <div role="img" aria-label={name} className={`${box} bg-[#EEF3FD]`} />;
  }
  return (
    <img
      src={url}
      alt={name}
      onError={() => setBroken(true)}
      className={`${box} bg-[#EEF3FD] object-contain`}
    />
  );
}
