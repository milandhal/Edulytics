import { Link } from 'react-router-dom';

type DashboardFeatureCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  to: string;
  cta: string;
  icon: string;
  tone?: 'primary' | 'secondary' | 'sky' | 'mint';
};

const toneClasses = {
  primary: {
    shell: 'border border-[#8db9ff] bg-[#cfe2ff] text-[#172033]',
    eyebrow: 'text-[#4a6ea8]',
    description: 'text-[#53657f]',
    bubbleA: 'bg-[#9cc3ff]/35',
    bubbleB: 'bg-[#8db9ff]/25',
    iconGhost: 'text-[#7fb1ff]/30',
    cta: 'bg-white text-[#2f63c8] hover:bg-[#f7fbff]',
    shadow: 'shadow-[#bcd6ff]/70',
  },
  secondary: {
    shell: 'border border-[#7aaef7] bg-[#b9d5fb] text-[#172033]',
    eyebrow: 'text-[#4d79b8]',
    description: 'text-[#53657f]',
    bubbleA: 'bg-[#8fc0ff]/35',
    bubbleB: 'bg-[#7aaef7]/25',
    iconGhost: 'text-[#6ea5f2]/28',
    cta: 'bg-white text-[#3c6fcc] hover:bg-[#f7fbff]',
    shadow: 'shadow-[#c6dcfb]/70',
  },
  sky: {
    shell: 'border border-[#80b5ff] bg-[#a9cdff] text-[#172033]',
    eyebrow: 'text-[#416ea8]',
    description: 'text-[#4f6480]',
    bubbleA: 'bg-[#d8e8ff]/55',
    bubbleB: 'bg-[#94beff]/28',
    iconGhost: 'text-[#dcecff]/55',
    cta: 'bg-[#eaf3ff] text-[#3467c9] hover:bg-white',
    shadow: 'shadow-[#bfd8ff]/70',
  },
  mint: {
    shell: 'border border-[#b9ddd1] bg-[#dff0ea] text-[#172033]',
    eyebrow: 'text-[#5e8f82]',
    description: 'text-[#5f7370]',
    bubbleA: 'bg-white/40',
    bubbleB: 'bg-[#bfded2]/45',
    iconGhost: 'text-[#c8e7dc]/60',
    cta: 'bg-[#eef8f4] text-[#3b7d69] hover:bg-white',
    shadow: 'shadow-[#d5ebe3]/80',
  },
} as const;

export function DashboardFeatureCard({
  eyebrow,
  title,
  description,
  to,
  cta,
  icon,
  tone = 'primary',
}: DashboardFeatureCardProps) {
  const styles = toneClasses[tone];

  return (
    <div className={`relative overflow-hidden rounded-xl p-5 shadow-sm ${styles.shell} ${styles.shadow}`}>
      <div className={`absolute -right-8 -top-8 h-28 w-28 rounded-full ${styles.bubbleA}`} />
      <div className={`absolute -bottom-6 -left-6 h-20 w-20 rounded-full ${styles.bubbleB}`} />
      <span
        className={`material-symbols-outlined pointer-events-none absolute -bottom-4 right-0 text-8xl ${styles.iconGhost}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {icon}
      </span>

      <div className="relative z-10">
        <p className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${styles.eyebrow}`}>{eyebrow}</p>
        <h3 className="mb-1 text-base font-black">{title}</h3>
        <p className={`mb-4 text-xs ${styles.description}`}>{description}</p>
        <Link to={to} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${styles.cta}`}>
          <span className="material-symbols-outlined text-sm">{icon}</span>
          {cta}
        </Link>
      </div>
    </div>
  );
}
