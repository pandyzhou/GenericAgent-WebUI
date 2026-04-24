from bottle import Bottle, request, response, static_file
import json, os, queue, threading, time, uuid, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from agentmain import GeneraticAgent
from frontends.continue_cmd import list_sessions, handle_frontend_command, reset_conversation, extract_ui_messages

FRONTEND_DIST = os.path.join(ROOT, 'webui', 'frontend', 'dist')

app = Bottle()

agent = GeneraticAgent()
if agent.llmclient is None:
    raise RuntimeError('未配置可用的 LLM，请先配置 mykey.py 或 mykey.json')
threading.Thread(target=agent.run, daemon=True).start()

RUNS = {}
RUN_LOCK = threading.Lock()


def now_ts():
    return int(time.time())


def get_llms():
    return [
        {"index": idx, "name": name, "current": current}
        for idx, name, current in agent.list_llms()
    ]


def clean_text(text):
    return (text or '').replace('\r\n', '\n')


def create_run(prompt):
    run_id = uuid.uuid4().hex
    dq = agent.put_task(prompt, source='user')
    data = {
        'id': run_id,
        'prompt': prompt,
        'queue': dq,
        'created_at': now_ts(),
        'latest': '',
        'done': False,
    }
    with RUN_LOCK:
        RUNS[run_id] = data
    return data


@app.hook('after_request')
def enable_cors():
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'


@app.route('/api/<:re:.*>', method='OPTIONS')
def api_options():
    return ''


@app.get('/api/status')
def api_status():
    return {
        'ok': True,
        'running': bool(agent.is_running),
        'llm_no': agent.llm_no,
        'llm_name': agent.get_llm_name(),
        'llms': get_llms(),
        'history_count': len(getattr(agent, 'history', []) or []),
    }


@app.post('/api/chat')
def api_chat():
    payload = request.json or {}
    prompt = clean_text(payload.get('prompt', '')).strip()
    if not prompt:
        response.status = 400
        return {'ok': False, 'error': 'prompt 不能为空'}
    run = create_run(prompt)
    return {'ok': True, 'run_id': run['id']}


@app.get('/api/runs/<run_id>/events')
def api_run_events(run_id):
    with RUN_LOCK:
        run = RUNS.get(run_id)
    if not run:
        response.status = 404
        return {'ok': False, 'error': 'run 不存在'}

    response.content_type = 'text/event-stream; charset=utf-8'
    response.set_header('Cache-Control', 'no-cache')
    response.set_header('Connection', 'keep-alive')

    def stream():
        yield 'event: ready\ndata: {}\n\n'
        q = run['queue']
        idle = 0
        while True:
            try:
                item = q.get(timeout=1)
                idle = 0
            except queue.Empty:
                idle += 1
                yield 'event: ping\ndata: {}\n\n'
                if run['done'] and idle > 2:
                    break
                continue

            if 'next' in item:
                run['latest'] = item['next']
                data = json.dumps({'content': item['next']}, ensure_ascii=False)
                yield f'event: chunk\ndata: {data}\n\n'
            if 'done' in item:
                run['latest'] = item['done']
                run['done'] = True
                data = json.dumps({'content': item['done']}, ensure_ascii=False)
                yield f'event: done\ndata: {data}\n\n'
                break

    return stream()


@app.post('/api/abort')
def api_abort():
    agent.abort()
    return {'ok': True}


@app.post('/api/new')
def api_new():
    message = reset_conversation(agent)
    return {'ok': True, 'message': message}


@app.post('/api/llm')
def api_switch_llm():
    payload = request.json or {}
    idx = payload.get('index')
    if idx is None:
        response.status = 400
        return {'ok': False, 'error': 'index 不能为空'}
    agent.next_llm(int(idx))
    return {
        'ok': True,
        'llm_no': agent.llm_no,
        'llm_name': agent.get_llm_name(),
        'llms': get_llms(),
    }


@app.get('/api/sessions')
def api_sessions():
    sessions = []
    for idx, (path, mtime, preview, rounds) in enumerate(list_sessions(exclude_pid=os.getpid())[:20], 1):
        sessions.append({
            'index': idx,
            'path': path,
            'mtime': mtime,
            'preview': preview,
            'rounds': rounds,
        })
    return {'ok': True, 'sessions': sessions}


@app.post('/api/continue')
def api_continue():
    payload = request.json or {}
    idx = int(payload.get('index', 0))
    if idx <= 0:
        response.status = 400
        return {'ok': False, 'error': 'index 必须大于 0'}
    message = handle_frontend_command(agent, f'/continue {idx}', exclude_pid=os.getpid())
    sessions = list_sessions(exclude_pid=os.getpid())
    history = []
    if message.startswith('✅') and 0 < idx <= len(sessions):
        history = extract_ui_messages(sessions[idx - 1][0])
    return {'ok': True, 'message': message, 'history': history}


@app.get('/api/history')
def api_history():
    return {'ok': True, 'history': getattr(agent, 'history', []) or []}


@app.get('/')
def index():
    response.set_header('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.set_header('Pragma', 'no-cache')
    response.set_header('Expires', '0')
    if os.path.exists(os.path.join(FRONTEND_DIST, 'index.html')):
        return static_file('index.html', root=FRONTEND_DIST)
    return {
        'ok': True,
        'message': '前端尚未构建，请先在 webui/frontend 下执行 npm install && npm run build',
    }


@app.get('/assets/<filepath:path>')
def assets(filepath):
    return static_file(filepath, root=os.path.join(FRONTEND_DIST, 'assets'))


@app.get('/<filepath:path>')
def fallback(filepath):
    if filepath.startswith('api/'):
        response.status = 404
        return {'ok': False, 'error': 'not found'}
    target = os.path.join(FRONTEND_DIST, filepath)
    if os.path.exists(target):
        return static_file(filepath, root=FRONTEND_DIST)
    if os.path.exists(os.path.join(FRONTEND_DIST, 'index.html')):
        return static_file('index.html', root=FRONTEND_DIST)
    response.status = 404
    return {'ok': False, 'error': 'frontend not built'}


if __name__ == '__main__':
    from bottle import run
    run(app, host='127.0.0.1', port=18765, debug=True, reloader=False)
