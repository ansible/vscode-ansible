"""
VS Code Ansible Environments - Progress Callback Plugin

This callback plugin sends playbook execution events to a Unix socket
for real-time progress display in VS Code. It runs alongside the
user's chosen stdout callback without interference.

CALLBACK_TYPE = 'notification' ensures this doesn't replace stdout output.
"""

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = '''
    name: vscode_progress
    type: notification
    short_description: Send playbook progress to VS Code extension
    description:
        - Sends real-time playbook execution events via Unix socket
        - Does not interfere with stdout callback
    requirements:
        - ANSIBLE_ENV_SOCKET environment variable set to socket path
'''

import json
import os
import socket
import time
from datetime import datetime

from ansible.plugins.callback import CallbackBase


class CallbackModule(CallbackBase):
    CALLBACK_VERSION = 2.0
    CALLBACK_TYPE = 'notification'
    CALLBACK_NAME = 'vscode_progress'
    CALLBACK_NEEDS_WHITELIST = True

    def __init__(self):
        super(CallbackModule, self).__init__()
        self._sock = None
        self._start_time = None
        self._play_start_time = None
        self._task_start_times = {}
        
        socket_path = os.environ.get('ANSIBLE_ENV_SOCKET')
        if socket_path:
            try:
                self._sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                self._sock.connect(socket_path)
            except Exception:
                self._sock = None

    def _send(self, event_type, data=None):
        """Send event to VS Code extension via socket."""
        if not self._sock:
            return
        try:
            msg = json.dumps({
                'type': event_type,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'data': data or {}
            }, default=str) + '\n'
            self._sock.sendall(msg.encode('utf-8'))
        except Exception:
            pass

    def _sanitize_result(self, result):
        """Clean result data for transmission."""
        if not isinstance(result, dict):
            return result
        
        sanitized = {}
        # Keys to omit (too large or sensitive)
        omit_keys = {'ansible_facts', 'ansible_env'}
        
        for key, value in result.items():
            if key in omit_keys:
                continue
            elif isinstance(value, str) and len(value) > 5000:
                sanitized[key] = value[:5000] + '\n... [truncated]'
            elif isinstance(value, (dict, list)) and len(str(value)) > 10000:
                sanitized[key] = '[large data omitted]'
            else:
                sanitized[key] = value
        
        return sanitized

    def _host_result(self, result):
        """Extract host result data."""
        task_uuid = str(result._task._uuid)
        duration = None
        if task_uuid in self._task_start_times:
            duration = time.time() - self._task_start_times[task_uuid]
        
        return {
            'host': result._host.get_name(),
            'task': result._task.get_name(),
            'task_uuid': task_uuid,
            'action': result._task.action,
            'changed': result._result.get('changed', False),
            'duration': round(duration, 2) if duration else None,
            'result': self._sanitize_result(result._result),
        }

    # === Playbook Events ===

    def v2_playbook_on_start(self, playbook):
        self._start_time = time.time()
        self._send('playbook_start', {
            'playbook': os.path.basename(playbook._file_name),
            'path': playbook._file_name,
        })

    def v2_playbook_on_play_start(self, play):
        self._play_start_time = time.time()
        self._send('play_start', {
            'name': play.get_name(),
            'uuid': str(play._uuid),
            'hosts': play.hosts if isinstance(play.hosts, list) else [play.hosts],
            'serial': play.serial,
        })

    def v2_playbook_on_task_start(self, task, is_conditional):
        task_uuid = str(task._uuid)
        self._task_start_times[task_uuid] = time.time()
        self._send('task_start', {
            'name': task.get_name(),
            'uuid': task_uuid,
            'action': task.action,
            'args': dict(task.args) if hasattr(task, 'args') else {},
            'path': task.get_path(),  # Returns "file.yml:line" or None
            'is_handler': False,
        })

    def v2_playbook_on_handler_task_start(self, task):
        task_uuid = str(task._uuid)
        self._task_start_times[task_uuid] = time.time()
        self._send('task_start', {
            'name': task.get_name(),
            'uuid': task_uuid,
            'action': task.action,
            'is_handler': True,
        })

    def v2_playbook_on_stats(self, stats):
        duration = time.time() - self._start_time if self._start_time else 0
        summary = {}
        for host in stats.processed.keys():
            host_stats = stats.summarize(host)
            summary[host] = {
                'ok': host_stats.get('ok', 0),
                'changed': host_stats.get('changed', 0),
                'failures': host_stats.get('failures', 0),
                'unreachable': host_stats.get('unreachable', 0),
                'skipped': host_stats.get('skipped', 0),
                'rescued': host_stats.get('rescued', 0),
                'ignored': host_stats.get('ignored', 0),
            }
        self._send('playbook_complete', {
            'stats': summary,
            'duration': round(duration, 2),
        })

    def v2_playbook_on_include(self, included_file):
        self._send('include', {
            'file': included_file._filename,
            'hosts': [h.get_name() for h in included_file._hosts],
        })

    # === Runner Events ===

    def v2_runner_on_start(self, host, task):
        self._send('host_task_start', {
            'host': host.get_name(),
            'task': task.get_name(),
            'task_uuid': str(task._uuid),
        })

    def v2_runner_on_ok(self, result):
        self._send('host_ok', self._host_result(result))

    def v2_runner_on_failed(self, result, ignore_errors=False):
        data = self._host_result(result)
        data['ignore_errors'] = ignore_errors
        self._send('host_failed', data)

    def v2_runner_on_skipped(self, result):
        self._send('host_skipped', self._host_result(result))

    def v2_runner_on_unreachable(self, result):
        self._send('host_unreachable', self._host_result(result))

    # === Loop Item Events ===

    def v2_runner_item_on_ok(self, result):
        data = self._host_result(result)
        data['item'] = result._result.get('item', '')
        data['item_label'] = result._result.get('ansible_loop_var', 'item')
        self._send('item_ok', data)

    def v2_runner_item_on_failed(self, result):
        data = self._host_result(result)
        data['item'] = result._result.get('item', '')
        self._send('item_failed', data)

    def v2_runner_item_on_skipped(self, result):
        data = self._host_result(result)
        data['item'] = result._result.get('item', '')
        self._send('item_skipped', data)

    # === Retry Events ===

    def v2_runner_retry(self, result):
        data = self._host_result(result)
        data['retries'] = result._result.get('retries', 0)
        data['attempts'] = result._result.get('attempts', 0)
        self._send('host_retry', data)

    # === Diff Events ===

    def v2_on_file_diff(self, result):
        if result._result.get('diff'):
            self._send('file_diff', {
                'host': result._host.get_name(),
                'task': result._task.get_name(),
                'diff': result._result.get('diff'),
            })
