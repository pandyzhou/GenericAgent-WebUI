from bottle import Bottle, request, response, static_file
import glob, json, os, queue, re, shutil, threading, time, uuid, sys, subprocess, requests as http_requests

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTENDS_DIR = os.path.join(ROOT, 'frontends')
for path in (ROOT, FRONTENDS_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from agentmain import GeneraticAgent
from frontends.continue_cmd import list_sessions, reset_conversation, extract_ui_messages, restore

FRONTEND_DIST = os.path.join(ROOT, 'webui', 'frontend', 'dist')
SERVER_STARTED_AT = time.time()

app = Bottle()

agent = GeneraticAgent()
if agent.llmclient is None:
    raise RuntimeError('未配置可用的 LLM，请先配置 mykey.py 或 mykey.json')


RUNS = {}
RUN_LOCK = threading.Lock()
AUDIT_PATH = os.path.join(ROOT, 'temp', 'webui_audit.jsonl')


def _append_audit(event_type, title, detail='', meta=None):
    os.makedirs(os.path.dirname(AUDIT_PATH), exist_ok=True)
    rec = {
        'ts': int(time.time()),
        'type': event_type,
        'title': title,
        'detail': detail,
        'meta': meta or {},
    }
    with open(AUDIT_PATH, 'a', encoding='utf-8') as f:
        f.write(json.dumps(rec, ensure_ascii=False) + '\n')


def _read_audit(limit=100):
    items = []
    try:
        with open(AUDIT_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    items.append(json.loads(line))
                except Exception:
                    continue
    except FileNotFoundError:
        return []
    return list(reversed(items[-limit:]))


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
    _append_audit('new_chat', '新建对话', message)
    return {'ok': True, 'message': message}


@app.post('/api/llm')
def api_switch_llm():
    payload = request.json or {}
    idx = payload.get('index')
    if idx is None:
        response.status = 400
        return {'ok': False, 'error': 'index 不能为空'}
    agent.next_llm(int(idx))
    _append_audit('switch_llm', '切换模型', f'切换到 {agent.get_llm_name()}', {'index': int(idx)})
    return {
        'ok': True,
        'llm_no': agent.llm_no,
        'llm_name': agent.get_llm_name(),
        'llms': get_llms(),
    }


def _dir_size(path):
    if not os.path.exists(path):
        return 0
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


@app.get('/api/runtime')
def api_runtime():
    current_session = _current_session_path()
    runs = []
    with RUN_LOCK:
        for run_id, info in RUNS.items():
            events = info.get('events', []) or []
            status = 'done'
            if events:
                status = events[-1].get('type', 'done')
            runs.append({
                'id': run_id,
                'status': status,
                'events': len(events),
            })
    return {
        'ok': True,
        'pid': os.getpid(),
        'uptime_sec': int(time.time() - SERVER_STARTED_AT),
        'running': bool(getattr(agent, 'running', False)),
        'current_llm': getattr(agent, 'llm_name', lambda: '')(),
        'current_llm_no': getattr(agent, 'llm_no', 0),
        'history_count': len(getattr(agent, 'history', []) or []),
        'active_runs': len(runs),
        'current_session_path': os.path.relpath(current_session, ROOT).replace('\\', '/'),
        'paths': {
            'temp_size': _dir_size(os.path.join(ROOT, 'temp')),
            'sessions_size': _dir_size(os.path.join(ROOT, 'temp', 'model_responses')),
            'archives_size': _dir_size(os.path.join(ROOT, 'memory', 'L4_raw_sessions')),
        },
        'runs': runs,
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
        _append_audit('delete_session', '删除历史会话', os.path.relpath(path, ROOT).replace('\\', '/'), {'index': idx})
        return {'ok': True}
    except Exception as e:
        response.status = 400
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
        _append_audit('open_session', '打开历史会话', os.path.relpath(target_path, ROOT).replace('\\', '/'), {'index': idx, 'current': True})
        return {'ok': True, 'message': '✅ 已打开当前会话', 'history': history}

    message, _ = restore(agent, target_path)
    history = extract_ui_messages(target_path) if message.startswith(('✅', '⚠️')) else []
    _append_audit('open_session', '打开历史会话', os.path.relpath(target_path, ROOT).replace('\\', '/'), {'index': idx, 'current': False})
    return {'ok': True, 'message': message, 'history': history}



@app.get('/api/history')
def api_history():
    return {'ok': True, 'history': getattr(agent, 'history', []) or []}


@app.get('/api/audit')
def api_audit():
    limit = int(request.query.get('limit', '100'))
    return {'ok': True, 'items': _read_audit(limit)}


# ── Storage management ───────────────────────────────────────────────────────

STORAGE_GROUPS = {
    'sessions': {
        'label': '会话日志',
        'path': 'temp/model_responses',
        'cleanup': 'cautious',
        'desc': '原始 LLM 请求/响应日志，用于历史会话恢复。',
    },
    'backups': {
        'label': 'WebUI 备份',
        'path': 'temp/webui_backups',
        'cleanup': 'safe',
        'desc': '编辑系统提示词、记忆、SOP、技能前自动创建的备份。',
    },
    'temp': {
        'label': '临时文件',
        'path': 'temp',
        'cleanup': 'safe',
        'desc': '上传媒体、临时脚本、工具输出等临时数据。',
    },
    'logs': {
        'label': 'IM / 网关日志',
        'path': 'temp',
        'cleanup': 'safe',
        'desc': 'Telegram、微信、企业微信、飞书等前端运行日志。',
        'patterns': ['*.log', '../sche_tasks/*.log'],
    },
    'reports': {
        'label': '自主任务报告',
        'path': 'temp/autonomous_reports',
        'cleanup': 'manual',
        'desc': '自主任务 SOP 生成的报告和 history.txt。',
    },
    'l4': {
        'label': 'L4 归档',
        'path': 'memory/L4_raw_sessions',
        'cleanup': 'readonly',
        'desc': '压缩后的长期会话归档和 all_histories.txt。',
    },
    'frontend': {
        'label': 'WebUI 构建缓存',
        'path': 'webui/frontend',
        'cleanup': 'readonly',
        'desc': '前端依赖与构建产物，仅展示占用，不默认清理。',
        'patterns': ['node_modules/**', 'dist/**'],
    },
}


def _storage_group(key):
    if key not in STORAGE_GROUPS:
        raise ValueError('未知储存分类')
    return STORAGE_GROUPS[key]


def _safe_storage_root(rel):
    rel = _rel_path(rel)
    if rel.startswith('../') or ':' in rel:
        raise ValueError('非法路径')
    abs_path = os.path.abspath(os.path.join(ROOT, rel))
    if not abs_path.startswith(os.path.abspath(ROOT)):
        raise ValueError('路径越界')
    return rel, abs_path


def _iter_storage_files(key):
    cfg = _storage_group(key)
    rel, base = _safe_storage_root(cfg['path'])
    if not os.path.exists(base):
        return []
    files = []
    patterns = cfg.get('patterns')
    if patterns:
        for pat in patterns:
            root = base
            pattern = pat
            if pat.startswith('../'):
                root = os.path.abspath(os.path.join(base, os.path.dirname(pat)))
                pattern = os.path.basename(pat)
            files.extend(glob.glob(os.path.join(root, pattern), recursive=True))
    else:
        if os.path.isfile(base):
            files = [base]
        else:
            files = [p for p in glob.glob(os.path.join(base, '**', '*'), recursive=True) if os.path.isfile(p)]
    seen = []
    for p in files:
        ap = os.path.abspath(p)
        if os.path.isfile(ap) and ap not in seen:
            seen.append(ap)
    return seen


def _storage_summary(key):
    cfg = _storage_group(key)
    rel, base = _safe_storage_root(cfg['path'])
    if key == 'frontend':
        children = [x for x in [
            _storage_child_item('webui/frontend/node_modules'),
            _storage_child_item('webui/frontend/dist'),
        ] if x]
        return {
            'key': key,
            'label': cfg['label'],
            'path': rel,
            'size': sum(x['size'] for x in children),
            'files': sum(int(x.get('files', 1)) for x in children),
            'dirs': 2 if children else 0,
            'mtime': max([x['mtime'] for x in children], default=0),
            'cleanup': cfg['cleanup'],
            'desc': cfg['desc'],
        }
    files = _iter_storage_files(key)
    size = sum(os.path.getsize(p) for p in files if os.path.exists(p))
    mtimes = [os.path.getmtime(p) for p in files if os.path.exists(p)]
    dirs = 0
    if os.path.isdir(base):
        for _, dnames, _ in os.walk(base):
            dirs += len(dnames)
    return {
        'key': key,
        'label': cfg['label'],
        'path': rel,
        'size': size,
        'files': len(files),
        'dirs': dirs,
        'mtime': max(mtimes) if mtimes else 0,
        'cleanup': cfg['cleanup'],
        'desc': cfg['desc'],
    }


def _rel_file_item(path):
    rel = os.path.relpath(path, ROOT).replace('\\', '/')
    st = os.stat(path)
    return {'path': rel, 'name': os.path.basename(path), 'size': st.st_size, 'mtime': st.st_mtime}


@app.get('/api/storage')
def api_storage():
    groups = [_storage_summary(k) for k in STORAGE_GROUPS]
    return {
        'ok': True,
        'total_size': sum(g['size'] for g in groups),
        'total_files': sum(g['files'] for g in groups),
        'groups': groups,
    }


def _storage_child_item(rel):
    rel, abs_path = _safe_storage_root(rel)
    if not os.path.exists(abs_path):
        return None
    if os.path.isfile(abs_path):
        return _rel_file_item(abs_path)
    size = 0
    files = 0
    latest = 0
    for root, _, names in os.walk(abs_path):
        for name in names:
            p = os.path.join(root, name)
            try:
                st = os.stat(p)
                size += st.st_size
                files += 1
                latest = max(latest, st.st_mtime)
            except OSError:
                pass
    return {'path': rel, 'name': os.path.basename(rel), 'size': size, 'mtime': latest, 'files': files}


@app.get('/api/storage/<key>')
def api_storage_detail(key):
    try:
        group = _storage_summary(key)
        if key == 'frontend':
            files = [x for x in [
                _storage_child_item('webui/frontend/node_modules'),
                _storage_child_item('webui/frontend/dist'),
            ] if x]
        else:
            files = sorted((_rel_file_item(p) for p in _iter_storage_files(key)), key=lambda x: x['size'], reverse=True)[:20]
        return {'ok': True, 'group': group, 'largest': files}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


def _cleanup_candidates(key, mode, days):
    cfg = _storage_group(key)
    if cfg['cleanup'] == 'readonly':
        raise ValueError('该分类为只读，不支持清理')
    now = time.time()
    current_session = os.path.abspath(_current_session_path())
    files = _iter_storage_files(key)
    candidates = []
    for p in files:
        ap = os.path.abspath(p)
        name = os.path.basename(ap)
        if ap == current_session:
            continue
        if key == 'sessions' and mode == 'snapshots_only' and 'snapshot' not in name:
            continue
        if key == 'logs' and mode != 'logs_truncate':
            continue
        if mode == 'older_than_days' and os.path.getmtime(ap) > now - float(days) * 86400:
            continue
        if mode == 'all' and cfg['cleanup'] != 'safe':
            raise ValueError('仅安全分类允许清理全部')
        candidates.append(ap)
    return candidates


@app.post('/api/storage/<key>/cleanup')
def api_storage_cleanup(key):
    payload = request.json or {}
    mode = payload.get('mode', 'older_than_days')
    days = int(payload.get('days', 7))
    dry_run = bool(payload.get('dry_run', True))
    try:
        candidates = _cleanup_candidates(key, mode, days)
        total_size = sum(os.path.getsize(p) for p in candidates if os.path.exists(p))
        deleted = []
        errors = []
        if not dry_run:
            for p in candidates:
                try:
                    if mode == 'logs_truncate':
                        open(p, 'w', encoding='utf-8').close()
                    else:
                        os.remove(p)
                    deleted.append(os.path.relpath(p, ROOT).replace('\\', '/'))
                except Exception as e:
                    errors.append({'path': os.path.relpath(p, ROOT).replace('\\', '/'), 'error': str(e)})
            _append_audit('storage_cleanup', '清理储存空间', f'{key}: {len(candidates)} files, {total_size} bytes', {'key': key, 'count': len(candidates), 'size': total_size})
        return {
            'ok': True,
            'dry_run': dry_run,
            'count': len(candidates),
            'size': total_size,
            'files': [_rel_file_item(p) for p in candidates[:50] if os.path.exists(p)],
            'deleted': deleted,
            'errors': errors,
        }
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


def _allow_single_file_delete(rel_path):
    rel = _rel_path(rel_path)
    abs_path = os.path.abspath(os.path.join(ROOT, rel))
    if not abs_path.startswith(os.path.abspath(ROOT)):
        raise ValueError('非法路径')
    current_session = os.path.abspath(_current_session_path())
    if abs_path == current_session:
        raise ValueError('不能删除当前活跃会话文件')
    allowed = []
    for key, cfg in STORAGE_GROUPS.items():
        if cfg['cleanup'] == 'readonly':
            continue
        _, base = _safe_storage_root(cfg['path'])
        allowed.append(os.path.abspath(base))
    if not any(abs_path.startswith(base) for base in allowed if os.path.exists(base)):
        raise ValueError('该文件不在可删除分类中')
    if not os.path.exists(abs_path) or not os.path.isfile(abs_path):
        raise ValueError('文件不存在')
    return rel, abs_path


@app.delete('/api/storage/file')
def api_storage_delete_file():
    rel_path = request.query.get('path', '')
    try:
        rel, abs_path = _allow_single_file_delete(rel_path)
        size = os.path.getsize(abs_path)
        os.remove(abs_path)
        return {'ok': True, 'path': rel, 'size': size}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


# ── Provider management ──────────────────────────────────────────────────────

MYKEY_PY_PATH = os.path.join(ROOT, 'mykey.py')
MYKEY_JSON_PATH = os.path.join(ROOT, 'mykey.json')


def _detect_mykey_backend():
    if os.path.exists(MYKEY_PY_PATH):
        return 'py'
    if os.path.exists(MYKEY_JSON_PATH):
        return 'json'
    return 'py'


def _active_mykey_path():
    return MYKEY_PY_PATH if _detect_mykey_backend() == 'py' else MYKEY_JSON_PATH


def _load_active_mykey_json():
    if not os.path.exists(MYKEY_JSON_PATH):
        return {}
    with open(MYKEY_JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def _safe_reload_llms():
    try:
        return {'ok': True, 'llms': agent.reload_llm_configs(force=True)}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

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
    """Regenerate mykey.py or mykey.json from provider list."""
    backend = _detect_mykey_backend()

    if backend == 'json':
        data = _load_active_mykey_json()
        provider_keys = {p['key'] for p in providers}
        for key in list(data.keys()):
            if any(x in key for x in ['api', 'config', 'cookie']) and key not in provider_keys:
                data.pop(key, None)
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
            data[varname] = cfg
        with open(MYKEY_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return

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

    if os.path.exists(MYKEY_PY_PATH):
        with open(MYKEY_PY_PATH, 'r', encoding='utf-8') as f:
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

    with open(MYKEY_PY_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


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
    reload = _safe_reload_llms()
    if not reload['ok']:
        response.status = 500
        return {'ok': False, 'error': f"配置已写入，但 LLM 重载失败: {reload['error']}"}
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
        backup = _backup_file(rel, abs_path)
        with open(abs_path, 'w', encoding='utf-8') as f:
            f.write(content)
        st = os.stat(abs_path)
        _append_audit('save_knowledge', '保存知识文件', rel, {'size': st.st_size})
        return {'ok': True, 'path': rel, 'backup': backup, 'size': st.st_size, 'mtime': st.st_mtime}
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
        started = time.time()
        resp = http_requests.post(url, headers=headers, json=body, timeout=30, verify=False)
        elapsed_ms = int((time.time() - started) * 1000)
        if resp.status_code == 200:
            _append_audit('test_provider', '测试提供商连接', key, {'ok': True, 'elapsed_ms': elapsed_ms})
            return {'ok': True, 'message': '连接成功', 'elapsed_ms': elapsed_ms}
        # Some APIs return 201 or other 2xx
        if 200 <= resp.status_code < 300:
            _append_audit('test_provider', '测试提供商连接', key, {'ok': True, 'elapsed_ms': elapsed_ms, 'status_code': resp.status_code})
            return {'ok': True, 'message': f'连接成功 (HTTP {resp.status_code})', 'elapsed_ms': elapsed_ms}
        _append_audit('test_provider', '测试提供商连接', key, {'ok': False, 'elapsed_ms': elapsed_ms, 'status_code': resp.status_code})
        return {'ok': False, 'error': f'HTTP {resp.status_code}: {resp.text[:300]}', 'elapsed_ms': elapsed_ms}
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


# ── IM Gateway configuration ────────────────────────────────────────────────

IM_CHANNEL_SCHEMA = {
    'feishu': {
        'name': '飞书',
        'fields': [
            {'key': 'fs_app_id', 'label': 'App ID', 'type': 'text'},
            {'key': 'fs_app_secret', 'label': 'App Secret', 'type': 'password'},
            {'key': 'fs_allowed_users', 'label': '允许用户', 'type': 'text', 'placeholder': "['*'] 表示允许所有用户"},
        ],
    },
    'telegram': {
        'name': 'Telegram',
        'fields': [
            {'key': 'tg_bot_token', 'label': 'Bot Token', 'type': 'password'},
            {'key': 'tg_allowed_users', 'label': '允许用户 ID', 'type': 'text', 'placeholder': '[123456789]'},
            {'key': 'proxy', 'label': '代理', 'type': 'text', 'placeholder': 'http://127.0.0.1:2082'},
        ],
    },
    'qq': {
        'name': 'QQ',
        'fields': [
            {'key': 'qq_app_id', 'label': 'App ID', 'type': 'text'},
            {'key': 'qq_app_secret', 'label': 'App Secret', 'type': 'password'},
            {'key': 'qq_allowed_users', 'label': '允许用户', 'type': 'text', 'placeholder': "['*']"},
        ],
    },
    'wecom': {
        'name': '企业微信',
        'fields': [
            {'key': 'wecom_bot_id', 'label': 'Bot ID', 'type': 'text'},
            {'key': 'wecom_secret', 'label': 'Secret', 'type': 'password'},
            {'key': 'wecom_allowed_users', 'label': '允许用户', 'type': 'text', 'placeholder': "['*']"},
            {'key': 'wecom_welcome_message', 'label': '欢迎消息', 'type': 'text'},
        ],
    },
    'dingtalk': {
        'name': '钉钉',
        'fields': [
            {'key': 'dingtalk_client_id', 'label': 'Client ID', 'type': 'text'},
            {'key': 'dingtalk_client_secret', 'label': 'Client Secret', 'type': 'password'},
            {'key': 'dingtalk_allowed_users', 'label': '允许用户', 'type': 'text', 'placeholder': "['*']"},
        ],
    },
    'wechat': {
        'name': '微信',
        'fields': [],
        'note': '微信通过扫码登录，无需额外配置',
    },
    'streamlit': {
        'name': 'Streamlit',
        'fields': [],
        'note': '内置 Web UI，无需额外配置',
    },
}

IM_CONFIG_KEYS = set()
for ch in IM_CHANNEL_SCHEMA.values():
    for f in ch.get('fields', []):
        IM_CONFIG_KEYS.add(f['key'])

IM_PROCESS_REGISTRY = {}
IM_RUNTIME_DIR = os.path.join(ROOT, 'webui', 'temp', 'im_runtime')
IM_STATE_PATH = os.path.join(IM_RUNTIME_DIR, 'state.json')
GENERIC_AGENT_ROOT = os.path.abspath(os.path.join(ROOT, '..', 'GenericAgent'))
GENERIC_AGENT_FRONTENDS = os.path.join(GENERIC_AGENT_ROOT, 'frontends')

IM_CHANNEL_RUNTIME = {
    'feishu': {
        'script': os.path.join(GENERIC_AGENT_FRONTENDS, 'fsapp.py'),
        'required': ['fs_app_id', 'fs_app_secret'],
        'managed': True,
    },
    'telegram': {
        'script': os.path.join(GENERIC_AGENT_FRONTENDS, 'tgapp.py'),
        'required': ['tg_bot_token'],
        'managed': True,
    },
    'qq': {
        'script': os.path.join(GENERIC_AGENT_FRONTENDS, 'qqapp.py'),
        'required': ['qq_app_id', 'qq_app_secret'],
        'managed': True,
    },
    'wecom': {
        'script': os.path.join(GENERIC_AGENT_FRONTENDS, 'wecomapp.py'),
        'required': ['wecom_bot_id', 'wecom_secret'],
        'managed': True,
    },
    'dingtalk': {
        'script': os.path.join(GENERIC_AGENT_FRONTENDS, 'dingtalkapp.py'),
        'required': ['dingtalk_client_id', 'dingtalk_client_secret'],
        'managed': True,
    },
    'wechat': {
        'script': os.path.join(GENERIC_AGENT_FRONTENDS, 'wechatapp.py'),
        'required': [],
        'managed': True,
    },
    'streamlit': {
        'script': os.path.join(GENERIC_AGENT_FRONTENDS, 'stapp.py'),
        'required': [],
        'managed': True,
    },
}


def _validate_im_required(channel, raw):
    runtime = IM_CHANNEL_RUNTIME.get(channel, {})
    required = runtime.get('required', [])
    missing = []
    for key in required:
        val = str(raw.get(key, '') or '').strip("'\"")
        if not val:
            missing.append(key)
    return missing


def _ensure_im_runtime_dir():
    os.makedirs(IM_RUNTIME_DIR, exist_ok=True)


def _im_log_path(channel):
    _ensure_im_runtime_dir()
    return os.path.join(IM_RUNTIME_DIR, f'{channel}.log')


def _read_log_tail(path, max_lines=8, max_chars=4000):
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
        tail = [line.rstrip('\r\n') for line in lines[-max_lines:]]
        text = '\n'.join(tail)
        if len(text) > max_chars:
            text = text[-max_chars:]
            tail = text.splitlines()
        return tail
    except Exception as e:
        return [f'读取日志失败: {e}']


def _read_log_tail(path, max_lines=8, max_chars=4000):
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
        tail = [line.rstrip('\r\n') for line in lines[-max_lines:]]
        text = '\n'.join(tail)
        if len(text) > max_chars:
            text = text[-max_chars:]
            tail = text.splitlines()
        return tail
    except Exception as e:
        return [f'读取日志失败: {e}']


def _read_log_content(path, max_lines=200, max_chars=20000):
    if not path or not os.path.exists(path):
        return '', False
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    sliced = lines[-max_lines:] if max_lines > 0 else lines
    content = ''.join(sliced)
    truncated = len(lines) > len(sliced)
    if max_chars > 0 and len(content) > max_chars:
        content = content[-max_chars:]
        truncated = True
    return content, truncated


def _load_im_state():
    if not os.path.exists(IM_STATE_PATH):
        return {'channels': {}}
    try:
        with open(IM_STATE_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get('channels'), dict):
            return data
    except Exception:
        pass
    return {'channels': {}}


def _save_im_state(state):
    _ensure_im_runtime_dir()
    with open(IM_STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def _update_im_state(channel, managed_by_webui=None, auto_restart=None):
    state = _load_im_state()
    channels = state.setdefault('channels', {})
    current = channels.setdefault(channel, {})
    runtime = IM_CHANNEL_RUNTIME.get(channel, {})
    current['script'] = runtime.get('script', '')
    if managed_by_webui is not None:
        current['managed_by_webui'] = managed_by_webui
    if auto_restart is not None:
        current['auto_restart'] = auto_restart
    current['updated_at'] = int(time.time())
    _save_im_state(state)


def _normalize_im_registry(channel):
    runtime = IM_CHANNEL_RUNTIME.get(channel, {})
    script = runtime.get('script', '')
    entry = IM_PROCESS_REGISTRY.setdefault(channel, {
        'process': None,
        'pid': None,
        'started_at': None,
        'last_exit_code': None,
        'log_path': _im_log_path(channel),
        'message': '',
    })
    proc = entry.get('process')
    if proc is not None:
        code = proc.poll()
        if code is not None:
            entry['last_exit_code'] = code
            entry['process'] = None
            entry['pid'] = None
            if not entry.get('message'):
                entry['message'] = f'进程已退出，退出码 {code}'
    state = _load_im_state().get('channels', {}).get(channel, {})
    return {
        'key': channel,
        'managed': bool(runtime.get('managed')),
        'script_exists': bool(script and os.path.exists(script)),
        'running': entry.get('process') is not None,
        'pid': entry.get('pid'),
        'started_at': entry.get('started_at'),
        'last_exit_code': entry.get('last_exit_code'),
        'log_path': entry.get('log_path'),
        'log_tail': _read_log_tail(entry.get('log_path')),
        'message': entry.get('message', ''),
        'auto_restart': bool(state.get('auto_restart')),
    }


def _start_im_process(channel):
    runtime = IM_CHANNEL_RUNTIME.get(channel)
    if not runtime:
        raise ValueError('未知渠道')
    if not runtime.get('managed'):
        raise ValueError('该渠道暂不支持由 WebUI 启动')
    script = runtime.get('script', '')
    if not script or not os.path.exists(script):
        raise FileNotFoundError(f'启动脚本不存在: {script}')

    raw = _read_im_config()
    missing = _validate_im_required(channel, raw)
    if missing:
        raise ValueError(f'缺少配置项: {", ".join(missing)}')

    current = _normalize_im_registry(channel)
    if current['running']:
        return current

    log_path = _im_log_path(channel)
    py_path = os.pathsep.join([ROOT, GENERIC_AGENT_ROOT])
    env = os.environ.copy()
    env['PYTHONPATH'] = py_path + (os.pathsep + env['PYTHONPATH'] if env.get('PYTHONPATH') else '')
    env['PYTHONIOENCODING'] = 'utf-8'
    env['PYTHONUTF8'] = '1'
    env['LANG'] = env.get('LANG') or 'C.UTF-8'

    logf = open(log_path, 'a', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [sys.executable, script],
        cwd=GENERIC_AGENT_ROOT,
        stdout=logf,
        stderr=subprocess.STDOUT,
        env=env,
    )
    IM_PROCESS_REGISTRY[channel] = {
        'process': proc,
        'pid': proc.pid,
        'started_at': int(time.time()),
        'last_exit_code': None,
        'log_path': log_path,
        'message': '已启动',
    }
    _update_im_state(channel, managed_by_webui=True, auto_restart=True)
    time.sleep(0.4)
    return _normalize_im_registry(channel)


def _stop_im_process(channel):
    entry = IM_PROCESS_REGISTRY.get(channel)
    if not entry or entry.get('process') is None:
        return _normalize_im_registry(channel)
    proc = entry.get('process')
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
            proc.wait(timeout=5)
    entry['last_exit_code'] = proc.returncode
    entry['process'] = None
    entry['pid'] = None
    entry['message'] = f'已停止（退出码 {proc.returncode}）'
    _update_im_state(channel, managed_by_webui=True, auto_restart=False)
    return _normalize_im_registry(channel)


def _restore_im_processes():
    state = _load_im_state().get('channels', {})
    for channel, meta in state.items():
        if channel not in IM_CHANNEL_RUNTIME:
            continue
        if not meta.get('managed_by_webui') or not meta.get('auto_restart'):
            continue
        try:
            _start_im_process(channel)
            entry = IM_PROCESS_REGISTRY.get(channel)
            if entry:
                entry['message'] = '后端重启后已自动恢复'
        except Exception as e:
            IM_PROCESS_REGISTRY[channel] = {
                'process': None,
                'pid': None,
                'started_at': None,
                'last_exit_code': None,
                'log_path': _im_log_path(channel),
                'message': f'自动恢复失败: {e}',
            }

def _read_im_config():
    """Read IM-related config from active mykey backend."""
    result = {}
    backend = _detect_mykey_backend()
    if backend == 'json':
        data = _load_active_mykey_json()
        for key in IM_CONFIG_KEYS:
            if key in data:
                result[key] = data[key]
        return result

    if not os.path.exists(MYKEY_PY_PATH):
        return result
    with open(MYKEY_PY_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    for key in IM_CONFIG_KEYS:
        pattern = rf"^{re.escape(key)}\s*=\s*(.+)$"
        m = re.search(pattern, content, re.MULTILINE)
        if m:
            result[key] = m.group(1).strip()
    return result


def _mask_value(value, visible=4):
    """Mask sensitive value, keep last N chars visible."""
    if not value or len(value) <= visible + 2:
        return value
    return '*' * (len(value) - visible) + value[-visible:]


def _write_im_config(channel_key, fields):
    """Update IM config in active mykey backend, preserving other content."""
    backend = _detect_mykey_backend()
    schema = IM_CHANNEL_SCHEMA.get(channel_key)
    if not schema:
        raise ValueError(f'未知渠道: {channel_key}')

    if backend == 'json':
        data = _load_active_mykey_json()
        for f in schema.get('fields', []):
            key = f['key']
            val = fields.get(key, '')
            if val:
                try:
                    data[key] = json.loads(val)
                except Exception:
                    data[key] = val
            else:
                data.pop(key, None)
        with open(MYKEY_JSON_PATH, 'w', encoding='utf-8') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        return

    if not os.path.exists(MYKEY_PY_PATH):
        lines = ['# Auto-generated by GA WebUI\n']
    else:
        with open(MYKEY_PY_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        lines = content.split('\n')

    updated_keys = set()
    new_lines = []
    for line in lines:
        matched = False
        for f in schema.get('fields', []):
            key = f['key']
            pattern = rf"^{re.escape(key)}\s*=\s*.+$"
            if re.match(pattern, line):
                val = fields.get(key, '')
                if val:
                    new_lines.append(f"{key} = {val}")
                matched = True
                updated_keys.add(key)
                break
        if not matched:
            new_lines.append(line)

    for f in schema.get('fields', []):
        key = f['key']
        if key not in updated_keys:
            val = fields.get(key, '')
            if val:
                new_lines.append(f"{key} = {val}")

    with open(MYKEY_PY_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines) + '\n')


@app.get('/api/im/config')
def api_im_config():
    raw = _read_im_config()
    channels = []
    for key, schema in IM_CHANNEL_SCHEMA.items():
        fields = {}
        configured = False
        for f in schema.get('fields', []):
            fk = f['key']
            val = raw.get(fk, '')
            if val:
                configured = True
                if f.get('type') == 'password':
                    fields[fk] = _mask_value(val.strip("'\""), visible=4)
                else:
                    fields[fk] = val.strip("'\"")
        channels.append({
            'key': key,
            'name': schema['name'],
            'configured': configured,
            'fields': fields,
            'note': schema.get('note', ''),
        })
    return {'ok': True, 'channels': channels}


@app.post('/api/im/config')
def api_im_save_config():
    payload = request.json or {}
    channel = payload.get('channel')
    fields = payload.get('fields', {})
    if not channel or channel not in IM_CHANNEL_SCHEMA:
        response.status = 400
        return {'ok': False, 'error': 'channel 不能为空或未知渠道'}
    try:
        _write_im_config(channel, fields)
        reload = _safe_reload_llms()
        result = {'ok': True}
        if not reload['ok']:
            result['warning'] = f"LLM 重载失败: {reload['error']}"
        return result
    except Exception as e:
        response.status = 500
        return {'ok': False, 'error': str(e)}


def _restore_im_processes():
    state = _load_im_state().get('channels', {})
    for channel, meta in state.items():
        if channel not in IM_CHANNEL_RUNTIME:
            continue
        if not meta.get('managed_by_webui') or not meta.get('auto_restart'):
            continue
        try:
            _start_im_process(channel)
            entry = IM_PROCESS_REGISTRY.get(channel)
            if entry:
                entry['message'] = '后端重启后已自动恢复'
        except Exception as e:
            IM_PROCESS_REGISTRY[channel] = {
                'process': None,
                'pid': None,
                'started_at': None,
                'last_exit_code': None,
                'log_path': _im_log_path(channel),
                'message': f'自动恢复失败: {e}',
            }


_restore_im_processes()


@app.get('/api/im/status')
def api_im_status():
    statuses = {}
    for key in IM_CHANNEL_SCHEMA.keys():
        statuses[key] = _normalize_im_registry(key)
    return {'ok': True, 'statuses': statuses}


@app.get('/api/im/log/<channel>')
def api_im_log(channel):
    if channel not in IM_CHANNEL_SCHEMA:
        response.status = 400
        return {'ok': False, 'error': '未知渠道'}
    status = _normalize_im_registry(channel)
    lines = int(request.query.get('lines') or 200)
    chars = int(request.query.get('chars') or 20000)
    content, truncated = _read_log_content(status.get('log_path'), max_lines=lines, max_chars=chars)
    return {
        'ok': True,
        'channel': channel,
        'log_path': status.get('log_path'),
        'exists': os.path.exists(status.get('log_path') or ''),
        'content': content,
        'truncated': truncated,
    }


@app.post('/api/im/log/<channel>/clear')
def api_im_clear_log(channel):
    if channel not in IM_CHANNEL_SCHEMA:
        response.status = 400
        return {'ok': False, 'error': '未知渠道'}
    log_path = _im_log_path(channel)
    _ensure_im_runtime_dir()
    with open(log_path, 'w', encoding='utf-8') as f:
        pass
    entry = IM_PROCESS_REGISTRY.get(channel)
    if entry:
        entry['log_path'] = log_path
    return {'ok': True, 'log_path': log_path}


@app.post('/api/im/auto-restart/<channel>')
def api_im_auto_restart(channel):
    if channel not in IM_CHANNEL_SCHEMA:
        response.status = 400
        return {'ok': False, 'error': '未知渠道'}
    payload = request.json or {}
    enabled = bool(payload.get('enabled'))
    _update_im_state(channel, managed_by_webui=True, auto_restart=enabled)
    status = _normalize_im_registry(channel)
    return {'ok': True, 'status': status}


@app.post('/api/im/start/<channel>')
def api_im_start(channel):
    if channel not in IM_CHANNEL_SCHEMA:
        response.status = 400
        return {'ok': False, 'error': '未知渠道'}
    try:
        status = _start_im_process(channel)
        return {'ok': True, 'status': status}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


@app.post('/api/im/stop/<channel>')
def api_im_stop(channel):
    if channel not in IM_CHANNEL_SCHEMA:
        response.status = 400
        return {'ok': False, 'error': '未知渠道'}
    try:
        status = _stop_im_process(channel)
        return {'ok': True, 'status': status}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


@app.post('/api/im/restart/<channel>')
def api_im_restart(channel):
    if channel not in IM_CHANNEL_SCHEMA:
        response.status = 400
        return {'ok': False, 'error': '未知渠道'}
    try:
        _stop_im_process(channel)
        status = _start_im_process(channel)
        return {'ok': True, 'status': status}
    except Exception as e:
        response.status = 400
        return {'ok': False, 'error': str(e)}


@app.post('/api/im/test/<channel>')
def api_im_test(channel):
    """Test IM channel configuration."""
    if channel not in IM_CHANNEL_SCHEMA:
        response.status = 400
        return {'ok': False, 'error': '未知渠道'}

    raw = _read_im_config()
    schema = IM_CHANNEL_SCHEMA[channel]

    missing = _validate_im_required(channel, raw)
    if missing:
        return {'ok': False, 'error': f'缺少配置项: {", ".join(missing)}'}

    try:
        if channel == 'feishu':
            return _test_feishu(raw)
        elif channel == 'telegram':
            return _test_telegram(raw)
        elif channel == 'wecom':
            return _test_wecom(raw)
        elif channel == 'dingtalk':
            return _test_dingtalk(raw)
        elif channel == 'qq':
            return {'ok': True, 'message': 'QQ 配置格式正确（需运行 qqapp.py 验证实际连接）'}
        elif channel == 'wechat':
            return {'ok': True, 'message': '微信无需配置，运行 wechatapp.py 扫码登录'}
        elif channel == 'streamlit':
            return {'ok': True, 'message': 'Streamlit 内置，无需配置'}
        return {'ok': False, 'error': '该渠道暂不支持测试'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def _test_feishu(raw):
    app_id = raw.get('fs_app_id', '').strip("'\"")
    secret = raw.get('fs_app_secret', '').strip("'\"")
    if not app_id or not secret:
        return {'ok': False, 'error': '缺少 fs_app_id 或 fs_app_secret'}
    try:
        import urllib.request, urllib.parse
        url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'
        body = json.dumps({'app_id': app_id, 'app_secret': secret}).encode()
        req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read().decode())
        if data.get('code') == 0:
            return {'ok': True, 'message': '飞书连接成功'}
        return {'ok': False, 'error': f"飞书返回错误: {data.get('msg', '未知错误')}"}
    except Exception as e:
        return {'ok': False, 'error': f'连接失败: {e}'}


def _test_telegram(raw):
    token = raw.get('tg_bot_token', '').strip("'\"")
    if not token:
        return {'ok': False, 'error': '缺少 tg_bot_token'}
    try:
        import urllib.request
        url = f'https://api.telegram.org/bot{token}/getMe'
        req = urllib.request.Request(url, method='GET')
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read().decode())
        if data.get('ok'):
            bot = data.get('result', {})
            return {'ok': True, 'message': f"Bot 连接成功: @{bot.get('username', 'unknown')}"}
        return {'ok': False, 'error': f"Telegram 返回错误: {data.get('description', '未知错误')}"}
    except Exception as e:
        return {'ok': False, 'error': f'连接失败: {e}'}


def _test_wecom(raw):
    bot_id = raw.get('wecom_bot_id', '').strip("'\"")
    secret = raw.get('wecom_secret', '').strip("'\"")
    if not bot_id or not secret:
        return {'ok': False, 'error': '缺少 wecom_bot_id 或 wecom_secret'}
    return {'ok': True, 'message': '企业微信配置格式正确（需运行 wecomapp.py 验证实际连接）'}


def _test_dingtalk(raw):
    client_id = raw.get('dingtalk_client_id', '').strip("'\"")
    secret = raw.get('dingtalk_client_secret', '').strip("'\"")
    if not client_id or not secret:
        return {'ok': False, 'error': '缺少 dingtalk_client_id 或 dingtalk_client_secret'}
    try:
        import urllib.request, urllib.parse
        url = 'https://api.dingtalk.com/v1.0/oauth2/accessToken'
        body = json.dumps({'appKey': client_id, 'appSecret': secret}).encode()
        req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read().decode())
        if data.get('accessToken'):
            return {'ok': True, 'message': '钉钉连接成功'}
        return {'ok': False, 'error': f"钉钉返回错误: {data.get('errmsg', '未知错误')}"}
    except Exception as e:
        return {'ok': False, 'error': f'连接失败: {e}'}


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
