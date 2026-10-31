from contextlib import contextmanager
import os
import re
import threading
import uuid
from collections import OrderedDict

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from openai import APIConnectionError, APIStatusError, APITimeoutError, AuthenticationError, OpenAI, RateLimitError


load_dotenv()

SYSTEM_PROMPT = (
    "You are Mira, a thoughtful and friendly everyday AI companion. "
    "Keep answers clear, warm, and useful. Ask a brief follow-up question "
    "when it would help the conversation."
)
MAX_HISTORY_MESSAGES = 12
MAX_CONVERSATIONS = 100
MAX_MESSAGE_LENGTH = 4000

app = Flask(__name__, static_folder="static", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024

_histories = OrderedDict()
_conversation_locks = {}
_lock_users = {}
_state_lock = threading.Lock()


@contextmanager
def _conversation_turn(conversation_id):
    with _state_lock:
        lock = _conversation_locks.setdefault(conversation_id, threading.Lock())
        _lock_users[conversation_id] = _lock_users.get(conversation_id, 0) + 1
    try:
        with lock:
            yield
    finally:
        with _state_lock:
            users = _lock_users[conversation_id] - 1
            if users:
                _lock_users[conversation_id] = users
            else:
                del _lock_users[conversation_id]
                del _conversation_locks[conversation_id]


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.post("/api/chat")
def chat():
    if not request.is_json:
        return jsonify(error="Please send your message as JSON."), 415
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Please send a valid JSON message."), 400

    message = payload.get("message")
    if not isinstance(message, str) or not message.strip():
        return jsonify(error="Write a message before sending."), 400
    message = message.strip()
    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify(error=f"Messages must be {MAX_MESSAGE_LENGTH} characters or fewer."), 400

    conversation_id = payload.get("conversation_id") or str(uuid.uuid4())
    if not isinstance(conversation_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", conversation_id):
        return jsonify(error="That conversation could not be found. Start a new chat."), 400

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return jsonify(error="The chat service is not configured yet. Add OPENAI_API_KEY to your environment."), 503

    with _conversation_turn(conversation_id):
        with _state_lock:
            history = list(_histories.get(conversation_id, []))
            if conversation_id in _histories:
                _histories.move_to_end(conversation_id)

        try:
            client = OpenAI(api_key=api_key, timeout=30.0)
            response = client.chat.completions.create(
                model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    *history,
                    {"role": "user", "content": message},
                ],
            )
        except RateLimitError:
            return jsonify(error="The chat service is busy right now. Please try again in a moment."), 429
        except APITimeoutError:
            return jsonify(error="The chat service took too long to respond. Please try again."), 504
        except APIConnectionError:
            return jsonify(error="Could not reach the chat service. Check your connection and try again."), 503
        except AuthenticationError:
            return jsonify(error="The chat service rejected its API key. Please check the server configuration."), 502
        except APIStatusError:
            return jsonify(error="The chat service had a problem. Please try again shortly."), 502

        if not response.choices:
            return jsonify(error="The chat service returned an empty reply. Please try again."), 502
        answer = response.choices[0].message.content
        if not isinstance(answer, str) or not answer.strip():
            return jsonify(error="The chat service returned an empty reply. Please try again."), 502

        with _state_lock:
            history.extend(
                [
                    {"role": "user", "content": message},
                    {"role": "assistant", "content": answer.strip()},
                ]
            )
            _histories[conversation_id] = history[-MAX_HISTORY_MESSAGES:]
            _histories.move_to_end(conversation_id)
            while len(_histories) > MAX_CONVERSATIONS:
                _histories.popitem(last=False)

        return jsonify(reply=answer.strip(), conversation_id=conversation_id)


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify(error="That message is too large. Please shorten it and try again."), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
