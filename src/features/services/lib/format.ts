export const formatKRW = (won: number): string => `₩${won.toLocaleString('en-US')}`;

export const formatUSD = (won: number, rate: number = 1393): string =>
  `≈ $${Math.round(won / rate).toLocaleString('en-US')}`;

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export function formatKST(time: string): string {
  return `${time} KST`;
}

export function formatDateChip(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(date);
}
