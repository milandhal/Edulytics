export function BrandText({ className = '' }: { className?: string }) {
  return (
    <span
      className={`font-black tracking-tight ${className}`}
      style={{
        background: 'linear-gradient(to right, oklch(48.8% 0.243 264.376), oklch(49.6% 0.265 301.924), oklch(48.8% 0.243 264.376))',
        backgroundSize: '200% auto',
        animation: 'text-gradient-move 4s linear infinite',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      Edulytics
    </span>
  );
}
