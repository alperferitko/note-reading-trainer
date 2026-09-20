import type { Clef } from './practice-tools';
export function MusicStaff({ position, accidental = 0, clef = 'treble', label }: { position: number; accidental?: number; clef?: Clef; label: string }) {
  const base = Math.max(118, position * 7 + 56);
  const y = base - position * 7;
  const height = Math.max(192, y + 65);
  const ledger = Array.from({ length: 25 }, (_, i) => i * 2 - 20).filter(p => p < 0 ? p >= position : p > 8 && p <= position);
  return <svg className="music-staff" role="img" aria-label={label} viewBox={`0 0 480 ${height}`}>
    <g stroke="currentColor" strokeWidth="1">{[0,1,2,3,4].map(i=><line key={i} x1="80" x2="455" y1={base-i*14} y2={base-i*14} />)}{ledger.map(p=><line key={p} x1="238" x2="282" y1={base-p*7} y2={base-p*7} />)}</g>
    <text className="music-clef" x="22" y={clef === 'bass' ? base-11 : base+14} fontSize={clef === 'bass' ? 66 : 90}>{clef === 'bass' ? '𝄢' : '𝄞'}</text>
    {accidental !== 0 && <text x="219" y={y+9} fontSize="30">{accidental === 1 ? '♯' : '♭'}</text>}
    <g fill="var(--primary)" stroke="var(--primary)"><ellipse cx="260" cy={y} rx="10" ry="7" transform={`rotate(-15 260 ${y})`} /><line x1={position>=4?250:270} x2={position>=4?250:270} y1={y} y2={y+(position>=4?43:-43)} strokeWidth="2" /></g>
  </svg>;
}
