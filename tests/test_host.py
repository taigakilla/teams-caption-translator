"""Protocol and persistence checks using only synthetic captions."""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
HOST = ROOT / 'bin' / 'ciel-legendas-host'
INSTALL = ROOT / 'bin' / 'ciel-legendas-install'


def encode(messages):
    out = b''
    for message in messages:
        body = json.dumps(message).encode()
        out += struct.pack('=I', len(body)) + body
    return out


class HostTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.env = {**os.environ, 'XDG_RUNTIME_DIR': str(self.base / 'run'),
                    'XDG_STATE_HOME': str(self.base / 'state'), 'CIEL_SANDBOX': ''}
        self.sid = '2026-10-07_143210'
        self.start = {'type': 'start', 'session': self.sid, 'meeting': 'Example',
                      'source': 'en', 'target': 'pt', 'started': 1791379930000}
        self.line = {'type': 'line', 'id': 'c1', 'speaker': 'Person A',
                     'text': 'Hello', 'translation': 'Olá', 't': 1791379930000,
                     'final': False}

    def run_host(self, messages):
        return subprocess.run([sys.executable, str(HOST)], input=encode(messages),
                              env=self.env, capture_output=True, check=True)

    def read_live(self):
        return json.loads((self.base / 'run/ciel/legendas/live.json').read_text())

    def session_path(self, suffix):
        return self.base / 'state/ciel/legendas' / (self.sid + suffix)

    def test_ping_protocol(self):
        result = self.run_host([{'type': 'ping'}])
        size, = struct.unpack('=I', result.stdout[:4])
        self.assertEqual(size, len(result.stdout[4:]))
        self.assertEqual(json.loads(result.stdout[4:]), {'type': 'pong', 'v': 1})

    def test_eof_finalizes_and_resume_updates_translation(self):
        result = self.run_host([self.start, self.line])
        self.assertEqual(result.stdout, b'')
        self.assertEqual(result.stderr, b'')
        self.assertFalse(self.read_live()['active'])
        self.assertTrue(self.read_live()['lines'][0]['final'])
        self.assertIn('> Olá', self.session_path('.md').read_text())
        changed = {**self.line, 'final': True, 'translation': 'Olá!'}
        self.run_host([self.start, changed, {'type': 'stop'}])
        saved = json.loads(self.session_path('.json').read_text())
        self.assertEqual(len(saved['lines']), 1)
        self.assertEqual(saved['lines'][0]['translation'], 'Olá!')

    def test_disabled_drops_new_lines(self):
        folder = self.base / 'state/ciel'
        folder.mkdir(parents=True)
        (folder / 'legendas-settings.json').write_text('{"enabled":false}')
        self.run_host([self.start, self.line])
        self.assertFalse(self.session_path('.json').exists())
        self.assertFalse((self.base / 'run/ciel/legendas/live.json').exists())

    def test_live_keeps_last_three_but_session_keeps_all(self):
        lines = [{**self.line, 'id': f'c{i}', 'final': True} for i in range(5)]
        self.run_host([self.start, *lines])
        self.assertEqual([line['id'] for line in self.read_live()['lines']], ['c2', 'c3', 'c4'])
        self.assertEqual(len(json.loads(self.session_path('.json').read_text())['lines']), 5)

    def test_installer_with_spaces_and_uninstall(self):
        browser = self.base / 'Browser Data'
        browser.mkdir()
        command = [sys.executable, str(INSTALL), '--browser-dir', str(browser)]
        subprocess.run(command, check=True, capture_output=True)
        folder = browser / 'NativeMessagingHosts'
        manifest = json.loads((folder / 'ciel.legendas.json').read_text())
        launcher = Path(manifest['path'])
        result = subprocess.run([str(launcher)], input=encode([{'type': 'ping'}]),
                                env=self.env, check=True, capture_output=True)
        self.assertEqual(json.loads(result.stdout[4:])['type'], 'pong')
        self.assertEqual(manifest['allowed_origins'],
                         ['chrome-extension://mnahiiepnlmgngcjlhdfilnmjlnanolp/'])
        subprocess.run([*command, '--uninstall'], check=True, capture_output=True)
        self.assertFalse(launcher.exists())
        self.assertFalse((folder / 'ciel.legendas.json').exists())

    def test_macos_paths(self):
        loader = importlib.machinery.SourceFileLoader('caption_host', str(HOST))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        with patch.dict(os.environ, {'HOME': str(self.base)}, clear=True), patch.object(module.sys, 'platform', 'darwin'):
            self.assertEqual(module.runtime_dir(), str(self.base / 'Library/Caches/ciel/legendas'))
            self.assertEqual(module.state_dir(), str(self.base / 'Library/Application Support/ciel/legendas'))


if __name__ == '__main__':
    unittest.main()
