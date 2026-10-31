# Lumi — a thoughtful little AI companion

A small, friendly chat app powered by the OpenAI API. Lumi remembers the
conversation, keeps the most recent 12 messages in its context, and gives you
a clean, responsive place to think out loud.

## Get started

1. Install Python 3.10 or newer.
2. Create and activate a virtual environment, then install dependencies:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and add your OpenAI API key. Keep `.env`
   private; it is excluded from Git.
4. Start the app and visit http://127.0.0.1:5000:

   ```powershell
   python app.py
   ```

   You can also set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` directly in
   your environment instead of using a `.env` file.

## Open the interface with VS Code Live Server

For a visual preview, open `static/index.html` in VS Code and choose **Open
with Live Server**. The page now loads its CSS and JavaScript with relative
paths, so it displays correctly at `/static/index.html`.

Live Server only hosts static files; it cannot run the Python API. To send
messages to the LLM, keep `python app.py` running and open
http://127.0.0.1:5000 instead. The API key must be configured as described
above.

## How it works

- `POST /api/chat` accepts `{"message": "...", "conversation_id": "..."}` and
  returns `{"reply": "...", "conversation_id": "..."}`.
- Conversation history is kept in memory per conversation. The last 12 user
  and assistant messages are sent with each request, alongside Lumi's system
  prompt. A new chat starts a fresh conversation.
- History is limited to 100 active conversations and is cleared when the
  server restarts. This is intentionally lightweight; use persistent storage
  for a multi-user production deployment.
- API/network problems return a readable JSON error and an appropriate HTTP
  status. The browser shows the error in the conversation.

## Run tests

```powershell
python -m unittest discover -s tests
```