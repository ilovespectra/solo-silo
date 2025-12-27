const apiBase = `${window.location.origin}/api`;

async function fetchJSON(path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function setStatus(data) {
  document.querySelector("#files-count").textContent = `${data.files_indexed} files`;
  document.querySelector("#faces-count").textContent = `${data.faces_indexed} faces`;
  document.querySelector("#path-label").textContent = data.photos_path || "";
}

async function loadStatus() {
  try {
    const data = await fetchJSON("/status");
    setStatus(data);
  } catch (err) {
    console.error(err);
  }
}

async function startIndexing(path) {
  const log = document.querySelector("#index-log");
  log.textContent = "Indexing...";
  try {
    const result = await fetchJSON("/index", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    log.textContent = `Indexed ${result.indexed} files from ${result.path}`;
    await Promise.all([loadStatus(), loadFiles(), loadPeople()]);
  } catch (err) {
    log.textContent = `Failed: ${err.message}`;
  }
}

function renderResults(results) {
  const container = document.querySelector("#results");
  container.innerHTML = "";
  if (!results || results.length === 0) {
    container.innerHTML = '<p class="muted">No matches yet.</p>';
    return;
  }
  results.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    const score = (item.score || 0).toFixed(3);
    card.innerHTML = `
      <div class="card-body">
        <p class="muted">Score ${score}</p>
        <p class="path">${item.file_path || item.path}</p>
      </div>
    `;
    container.appendChild(card);
  });
}

async function runSearch(query) {
  const container = document.querySelector("#results");
  container.innerHTML = '<p class="muted">Searching…</p>';
  try {
    const data = await fetchJSON(`/search?q=${encodeURIComponent(query)}`);
    renderResults(data.results || []);
  } catch (err) {
    container.innerHTML = `<p class="muted">${err.message}</p>`;
  }
}

function renderPeople(people) {
  const holder = document.querySelector("#people");
  holder.innerHTML = "";
  if (!people || people.length === 0) {
    holder.innerHTML = '<p class="muted">No clusters yet.</p>';
    return;
  }
  people.forEach((person) => {
    const card = document.createElement("div");
    card.className = "person";
    card.innerHTML = `
      <div>
        <p class="muted">${person.face_count} faces</p>
        <p class="path">${person.name || "Unnamed"} • ${person.cluster_id}</p>
      </div>
      <div class="rename">
        <input type="text" value="${person.name || ""}" placeholder="Name" />
        <button>Save</button>
      </div>
    `;
    const input = card.querySelector("input");
    const button = card.querySelector("button");
    button.addEventListener("click", async () => {
      try {
        await fetchJSON(`/people/${encodeURIComponent(person.cluster_id)}/name`, {
          method: "POST",
          body: JSON.stringify({ name: input.value }),
        });
        await loadPeople();
      } catch (err) {
        alert(err.message);
      }
    });
    holder.appendChild(card);
  });
}

async function loadPeople() {
  try {
    const data = await fetchJSON("/people");
    renderPeople(data.people || []);
  } catch (err) {
    console.error(err);
  }
}

function renderFiles(files) {
  const holder = document.querySelector("#files");
  holder.innerHTML = "";
  if (!files || files.length === 0) {
    holder.innerHTML = '<p class="muted">No files yet.</p>';
    return;
  }
  files.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <span class="path">${file.path}</span>
      <span class="muted">${file.width || "?"}x${file.height || "?"}</span>
    `;
    holder.appendChild(row);
  });
}

async function loadFiles() {
  try {
    const data = await fetchJSON("/files?limit=12");
    renderFiles(data.files || []);
  } catch (err) {
    console.error(err);
  }
}

function bindEvents() {
  const indexForm = document.querySelector("#index-form");
  indexForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const path = document.querySelector("#index-path").value.trim();
    if (path) {
      startIndexing(path);
    }
  });

  const searchForm = document.querySelector("#search-form");
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.querySelector("#search-query").value.trim();
    if (q) {
      runSearch(q);
    }
  });

  document.querySelector("#refresh-status").addEventListener("click", loadStatus);
}

async function bootstrap() {
  bindEvents();
  await Promise.all([loadStatus(), loadFiles(), loadPeople()]);
}

document.addEventListener("DOMContentLoaded", bootstrap);
