"""Serve the complete portable workflow on localhost, reusing a matching server."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from workflow_server import WorkflowHandler
import argparse, json, threading, urllib.request, webbrowser

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port',type=int,default=8797)
parser.add_argument('--no-browser',action='store_true')
args=parser.parse_args()
url=f'http://127.0.0.1:{args.port}/'
try:
    with urllib.request.urlopen(url+'api/session',timeout=2) as response:
        current=json.load(response)
    if Path(current.get('root','')).resolve()!=root.resolve(): raise SystemExit('Port serves a different catalog. Choose --port with a free port.')
except (OSError,ValueError):
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(WorkflowHandler,directory=str(root)))
    print(url,flush=True)
    if not args.no_browser: threading.Timer(.3,lambda:webbrowser.open(url)).start()
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()
else:
    print(url,flush=True)
    if not args.no_browser: webbrowser.open(url)
