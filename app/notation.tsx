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

/** One written note on a staff whose bottom line is at `base`; ledger lines are drawn as needed. */
function StaffNote({ base, position, accidental, x }: { base: number; position: number; accidental: number; x: number }) {
  const y = base - position * 7;
  const ledger = Array.from({ length: 25 }, (_, i) => i * 2 - 20).filter(p => p < 0 ? p >= position : p > 8 && p <= position);
  const stemDown = position >= 4;
  return <g>
    <g stroke="currentColor" strokeWidth="1">{ledger.map(p => <line key={p} x1={x - 22} x2={x + 22} y1={base - p * 7} y2={base - p * 7} />)}</g>
    {accidental !== 0 && <text x={x - 41} y={y + 9} fontSize="30" fill="currentColor">{accidental === 1 ? '♯' : '♭'}</text>}
    <g fill="var(--primary)" stroke="var(--primary)"><ellipse cx={x} cy={y} rx="10" ry="7" transform={`rotate(-15 ${x} ${y})`} /><line x1={stemDown ? x - 10 : x + 10} x2={stemDown ? x - 10 : x + 10} y1={y} y2={y + (stemDown ? 43 : -43)} strokeWidth="2" /></g>
  </g>;
}

/**
 * A piano grand staff: treble above bass, joined by a brace line, with one
 * note in each staff sounding at the same time.
 */
export function GrandStaff({ treble, bass, label }: { treble: { position: number; accidental?: number }; bass: { position: number; accidental?: number }; label: string }) {
  const trebleBase = 120;
  const bassBase = 250;
  return <svg className="music-staff music-staff--grand" role="img" aria-label={label} viewBox="0 0 480 300">
    <g stroke="currentColor" strokeWidth="1">
      {[0,1,2,3,4].map(i => <line key={`t${i}`} x1="80" x2="455" y1={trebleBase - i * 14} y2={trebleBase - i * 14} />)}
      {[0,1,2,3,4].map(i => <line key={`b${i}`} x1="80" x2="455" y1={bassBase - i * 14} y2={bassBase - i * 14} />)}
      <line x1="80" x2="80" y1={trebleBase - 56} y2={bassBase} strokeWidth="2" />
      <line x1="455" x2="455" y1={trebleBase - 56} y2={bassBase} />
    </g>
    <path d={`M 70 ${trebleBase - 56} C 56 ${trebleBase - 10}, 72 ${trebleBase + 24}, 60 ${(trebleBase + bassBase - 56) / 2} C 72 ${bassBase - 80}, 56 ${bassBase - 46}, 70 ${bassBase}`} fill="none" stroke="currentColor" strokeWidth="3" />
    <text className="music-clef" x="86" y={trebleBase + 14} fontSize="90">𝄞</text>
    <text className="music-clef" x="86" y={bassBase - 11} fontSize="66">𝄢</text>
    <StaffNote base={trebleBase} position={treble.position} accidental={treble.accidental ?? 0} x={280} />
    <StaffNote base={bassBase} position={bass.position} accidental={bass.accidental ?? 0} x={280} />
  </svg>;
}
