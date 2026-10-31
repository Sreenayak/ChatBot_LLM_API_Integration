import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app
from httpx import Request


class FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="A thoughtful reply."))]
        )


class FakeOpenAI:
    completions = FakeCompletions()

    def __init__(self, **_kwargs):
        self.chat = SimpleNamespace(completions=self.completions)


class ChatEndpointTests(unittest.TestCase):
    def setUp(self):
        app.app.config["TESTING"] = True
        self.client = app.app.test_client()
        app._histories.clear()
        app._conversation_locks.clear()
        app._lock_users.clear()
        FakeOpenAI.completions = FakeCompletions()
        self.patcher = patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"})
        self.patcher.start()
        self.openai_patcher = patch.object(app, "OpenAI", FakeOpenAI)
        self.openai_patcher.start()

    def tearDown(self):
        self.openai_patcher.stop()
        self.patcher.stop()

    def test_chat_keeps_history_and_trims_it_to_the_context_limit(self):
        for turn in range(7):
            response = self.client.post(
                "/api/chat",
                json={"conversation_id": "test-conversation", "message": f"Message {turn}"},
            )
            self.assertEqual(response.status_code, 200)

        response = self.client.post(
            "/api/chat",
            json={"conversation_id": "test-conversation", "message": "One more message"},
        )

        self.assertEqual(response.status_code, 200)
        messages = FakeOpenAI.completions.calls[-1]["messages"]
        self.assertEqual(len(messages), app.MAX_HISTORY_MESSAGES + 2)
        self.assertEqual(messages[0]["role"], "system")
        self.assertEqual(messages[1], {"role": "user", "content": "Message 1"})
        self.assertEqual(messages[-1], {"role": "user", "content": "One more message"})

    def test_missing_api_key_returns_a_clear_error(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.post("/api/chat", json={"message": "Hello"})

        self.assertEqual(response.status_code, 503)
        self.assertIn("OPENAI_API_KEY", response.get_json()["error"])

    def test_empty_message_is_rejected(self):
        response = self.client.post("/api/chat", json={"message": "  "})

        self.assertEqual(response.status_code, 400)
        self.assertIn("Write a message", response.get_json()["error"])

    def test_api_timeout_returns_a_clear_error(self):
        timeout = app.APITimeoutError(
            request=Request("POST", "https://api.openai.com/v1/chat/completions")
        )
        with patch.object(app, "OpenAI", side_effect=timeout):
            response = self.client.post("/api/chat", json={"message": "Hello"})

        self.assertEqual(response.status_code, 504)
        self.assertIn("too long to respond", response.get_json()["error"])

    def test_non_json_request_returns_a_clear_error(self):
        response = self.client.post("/api/chat", data="message=Hello")

        self.assertEqual(response.status_code, 415)
        self.assertIn("JSON", response.get_json()["error"])

    def test_homepage_and_assets_load(self):
        for path in ("/", "/styles.css", "/app.js", "/favicon.svg"):
            response = self.client.get(path)
            try:
                self.assertEqual(response.status_code, 200)
            finally:
                response.close()

    def test_static_page_uses_relative_asset_paths_for_live_server(self):
        response = self.client.get("/")
        try:
            html = response.get_data(as_text=True)
        finally:
            response.close()

        self.assertIn('href="./styles.css"', html)
        self.assertIn('src="./app.js"', html)
        self.assertIn("<title>Mira — a little more thoughtful</title>", html)
        self.assertIn('href="./favicon.svg"', html)


if __name__ == "__main__":
    unittest.main()
