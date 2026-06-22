/*
 * Nalepi isključivo objavljeni Google Apps Script Web App /exec URL.
 * Primer: https://script.google.com/macros/s/DEPLOYMENT_ID/exec
 */
const API_URL =
  "https://script.google.com/macros/s/AKfycbztoPDv2q4kMqgAC_y1bSP5LhG_Y38919Up8qwGVg4S46DnDLGGoC9dmzxJclTUpIBk/exec";

const state = {
  projects: [],
  currentProject: null,
  currentEntries: [],
  report: [],
  reportProject: null,
  pin: "",
  editingEntry: null,
};

const elements = {
  views: document.querySelectorAll(".view"),
  navItems: document.querySelectorAll(".nav-item"),
  projectsGrid: document.querySelector("#projectsGrid"),
  projectsLoading: document.querySelector("#projectsLoading"),
  projectsEmpty: document.querySelector("#projectsEmpty"),
  addProjectButton: document.querySelector("#addProjectButton"),
  projectView: document.querySelector("#projectView"),
  projectDetailTitle: document.querySelector("#projectDetailTitle"),
  projectTotalHours: document.querySelector("#projectTotalHours"),
  projectWorkingDays: document.querySelector("#projectWorkingDays"),
  projectEntryCount: document.querySelector("#projectEntryCount"),
  projectEntriesList: document.querySelector("#projectEntriesList"),
  entriesLoading: document.querySelector("#entriesLoading"),
  entriesEmpty: document.querySelector("#entriesEmpty"),
  backToProjectsButton: document.querySelector("#backToProjectsButton"),
  deleteCurrentProjectButton: document.querySelector(
    "#deleteCurrentProjectButton",
  ),
  addEntryButton: document.querySelector("#addEntryButton"),
  reportMonth: document.querySelector("#reportMonth"),
  exportProjectReportButton: document.querySelector(
    "#exportProjectReportButton",
  ),
  reportLoading: document.querySelector("#reportLoading"),
  reportEmpty: document.querySelector("#reportEmpty"),
  reportProjectsList: document.querySelector("#reportProjectsList"),
  reportsOverview: document.querySelector("#reportsOverview"),
  reportProjectDetail: document.querySelector("#reportProjectDetail"),
  reportProjectTitle: document.querySelector("#reportProjectTitle"),
  reportDetailMonthLabel: document.querySelector("#reportDetailMonthLabel"),
  reportProjectTotalHours: document.querySelector("#reportProjectTotalHours"),
  reportEntriesList: document.querySelector("#reportEntriesList"),
  reportEntriesEmpty: document.querySelector("#reportEntriesEmpty"),
  backToReportButton: document.querySelector("#backToReportButton"),
  projectModal: document.querySelector("#projectModal"),
  projectForm: document.querySelector("#projectForm"),
  projectName: document.querySelector("#projectName"),
  projectFormError: document.querySelector("#projectFormError"),
  saveProjectButton: document.querySelector("#saveProjectButton"),
  entryModal: document.querySelector("#entryModal"),
  entryForm: document.querySelector("#entryForm"),
  entryDate: document.querySelector("#entryDate"),
  entryProjectName: document.querySelector("#entryProjectName"),
  entryFormError: document.querySelector("#entryFormError"),
  saveEntryButton: document.querySelector("#saveEntryButton"),
  toast: document.querySelector("#toast"),
  authModal: document.querySelector("#authModal"),
  authForm: document.querySelector("#authForm"),
  pinInput: document.querySelector("#pinInput"),
  authFormError: document.querySelector("#authFormError"),
  loginButton: document.querySelector("#loginButton"),
  entryModalTitle: document.querySelector("#entryModalTitle"),
};

let toastTimer;
let jsonpRequestId = 0;

console.log("[Work Log] API_URL:", API_URL);

function isApiConfigured() {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL);
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
  return getLocalDateString().slice(0, 7);
}

function createClientId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatHours(value) {
  return Number(value || 0).toLocaleString("sr-Latn-RS", {
    maximumFractionDigits: 2,
  });
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMonth(month) {
  const date = new Date(`${month}-01T12:00:00`);
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function showToast(message, type = "success") {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", type === "error");
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(
    () => elements.toast.classList.remove("show"),
    3200,
  );
}

function showFormError(element, message) {
  element.textContent = message;
  element.classList.add("visible");
}

function clearFormError(element) {
  element.textContent = "";
  element.classList.remove("visible");
}

function setButtonLoading(button, loading, normalText, loadingText) {
  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}

function showView(viewId) {
  elements.views.forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });

  elements.navItems.forEach((item) => {
    const activeView = viewId === "projectView" ? "homeView" : viewId;
    item.classList.toggle("active", item.dataset.view === activeView);
  });

  elements.addProjectButton.classList.toggle("hidden", viewId !== "homeView");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(modal) {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

/*
 * Apps Script GET koristi JSONP kako bi radio preko file://, Live Server-a
 * i GitHub Pages-a bez CORS problema.
 */
function apiGet(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!isApiConfigured()) {
      reject(new Error("API_URL nije ispravan /exec Web App URL."));
      return;
    }

    const callbackName = `workLogCallback_${Date.now()}_${jsonpRequestId++}`;
    const script = document.createElement("script");
    const url = new URL(API_URL);
    let timeoutId;

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (result) => {
      cleanup();
      if (!result || result.success !== true) {
        reject(new Error(result?.message || "Google Apps Script API greška."));
        return;
      }
      resolve(result);
    };

    url.searchParams.set("action", action);
    url.searchParams.set("pin", state.pin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", Date.now().toString());

    script.src = url.toString();
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error("Google Apps Script nije dostupan."));
    };
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Apps Script odgovor traje predugo."));
    }, 15000);

    document.head.appendChild(script);
  });
}

/*
 * POST je no-cors jer Apps Script ne podržava standardni CORS preflight.
 * Posle svake akcije frontend ponovo učitava podatke iz Google Sheets-a.
 */
async function apiPost(payload) {
  if (!isApiConfigured()) {
    throw new Error("API_URL nije ispravan /exec Web App URL.");
  }

  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({ ...payload, pin: state.pin }),
  });

  await new Promise((resolve) => window.setTimeout(resolve, 350));
}

/*
 * no-cors POST nema čitljiv odgovor. Zato nakon izmene proveravamo konkretan
 * ID kroz GET. Tek kada se očekivano stanje pojavi u Sheets-u prikazujemo
 * poruku da je akcija uspela.
 */
async function waitForCondition(check, errorMessage) {
  let lastError;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 700));
  }

  throw lastError || new Error(errorMessage);
}

async function authenticate(pin) {
  state.pin = pin;
  const result = await apiGet("authenticate");
  return result.success === true;
}

async function login(event) {
  event.preventDefault();
  clearFormError(elements.authFormError);
  const pin = elements.pinInput.value.trim();

  if (!pin) {
    showFormError(elements.authFormError, "Unesi PIN.");
    return;
  }

  setButtonLoading(elements.loginButton, true, "Prijavi se", "Provera...");

  try {
    await authenticate(pin);
    sessionStorage.setItem("workLogPin", pin);
    closeModal(elements.authModal);
    await loadProjects();
  } catch (error) {
    state.pin = "";
    sessionStorage.removeItem("workLogPin");
    showFormError(
      elements.authFormError,
      error.message === "Pogrešan PIN."
        ? error.message
        : "Prijava nije uspela. Proveri PIN i deployment.",
    );
  } finally {
    setButtonLoading(elements.loginButton, false, "Prijavi se", "Provera...");
  }
}

function createProjectCard(project) {
  const card = document.createElement("article");
  card.className = "project-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Otvori gradilište ${project.projectName}`);

  const icon = document.createElement("div");
  icon.className = "folder-icon";
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = project.projectName;
  const subtitle = document.createElement("p");
  subtitle.textContent = "Otvori radne unose";
  text.append(title, subtitle);

  const deleteButton = document.createElement("button");
  deleteButton.className = "project-delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute(
    "aria-label",
    `Obriši gradilište ${project.projectName}`,
  );
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteProject(project);
  });

  card.addEventListener("click", () => openProject(project));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProject(project);
    }
  });
  card.append(icon, text, deleteButton);
  return card;
}

function renderProjects() {
  elements.projectsGrid.replaceChildren();
  elements.projectsEmpty.classList.toggle("hidden", state.projects.length > 0);
  state.projects.forEach((project) => {
    elements.projectsGrid.appendChild(createProjectCard(project));
  });
}

async function loadProjects() {
  console.log("[Work Log] Učitavanje gradilišta.");
  elements.projectsLoading.classList.remove("hidden");
  elements.projectsEmpty.classList.add("hidden");

  try {
    const result = await apiGet("getProjects");
    state.projects = Array.isArray(result.projects) ? result.projects : [];
    renderProjects();
  } catch (error) {
    console.error("[Work Log] Greška pri učitavanju gradilišta:", error);
    state.projects = [];
    renderProjects();
    showToast(error.message, "error");
  } finally {
    elements.projectsLoading.classList.add("hidden");
  }
}

function createEntryCard(entry, allowDelete = true) {
  const card = document.createElement("article");
  card.className = "entry-card card";

  const top = document.createElement("div");
  top.className = "entry-card-top";
  const date = document.createElement("p");
  date.className = "entry-date";
  date.textContent = formatDate(entry.date);

  const actions = document.createElement("div");
  actions.className = "entry-actions";
  const hours = document.createElement("span");
  hours.className = "entry-hours";
  hours.textContent = `${formatHours(entry.hours)} h`;
  actions.appendChild(hours);

  if (allowDelete) {
    const editButton = document.createElement("button");
    editButton.className = "entry-edit-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => openEditEntry(entry));
    actions.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.className = "entry-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", "Obriši radni unos");
    deleteButton.addEventListener("click", () => deleteEntry(entry));
    actions.appendChild(deleteButton);
  }

  const description = document.createElement("p");
  description.className = "entry-description";
  description.textContent = entry.description;

  top.append(date, actions);
  card.append(top, description);
  return card;
}

function renderProjectEntries() {
  elements.projectEntriesList.replaceChildren();
  const total = state.currentEntries.reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );
  const days = new Set(state.currentEntries.map((entry) => entry.date)).size;

  elements.projectTotalHours.textContent = formatHours(total);
  elements.projectWorkingDays.textContent = days;
  elements.projectEntryCount.textContent = state.currentEntries.length;
  elements.entriesEmpty.classList.toggle(
    "hidden",
    state.currentEntries.length > 0,
  );

  state.currentEntries.forEach((entry) => {
    elements.projectEntriesList.appendChild(createEntryCard(entry, true));
  });
}

async function loadProjectEntries() {
  if (!state.currentProject) return;

  elements.entriesLoading.classList.remove("hidden");
  elements.entriesEmpty.classList.add("hidden");
  try {
    const result = await apiGet("getEntries", {
      projectId: state.currentProject.projectId,
    });
    state.currentEntries = Array.isArray(result.entries) ? result.entries : [];
    renderProjectEntries();
  } catch (error) {
    console.error("[Work Log] Greška pri učitavanju unosa:", error);
    state.currentEntries = [];
    renderProjectEntries();
    showToast(error.message, "error");
  } finally {
    elements.entriesLoading.classList.add("hidden");
  }
}

async function openProject(project) {
  console.log("[Work Log] Ulazak u gradilište:", project);
  state.currentProject = project;
  elements.projectDetailTitle.textContent = project.projectName;
  showView("projectView");
  await loadProjectEntries();
}

async function createProject(event) {
  event.preventDefault();
  clearFormError(elements.projectFormError);
  const projectName = elements.projectName.value.trim();
  console.log("[Work Log] Kreiranje gradilišta:", projectName);

  if (!projectName) {
    showFormError(elements.projectFormError, "Unesi naziv gradilišta.");
    return;
  }

  setButtonLoading(elements.saveProjectButton, true, "Save", "Saving...");
  try {
    const projectId = createClientId();
    await apiPost({ action: "createProject", projectId, projectName });
    await waitForCondition(async () => {
      const result = await apiGet("getProjects");
      return result.projects.some((project) => project.projectId === projectId);
    }, "Gradilište nije potvrđeno u Google Sheets-u.");

    elements.projectForm.reset();
    closeModal(elements.projectModal);
    await loadProjects();
    showToast("Gradilište je kreirano.");
  } catch (error) {
    console.error("[Work Log] Greška pri kreiranju gradilišta:", error);
    showFormError(elements.projectFormError, error.message);
  } finally {
    setButtonLoading(elements.saveProjectButton, false, "Save", "Saving...");
  }
}

async function createEntry(event) {
  event.preventDefault();
  clearFormError(elements.entryFormError);
  const formData = new FormData(elements.entryForm);
  const payload = {
    action: state.editingEntry ? "updateEntry" : "createEntry",
    entryId: state.editingEntry?.entryId || createClientId(),
    projectId: state.currentProject?.projectId,
    date: formData.get("date"),
    description: String(formData.get("description") || "").trim(),
    hours: Number(formData.get("hours")),
  };
  console.log(
    state.editingEntry
      ? "[Work Log] Izmena radnog unosa:"
      : "[Work Log] Kreiranje radnog unosa:",
    payload,
  );

  if (
    !payload.projectId ||
    !payload.date ||
    !payload.description ||
    payload.hours <= 0
  ) {
    showFormError(elements.entryFormError, "Popuni sva polja.");
    return;
  }

  const isEditing = Boolean(state.editingEntry);
  const normalButtonText = isEditing ? "Save changes" : "Save entry";

  setButtonLoading(
    elements.saveEntryButton,
    true,
    normalButtonText,
    "Saving...",
  );
  try {
    await apiPost(payload);
    await waitForCondition(async () => {
      const result = await apiGet("getEntries", {
        projectId: payload.projectId,
      });
      const saved = result.entries.find(
        (entry) => entry.entryId === payload.entryId,
      );
      return (
        saved &&
        saved.date === payload.date &&
        saved.description === payload.description &&
        Number(saved.hours) === Number(payload.hours)
      );
    }, "Unos nije potvrđen u Google Sheets-u.");

    const wasEditing = isEditing;
    state.editingEntry = null;
    elements.entryForm.reset();
    elements.entryDate.value = getLocalDateString();
    closeModal(elements.entryModal);
    await loadProjectEntries();
    showToast(wasEditing ? "Izmena je sačuvana." : "Radni unos je sačuvan.");
  } catch (error) {
    console.error("[Work Log] Greška pri kreiranju unosa:", error);
    showFormError(elements.entryFormError, error.message);
  } finally {
    setButtonLoading(
      elements.saveEntryButton,
      false,
      normalButtonText,
      "Saving...",
    );
  }
}

function openEditEntry(entry) {
  state.editingEntry = entry;
  elements.entryProjectName.textContent =
    state.currentProject?.projectName || "Gradilište";
  elements.entryModalTitle.textContent = "Izmeni rad";
  elements.entryDate.value = entry.date;
  elements.entryForm.elements.description.value = entry.description;
  elements.entryForm.elements.hours.value = entry.hours;
  elements.saveEntryButton.textContent = "Save changes";
  clearFormError(elements.entryFormError);
  openModal(elements.entryModal);
}

async function deleteProject(project) {
  if (
    !window.confirm(
      "Da li si sigurna da želiš da obrišeš ovo gradilište?",
    )
  ) {
    return;
  }
  if (
    !window.confirm(
      "Ovo će obrisati i sve unose za ovo gradilište. Nastaviti?",
    )
  ) {
    return;
  }
  if (!window.confirm("Poslednja potvrda: obrisati trajno?")) return;

  console.log("[Work Log] Brisanje gradilišta:", project);
  try {
    await apiPost({
      action: "deleteProject",
      projectId: project.projectId,
    });
    await waitForCondition(async () => {
      const result = await apiGet("getProjects");
      return !result.projects.some(
        (item) => item.projectId === project.projectId,
      );
    }, "Brisanje gradilišta nije potvrđeno.");

    state.currentProject = null;
    showView("homeView");
    await loadProjects();
    showToast("Gradilište je obrisano.");
  } catch (error) {
    console.error("[Work Log] Greška pri brisanju gradilišta:", error);
    showToast(error.message, "error");
  }
}

async function deleteEntry(entry) {
  if (!window.confirm("Da li želiš da obrišeš ovaj unos?")) return;
  if (!window.confirm("Potvrdi brisanje unosa.")) return;

  console.log("[Work Log] Brisanje unosa:", entry);
  try {
    await apiPost({ action: "deleteEntry", entryId: entry.entryId });
    await waitForCondition(async () => {
      const result = await apiGet("getEntries", {
        projectId: state.currentProject.projectId,
      });
      return !result.entries.some((item) => item.entryId === entry.entryId);
    }, "Brisanje unosa nije potvrđeno.");

    await loadProjectEntries();
    showToast("Unos je obrisan.");
  } catch (error) {
    console.error("[Work Log] Greška pri brisanju unosa:", error);
    showToast(error.message, "error");
  }
}

function createReportCard(item) {
  const card = document.createElement("button");
  card.className = "report-card";
  card.type = "button";

  const text = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = item.projectName;
  const subtitle = document.createElement("p");
  subtitle.textContent = `${item.workingDays} radnih dana`;
  text.append(title, subtitle);

  const hours = document.createElement("span");
  hours.className = "report-hours";
  hours.textContent = `${formatHours(item.totalHours)} h`;
  card.append(text, hours);
  card.addEventListener("click", () => openReportProject(item));
  return card;
}

function renderReport() {
  elements.reportProjectsList.replaceChildren();
  elements.reportEmpty.classList.toggle("hidden", state.report.length > 0);
  state.report.forEach((item) => {
    elements.reportProjectsList.appendChild(createReportCard(item));
  });
}

async function loadReport() {
  console.log("[Work Log] Učitavanje reporta:", elements.reportMonth.value);
  elements.reportLoading.classList.remove("hidden");
  elements.reportEmpty.classList.add("hidden");
  try {
    const result = await apiGet("getReport", {
      month: elements.reportMonth.value,
    });
    state.report = Array.isArray(result.report) ? result.report : [];
    renderReport();
  } catch (error) {
    console.error("[Work Log] Greška pri učitavanju reporta:", error);
    state.report = [];
    renderReport();
    showToast(error.message, "error");
  } finally {
    elements.reportLoading.classList.add("hidden");
  }
}

async function exportProjectReportToGoogleSheets() {
  const month = elements.reportMonth.value;
  const project = state.reportProject;
  console.log("[Work Log] Export gradilišta u Google Sheets:", {
    project,
    month,
  });

  if (!month || !project) {
    showToast("Izaberi gradilište i mesec za export.", "error");
    return;
  }

  setButtonLoading(
    elements.exportProjectReportButton,
    true,
    "Export ovog gradilišta u Google Sheets",
    "Exporting...",
  );

  try {
    await apiPost({
      action: "exportReport",
      projectId: project.projectId,
      month,
    });
    showToast(`Kreiran je report za: ${project.projectName}`);
  } catch (error) {
    console.error("[Work Log] Greška pri exportu reporta:", error);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(
      elements.exportProjectReportButton,
      false,
      "Export ovog gradilišta u Google Sheets",
      "Exporting...",
    );
  }
}

async function openReportProject(item) {
  state.reportProject = item;
  elements.reportsOverview.classList.add("hidden");
  elements.reportProjectDetail.classList.remove("hidden");
  elements.reportProjectTitle.textContent = item.projectName;
  elements.reportDetailMonthLabel.textContent = formatMonth(
    elements.reportMonth.value,
  );
  elements.reportProjectTotalHours.textContent =
    `${formatHours(item.totalHours)} h`;
  elements.reportEntriesList.replaceChildren();

  try {
    const result = await apiGet("getEntries", {
      projectId: item.projectId,
      month: elements.reportMonth.value,
    });
    const entries = Array.isArray(result.entries) ? result.entries : [];
    elements.reportEntriesEmpty.classList.toggle("hidden", entries.length > 0);
    entries.forEach((entry) => {
      elements.reportEntriesList.appendChild(createEntryCard(entry, false));
    });
  } catch (error) {
    elements.reportEntriesEmpty.classList.remove("hidden");
    showToast(error.message, "error");
  }
}

function showReportsOverview() {
  elements.reportProjectDetail.classList.add("hidden");
  elements.reportsOverview.classList.remove("hidden");
}

elements.navItems.forEach((item) => {
  item.addEventListener("click", async () => {
    const viewId = item.dataset.view;
    showView(viewId);
    if (viewId === "homeView") {
      state.currentProject = null;
      await loadProjects();
    } else {
      showReportsOverview();
      await loadReport();
    }
  });
});

elements.addProjectButton.addEventListener("click", () => {
  clearFormError(elements.projectFormError);
  openModal(elements.projectModal);
  window.setTimeout(() => elements.projectName.focus(), 80);
});

document.querySelectorAll("[data-close-project-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(elements.projectModal));
});

elements.addEntryButton.addEventListener("click", () => {
  state.editingEntry = null;
  clearFormError(elements.entryFormError);
  elements.entryProjectName.textContent =
    state.currentProject?.projectName || "Gradilište";
  elements.entryModalTitle.textContent = "Dodaj rad";
  elements.saveEntryButton.textContent = "Save entry";
  elements.entryForm.reset();
  elements.entryDate.value = getLocalDateString();
  openModal(elements.entryModal);
  window.setTimeout(() => elements.entryDate.focus(), 80);
});

document.querySelectorAll("[data-close-entry-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    state.editingEntry = null;
    closeModal(elements.entryModal);
  });
});

elements.authForm.addEventListener("submit", login);
elements.projectForm.addEventListener("submit", createProject);
elements.entryForm.addEventListener("submit", createEntry);
elements.backToProjectsButton.addEventListener("click", () => {
  state.currentProject = null;
  showView("homeView");
});
elements.deleteCurrentProjectButton.addEventListener("click", () => {
  if (state.currentProject) deleteProject(state.currentProject);
});
elements.reportMonth.addEventListener("change", () => {
  showReportsOverview();
  loadReport();
});
elements.exportProjectReportButton.addEventListener(
  "click",
  exportProjectReportToGoogleSheets,
);
elements.backToReportButton.addEventListener("click", showReportsOverview);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (elements.projectModal.classList.contains("open")) {
    closeModal(elements.projectModal);
  }
  if (elements.entryModal.classList.contains("open")) {
    closeModal(elements.entryModal);
  }
});

elements.reportMonth.value = getCurrentMonth();
elements.entryDate.value = getLocalDateString();

async function initializeApp() {
  const storedPin = sessionStorage.getItem("workLogPin");

  if (!storedPin) {
    elements.pinInput.focus();
    return;
  }

  try {
    await authenticate(storedPin);
    closeModal(elements.authModal);
    await loadProjects();
  } catch (error) {
    state.pin = "";
    sessionStorage.removeItem("workLogPin");
    elements.pinInput.focus();
  }
}

initializeApp();
