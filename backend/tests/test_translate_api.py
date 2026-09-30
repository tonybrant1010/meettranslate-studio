"""Offline tests: a fake Gemini Live session stands in for the real API.

Run:  cd backend && python -m pytest -q
"""

import asyncio
import contextlib
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GEMINI_API_KEY", "test-key")

import gemini_bridge  # noqa: E402
from gemini_bridge import TranslateBridge, build_config  # noqa: E402


class FakeSession:
    """Echoes every audio chunk back as 'translated' audio + transcripts."""

    instances = []

    def __init__(self, fail_after=None):
        self.q: asyncio.Queue = asyncio.Queue()
        self.received = []
        self.stream_ended = False
        self.closed = False
        self.fail_after = fail_after
        FakeSession.instances.append(self)

    async def send_realtime_input(self, audio=None, audio_stream_end=None):
        if self.closed:
            raise RuntimeError("closed")
        if audio_stream_end:
            self.stream_ended = True
            return
        self.received.append(audio.data)
        n = len(self.received)
        await self.q.put(NS(go_away=None, server_content=NS(
            input_transcription=NS(text=f"in{n} "),
            output_transcription=NS(text=f"out{n} "),
            model_turn=NS(parts=[NS(inline_data=NS(data=b"\x01\x00" * 4))]),
            turn_complete=False, generation_complete=False,
        )))
        if self.fail_after and n >= self.fail_after:
            await self.q.put(RuntimeError("socket dropped"))

    async def send_go_away(self):
        await self.q.put(NS(go_away=NS(time_left="5s"), server_content=None))

    async def receive(self):
        while True:
            item = await self.q.get()
            if isinstance(item, Exception):
                raise item
            yield item


def make_connect(fail_after_first=None):
    @contextlib.asynccontextmanager
    async def connect(model, config):
        s = FakeSession(fail_after=fail_after_first if not FakeSession.instances else None)
        try:
            yield s
        finally:
            s.closed = True
    return connect


def run(coro):
    return asyncio.run(coro)


def test_build_config_sets_translation():
    cfg = build_config("hu", False)
    assert cfg.translation_config.target_language_code == "hu"
    assert cfg.translation_config.echo_target_language is False
    assert cfg.response_modalities == ["AUDIO"]
    assert cfg.input_audio_transcription is not None
    assert cfg.output_audio_transcription is not None


def test_audio_roundtrip_and_transcripts():
    FakeSession.instances = []

    async def main():
        out_json, out_audio = [], []

        async def sj(p): out_json.append(p)
        async def sa(b): out_audio.append(b)

        br = TranslateBridge(connect_fn=make_connect(), model="m", target="hu", echo=False,
                             send_json=sj, send_audio=sa)
        await br.start()
        for _ in range(50):
            if any(p.get("state") == "ready" for p in out_json):
                break
            await asyncio.sleep(0.01)
        await br.push_audio(b"\x00\x00" * 1600)
        await br.push_audio(b"\x00\x00" * 1600)
        await asyncio.sleep(0.1)
        await br.close()
        return out_json, out_audio

    js, au = run(main())
    types_ = [p["type"] for p in js]
    assert "input" in types_ and "output" in types_
    assert len(au) == 2


def test_buffer_before_ready_is_flushed():
    FakeSession.instances = []

    async def main():
        async def noop(_): pass
        br = TranslateBridge(connect_fn=make_connect(), model="m", target="en", echo=True,
                             send_json=noop, send_audio=noop)
        # audio arrives before the session is open
        await br.push_audio(b"a")
        await br.push_audio(b"b")
        await br.start()
        await asyncio.sleep(0.15)
        got = list(FakeSession.instances[0].received)
        await br.close()
        return got

    assert run(main()) == [b"a", b"b"]


def test_reconnects_after_drop():
    FakeSession.instances = []

    async def main():
        states = []

        async def sj(p):
            if p["type"] == "status":
                states.append(p["state"])
        async def noop(_): pass

        br = TranslateBridge(connect_fn=make_connect(fail_after_first=1), model="m",
                             target="hu", echo=False, send_json=sj, send_audio=noop)
        await br.start()
        await asyncio.sleep(0.05)
        await br.push_audio(b"1")          # first session dies after this
        await asyncio.sleep(0.4)
        await br.push_audio(b"2")          # must reach the new session
        await asyncio.sleep(0.1)
        n = len(FakeSession.instances)
        second = FakeSession.instances[-1].received
        await br.close()
        return states, n, second

    states, n, second = run(main())
    assert n == 2
    assert "reconnecting" in states
    assert second[-1] == b"2"


def test_planned_rotation_waits_for_quiet_and_drains_old():
    FakeSession.instances = []

    async def main():
        async def noop(_): pass
        br = TranslateBridge(connect_fn=make_connect(), model="m", target="hu", echo=False,
                             send_json=noop, send_audio=noop,
                             rotate_after_s=0.2, force_rotate_after_s=60,
                             quiet_for_s=0.1, drain_s=0.2)
        await br.start()
        await asyncio.sleep(0.05)
        await br.push_audio(b"x")
        await asyncio.sleep(0.8)
        first = FakeSession.instances[0]
        await br.push_audio(b"y")
        await asyncio.sleep(0.05)
        rotations = br.rotations
        await br.close()
        return first, rotations

    first, rotations = run(main())
    assert rotations >= 1
    assert first.stream_ended          # old session was told the stream ended
    assert first.closed                # ...and closed after draining
    assert b"y" not in first.received  # new audio went to the new session


def test_go_away_triggers_rotation():
    FakeSession.instances = []

    async def main():
        async def noop(_): pass
        br = TranslateBridge(connect_fn=make_connect(), model="m", target="hu", echo=False,
                             send_json=noop, send_audio=noop, drain_s=0.1)
        await br.start()
        await asyncio.sleep(0.05)
        await FakeSession.instances[0].send_go_away()
        await asyncio.sleep(0.5)
        r = br.rotations
        await br.close()
        return r

    assert run(main()) == 1


def test_fatal_auth_error_is_reported():
    @contextlib.asynccontextmanager
    async def bad(model, config):
        raise RuntimeError("401 API key not valid")
        yield  # pragma: no cover

    async def main():
        out = []
        async def sj(p): out.append(p)
        async def noop(_): pass
        br = TranslateBridge(connect_fn=bad, model="m", target="hu", echo=False,
                             send_json=sj, send_audio=noop)
        await br.start()
        await asyncio.sleep(0.2)
        await br.close()
        return out

    out = run(main())
    assert out and out[-1]["type"] == "error" and out[-1]["fatal"]
    assert "API kulcs" in out[-1]["message"]


def test_websocket_endpoint_end_to_end():
    from fastapi.testclient import TestClient
    import server

    FakeSession.instances = []
    server.CONNECT_FN = make_connect()
    client = TestClient(server.app)

    assert client.get("/api/health").json()["has_key"] is True

    with client.websocket_connect("/ws/translate?target=hu&echo=0&label=A") as ws:
        first = json.loads(ws.receive_text())
        assert first == {"type": "status", "state": "ready"}
        ws.send_bytes(b"\x00\x00" * 1600)
        seen_audio = seen_out = False
        for _ in range(6):
            m = ws.receive()
            if m.get("bytes"):
                seen_audio = True
            elif m.get("text") and json.loads(m["text"])["type"] == "output":
                seen_out = True
            if seen_audio and seen_out:
                break
        assert seen_audio and seen_out
        ws.send_text(json.dumps({"type": "stop"}))


def test_websocket_rejects_unknown_language():
    from fastapi.testclient import TestClient
    import server

    client = TestClient(server.app)
    with client.websocket_connect("/ws/translate?target=xx") as ws:
        m = json.loads(ws.receive_text())
        assert m["type"] == "error"
