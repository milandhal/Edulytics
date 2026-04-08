import type { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
  className?: string;
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <div className={`motion-reveal mx-auto max-w-7xl px-6 py-8 sm:px-8 sm:py-10 ${className}`.trim()}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between ${className}`.trim()}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}
        <h1 className="text-[2.125rem] font-black tracking-[-0.04em] text-on-surface sm:text-[2.625rem] leading-none">
          {title}
        </h1>
        {description ? (
          <div className="mt-3 max-w-4xl text-base text-on-surface-variant sm:text-lg">
            {description}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 lg:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
