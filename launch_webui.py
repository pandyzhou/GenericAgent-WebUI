import os
import subprocess
import sys
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, 'webui', 'backend', 'server.py')
FRONTEND = os.path.join(ROOT, 'webui', 'frontend')


def main():
    backend_proc = subprocess.Popen([sys.executable, BACKEND], cwd=ROOT)
    try:
        time.sleep(1.5)
        webbrowser.open('http://127.0.0.1:18765')
        print('GA WebUI backend started at http://127.0.0.1:18765')
        backend_proc.wait()
    finally:
        if backend_proc.poll() is None:
            backend_proc.kill()


if __name__ == '__main__':
    main()
