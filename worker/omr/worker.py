"""NotaNota OMR worker: takes queued recognition jobs, reads the chosen pages and stores MusicXML.

It runs as the Supabase service role, so the key is read from the environment only and never written
anywhere or logged. Logs carry job ids, page counts, durations and error codes; never file content.

    SUPABASE_URL=https://<staging-ref>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=...            (environment only)
    OMR_ENGINE=oemer | audiveris
    OMR_OEMER_PYTHON=<python with oemer installed>        (engine oemer)
    OMR_AUDIVERIS=<path to the Audiveris launcher>         (engine audiveris)
    OMR_PDFTOPPM=pdftoppm                                  (Poppler, for PDF pages)
    python worker/omr/worker.py [--once]

Job rules live in the database (supabase/migrations/202611040001_score_library.sql): one active job per
score, a lease token per attempt, failed attempts go back to the queue until max_attempts, so a retry never
creates a second copy of a score.
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.request, zipfile
import xml.etree.ElementTree as ET

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
ENGINE = os.environ.get('OMR_ENGINE', 'oemer')
PAGE_TIMEOUT = int(os.environ.get('OMR_PAGE_TIMEOUT', '1500'))
LEASE = 1800
MAX_XML = 2 * 1024 * 1024


def log(**event):
    print(json.dumps({'t': round(time.time()), **event}), flush=True)


def call(path, body=None, method='POST', raw=False):
    request = urllib.request.Request(f'{URL}{path}', method=method, data=None if body is None else json.dumps(body).encode(),
                                     headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    return data if raw else json.loads(data or b'null')


def rpc(name, **args):
    return call(f'/rest/v1/rpc/{name}', args)


def pages_of(source, mime, selected, folder):
    """Page images at 300 dpi, in the order the user chose."""
    if mime in ('image/png', 'image/jpeg'):
        return [source]
    pdftoppm = os.environ.get('OMR_PDFTOPPM', 'pdftoppm')
    out = []
    for page in selected or [1]:
        prefix = os.path.join(folder, f'page-{page}')
        subprocess.run([pdftoppm, '-r', '300', '-f', str(page), '-l', str(page), '-png', '-singlefile', source, prefix],
                       check=True, timeout=120, capture_output=True)
        out.append(prefix + '.png')
    return out


def read_oemer(image, folder):
    python = os.environ.get('OMR_OEMER_PYTHON', sys.executable)
    entry = "import sys; from oemer import ete; sys.argv = ['oemer'] + sys.argv[1:]; ete.main()"
    subprocess.run([python, '-c', entry, image, '-o', folder], check=True, timeout=PAGE_TIMEOUT, capture_output=True)
    name = os.path.splitext(os.path.basename(image))[0] + '.musicxml'
    return open(os.path.join(folder, name), encoding='utf-8').read()


def read_audiveris(image, folder):
    launcher = os.environ['OMR_AUDIVERIS']
    subprocess.run([launcher, '-batch', '-export', '-output', folder, '--', image], check=True, timeout=PAGE_TIMEOUT, capture_output=True)
    for root, _, files in os.walk(folder):
        for name in files:
            if name.endswith('.mxl'):
                with zipfile.ZipFile(os.path.join(root, name)) as archive:
                    for member in archive.namelist():
                        if member.endswith('.xml') and not member.startswith('META-INF'):
                            return archive.read(member).decode('utf-8')
    raise RuntimeError('no_output')


ENGINES = {'oemer': (read_oemer, 'oemer 0.1.8'), 'audiveris': (read_audiveris, 'audiveris 5.11.0')}
# What each engine is known to get wrong, measured on our test pages; the app shows these for review.
KNOWN = {
    'oemer': ['voices_not_separated', 'key_signature_may_be_missed', 'tempo_marks_read_as_notes'],
    'audiveris': [],
}


def merge(documents):
    """Pages read one by one become one score: later pages' measures are appended part by part."""
    first = ET.fromstring(documents[0])
    parts = first.findall('part')
    for text in documents[1:]:
        other = ET.fromstring(text).findall('part')
        if len(other) != len(parts):
            raise RuntimeError('page_parts_mismatch')
        for target, source in zip(parts, other):
            offset = len(target.findall('measure'))
            for i, measure in enumerate(source.findall('measure')):
                measure.set('number', str(offset + i + 1))
                target.append(measure)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(first, encoding='unicode')


def run(job):
    job_id, lease = job['jobId'], job['leaseToken']
    read, version = ENGINES[ENGINE]
    started = time.time()
    folder = tempfile.mkdtemp(prefix='omr-')
    try:
        ext = {'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg'}.get(job['mime'])
        if not ext:
            raise RuntimeError('unsupported_type')
        source = os.path.join(folder, 'source' + ext)
        with open(source, 'wb') as handle:
            handle.write(call(f"/storage/v1/object/score-sources/{job['storagePath']}", method='GET', raw=True))
        pages = pages_of(source, job['mime'], job.get('selectedPages'), folder)
        documents = []
        for n, page in enumerate(pages):
            documents.append(read(page, folder))
            rpc('score_job_progress', p_job_id=job_id, p_lease_token=lease, p_progress=min(99, int(100 * (n + 1) / (len(pages) + 1))))
        xml = merge(documents)
        if len(xml.encode()) > MAX_XML:
            raise RuntimeError('result_too_large')
        warnings = [{'code': code, 'source': 'engine'} for code in KNOWN[ENGINE]]
        rpc('score_job_finish', p_job_id=job_id, p_lease_token=lease, p_ok=True, p_musicxml=xml, p_engine=ENGINE,
            p_engine_version=version, p_warnings=warnings, p_error_code=None)
        log(event='job_done', job=job_id, pages=len(pages), seconds=round(time.time() - started, 1))
    except Exception as error:  # every failure ends the attempt; the database decides whether to retry
        code = 'engine_timeout' if isinstance(error, subprocess.TimeoutExpired) else \
            'download_failed' if isinstance(error, urllib.error.URLError) else \
            str(error) if str(error) in ('unsupported_type', 'no_output', 'page_parts_mismatch', 'result_too_large') else 'engine_failed'
        try:
            rpc('score_job_finish', p_job_id=job_id, p_lease_token=lease, p_ok=False, p_musicxml=None, p_engine=None,
                p_engine_version=None, p_warnings=None, p_error_code=code)
        except Exception:
            pass  # the lease expires and the job is reclaimed
        log(event='job_failed', job=job_id, code=code, seconds=round(time.time() - started, 1))
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def main():
    if not URL.startswith('https://') or not KEY or ENGINE not in ENGINES:
        sys.exit('Set SUPABASE_URL (https), SUPABASE_SERVICE_ROLE_KEY and OMR_ENGINE (oemer|audiveris).')
    once = '--once' in sys.argv
    log(event='worker_start', engine=ENGINE)
    while True:
        job = rpc('score_job_claim', p_lease_seconds=LEASE)
        if job and job.get('status') == 'claimed':
            run(job)
        elif once:
            return
        else:
            time.sleep(10)
        if once:
            return


if __name__ == '__main__':
    main()
