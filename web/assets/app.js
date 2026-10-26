const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  tasks: [],
  view: "dashboard",
  filter: "all",
  search: "",
  demo: new URLSearchParams(location.search).get("demo") === "1" || location.protocol === "file:",
};

const els = {
  sidebar: $(".sidebar"),
  demoBanner: $("#demoBanner"),
  taskForm: $("#taskForm"),
  createDialog: $("#createDialog"),
  taskDialog: $("#taskDialog"),
  formStatus: $("#formStatus"),
  toast: $("#toast"),
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function demoRecipient(email, complete = false, reminders = 0) {
  return {
    email,
    displayName: email.split("@")[0].replace(/[._]/g, " "),
    completionStatus: complete ? "complete" : "incomplete",
    completedAtUtc: complete ? new Date().toISOString() : null,
    lastReminderAtUtc: reminders ? new Date().toISOString() : null,
    reminderCount: reminders,
  };
}

function demoLoad() {
  const saved = localStorage.getItem("llx-taskflow-empty-v2");
  if (saved) {
    try { return JSON.parse(saved); } catch { /* reset below */ }
  }
  const tasks = [];
  localStorage.setItem("llx-taskflow-empty-v2", JSON.stringify(tasks));
  return tasks;
}

function demoSave(tasks) {
  localStorage.setItem("llx-taskflow-empty-v2", JSON.stringify(tasks));
}

async function demoApi(path, options = {}) {
  await new Promise(resolve => setTimeout(resolve, 120));
  const tasks = demoLoad();
  const method = options.method || "GET";
  const parts = path.split("?")[0].split("/").filter(Boolean);
  if (path === "/api/client-config") return { testRecipient: "xixili0818@gmail.com", timezone: "America/New_York", maxRecipients: 50 };
  if (path === "/api/tasks" && method === "GET") return tasks;
  if (path === "/api/tasks" && method === "POST") {
    const payload = JSON.parse(options.body);
    const now = new Date().toISOString();
    const task = { ...payload, id: uuid(), tenantId: "default", recordType: "task", status: "active", dueAtUtc: payload.dueAt, publishedAtUtc: now, createdAtUtc: now, updatedAtUtc: now, createdBy: "xi.li@quantive.bio", recipients: payload.recipients.map(email => demoRecipient(typeof email === "string" ? email : email.email)), events: [] };
    delete task.dueAt;
    tasks.unshift(task); demoSave(tasks); return { task, delivery: { sent: task.recipients.length, failed: [] } };
  }
  const id = parts[2];
  const task = tasks.find(item => item.id === id);
  if (!task) throw new Error("Task not found");
  if (parts.length === 3 && method === "GET") return task;
  if (parts.length === 3 && method === "PATCH") { Object.assign(task, JSON.parse(options.body), { updatedAtUtc: new Date().toISOString() }); demoSave(tasks); return task; }
  const action = parts[3];
  if (action === "cancel") { task.status = "cancelled"; demoSave(tasks); return task; }
  if (action === "remind") { const pending = task.recipients.filter(item => item.completionStatus !== "complete"); pending.forEach(item => { item.reminderCount = (item.reminderCount || 0) + 1; item.lastReminderAtUtc = new Date().toISOString(); }); demoSave(tasks); return { task, delivery: { sent: pending.length, failed: [] } }; }
  if (action === "recipients" && parts[5] === "complete") { const email = decodeURIComponent(parts[4]); const recipient = task.recipients.find(item => item.email === email); if (recipient) { recipient.completionStatus = "complete"; recipient.completedAtUtc = new Date().toISOString(); } if (task.recipients.every(item => item.completionStatus === "complete")) task.status = "completed"; demoSave(tasks); return task; }
  throw new Error("Unsupported preview action");
}

async function api(path, options = {}) {
  if (state.demo) return demoApi(path, options);
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function parseNumberList(value) {
  return [...new Set(String(value).split(",").map(item => Number.parseInt(item.trim(), 10)).filter(Number.isInteger))];
}

function messageToHtml(value) {
  return String(value).split(/\n{2,}/).map(block => `<p>${esc(block).replaceAll("\n", "<br>")}</p>`).join("");
}

function formPayload() {
  const data = new FormData(els.taskForm);
  const dueAt = new Date(data.get("dueAt"));
  return {
    title: data.get("title"), taskType: data.get("taskType"), priority: data.get("priority"),
    emailSubject: data.get("emailSubject"), dueAt: dueAt.toISOString(), actionUrl: data.get("actionUrl"),
    recipients: String(data.get("recipients")).split(/\r?\n|,/).map(value => value.trim().toLowerCase()).filter(Boolean),
    htmlBody: messageToHtml(data.get("message")), plainTextBody: data.get("message"),
    reminderPolicy: { daysAfterPublication: parseNumberList(data.get("daysAfter")), daysBeforeDue: parseNumberList(data.get("daysBefore")), overdueFrequencyDays: Number.parseInt(data.get("overdueFrequency"), 10), excludeWeekends: data.get("excludeWeekends") === "on" },
  };
}

function completion(task) {
  const total = task.recipients?.length || 0;
  const complete = task.recipients?.filter(item => item.completionStatus === "complete").length || 0;
  return { total, complete, pending: total - complete, percent: total ? Math.round(complete / total * 100) : 0 };
}

function isOverdue(task) {
  return task.status === "active" && task.dueAtUtc && new Date(task.dueAtUtc) < new Date();
}

function shortDate(value) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function relativeDue(task) {
  if (!task.dueAtUtc) return "No due date";
  const days = Math.ceil((new Date(task.dueAtUtc) - new Date()) / 86400000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

function statusBadge(status) { return `<span class="status-badge ${esc(status)}">${esc(status)}</span>`; }
function progressMarkup(task) { const value = completion(task); return `<div class="progress-wrap"><div class="progress-label"><span>${value.complete} of ${value.total}</span><strong>${value.percent}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${value.percent}%"></div></div></div>`; }

function renderDashboard() {
  const active = state.tasks.filter(task => task.status === "active");
  const totals = active.map(completion);
  const avg = totals.length ? Math.round(totals.reduce((sum, item) => sum + item.percent, 0) / totals.length) : 0;
  $("#activeStat").textContent = active.length;
  $("#completionStat").textContent = `${avg}%`;
  $("#pendingStat").textContent = totals.reduce((sum, item) => sum + item.pending, 0);
  $("#overdueStat").textContent = active.filter(isOverdue).length;
  const dashboardTasks = active.slice(0, 4);
  $("#dashboardTasks").innerHTML = dashboardTasks.length ? dashboardTasks.map(task => `
    <article class="dashboard-task">
      <div class="task-title"><strong>${esc(task.title)}</strong><small>${statusBadge(task.status)} &nbsp; ${esc(task.taskType || "general")}</small></div>
      ${progressMarkup(task)}
      <div class="due-date ${isOverdue(task) ? "overdue" : ""}"><strong>${esc(relativeDue(task))}</strong>${esc(shortDate(task.dueAtUtc))}</div>
      <button class="row-menu" data-open-task="${esc(task.id)}" aria-label="Open ${esc(task.title)}">›</button>
    </article>`).join("") : `<div class="attention-empty">No active tasks. Create a task to get started.</div>`;

  const overdue = active.filter(isOverdue);
  const lowProgress = active.filter(task => !isOverdue(task) && completion(task).percent < 50);
  const attention = [
    ...overdue.map(task => ({ danger: true, icon: "!", title: task.title, body: `${completion(task).pending} people pending · ${relativeDue(task)}` })),
    ...lowProgress.slice(0, 2).map(task => ({ danger: false, icon: "↗", title: task.title, body: `${completion(task).percent}% complete · ${relativeDue(task)}` })),
  ].slice(0, 4);
  $("#attentionList").innerHTML = attention.length ? attention.map(item => `<div class="attention-item ${item.danger ? "danger" : ""}"><span class="attention-dot">${item.icon}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p></div></div>`).join("") : `<div class="attention-empty">Everything is on track.</div>`;

  const recent = [...state.tasks].sort((a, b) => new Date(b.updatedAtUtc || b.createdAtUtc) - new Date(a.updatedAtUtc || a.createdAtUtc)).slice(0, 3);
  $("#activityList").innerHTML = recent.map(task => `<div class="activity-item"><span class="activity-avatar">${task.status === "completed" ? "✓" : "XL"}</span><div><p><strong>${esc(task.title)}</strong> ${task.status === "completed" ? "was completed" : "is being tracked"}.</p><time>${esc(shortDate(task.updatedAtUtc || task.createdAtUtc))}</time></div></div>`).join("");
}

function filteredTasks() {
  const query = state.search.trim().toLowerCase();
  return state.tasks.filter(task => {
    const statusMatch = state.filter === "all" || task.status === state.filter;
    const haystack = `${task.title} ${task.emailSubject} ${(task.recipients || []).map(item => item.email).join(" ")}`.toLowerCase();
    return statusMatch && (!query || haystack.includes(query));
  });
}

function renderTaskTable() {
  const tasks = filteredTasks();
  $("#taskTableCount").textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
  $("#taskTableBody").innerHTML = tasks.map(task => `<tr>
    <td><div class="table-title"><strong>${esc(task.title)}</strong><small>${esc(task.taskType || "General")} · ${completion(task).total} recipients</small></div></td>
    <td>${statusBadge(task.status)}</td>
    <td><span class="${isOverdue(task) ? "overdue-text" : ""}">${esc(shortDate(task.dueAtUtc))}</span></td>
    <td><div class="table-progress">${progressMarkup(task)}</div></td>
    <td><span class="owner"><span class="avatar">XL</span>Xi Li</span></td>
    <td><button class="row-menu" data-open-task="${esc(task.id)}" aria-label="Open task">›</button></td>
  </tr>`).join("");
  $(".table-scroll").hidden = tasks.length === 0;
  $("#emptyTasks").hidden = tasks.length !== 0;
}

function renderAll() { renderDashboard(); renderTaskTable(); }

async function loadTasks() {
  $("#dashboardTasks").setAttribute("aria-busy", "true");
  try { state.tasks = await api("/api/tasks"); renderAll(); }
  catch (error) { showToast(error.message, true); $("#dashboardTasks").innerHTML = `<div class="attention-empty">Unable to load tasks.</div>`; }
  finally { $("#dashboardTasks").removeAttribute("aria-busy"); }
}

function setView(view) {
  state.view = view;
  $$(".view").forEach(item => item.classList.toggle("active", item.id === `${view}View`));
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  els.sidebar.classList.remove("open");
}

function showToast(message, error = false) {
  els.toast.textContent = message;
  els.toast.className = `toast show${error ? " error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.className = "toast", 3300);
}

function openCreate() {
  els.taskForm.reset();
  els.taskForm.elements.daysAfter.value = "3";
  els.taskForm.elements.daysBefore.value = "3, 1, 0";
  els.taskForm.elements.overdueFrequency.value = "1";
  els.taskForm.elements.excludeWeekends.checked = true;
  const due = new Date(); due.setDate(due.getDate() + 7); due.setHours(17, 0, 0, 0);
  els.taskForm.elements.dueAt.value = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  els.taskForm.elements.recipients.value = "xixili0818@gmail.com\nxixili@bu.edu";
  els.formStatus.textContent = "";
  els.createDialog.showModal();
}

async function showTask(taskId) {
  try {
    const task = await api(`/api/tasks/${taskId}`);
    const value = completion(task);
    $("#dialogTitle").textContent = task.title;
    $("#detailType").textContent = `${task.taskType || "general"} task`;
    $("#detailSubtitle").textContent = task.emailSubject;
    const recipients = (task.recipients || []).map(recipient => `<tr><td><strong>${esc(recipient.displayName || recipient.email.split("@")[0])}</strong><br><span class="muted-text">${esc(recipient.email)}</span></td><td><span class="recipient-state ${recipient.completionStatus === "complete" ? "complete" : ""}">${recipient.completionStatus === "complete" ? "Complete" : "Pending"}</span></td><td>${recipient.reminderCount || 0}</td><td>${recipient.completionStatus === "complete" ? esc(shortDate(recipient.completedAtUtc)) : `<button class="text-button" data-complete="${esc(recipient.email)}" data-task="${esc(task.id)}">Mark complete</button>`}</td></tr>`).join("");
    const actionButtons = [
      task.status === "active" && value.pending ? `<button class="button primary small" data-task-action="remind" data-task="${esc(task.id)}">Remind ${value.pending} pending</button>` : "",
      task.status === "active" ? `<button class="button danger small" data-task-action="cancel" data-task="${esc(task.id)}">Cancel task</button>` : "",
      task.actionUrl ? `<a class="button-link" href="${esc(task.actionUrl)}" target="_blank" rel="noreferrer">Open task link ↗</a>` : "",
    ].join("");
    $("#dialogBody").innerHTML = `
      <div class="detail-summary"><div class="completion-ring" style="--progress:${value.percent}%"><div class="completion-ring-content"><strong>${value.percent}%</strong><span>${value.complete} of ${value.total} complete</span></div></div><div class="detail-facts"><div class="fact"><span>Status</span><strong>${statusBadge(task.status)}</strong></div><div class="fact"><span>Due date</span><strong>${esc(shortDate(task.dueAtUtc))}</strong></div><div class="fact"><span>Priority</span><strong>${esc(task.priority || "Normal")}</strong></div><div class="fact"><span>Reminders</span><strong>${(task.recipients || []).reduce((sum, item) => sum + (item.reminderCount || 0), 0)} sent</strong></div></div></div>
      <div class="detail-actions">${actionButtons}</div>
      <div class="recipient-heading"><h3>Employee progress</h3><span>${value.pending} pending</span></div>
      <div class="table-scroll"><table class="recipient-table"><thead><tr><th>Employee</th><th>Status</th><th>Reminders</th><th>Completed</th></tr></thead><tbody>${recipients}</tbody></table></div>`;
    els.taskDialog.showModal();
  } catch (error) { showToast(error.message, true); }
}

async function taskAction(action, taskId) {
  const messages = { remind: "Send a reminder to every pending recipient now?", cancel: "Cancel this task and stop future reminders?" };
  if (!confirm(messages[action])) return;
  try {
    const result = await api(`/api/tasks/${taskId}/${action}`, { method: "POST", body: "{}" });
    if (action === "remind") showToast(`${result.delivery.sent} reminder${result.delivery.sent === 1 ? "" : "s"} sent.`);
    if (action === "cancel") showToast("Task cancelled.");
    await loadTasks();
    await showTask(taskId);
  } catch (error) { showToast(error.message, true); }
}

els.taskForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!els.taskForm.reportValidity()) return;
  els.formStatus.textContent = "Creating task…";
  els.formStatus.className = "form-status";
  try {
    const result = await api("/api/tasks", { method: "POST", body: JSON.stringify(formPayload()) });
    els.createDialog.close();
    const failed = result.delivery.failed?.length || 0;
    if (failed) {
      showToast(`Task created. ${result.delivery.sent} email${result.delivery.sent === 1 ? "" : "s"} sent; ${failed} failed.`, true);
    } else {
      showToast(`Task created and sent to ${result.delivery.sent} recipient${result.delivery.sent === 1 ? "" : "s"}.`);
    }
    els.taskForm.reset();
    await loadTasks();
  } catch (error) { els.formStatus.textContent = error.message; els.formStatus.className = "form-status error"; }
});

document.addEventListener("click", async event => {
  const create = event.target.closest(".open-create"); if (create) openCreate();
  const close = event.target.closest(".close-modal"); if (close) els.createDialog.close();
  const nav = event.target.closest("[data-view]"); if (nav) setView(nav.dataset.view);
  const link = event.target.closest("[data-view-link]"); if (link) setView(link.dataset.viewLink);
  const open = event.target.closest("[data-open-task]"); if (open) await showTask(open.dataset.openTask);
  const action = event.target.closest("[data-task-action]"); if (action) await taskAction(action.dataset.taskAction, action.dataset.task);
  const complete = event.target.closest("[data-complete]");
  if (complete) {
    try { await api(`/api/tasks/${complete.dataset.task}/recipients/${encodeURIComponent(complete.dataset.complete)}/complete`, { method: "POST", body: "{}" }); showToast(`${complete.dataset.complete} marked complete.`); await loadTasks(); await showTask(complete.dataset.task); }
    catch (error) { showToast(error.message, true); }
  }
});

$("#closeTaskDialog").addEventListener("click", () => els.taskDialog.close());
$("#mobileMenu").addEventListener("click", () => els.sidebar.classList.toggle("open"));
$("#taskSearch").addEventListener("input", event => { state.search = event.target.value; renderTaskTable(); });
$$('.filter-tab').forEach(button => button.addEventListener("click", () => { state.filter = button.dataset.filter; $$('.filter-tab').forEach(item => item.classList.toggle("active", item === button)); renderTaskTable(); }));
$("#resetDemo").addEventListener("click", () => { localStorage.removeItem("llx-taskflow-empty-v2"); loadTasks(); showToast("Local tasks cleared."); });

if (state.demo) els.demoBanner.hidden = false;
loadTasks();
