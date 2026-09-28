// Spinning ring. motion-reduce:animate-none stops the spin for people who turn off animations.
export function Spinner({ onDark = false, className = 'size-5' }) {
  const colors = onDark ? 'border-white/35 border-t-white' : 'border-[#C9D3E3] border-t-primary';
  return (
    <span
      data-testid="spinner"
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 motion-reduce:animate-none ${colors} ${className}`}
    />
  );
}
