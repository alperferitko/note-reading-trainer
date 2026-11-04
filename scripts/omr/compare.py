"""Compare OMR MusicXML output against the hand-encoded reference (evaluation only).

usage: python compare.py <omr.musicxml> <reference.json> [label]

Voice separation (reference-free, applied to the OMR output before any comparison):
  * staff = (part, staff) pair; the first staff carries S/A, the second T/B.
  * on each staff, notes are grouped by onset (computed from OMR durations, <backup>, <forward>, <chord/>).
  * a group of 2+ notes: highest -> upper voice, lowest -> lower voice, any middle notes -> 'extra'.
  * a single note: if another note on the staff is still sounding, it goes to the opposite side of that
    sustained note (above -> upper, below -> lower); if nothing is sounding it is treated as a shared
    (unison) notehead and given to both voices.
Alignment: per voice, per bar (OMR measure i <-> reference bar i), edit-distance alignment where a
substitution is allowed; plus a bar-agnostic whole-voice alignment for a barline-robust figure.
"""
import json, sys, xml.etree.ElementTree as ET
from collections import defaultdict

STEPS = 'CDEFGAB'


def midi(n):
    return (n['octave'] + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][STEPS.index(n['step'])] + n['alter']


def name(n):
    if n is None:
        return '-'
    acc = {1: '#', -1: 'b', 0: '', 2: '##', -2: 'bb'}.get(n['alter'], '?')
    return f"{n['step']}{acc}{n['octave']}@{n['beats']:g}"


def parse(path):
    root = ET.parse(path).getroot()
    if root.tag.endswith('score-timewise'):
        raise SystemExit('timewise not supported')
    info = {'parts': [], 'measures_per_part': [], 'barlines': [], 'keys': set(), 'times': set(), 'clefs': [], 'wrapped_forwards': 0, 'segments': []}
    staves = defaultdict(lambda: defaultdict(list))  # staffkey -> measure index -> notes
    parts = root.findall('part')
    single_staff = len(parts) == 1 and all((m.findtext('attributes/staves') or '1') == '1' for m in parts[0].findall('measure'))
    seg_measure = {}  # staff -> (last raw measure index, running measure number on that staff)
    current_clef = None
    for pi, part in enumerate(parts):
        measures = part.findall('measure')
        info['parts'].append(part.get('id'))
        info['measures_per_part'].append(len(measures))
        divisions = 1
        for mi, m in enumerate(measures):
            t = 0
            last_onset = 0
            for el in m:
                if el.tag == 'attributes':
                    d = el.find('divisions')
                    if d is not None:
                        divisions = int(float(d.text))
                    for k in el.findall('key'):
                        f = k.find('fifths')
                        info['keys'].add(f.text if f is not None else '?')
                    for ti in el.findall('time'):
                        info['times'].add(f"{ti.findtext('beats')}/{ti.findtext('beat-type')}")
                    for c in el.findall('clef'):
                        info['clefs'].append((pi, mi + 1, c.get('number', '1'), c.findtext('sign'), c.findtext('line')))
                        if single_staff:
                            current_clef = c.findtext('sign')
                            info['segments'].append((mi + 1, current_clef))
                elif el.tag == 'backup':
                    t -= int(float(el.findtext('duration')))
                elif el.tag == 'forward':
                    fd = int(float(el.findtext('duration')))
                    if fd > 32767:  # oemer writes negative offsets as unsigned 16-bit
                        fd -= 65536; info['wrapped_forwards'] += 1
                    t += fd
                elif el.tag == 'barline':
                    info['barlines'].append((pi, mi + 1, el.get('location', 'right'), el.findtext('bar-style')))
                elif el.tag == 'note':
                    grace = el.find('grace') is not None
                    dur = 0 if grace else int(float(el.findtext('duration') or 0))
                    is_chord = el.find('chord') is not None
                    onset = last_onset if is_chord else t
                    staff = el.findtext('staff') or '1'
                    if single_staff and current_clef in ('G', 'F'):
                        staff = 'treble' if current_clef == 'G' else 'bass'
                    voice = el.findtext('voice') or '1'
                    p = el.find('pitch')
                    n = {'measure': mi + 1, 'onset': onset / divisions, 'beats': dur / divisions,
                         'staff_key': (pi, staff), 'xml_voice': voice, 'rest': el.find('rest') is not None,
                         'grace': grace, 'chord': is_chord, 'type': el.findtext('type')}
                    if p is not None:
                        n.update(step=p.findtext('step'), alter=int(float(p.findtext('alter') or 0)),
                                 octave=int(p.findtext('octave')))
                    acc = el.findtext('accidental')
                    n['accidental_sign'] = acc
                    if single_staff:
                        key = (pi, staff)
                        if key not in seg_measure or seg_measure[key][0] != mi:
                            seg_measure[key] = (mi, (seg_measure.get(key, (None, 0))[1]) + 1)
                        n['measure'] = seg_measure[key][1]; n['omr_measure_index'] = mi + 1
                    staves[(pi, staff)][n['measure']].append(n)
                    if not is_chord:
                        last_onset = t
                        t += dur
    return info, staves


def separate(staves):
    """Return {voice_index_on_staff: ...} as {'upper'/'lower': {measure: [notes]}} per staff key."""
    out = {}
    stats = {'shared_single': 0, 'middle_extra': 0, 'rests': 0, 'grace': 0}
    for sk, measures in staves.items():
        up, lo, ex = defaultdict(list), defaultdict(list), defaultdict(list)
        for mi, notes in measures.items():
            pitched = [n for n in notes if not n['rest'] and not n['grace'] and 'step' in n]
            stats['rests'] += sum(1 for n in notes if n['rest'])
            stats['grace'] += sum(1 for n in notes if n['grace'])
            groups = defaultdict(list)
            for n in pitched:
                groups[round(n['onset'], 4)].append(n)
            for on in sorted(groups):
                g = sorted(groups[on], key=midi, reverse=True)
                if len(g) >= 2:
                    up[mi].append(g[0]); lo[mi].append(g[-1])
                    for x in g[1:-1]:
                        ex[mi].append(x); stats['middle_extra'] += 1
                else:
                    n = g[0]
                    sounding = [x for x in pitched if x['onset'] < on - 1e-6 and x['onset'] + x['beats'] > on + 1e-6]
                    if sounding:
                        s = max(sounding, key=lambda x: x['onset'])
                        (lo if midi(s) > midi(n) else up)[mi].append(n)
                    else:
                        up[mi].append(n); lo[mi].append(n); stats['shared_single'] += 1
        out[sk] = {'upper': up, 'lower': lo, 'extra': ex}
    return out, stats


def align(ref, got):
    """Edit-distance alignment. Cost: 0 exact, 0.5 duration-only, 0.75 same-step, 1 other sub, 1 indel."""
    def cost(a, b):
        if midi(a) == midi(b) and a['step'] == b['step']:
            return 0 if abs(a['beats'] - b['beats']) < 1e-6 else 0.5
        if a['step'] == b['step']:
            return 0.75
        return 1.0
    R, G = len(ref), len(got)
    D = [[0.0] * (G + 1) for _ in range(R + 1)]
    for i in range(1, R + 1): D[i][0] = i
    for j in range(1, G + 1): D[0][j] = j
    for i in range(1, R + 1):
        for j in range(1, G + 1):
            D[i][j] = min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + cost(ref[i - 1], got[j - 1]) * 1.5)
    pairs, i, j = [], R, G
    while i > 0 or j > 0:
        if i > 0 and j > 0 and abs(D[i][j] - (D[i - 1][j - 1] + cost(ref[i - 1], got[j - 1]) * 1.5)) < 1e-9:
            pairs.append((ref[i - 1], got[j - 1])); i -= 1; j -= 1
        elif i > 0 and abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9:
            pairs.append((ref[i - 1], None)); i -= 1
        else:
            pairs.append((None, got[j - 1])); j -= 1
    return pairs[::-1]


def classify(pairs, counts, errors, voice, bar_of):
    for r, g in pairs:
        if r is None:
            counts['extra'] += 1
            errors.append((g['measure'], voice, 'extra', '-', name(g)))
            continue
        counts['ref'] += 1
        if g is None:
            counts['missing'] += 1
            errors.append((bar_of(r), voice, 'missing', name(r), '-'))
            continue
        counts['matched'] += 1
        pitch_ok = r['step'] == g['step'] and r['alter'] == g['alter'] and r['octave'] == g['octave']
        dur_ok = abs(r['beats'] - g['beats']) < 1e-6
        if pitch_ok: counts['pitch_ok'] += 1
        if dur_ok: counts['dur_ok'] += 1
        if pitch_ok and dur_ok: counts['exact'] += 1
        kinds = []
        if not pitch_ok:
            if r['step'] == g['step'] and r['alter'] == g['alter']:
                counts['octave_err'] += 1; kinds.append('octave')
            elif r['step'] == g['step'] and r['octave'] == g['octave']:
                counts['accidental_err'] += 1; kinds.append('accidental')
            else:
                counts['pitch_err'] += 1; kinds.append('pitch')
        if not dur_ok:
            counts['dur_err'] += 1; kinds.append('duration')
        if kinds:
            errors.append((bar_of(r), voice, '+'.join(kinds), name(r), name(g)))


def main():
    omr_path, ref_path = sys.argv[1], sys.argv[2]
    label = sys.argv[3] if len(sys.argv) > 3 else omr_path
    assume_g = '--assume-g-major' in sys.argv  # DIAGNOSTIC ONLY: counterfactual "key signature had been read"
    ref = json.load(open(ref_path))
    info, staves = parse(omr_path)
    if assume_g:
        label += ' [DIAGNOSTIC: OMR F with no printed accidental re-read as F# (fifths=1); NOT the OMR result]'
        for sk in staves:
            for notes in staves[sk].values():
                for n in notes:
                    if n.get('step') == 'F' and n.get('alter') == 0 and not n.get('accidental_sign'):
                        n['alter'] = 1
    sep, sstats = separate(staves)
    staff_keys = sorted(sep, key=lambda k: (k[0], {'treble': '0', 'bass': '1'}.get(k[1], k[1])))
    lines = [f'## {label}', '']
    lines.append(f"parts: {info['parts']}, measures per part: {info['measures_per_part']} (reference: 16)")
    lines.append(f"staves found: {[f'part{p}/staff{s}' for p, s in staff_keys]}")
    lines.append(f"key fifths seen: {sorted(info['keys'])} (ref 1), time: {sorted(info['times'])} (ref 4/4)")
    lines.append(f"clefs: {info['clefs'][:8]}")
    lines.append(f"barline elements: {info['barlines']}")
    lines.append(f"separation stats: {sstats}")
    lines.append(f"single-staff serialisation clef segments (raw measure index, clef): {info['segments']}")
    lines.append(f"wrapped (negative) <forward> durations reinterpreted as signed 16-bit: {info['wrapped_forwards']}")
    for sk in staff_keys:
        lines.append(f"  measures on staff {sk}: {len(staves[sk])} (reference 16)")
    for sk in staff_keys:
        per = {m: len([n for n in notes if not n['rest']]) for m, notes in sorted(staves[sk].items())}
        vs = sorted({n['xml_voice'] for notes in staves[sk].values() for n in notes})
        lines.append(f"  staff {sk}: pitched notes per measure {per}; xml voices used {vs}")
    mapping = {}
    if len(staff_keys) >= 2:
        mapping = {'soprano': (staff_keys[0], 'upper'), 'alto': (staff_keys[0], 'lower'),
                   'tenor': (staff_keys[1], 'upper'), 'bass': (staff_keys[1], 'lower')}
    else:
        lines.append('FEWER THAN 2 STAVES: cannot map SATB')
    total_bar = defaultdict(int); total_seq = defaultdict(int)
    errors_bar, errors_seq = [], []
    per_voice = {}
    nmeas = max(info['measures_per_part'] or [0])
    for voice, refbars in ref.items():
        if voice not in mapping:
            continue
        sk, side = mapping[voice]
        got = sep[sk][side]
        c = defaultdict(int)
        for b in range(1, max(16, nmeas) + 1):
            r = refbars[b - 1] if b <= 16 else []
            g = got.get(b, [])
            classify(align(r, g), c, errors_bar, voice, lambda n: n['bar'])
        for k, v in c.items(): total_bar[k] += v
        # bar-agnostic
        rs = [n for bar in refbars for n in bar]
        gs = [n for b in sorted(got) for n in got[b]]
        c2 = defaultdict(int)
        classify(align(rs, gs), c2, errors_seq, voice, lambda n: n['bar'])
        for k, v in c2.items(): total_seq[k] += v
        per_voice[voice] = (sum(len(x) for x in refbars), len(gs), dict(c), dict(c2))
    lines.append('')
    lines.append('| voice | ref notes | OMR notes (after separation) | exact (pitch+dur) per-bar | pitch ok | dur ok | octave err | accidental err | other pitch err | missing | extra | exact, bar-agnostic |')
    lines.append('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for v, (rn, gn, c, c2) in per_voice.items():
        lines.append(f"| {v} | {rn} | {gn} | {c.get('exact',0)} | {c.get('pitch_ok',0)} | {c.get('dur_ok',0)} | {c.get('octave_err',0)} | {c.get('accidental_err',0)} | {c.get('pitch_err',0)} | {c.get('missing',0)} | {c.get('extra',0)} | {c2.get('exact',0)} |")
    R = total_bar['ref'] or 1
    lines.append('')
    lines.append(f"TOTAL per-bar: ref {total_bar['ref']}, exact {total_bar['exact']} ({100*total_bar['exact']/R:.1f}%), "
                 f"pitch-correct {total_bar['pitch_ok']} ({100*total_bar['pitch_ok']/R:.1f}%), "
                 f"duration-correct {total_bar['dur_ok']} ({100*total_bar['dur_ok']/R:.1f}%), "
                 f"missing {total_bar['missing']}, extra {total_bar['extra']}, octave {total_bar['octave_err']}, "
                 f"accidental {total_bar['accidental_err']}, other pitch {total_bar['pitch_err']}, duration {total_bar['dur_err']}")
    R2 = total_seq['ref'] or 1
    lines.append(f"TOTAL bar-agnostic: exact {total_seq['exact']} ({100*total_seq['exact']/R2:.1f}%), "
                 f"pitch-correct {total_seq['pitch_ok']} ({100*total_seq['pitch_ok']/R2:.1f}%), missing {total_seq['missing']}, extra {total_seq['extra']}")
    # accidental checks of interest
    lines.append('')
    lines.append('Accidental spot checks (OMR notes in the expected bar on the expected staff):')
    for bar, voice, want in [(12, 'alto', ('C', 1, 4)), (11, 'bass', ('D', 1, 3)), (13, 'tenor', ('F', 0, 4)), (13, 'bass', ('F', 0, 3))]:
        if voice not in mapping: continue
        sk, side = mapping[voice]
        allm = [n for n in staves[sk].get(bar, []) if 'step' in n]
        hit = [name(n) + (f"[sign={n['accidental_sign']}]" if n['accidental_sign'] else '') for n in allm if n['step'] == want[0]]
        lines.append(f"  bar {bar} {voice} expects {want[0]}{['b','','#'][want[1]+1]}{want[2]}: OMR {want[0]}-notes on that staff: {hit or 'none'}")
    lines.append('')
    lines.append('Errors (per-bar alignment): bar | voice | kind | expected | got')
    for e in sorted(errors_bar, key=lambda e: (e[0], ['soprano', 'alto', 'tenor', 'bass'].index(e[1]))):
        lines.append(f"  {e[0]} | {e[1]} | {e[2]} | {e[3]} | {e[4]}")
    print('\n'.join(lines))
    if assume_g:
        return
    json.dump({'label': label, 'per_bar': dict(total_bar), 'bar_agnostic': dict(total_seq),
               'measures': info['measures_per_part'], 'errors': errors_bar},
              open(omr_path + '.eval.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
