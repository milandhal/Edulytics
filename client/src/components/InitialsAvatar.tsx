type AvatarTone = 'primary' | 'secondary' | 'green' | 'amber' | 'indigo' | 'rose' | 'cyan';
type AvatarSize = 'sm' | 'md' | 'lg';

const toneClasses: Record<AvatarTone, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  rose: 'bg-rose-100 text-rose-700',
  cyan: 'bg-cyan-100 text-cyan-700',
};

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-10 w-10 text-sm',
};

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .slice(-2)
    .join('')
    .toUpperCase();
}

function pickTone(seed: string) {
  const tones: AvatarTone[] = ['primary', 'secondary', 'green', 'amber', 'indigo', 'rose', 'cyan'];
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[hash % tones.length];
}

export function InitialsAvatar({
  name,
  size = 'md',
  tone,
  className = '',
}: {
  name: string;
  size?: AvatarSize;
  tone?: AvatarTone;
  className?: string;
}) {
  const resolvedTone = tone ?? pickTone(name);

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-bold ${sizeClasses[size]} ${toneClasses[resolvedTone]} ${className}`.trim()}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}
