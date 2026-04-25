from bottle import Bottle, request, response, static_file
import glob, json, os, queue, re, shutil, threading, time, uuid, sys, requests as http_requests

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTENDS_DIR = os.path.join(ROOT, 'frontends')
for path in (ROOT, FRONTENDS_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from agentmain import GeneraticAgent
from frontends.continue_cmd import list_sessions, reset_conversation, extract_ui_messages, restore

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
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
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


@app.get('/api/current')
def api_current():
    history = getattr(agent, 'history', []) or []
    return {
        'ok': True,
        'running': bool(agent.is_running),
        'llm_no': agent.llm_no,
        'llm_name': agent.get_llm_name(),
        'llms': get_llms(),
        'history_count': len(history),
        'message_count': len(history),
        'history': history[-50:],
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


@app.post('/api/reload')
def api_reload():
    try:
        result = agent.reload_llm_configs(force=True)
        return {
            'ok': True,
            'llms': [{"index": i, "name": name, "current": current} for i, name, current in result],
        }
    except Exception as e:
        response.status = 500
        return {'ok': False, 'error': str(e)}


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


def _current_session_path():
    return os.path.join(ROOT, 'temp', 'model_responses', f'model_responses_{os.getpid()}.txt')


@app.get('/api/sessions')
def api_sessions():
    sessions = []
    current_path = os.path.abspath(_current_session_path())
    for idx, (path, mtime, preview, rounds) in enumerate(list_sessions()[:20], 1):
        sessions.append({
            'index': idx,
            'path': path,
            'mtime': mtime,
            'preview': preview,
            'rounds': rounds,
            'current': os.path.abspath(path) == current_path,
        })
    return {'ok': True, 'sessions': sessions}


@app.delete('/api/sessions/<idx:int>')
def api_delete_session(idx):
    sessions = list_sessions()
    if idx <= 0 or idx > len(sessions):
        response.status = 404
        return {'ok': False, 'error': '会话不存在'}
    path = sessions[idx - 1][0]
    try:
        os.remove(path)
        return {'ok': True}
    except Exception as e:
        response.status = 500
        return {'ok': False, 'error': str(e)}


def _truncate_backend_history(keep_messages):
    keep_messages = max(0, int(keep_messages))
    clients = []
    for client in getattr(agent, 'llmclients', []) or []:
        if client not in clients:
            clients.append(client)
    if getattr(agent, 'llmclient', None) is not None and agent.llmclient not in clients:
        clients.insert(0, agent.llmclient)
    for client in clients:
        backend = getattr(client, 'backend', None)
        if backend is not None and hasattr(backend, 'history'):
            backend.history = list((backend.history or [])[:keep_messages])
    if hasattr(agent, 'history'):
        agent.history = list((agent.history or [])[:keep_messages])
    if getattr(agent, 'handler', None) is not None:
        try:
            agent.handler.history_info = list((agent.handler.history_info or [])[:keep_messages])
        except Exception:
            pass


@app.post('/api/rollback')
def api_rollback():
    payload = request.json or {}
    keep_messages = int(payload.get('keep_messages', 0))
    try:
        agent.abort()
    except Exception:
        pass
    _truncate_backend_history(keep_messages)
    return {'ok': True, 'keep_messages': keep_messages}


@app.post('/api/continue')
def api_continue():
    payload = request.json or {}
    idx = int(payload.get('index', 0))
    if idx <= 0:
        response.status = 400
        return {'ok': False, 'error': 'index 必须大于 0'}

    sessions = list_sessions()
    if idx > len(sessions):
        response.status = 404
        return {'ok': False, 'error': f'索引越界（有效范围 1-{len(sessions)}）'}

    target_path = sessions[idx - 1][0]
    current_path = os.path.abspath(_current_session_path())

    if os.path.abspath(target_path) == current_path:
        history = extract_ui_messages(target_path)
        return {'ok': True, 'message': '✅ 已打开当前会话', 'history': history}

    reset_conversation(agent, message=None)
    message, _ = restore(agent, target_path)
    history = extract_ui_messages(target_path) if message.startswith(('✅', '⚠️')) else []
    return {'ok': True, 'message': message, 'history': history}


@app.get('/api/history')
def api_history():
    return {'ok': True, 'history': getattr(agent, 'history', []) or []}


# ── Provider management ──────────────────────────────────────────────────────

MYKEY_PATH = os.path.join(ROOT, 'mykey.py')

TYPE_KEYWORDS = {
    'native_claude': lambda k: 'native' in k and 'claude' in k,
    'native_oai': lambda k: 'native' in k and 'oai' in k,
    'claude': lambda k: 'claude' in k and 'native' not in k,
    'oai': lambda k: 'oai' in k and 'native' not in k,
    'mixin': lambda k: 'mixin' in k,
}

def _detect_type(key_name):
    for t, fn in TYPE_KEYWORDS.items():
        if fn(key_name):
            return t
    return 'oai'

def _mask_key(s):
    if not s or len(s) < 8:
        return '****'
    return '****' + s[-4:]

def _read_providers():
    from llmcore import mykeys
    providers = []
    for k, cfg in mykeys.items():
        if not isinstance(cfg, dict):
            continue
        if not any(x in k for x in ['api', 'config', 'cookie']):
            continue
        if 'mixin' in k:
            continue
        providers.append({
            'key': k,
            'name': cfg.get('name', ''),
            'type': _detect_type(k),
            'apikey': _mask_key(cfg.get('apikey', '')),
            'apikey_raw': cfg.get('apikey', ''),
            'apibase': cfg.get('apibase', ''),
            'model': cfg.get('model', ''),
            'api_mode': cfg.get('api_mode', 'chat_completions'),
            'reasoning_effort': cfg.get('reasoning_effort', ''),
            'max_retries': cfg.get('max_retries', 2),
            'connect_timeout': cfg.get('connect_timeout', 10),
            'read_timeout': cfg.get('read_timeout', 120),
            'stream': cfg.get('stream', True),
            'thinking_type': cfg.get('thinking_type', ''),
            'context_win': cfg.get('context_win', 0),
        })
    return providers

def _write_mykey(providers):
    """Regenerate mykey.py from provider list."""
    lines = []
    lines.append('# Auto-generated by GA WebUI — manual edits will be preserved on next reload\n')
    for p in providers:
        t = p.get('type', 'oai')
        if t == 'native_claude':
            varname = f"native_claude_config_{p['key']}" if not p['key'].startswith('native_claude') else p['key']
        elif t == 'native_oai':
            varname = f"native_oai_config_{p['key']}" if not p['key'].startswith('native_oai') else p['key']
        elif t == 'claude':
            varname = f"claude_config_{p['key']}" if 'claude' not in p['key'] else p['key']
        else:
            varname = p['key'] if 'oai' in p['key'] else f"oai_config_{p['key']}"
        cfg = {}
        if p.get('name'):
            cfg['name'] = p['name']
        cfg['apikey'] = p.get('apikey_raw', '')
        cfg['apibase'] = p.get('apibase', '')
        cfg['model'] = p.get('model', '')
        if t in ('oai', 'native_oai') and p.get('api_mode'):
            cfg['api_mode'] = p['api_mode']
        if p.get('reasoning_effort'):
            cfg['reasoning_effort'] = p['reasoning_effort']
        if p.get('max_retries') and p['max_retries'] != 2:
            cfg['max_retries'] = p['max_retries']
        if p.get('connect_timeout') and p['connect_timeout'] != 10:
            cfg['connect_timeout'] = p['connect_timeout']
        if p.get('read_timeout') and p['read_timeout'] != 120:
            cfg['read_timeout'] = p['read_timeout']
        if t == 'native_claude':
            if p.get('thinking_type'):
                cfg['thinking_type'] = p['thinking_type']
            if 'stream' in p:
                cfg['stream'] = p['stream']
        if p.get('context_win') and p['context_win'] > 0:
            cfg['context_win'] = p['context_win']
        lines.append(f'{varname} = {json.dumps(cfg, indent=4, ensure_ascii=False)}\n')

    # Preserve non-provider lines (fs_app_id, tg_bot_token, proxy, etc.)
    if os.path.exists(MYKEY_PATH):
        with open(MYKEY_PATH, 'r', encoding='utf-8') as f:
            old_content = f.read()
        provider_keys = set()
        for p in providers:
            provider_keys.add(p['key'])
        for line in old_content.split('\n'):
            m = re.match(r'^(\w+)\s*=\s*', line)
            if m:
                vname = m.group(1)
                if vname not in provider_keys and not any(x in vname for x in ['config', 'api', 'cookie']):
                    lines.append(line + '\n')

    with open(MYKEY_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    agent.reload_llm_configs(force=True)


@app.get('/api/providers')
def api_providers():
    providers = _read_providers()
    safe = []
    for p in providers:
        sp = dict(p)
        del sp['apikey_raw']
        safe.append(sp)
    return {'ok': True, 'providers': safe}


@app.put('/api/providers/<key>')
def api_update_provider(key):
    payload = request.json or {}
    providers = _read_providers()
    found = None
    for p in providers:
        if p['key'] == key:
            found = p
            break
    if not found:
        response.status = 404
        return {'ok': False, 'error': '提供商不存在'}
    for field in ('name', 'apibase', 'model', 'api_mode', 'reasoning_effort',
                  'max_retries', 'connect_timeout', 'read_timeout', 'stream',
                  'thinking_type', 'context_win', 'type'):
        if field in payload:
            found[field] = payload[field]
    if 'apikey' in payload and not payload['apikey'].startswith('****'):
        found['apikey_raw'] = payload['apikey']
        found['apikey'] = _mask_key(payload['apikey'])
    _write_mykey(providers)
    return {'ok': True}


@app.post('/api/providers')
def api_add_provider():
    payload = request.json or {}
    t = payload.get('type', 'oai')
    name = payload.get('name', 'new')
    key_id = uuid.uuid4().hex[:6]
    if t == 'native_claude':
        key = f'native_claude_config_{key_id}'
    elif t == 'native_oai':
        key = f'native_oai_config_{key_id}'
    elif t == 'claude':
        key = f'claude_config_{key_id}'
    else:
        key = f'oai_config_{key_id}'
    new_provider = {
        'key': key,
        'name': name,
        'type': t,
        'apikey': _mask_key(payload.get('apikey', '')),
        'apikey_raw': payload.get('apikey', ''),
        'apibase': payload.get('apibase', ''),
        'model': payload.get('model', ''),
        'api_mode': payload.get('api_mode', 'chat_completions'),
        'reasoning_effort': payload.get('reasoning_effort', ''),
        'max_retries': payload.get('max_retries', 2),
        'connect_timeout': payload.get('connect_timeout', 10),
        'read_timeout': payload.get('read_timeout', 120),
        'stream': payload.get('stream', True),
        'thinking_type': payload.get('thinking_type', ''),
        'context_win': payload.get('context_win', 0),
    }
    providers = _read_providers()
    providers.append(new_provider)
    _write_mykey(providers)
    return {'ok': True, 'key': key}


@app.delete('/api/providers/<key>')
def api_delete_provider(key):
    providers = _read_providers()
    new_list = [p for p in providers if p['key'] != key]
    if len(new_list) == len(providers):
        response.status = 404
        return {'ok': False, 'error': '提供商不存在'}
    _write_mykey(new_list)
    return {'ok': True}


@app.post('/api/providers/<key>/models')
def api_provider_models(key):
    providers = _read_providers()
    found = None
    for p in providers:
        if p['key'] == key:
            found = p
            break
    if not found:
        response.status = 404
        return {'ok': False, 'error': '提供商不存在'}
    apibase = found['apibase'].rstrip('/')
    apikey = found['apikey_raw']
    if not apibase or not apikey:
        return {'ok': False, 'error': '缺少 apibase 或 apikey'}
    url = apibase + '/models' if '/v1' in apibase else apibase + '/v1/models'
    try:
        resp = http_requests.get(url, headers={
            'Authorization': f'Bearer {apikey}',
            'User-Agent': 'claude-code/1.0',
        }, timeout=15, verify=False)
        if resp.status_code == 200:
            data = resp.json()
            models = sorted([m.get('id', '') for m in data.get('data', []) if m.get('id')])
            return {'ok': True, 'models': models}
        return {'ok': False, 'error': f'HTTP {resp.status_code}: {resp.text[:200]}'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


# ── Knowledge / prompts / memory management ─────────────────────────────────

KNOWLEDGE_ALLOWED_PREFIXES = ('assets', 'memory', 'plugins')


def _rel_path(path):
    return os.path.normpath(str(path or '').replace('\\', '/')).replace('\\', '/')


def _safe_knowledge_path(path):
    rel = _rel_path(path)
    if rel.startswith('../') or rel.startswith('/') or ':' in rel:
        raise ValueError('非法路径')
    if not any(rel == p or rel.startswith(p + '/') for p in KNOWLEDGE_ALLOWED_PREFIXES):
        raise ValueError('不允许访问该路径')
    abs_path = os.path.abspath(os.path.join(ROOT, rel))
    if not abs_path.startswith(os.path.abspath(ROOT)):
        raise ValueError('路径越界')
    return rel, abs_path


def _file_item(path, readonly=False, desc=''):
    rel, abs_path = _safe_knowledge_path(path)
    if not os.path.isfile(abs_path):
        return None
    st = os.stat(abs_path)
    return {
        'id': rel,
        'name': os.path.basename(rel),
        'path': rel,
        'size': st.st_size,
        'mtime': st.st_mtime,
        'readonly': bool(readonly),
        'desc': desc,
    }


def _existing_items(paths, readonly=None):
    readonly = readonly or set()
    items = []
    for p in paths:
        item = _file_item(p, readonly=p in readonly)
        if item:
            items.append(item)
    return items


@app.get('/api/knowledge')
def api_knowledge():
    prompt_paths = [
        'assets/sys_prompt.txt',
        'assets/sys_prompt_en.txt',
        'assets/insight_fixed_structure.txt',
        'assets/insight_fixed_structure_en.txt',
    ]
    memory_paths = [
        'memory/global_mem.txt',
        'memory/global_mem_insight.txt',
        'memory/file_access_stats.json',
    ]
    sop_paths = sorted(set(
        [p.replace('\\', '/') for p in glob.glob(os.path.join(ROOT, 'memory', '*_sop.md'))] +
        [p.replace('\\', '/') for p in glob.glob(os.path.join(ROOT, 'memory', '*.md'))] +
        [p.replace('\\', '/') for p in glob.glob(os.path.join(ROOT, 'memory', '*', '*.md'))]
    ))
    sop_paths = [os.path.relpath(p, ROOT).replace('\\', '/') for p in sop_paths]
    skill_paths = [os.path.relpath(p, ROOT).replace('\\', '/') for p in glob.glob(os.path.join(ROOT, 'memory', '**', 'SKILL.md'), recursive=True)]

    groups = [
        {'key': 'prompts', 'label': '系统提示词', 'items': _existing_items(prompt_paths)},
        {'key': 'memory', 'label': '记忆', 'items': _existing_items(memory_paths, readonly={'memory/file_access_stats.json'})},
        {'key': 'sop', 'label': 'SOP', 'items': _existing_items(sop_paths)},
        {'key': 'skills', 'label': '技能', 'items': _existing_items(skill_paths)},
    ]
    return {'ok': True, 'groups': groups}


@app.get('/api/knowledge/file')
def api_knowledge_file():
    path = request.query.get('path', '')
    try:
        rel, abs_path = _safe_knowledge_path(path)
        if not os.path.isfile(abs_path):
            response.status = 404
            return {'ok': False, 'error': '文件不存在'}
        with open(abs_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        st = os.stat(abs_path)
        return {'ok': True, 'path': rel, 'content': content, 'size': st.st_size, 'mtime': st.st_mtime}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


def _backup_file(rel, abs_path):
    stamp = time.strftime('%Y%m%d_%H%M%S')
    backup_dir = os.path.join(ROOT, 'temp', 'webui_backups', os.path.dirname(rel))
    os.makedirs(backup_dir, exist_ok=True)
    backup_path = os.path.join(backup_dir, f'{os.path.basename(rel)}.{stamp}.bak')
    shutil.copy2(abs_path, backup_path)
    return os.path.relpath(backup_path, ROOT).replace('\\', '/')


@app.put('/api/knowledge/file')
def api_save_knowledge_file():
    payload = request.json or {}
    path = payload.get('path', '')
    content = payload.get('content', '')
    try:
        rel, abs_path = _safe_knowledge_path(path)
        if rel == 'memory/file_access_stats.json':
            response.status = 403
            return {'ok': False, 'error': '该文件只读'}
        if not os.path.isfile(abs_path):
            response.status = 404
            return {'ok': False, 'error': '文件不存在'}
        backup = _backup_file(rel, abs_path)
        with open(abs_path, 'w', encoding='utf-8', errors='replace') as f:
            f.write(content)
        st = os.stat(abs_path)
        return {'ok': True, 'backup': backup, 'size': st.st_size, 'mtime': st.st_mtime}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


@app.post('/api/knowledge/backup')
def api_backup_knowledge_file():
    payload = request.json or {}
    path = payload.get('path', '')
    try:
        rel, abs_path = _safe_knowledge_path(path)
        if not os.path.isfile(abs_path):
            response.status = 404
            return {'ok': False, 'error': '文件不存在'}
        backup = _backup_file(rel, abs_path)
        return {'ok': True, 'backup': backup}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


@app.get('/api/knowledge/memory-stats')
def api_memory_stats():
    path = os.path.join(ROOT, 'memory', 'file_access_stats.json')
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            return {'ok': True, 'stats': json.load(f)}
    except FileNotFoundError:
        return {'ok': True, 'stats': {}}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


@app.post('/api/providers/<key>/test')
def api_provider_test(key):
    providers = _read_providers()
    found = None
    for p in providers:
        if p['key'] == key:
            found = p
            break
    if not found:
        response.status = 404
        return {'ok': False, 'error': '提供商不存在'}
    apibase = found['apibase'].rstrip('/')
    apikey = found['apikey_raw']
    model = found.get('model', '')
    ptype = found.get('type', 'oai')
    if not apibase or not apikey:
        return {'ok': False, 'error': '缺少 apibase 或 apikey'}

    headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/1.0',
    }

    if ptype == 'native_claude':
        # Anthropic native protocol: /v1/messages endpoint
        headers['x-api-key'] = apikey
        headers['anthropic-version'] = '2023-06-01'
        base = apibase.rstrip('/')
        # auto_make_url logic: if base already has /v1, append /messages; otherwise append /v1/messages
        if re.search(r'/v\d+(/|$)', base):
            url = base.rstrip('/') + '/messages'
        else:
            url = base + '/v1/messages'
        body = {
            'model': model or 'claude-sonnet-4-20250514',
            'max_tokens': 5,
            'messages': [{'role': 'user', 'content': 'Hi'}],
        }
    else:
        headers['Authorization'] = f'Bearer {apikey}'
        url = apibase + '/chat/completions' if '/v1' in apibase else apibase + '/v1/chat/completions'
        body = {
            'model': model or 'gpt-4o',
            'messages': [{'role': 'user', 'content': 'Hi'}],
            'max_tokens': 5,
        }

    try:
        resp = http_requests.post(url, headers=headers, json=body, timeout=30, verify=False)
        if resp.status_code == 200:
            return {'ok': True, 'message': '连接成功'}
        # Some APIs return 201 or other 2xx
        if 200 <= resp.status_code < 300:
            return {'ok': True, 'message': f'连接成功 (HTTP {resp.status_code})'}
        return {'ok': False, 'error': f'HTTP {resp.status_code}: {resp.text[:300]}'}
    except http_requests.exceptions.Timeout:
        return {'ok': False, 'error': '连接超时（30秒）'}
    except http_requests.exceptions.ConnectionError as e:
        return {'ok': False, 'error': f'无法连接: {e}'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


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
