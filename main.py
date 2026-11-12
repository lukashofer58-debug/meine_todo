"""Todo-Liste als Flask-App (für Hostman App Platform, läuft aber auch lokal).

Lokal starten:   python main.py   ->  http://localhost:8000
Auf dem Server:  gunicorn main:app --bind 0.0.0.0:80

Optionale Umgebungsvariablen:
  APP_PASSWORD  Wenn gesetzt, fragt der Browser nach einem Passwort (Benutzername egal).
  DB_PATH       Pfad zur SQLite-Datei (Standard: todos.db neben main.py).
  HOST, PORT    Nur für den lokalen Start mit "python main.py".
"""
import hmac
import os
import re
import sqlite3
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

BASE = Path(__file__).parent
DB_FILE = Path(os.environ.get("DB_PATH", BASE / "todos.db"))
PASSWORD = os.environ.get("APP_PASSWORD", "")

# static_folder=None: Es werden nur die drei Frontend-Dateien unten ausgeliefert,
# nie main.py oder die Datenbank.
app = Flask(__name__, static_folder=None)


# ---------- Datenbank ----------
def db():
    con = sqlite3.connect(DB_FILE)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.execute(
            """CREATE TABLE IF NOT EXISTS todos (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                text     TEXT NOT NULL,
                done     INTEGER NOT NULL DEFAULT 0,
                priority INTEGER NOT NULL DEFAULT 1,
                due      TEXT,
                created  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        cols = [r["name"] for r in con.execute("PRAGMA table_info(todos)")]
        if "archived" not in cols:
            con.execute("ALTER TABLE todos ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")


init_db()


def clean_text(value):
    return str(value or "").strip()[:200]


def clean_priority(value):
    try:
        return min(2, max(0, int(value)))
    except (TypeError, ValueError):
        return 1


def clean_due(value):
    value = str(value or "").strip()
    return value if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) else None


def error(message, status):
    return jsonify({"error": message}), status


# ---------- Passwortschutz (optional) ----------
@app.before_request
def check_password():
    if not PASSWORD:
        return None
    auth = request.authorization
    if auth and auth.password and hmac.compare_digest(auth.password, PASSWORD):
        return None
    return Response(
        "Passwort erforderlich",
        401,
        {"WWW-Authenticate": 'Basic realm="Todo-Liste", charset="UTF-8"'},
    )


@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------- Frontend ----------
@app.get("/")
def index():
    return send_from_directory(BASE, "index.html")


@app.get("/style.css")
def style():
    return send_from_directory(BASE, "style.css")


@app.get("/script.js")
def script():
    return send_from_directory(BASE, "script.js")


# ---------- API ----------
@app.get("/api/todos")
def list_todos():
    with db() as con:
        rows = con.execute("SELECT * FROM todos ORDER BY archived ASC, done ASC, id DESC").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/todos")
def create_todo():
    data = request.get_json(silent=True) or {}
    text = clean_text(data.get("text"))
    if not text:
        return error("Text darf nicht leer sein", 400)
    with db() as con:
        cur = con.execute(
            "INSERT INTO todos (text, priority, due) VALUES (?, ?, ?)",
            (text, clean_priority(data.get("priority", 1)), clean_due(data.get("due"))),
        )
        row = con.execute("SELECT * FROM todos WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.post("/api/todos/archive-done")
def archive_done():
    with db() as con:
        cur = con.execute("UPDATE todos SET archived = 1 WHERE done = 1 AND archived = 0")
    return jsonify({"archived": cur.rowcount})


@app.patch("/api/todos/<int:tid>")
def update_todo(tid):
    data = request.get_json(silent=True) or {}
    fields, values = [], []
    if "text" in data:
        text = clean_text(data["text"])
        if not text:
            return error("Text darf nicht leer sein", 400)
        fields.append("text = ?")
        values.append(text)
    if "done" in data:
        fields.append("done = ?")
        values.append(1 if data["done"] else 0)
    if "priority" in data:
        fields.append("priority = ?")
        values.append(clean_priority(data["priority"]))
    if "due" in data:
        fields.append("due = ?")
        values.append(clean_due(data["due"]))
    if "archived" in data:
        fields.append("archived = ?")
        values.append(1 if data["archived"] else 0)
    if not fields:
        return error("Nichts zu ändern", 400)
    with db() as con:
        con.execute(f"UPDATE todos SET {', '.join(fields)} WHERE id = ?", (*values, tid))
        row = con.execute("SELECT * FROM todos WHERE id = ?", (tid,)).fetchone()
    if row is None:
        return error("Nicht gefunden", 404)
    return jsonify(dict(row))


@app.delete("/api/todos/archived")
def delete_archived():
    with db() as con:
        con.execute("DELETE FROM todos WHERE archived = 1")
    return jsonify({"ok": True})


@app.delete("/api/todos/<int:tid>")
def delete_todo(tid):
    with db() as con:
        con.execute("DELETE FROM todos WHERE id = ?", (tid,))
    return jsonify({"ok": True})


@app.errorhandler(404)
def not_found(_):
    return error("Nicht gefunden", 404)


@app.errorhandler(405)
def not_allowed(_):
    return error("Methode nicht erlaubt", 405)


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 8000))
    print(f"Todo-Liste läuft auf http://localhost:{port}  (Beenden mit Strg+C)")
    app.run(host=host, port=port)
