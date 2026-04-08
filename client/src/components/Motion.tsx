import type { CSSProperties, ReactNode } from 'react';

export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={`motion-reveal ${className}`.trim()} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function staggerStyle(index: number, step = 36, initialDelay = 0): CSSProperties {
  return {
    animationDelay: `${initialDelay + index * step}ms`,
  };
}
