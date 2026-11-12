const $ = (id) => document.getElementById(id);
const list = $("list");

let todos = [];
let filter = "all";
let priority = 1;
let sortMode = "new";
try { sortMode = localStorage.getItem("todo-sort") || "new"; } catch (e) {}

// Aufgaben ohne Fälligkeitsdatum kommen beim Sortieren nach Datum ans Ende
function byDue(a, b) {
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due) return -1;
  if (b.due) return 1;
  return 0;
}

function sortTodos(items) {
  const byPrio = (a, b) => b.priority - a.priority;
  const byNew = (a, b) => b.id - a.id;
  const cmp =
    sortMode === "prio"
      ? (a, b) => byPrio(a, b) || byDue(a, b) || byNew(a, b)
      : sortMode === "due"
      ? (a, b) => byDue(a, b) || byPrio(a, b) || byNew(a, b)
      : byNew;
  return [...items].sort(cmp);
}

const PRIO_LABEL = { 0: "Niedrig", 1: "Normal", 2: "Hoch" };
const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ARCHIVE_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>';
const RESTORE_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
const TRASH_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14"/></svg>';

/* ---------- API ---------- */
async function api(path, method = "GET", body) {
  if (location.protocol === "file:") {
    throw new Error("Bitte über http://localhost:8000 öffnen, nicht per Doppelklick auf die Datei");
  }
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("Server nicht erreichbar – läuft app.py noch?");
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))).error;
    throw new Error(err || `Serverfehler (${res.status})`);
  }
  return res.json();
}

async function load() {
  try {
    todos = await api("/api/todos");
    // Ältere, noch nicht archivierte erledigte Aufgaben ebenfalls ins Archiv schieben
    if (todos.some((t) => t.done && !t.archived)) {
      await api("/api/todos/archive-done", "POST");
      todos = await api("/api/todos");
    }
    render();
  } catch (e) {
    toast(e.message);
  }
}

/* ---------- Hilfsfunktionen ---------- */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dueInfo(todo) {
  if (!todo.due) return null;
  const [y, m, d] = todo.due.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  if (todo.done) return { label, cls: "" };
  const t = todayStr();
  if (todo.due < t) return { label: `Überfällig · ${label}`, cls: "overdue" };
  if (todo.due === t) return { label: "Heute", cls: "today" };
  return { label, cls: "" };
}

/* ---------- Rendering ---------- */
function render() {
  const active = todos.filter((t) => !t.archived);
  const archived = todos.filter((t) => t.archived);
  const open = active.length;
  const done = archived.length; // erledigte Aufgaben liegen im Archiv
  const inArchive = filter === "archive";

  $("c-all").textContent = active.length;
  $("c-archive").textContent = archived.length;

  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
  $("progress-label").textContent = `${done} von ${todos.length} erledigt`;
  $("progress-pct").textContent = `${pct} %`;
  $("bar-fill").style.width = `${pct}%`;

  const visible = sortTodos(inArchive ? archived : active);

  list.innerHTML = "";
  for (const todo of visible) list.appendChild(renderItem(todo));

  const empty = $("empty");
  empty.hidden = visible.length > 0;
  $("empty-text").textContent = inArchive
    ? "Das Archiv ist leer."
    : active.length === 0
    ? "Noch keine Aufgaben. Leg oben die erste an."
    : filter === "done"
    ? "Noch nichts erledigt."
    : "Alles erledigt. Gut gemacht!";

  $("foot-info").textContent = inArchive
    ? archived.length === 1 ? "1 Aufgabe im Archiv" : `${archived.length} Aufgaben im Archiv`
    : open === 1 ? "1 Aufgabe offen" : `${open} Aufgaben offen`;
  $("clear-archive").hidden = !inArchive || archived.length === 0;
}

function renderItem(todo) {
  const li = document.createElement("li");
  li.className = "item" + (todo.done ? " done" : "") + (todo.archived ? " archived" : "");
  li.dataset.id = todo.id;

  const check = document.createElement("button");
  check.className = "check";
  check.setAttribute("aria-label", todo.done ? "Wieder öffnen" : "Erledigt");
  check.innerHTML = CHECK_SVG;
  if (todo.archived) check.disabled = true;
  else {
    check.addEventListener("click", async () => {
      // Abhaken: Aufgabe verschwindet kurz animiert und landet direkt im Archiv
      li.classList.add("removing");
      await new Promise((r) => setTimeout(r, 220));
      await update(todo.id, { done: true, archived: true });
      toast("Erledigt – ins Archiv verschoben");
    });
  }

  const body = document.createElement("div");
  body.className = "body";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = todo.text;
  if (!todo.archived) {
    title.title = "Doppelklick zum Bearbeiten";
    title.addEventListener("dblclick", () => startEdit(todo, title));
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  if (todo.priority !== 1) {
    const p = document.createElement("span");
    p.className = `tag p${todo.priority}`;
    p.textContent = PRIO_LABEL[todo.priority];
    meta.appendChild(p);
  }
  const due = dueInfo(todo);
  if (due) {
    const d = document.createElement("span");
    d.className = `tag ${due.cls}`;
    d.textContent = due.label;
    meta.appendChild(d);
  }

  body.append(title);
  if (meta.children.length) body.append(meta);

  const del = document.createElement("button");
  del.className = "del";
  del.setAttribute("aria-label", "Löschen");
  del.innerHTML = TRASH_SVG;
  del.addEventListener("click", () => remove(todo.id, li));

  if (todo.archived) {
    const restore = document.createElement("button");
    restore.className = "act";
    restore.title = "Wiederherstellen";
    restore.setAttribute("aria-label", "Wiederherstellen");
    restore.innerHTML = RESTORE_SVG;
    restore.addEventListener("click", async () => {
      await update(todo.id, { archived: false, done: false });
      toast("Aufgabe wiederhergestellt");
    });
    li.append(check, body, restore, del);
  } else if (todo.done) {
    const arch = document.createElement("button");
    arch.className = "act";
    arch.title = "Archivieren";
    arch.setAttribute("aria-label", "Archivieren");
    arch.innerHTML = ARCHIVE_SVG;
    arch.addEventListener("click", async () => {
      await update(todo.id, { archived: true });
      toast("Ins Archiv verschoben");
    });
    li.append(check, body, arch, del);
  } else {
    li.append(check, body, del);
  }
  return li;
}

function startEdit(todo, titleEl) {
  const input = document.createElement("input");
  input.className = "edit";
  input.value = todo.text;
  input.maxLength = 200;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const value = input.value.trim();
    if (save && value && value !== todo.text) await update(todo.id, { text: value });
    else render();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

/* ---------- Aktionen ---------- */
async function add(text, prio, due) {
  try {
    const created = await api("/api/todos", "POST", { text, priority: prio, due });
    todos.unshift(created);
    render();
  } catch (e) {
    toast(e.message);
  }
}

async function update(id, patch) {
  try {
    const updated = await api(`/api/todos/${id}`, "PATCH", patch);
    todos = todos.map((t) => (t.id === id ? updated : t));
    todos.sort((a, b) => a.done - b.done || b.id - a.id);
    render();
  } catch (e) {
    toast(e.message);
  }
}

async function remove(id, li) {
  li.classList.add("removing");
  try {
    await api(`/api/todos/${id}`, "DELETE");
    setTimeout(() => {
      todos = todos.filter((t) => t.id !== id);
      render();
    }, 200);
  } catch (e) {
    li.classList.remove("removing");
    toast(e.message);
  }
}

/* ---------- Bestätigungsdialog ---------- */
function confirmDialog({ title, text, okLabel = "Bestätigen" }) {
  return new Promise((resolve) => {
    const modal = $("modal");
    const ok = $("modal-ok");
    const cancel = $("modal-cancel");

    $("modal-title").textContent = title;
    $("modal-text").textContent = text;
    ok.textContent = okLabel;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("open"));
    cancel.focus();

    const close = (result) => {
      modal.classList.remove("open");
      setTimeout(() => { modal.hidden = true; }, 180);
      document.removeEventListener("keydown", onKey);
      modal.removeEventListener("click", onBackdrop);
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target === modal) close(false); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };

    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
  });
}

/* ---------- Events ---------- */
$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("new-text").value.trim();
  if (!text) return;
  await add(text, priority, $("new-due").value || null);
  $("new-text").value = "";
  $("new-due").value = "";
  $("new-text").focus();
});

$("prio-pick").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-p]");
  if (!btn) return;
  priority = Number(btn.dataset.p);
  document.querySelectorAll("#prio-pick button").forEach((b) => b.classList.toggle("active", b === btn));
});

$("sort").value = sortMode;
$("sort").addEventListener("change", (e) => {
  sortMode = e.target.value;
  try { localStorage.setItem("todo-sort", sortMode); } catch (err) {}
  render();
});

$("filters").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-f]");
  if (!btn) return;
  filter = btn.dataset.f;
  document.querySelectorAll("#filters button").forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

$("clear-archive").addEventListener("click", async () => {
  const n = todos.filter((t) => t.archived).length;
  const sure = await confirmDialog({
    title: "Archiv leeren?",
    text: `${n === 1 ? "Die 1 Aufgabe wird" : `Alle ${n} Aufgaben werden`} endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
    okLabel: "Endgültig löschen",
  });
  if (!sure) return;
  try {
    await api("/api/todos/archived", "DELETE");
    todos = todos.filter((t) => !t.archived);
    render();
    toast("Archiv geleert");
  } catch (e) {
    toast(e.message);
  }
});

/* Theme */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("todo-theme", theme); } catch (e) {}
}
$("theme").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});
try { applyTheme(localStorage.getItem("todo-theme") || "dark"); } catch (e) { applyTheme("dark"); }

/* Start */
$("today").textContent = new Date().toLocaleDateString("de-DE", {
  weekday: "long", day: "numeric", month: "long",
});
load();
