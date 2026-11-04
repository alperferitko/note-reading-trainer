#!/usr/bin/env bash
# Measures Audiveris (AGPL-3.0, official release) on the NotaNota OMR test pages. Evaluation only.
# Run from Windows:  wsl -d Ubuntu-24.04 -- bash /mnt/c/VSC/Notes/scripts/omr/bench-audiveris.sh
# Nothing is installed system-wide: the official .deb is unpacked into ~/omr-bench (it carries its own Java).
set -euo pipefail
VERSION=5.11.0
SHA=f20113aaa33b3149ec8d6a09b2a7963360e65fafd92d69389987a85bbc3ec7a3
REPO=/mnt/c/VSC/Notes
WORK=~/omr-bench
mkdir -p "$WORK" && cd "$WORK"
[ -f a.deb ] || curl -sSL -o a.deb "https://github.com/Audiveris/audiveris/releases/download/$VERSION/Audiveris-$VERSION-ubuntu24.04-x86_64.deb"
echo "$SHA  a.deb" | sha256sum -c -
[ -x x/opt/audiveris/bin/Audiveris ] || { rm -rf x; dpkg-deb -x a.deb x; }
OUT="$REPO/work/omr-bench/audiveris"
mkdir -p "$OUT"
for page in "$REPO"/work/omr-bench/in/*; do
  name=$(basename "${page%.*}")
  rm -rf "$OUT/$name" && mkdir -p "$OUT/$name"
  /usr/bin/time -f "RESULT $name seconds=%e max_rss_kb=%M exit=%x" \
    x/opt/audiveris/bin/Audiveris -batch -export -output "$OUT/$name" -- "$page" > "$OUT/$name/log.txt" 2> "$OUT/$name/time.txt" || true
  tail -1 "$OUT/$name/time.txt"
  # Audiveris writes compressed MusicXML (.mxl); unpack the score file next to it for comparison.
  for mxl in "$OUT/$name"/*.mxl; do [ -f "$mxl" ] && (cd "$OUT/$name" && python3 -c "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);[open(sys.argv[2],'wb').write(z.read(n)) for n in z.namelist() if n.endswith('.xml') and not n.startswith('META-INF')]" "$mxl" "$name.musicxml"); done
done
echo "done: $OUT"
