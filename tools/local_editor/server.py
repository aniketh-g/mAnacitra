#!/usr/bin/env python3
"""Optional loopback-only authoring UI; no dependency from the public website."""
import argparse
import hashlib
import json
import os
import secrets
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ASSETS = Path(__file__).resolve().parent
ROOT = ASSETS.parents[1]
DATASETS = {'cities', 'countries', 'rivers'}
LOCK = threading.Lock()
PREVIEW_LOCK = threading.Lock()
MAX_BODY = 4 * 1024 * 1024

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def read_records(root, dataset):
    if dataset not in DATASETS:
        raise ValueError('Unknown dataset')
    path = root / 'data/names' / f'{dataset}.json'
    raw = path.read_bytes()
    return path, raw, json.loads(raw)

def check_record(record):
    if not isinstance(record, dict):
        raise ValueError('A place record must be an object')
    names = record.get('names', [])
    if not isinstance(names, list) or any(not isinstance(n, dict) for n in names):
        raise ValueError('Names must be a list of name records')
    if names and sum(n.get('primary') is True for n in names) != 1:
        raise ValueError('Choose exactly one preferred Sanskrit name')
    def walk(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == 'citations' and isinstance(child, list):
                    if any(isinstance(c, dict) and 'quote' in c for c in child):
                        raise ValueError('Put quotations in attestation.quote, not citations.quote')
                walk(child)
        elif isinstance(value, list):
            for child in value: walk(child)
    walk(record)

def save_record(root, dataset, identifier, record, revision):
    check_record(record)
    if not isinstance(identifier, str) or not identifier.strip() or len(identifier) > 300:
        raise ValueError('Supply a valid record identifier')
    with LOCK:
        path, raw, records = read_records(root, dataset)
        if digest(records.get(identifier)) != revision:
            raise FileExistsError('This record changed on disk. Download your draft, then reload before saving.')
        records[identifier] = record
        encoded = (json.dumps(records, ensure_ascii=False, indent=2) + '\n').encode()
        backup_dir = root / 'build/editor-backups'
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / f'{dataset}-{time.time_ns()}.json'
        backup.write_bytes(raw)
        fd, temp = tempfile.mkstemp(dir=path.parent, prefix='.editor-', suffix='.tmp')
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(encoded); stream.flush(); os.fsync(stream.fileno())
            os.chmod(temp, path.stat().st_mode & 0o777)
            if path.read_bytes() != raw:
                raise FileExistsError('The file changed while saving. Reload before retrying.')
            os.replace(temp, path)
        finally:
            if os.path.exists(temp): os.unlink(temp)
        return {'revision':digest(record), 'backup':str(backup.relative_to(root))}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
    def send(self, code, value, mime='application/json; charset=utf-8'):
        body = json.dumps(value, ensure_ascii=False).encode() if mime.startswith('application/json') else value
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers(); self.wfile.write(body)
    def allowed(self, write=False):
        if self.headers.get('Host') != self.server.authority:
            return False
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.server.authority:
            return False
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            return False
        return not write or secrets.compare_digest(self.headers.get('X-Editor-Token',''), self.server.token)
    def do_GET(self):
        if not self.allowed(): return self.send(403, {'error':'Local editor requests only'})
        url = urlparse(self.path); query = parse_qs(url.query)
        try:
            if url.path == '/api/session': return self.send(200, {'token':self.server.token})
            if url.path == '/api/catalog':
                dataset = query.get('dataset',[''])[0]
                _, _, records = read_records(self.server.root, dataset)
                rows = [{'id':key, 'label':next((n.get('name') for n in record.get('names',[]) if n.get('primary') and n.get('name')), record.get('name_en') or key), 'reference':record.get('name_en','')} for key,record in records.items()]
                return self.send(200, rows)
            if url.path == '/api/record':
                _, _, records = read_records(self.server.root, query.get('dataset',[''])[0])
                record = records.get(query.get('id',[''])[0])
                return self.send(200, {'record':record, 'revision':digest(record)})
            if url.path == '/options.json':
                options = json.loads((ASSETS/'options.json').read_text())
                options['languages'] = json.loads((self.server.root/'data/languages.json').read_text())
                return self.send(200, options)
            files = {'/':('index.html','text/html; charset=utf-8'), '/app.js':('app.js','text/javascript; charset=utf-8'), '/style.css':('style.css','text/css; charset=utf-8'), '/options.json':('options.json','application/octet-stream')}
            if url.path == '/inspector-graph.js': return self.send(200, (self.server.root/'docs/inspector-graph.js').read_bytes(), 'text/javascript; charset=utf-8')
            if url.path == '/font.otf': return self.send(200, (self.server.root/'docs/fonts/Shobhika-Regular.otf').read_bytes(), 'font/otf')
            if url.path not in files: return self.send(404, {'error':'Not found'})
            name, mime = files[url.path]
            return self.send(200, (ASSETS/name).read_bytes(), mime)
        except (ValueError, OSError, KeyError) as error: return self.send(400, {'error':str(error)})
    def do_POST(self):
        if not self.allowed(True): return self.send(403, {'error':'Invalid local editor token or origin'})
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= MAX_BODY: return self.send(413, {'error':'Request too large or empty'})
            if self.headers.get('Content-Type','').split(';')[0] != 'application/json': return self.send(415, {'error':'JSON required'})
            data = json.loads(self.rfile.read(length))
            if self.path == '/api/save':
                return self.send(200, save_record(self.server.root, data['dataset'], data['id'], data['record'], data['revision']))
            if self.path == '/api/preview':
                binary = self.server.root/'build/vidyut/release/manacitra-vidyut'
                if not binary.is_file(): raise ValueError('Run make vidyut in the project first.')
                if not PREVIEW_LOCK.acquire(blocking=False): return self.send(409, {'error':'A preview is already running. Try again shortly.'})
                try:
                    result = subprocess.run([str(binary),'--list'], input=json.dumps(data['request'],ensure_ascii=False), text=True, capture_output=True, timeout=30, cwd=self.server.root)
                    if result.returncode: raise ValueError(result.stderr.strip() or 'No result generated')
                    return self.send(200, json.loads(result.stdout))
                finally: PREVIEW_LOCK.release()
            return self.send(404, {'error':'Not found'})
        except FileExistsError as error: return self.send(409, {'error':str(error)})
        except subprocess.TimeoutExpired: return self.send(408, {'error':'Preview exceeded 30 seconds; simplify the request.'})
        except (ValueError, OSError, KeyError, TypeError) as error: return self.send(400, {'error':str(error)})

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--root',type=Path,default=ROOT,help='Project root (also useful for isolated testing)')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1',args.port), Handler)
    server.root = args.root.resolve(); server.authority = f'127.0.0.1:{server.server_port}'; server.token = secrets.token_urlsafe(32)
    print(f'Local editor: http://{server.authority}/', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
