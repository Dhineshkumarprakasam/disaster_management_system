import os
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.request
import urllib.error
import socketserver
import threading
import socket
from http.cookies import CookieError, SimpleCookie
from urllib.parse import urlsplit, urlunsplit

BACKENDS = [
    backend.strip().rstrip("/")
    for backend in os.getenv(
        "BACKENDS",
        "http://127.0.0.1:3001,http://127.0.0.1:3002"
    ).split(",")
    if backend.strip()
]
if not BACKENDS:
    raise RuntimeError("Set BACKENDS to one or more comma-separated backend URLs.")

# Thread-safe round-robin cursor over currently resolved backend addresses.
backend_index = 0
pool_lock = threading.Lock()


def get_backend_candidates(affinity=None):
    global backend_index
    candidates = []

    for backend in BACKENDS:
        parsed = urlsplit(backend)
        try:
            addresses = socket.getaddrinfo(
                parsed.hostname,
                parsed.port,
                type=socket.SOCK_STREAM
            )
        except socket.gaierror:
            candidates.append((backend, parsed.netloc))
            continue

        seen = set()
        for address in addresses:
            ip_address = address[4][0]
            if ip_address in seen:
                continue
            seen.add(ip_address)
            host = f"[{ip_address}]" if ":" in ip_address else ip_address
            netloc = f"{host}:{parsed.port}" if parsed.port else host
            candidates.append((
                urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment)),
                parsed.netloc
            ))

    if not candidates:
        return []

    if affinity:
        pinned = [
            candidate for candidate in candidates
            if urlsplit(candidate[0]).netloc == affinity
        ]
        if pinned:
            return pinned + [
                candidate for candidate in candidates
                if urlsplit(candidate[0]).netloc != affinity
            ]

    with pool_lock:
        start = backend_index % len(candidates)
        backend_index = (backend_index + 1) % len(candidates)

    return candidates[start:] + candidates[:start]


class LoadBalancerHandler(BaseHTTPRequestHandler):

    def do_proxy(self, method):
        # 1. Read request body (vital for POST requests like disaster form submissions)
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        # 2. Filter headers to pass cleanly to the backend
        headers = {}
        for key, value in self.headers.items():
            if key.lower() not in ['host', 'connection']:
                headers[key] = value

        # Keep a browser on one gateway replica while still failing over if it disappears.
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            affinity = cookie.get('ndms_gateway')
            affinity = affinity.value if affinity else None
        except CookieError:
            affinity = None

        # 3. Resolve replicas and try each one in round-robin order.
        candidates = get_backend_candidates(affinity)
        for target_backend, backend_host in candidates:

            target_url = target_backend + self.path
            headers['Host'] = backend_host

            try:
                # Build the forwarded HTTP request
                req = urllib.request.Request(
                    target_url, 
                    data=body, 
                    headers=headers, 
                    method=method
                )
                
                # Preserve backend 4xx/5xx responses; urllib raises HTTPError for them.
                try:
                    timeout = None if self.path.startswith('/events') else 4
                    response = urllib.request.urlopen(req, timeout=timeout)
                except urllib.error.HTTPError as error:
                    response = error
            except (urllib.error.URLError, socket.timeout, ConnectionRefusedError):
                # Backend failed or timed out — automatically try the next one in line
                continue
            except Exception as e:
                print(f"⚠️ Unexpected error with backend {target_backend}: {e}")
                continue

            try:
                with response:
                    self.send_response(response.status)
                    for header, value in response.headers.items():
                        if header.lower() not in ['transfer-encoding', 'connection']:
                            self.send_header(header, value)
                    if affinity != urlsplit(target_backend).netloc:
                        self.send_header(
                            'Set-Cookie',
                            f"ndms_gateway={urlsplit(target_backend).netloc}; Path=/; HttpOnly; SameSite=Lax"
                        )
                    self.end_headers()

                    # Stream responses so long-lived SSE connections remain usable.
                    while True:
                        chunk = response.read1(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
                return
            except (BrokenPipeError, ConnectionResetError) as e:
                print(f"Client disconnected while proxying {target_backend}: {e}")
                return
            except Exception as e:
                print(f"Unexpected streaming error from backend {target_backend}: {e}")
                return

        # 4. Fallback if ALL backend containers are down
        self.send_response(502)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error": "502 Bad Gateway: All backend instances are currently offline."}')

    # Map standard HTTP verbs to our proxy function
    def do_GET(self):
        self.do_proxy('GET')

    def do_POST(self):
        self.do_proxy('POST')

    def do_PUT(self):
        self.do_proxy('PUT')

    def do_DELETE(self):
        self.do_proxy('DELETE')

    def do_PATCH(self):
        self.do_proxy('PATCH')

    # Suppress default noisy logs to keep terminal clean
    def log_message(self, format, *args):
        return

# Multi-threaded server wrapper to handle hundreds of concurrent users smoothly
class ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == "__main__":
    HOST, PORT = "", int(os.getenv("PORT", "8080"))

    try:
        server = ThreadedHTTPServer((HOST, PORT), LoadBalancerHandler)
        print(f"Load Balancer running on port {PORT}...")
        print(f"Managed Server Pool: {BACKENDS}")
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down load balancer gracefully...")
        server.server_close()