/* =========================
   VolunteerHub script.js
   - Works with: index.html, history.html, organizations.html
   - Uses localStorage (saved in this browser)
   - Uses modal UI (Log Hours / Add Organization)
   - PASSWORD LOCK: Owner vs View-only
   ========================= */

/* ---------- PASSWORD LOCK (Owner vs View-only) ---------- */
/* ✅ Change this password */
const OWNER_PASSWORD = "CHANGE_THIS_PASSWORD";

/*
  sessionStorage values:
  - vh_role = "owner"  -> can add/edit/delete
  - vh_role = "viewer" -> view-only (no edits)
*/
function getRole(){
  return sessionStorage.getItem("vh_role") || "";
}
function isOwner(){
  return getRole() === "owner";
}
function setViewer(){
  sessionStorage.setItem("vh_role","viewer");
}
function setOwner(){
  sessionStorage.setItem("vh_role","owner");
}

/* shows a choice every time you try to edit:
   - enter password (owner)
   - or "not owner: view only"
*/
function askForAccess(){
  // if already chosen this tab, keep it
  if(getRole()==="owner" || getRole()==="viewer") return getRole();

  const wantsOwner = confirm(
    "Owner access?\n\nOK = I am the owner (enter password)\nCancel = Not owner (view only)"
  );

  if(!wantsOwner){
    setViewer();
    alert("View-only mode enabled.");
    return "viewer";
  }

  const pw = prompt("Enter owner password:");
  if(pw === OWNER_PASSWORD){
    setOwner();
    alert("Owner mode enabled.");
    return "owner";
  }

  setViewer();
  alert("Wrong password. View-only mode enabled.");
  return "viewer";
}

function requireOwner(){
  if(isOwner()) return true;
  askForAccess();
  if(isOwner()) return true;
  alert("View-only mode: you can’t add/edit/delete.");
  return false;
}

/* Disable/enable UI based on role */
function applyRoleUI(){
  // Hide/disable buttons that change data if not owner
  const ownerOnlySelectors = [
    "#logHoursBtn",
    "#addOrgBtn"
  ];

  const viewer = !isOwner();

  ownerOnlySelectors.forEach(sel=>{
    const el = document.querySelector(sel);
    if(!el) return;
    el.disabled = viewer;
    el.style.opacity = viewer ? "0.6" : "1";
    el.style.cursor = viewer ? "not-allowed" : "pointer";
    if(viewer) el.setAttribute("title","View-only mode");
    else el.removeAttribute("title");
  });

  // If modal is open and user is viewer, close it
  if(viewer){
    const overlay = document.getElementById("modalOverlay");
    if(overlay && overlay.classList.contains("show")){
      overlay.classList.remove("show");
    }
  }
}

/* ---------- Helpers ---------- */
function $(id){ return document.getElementById(id); }

function safeText(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function parseDate(s){
  const [y,m,d] = String(s).split("-").map(Number);
  return new Date(y, (m||1)-1, d||1);
}

function prettyDate(s){
  return parseDate(s).toLocaleDateString(undefined,{month:"short", day:"numeric", year:"numeric"});
}

function newestFirst(data){
  return data.slice().sort((a,b)=>parseDate(b.date)-parseDate(a.date));
}

function makeId(){
  return "e_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}

/* ---------- Storage ---------- */
const ENTRIES_KEY = "vh_entries_v1";
const ORGS_KEY    = "vh_orgs_v1";

function loadEntries(){
  try{
    const raw = localStorage.getItem(ENTRIES_KEY);
    if(raw){
      const list = JSON.parse(raw);
      list.forEach(e=>{ if(!e.id) e.id = makeId(); });
      return list;
    }
  }catch(e){}
  const starter =
    (typeof volunteerData !== "undefined" && Array.isArray(volunteerData))
      ? volunteerData.slice()
      : [];
  starter.forEach(e=>{ if(!e.id) e.id = makeId(); });
  return starter;
}

function saveEntries(list){
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(list));
}

function loadOrgs(){
  try{
    const raw = localStorage.getItem(ORGS_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return (typeof orgContacts !== "undefined" && orgContacts && typeof orgContacts === "object")
    ? { ...orgContacts }
    : {};
}

function saveOrgs(map){
  localStorage.setItem(ORGS_KEY, JSON.stringify(map));
}

let entries = loadEntries();
let orgs    = loadOrgs();

/* ---------- Calculations ---------- */
function calcTotals(data){
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const total = data.reduce((s,e)=>s + Number(e.hours||0), 0);

  const year = data
    .filter(e => parseDate(e.date).getFullYear() === y)
    .reduce((s,e)=>s + Number(e.hours||0), 0);

  const month = data
    .filter(e=>{
      const dt = parseDate(e.date);
      return dt.getFullYear()===y && dt.getMonth()===m;
    })
    .reduce((s,e)=>s + Number(e.hours||0), 0);

  const orgCount = new Set(data.map(e=>e.organization)).size;

  return { total, year, month, orgCount, currentYear:y };
}

function orgPrimaryCategory(org){
  const items = entries.filter(e=>e.organization===org);
  if(!items.length) return "Community Service";
  const counts = {};
  items.forEach(e=>{
    const c = e.category || "Community Service";
    counts[c] = (counts[c]||0) + 1;
  });
  return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
}

/* =========================
   Page Renderers
   ========================= */

/* ---------- Dashboard ---------- */
function renderDashboard(){
  if(!$("totalHours")) return;

  const t = calcTotals(entries);

  $("totalHours").textContent = t.total.toFixed(1);
  if($("monthHours")) $("monthHours").textContent = t.month.toFixed(1);
  if($("yearHours"))  $("yearHours").textContent  = t.year.toFixed(1);
  if($("orgCount"))   $("orgCount").textContent   = t.orgCount;
  if($("yearLabel"))  $("yearLabel").textContent  = t.currentYear;

  const recent = $("recentList");
  if(recent){
    recent.innerHTML = "";
    newestFirst(entries).slice(0,5).forEach(e=>{
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="badgeIcon">📄</div>
        <div style="flex:1;">
          <div class="itemTop">
            <div>
              <div class="itemTitle">${safeText(e.activity)}</div>
              <div class="itemMeta">
                <span>🏢 ${safeText(e.organization)}</span>
                <span>📅 ${safeText(prettyDate(e.date))}</span>
              </div>
            </div>
            <span class="pill">⏱ ${safeText(e.hours)}h</span>
          </div>
        </div>
      `;
      recent.appendChild(div);
    });
  }

  renderChart();
}

function monthLabel(d){
  return d.toLocaleDateString(undefined,{month:"short"});
}

function renderChart(){
  const canvas = $("hoursChart");
  if(!canvas) return;
  if(typeof Chart === "undefined") return;

  const sorted = newestFirst(entries);
  const newest = sorted.length ? parseDate(sorted[0].date) : new Date();

  const months = [];
  const labels = [];
  for(let i=5;i>=0;i--){
    const dt = new Date(newest.getFullYear(), newest.getMonth()-i, 1);
    months.push(dt);
    labels.push(monthLabel(dt));
  }

  const values = months.map(dt=>{
    const y = dt.getFullYear();
    const m = dt.getMonth();
    return entries
      .filter(e=>{
        const d = parseDate(e.date);
        return d.getFullYear()===y && d.getMonth()===m;
      })
      .reduce((s,e)=>s + Number(e.hours||0), 0);
  });

  const ctx = canvas.getContext("2d");
  if(window._vhChart) window._vhChart.destroy();

  window._vhChart = new Chart(ctx,{
    type:"line",
    data:{
      labels,
      datasets:[{
        label:"Hours",
        data: values,
        tension:0.35,
        fill:true
      }]
    },
    options:{
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } }
    }
  });
}

/* ---------- History ---------- */
function renderHistory(){
  if(!$("historyList")) return;

  const search = $("searchBox");
  const select = $("categorySelect");
  const list = $("historyList");
  const stats = $("historyStats");

  if(select && select.dataset.filled !== "1"){
    const cats = Array.from(new Set(entries.map(e=>e.category || "Community Service"))).sort();
    cats.forEach(c=>{
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });
    select.dataset.filled = "1";
  }

  function apply(){
    const q = (search?.value || "").trim().toLowerCase();
    const cat = select?.value || "all";

    const filtered = newestFirst(entries).filter(e=>{
      const matchText =
        String(e.organization||"").toLowerCase().includes(q) ||
        String(e.activity||"").toLowerCase().includes(q);

      const matchCat = (cat==="all") ? true : (e.category===cat);
      return matchText && matchCat;
    });

    list.innerHTML = "";
    filtered.forEach(e=>{
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="badgeIcon">📄</div>
        <div style="flex:1;">
          <div class="itemTop">
            <div>
              <div class="itemTitle">${safeText(e.activity)}</div>
              <div class="itemMeta">
                <span>🏢 ${safeText(e.organization)}</span>
                <span>📅 ${safeText(prettyDate(e.date))}</span>
              </div>
              <div class="itemMeta" style="margin-top:8px;">
                <span class="pill" style="background:#eaf2ff;border-color:#dce9ff;color:#1d4ed8;">
                  ${safeText(e.category || "Community Service")}
                </span>
              </div>
            </div>

            <div style="display:flex; gap:8px; align-items:center;">
              <span class="pill">⏱ ${safeText(e.hours)}h</span>

              <button type="button"
                      class="btnGhost editEntryBtn"
                      data-id="${safeText(e.id)}"
                      style="padding:8px 10px;border-radius:12px;font-weight:900;"
                      ${isOwner() ? "" : "disabled"}
                      title="${isOwner() ? "" : "View-only mode"}">
                ✏ Edit
              </button>
              <button type="button"
                      class="btnGhost deleteEntryBtn"
                      data-id="${safeText(e.id)}"
                      style="padding:8px 10px;border-radius:12px;font-weight:900;"
                      ${isOwner() ? "" : "disabled"}
                      title="${isOwner() ? "" : "View-only mode"}">
                🗑 Delete
              </button>
            </div>
          </div>
        </div>
      `;
      list.appendChild(div);
    });

    const total = filtered.reduce((s,e)=>s + Number(e.hours||0), 0);
    if(stats) stats.textContent = `${filtered.length} entries • ${total.toFixed(1)} total hours`;
  }

  if(search && !search.dataset.hooked){
    search.addEventListener("input", apply);
    search.dataset.hooked = "1";
  }
  if(select && !select.dataset.hooked){
    select.addEventListener("change", apply);
    select.dataset.hooked = "1";
  }

  apply();
  hookHistoryActions();
}

/* history edit/delete buttons (locked) */
function hookHistoryActions(){
  const list = $("historyList");
  if(!list || list.dataset.actionsHooked === "1") return;

  list.addEventListener("click", (e)=>{
    const editBtn = e.target.closest?.(".editEntryBtn");
    const delBtn  = e.target.closest?.(".deleteEntryBtn");

    if(delBtn){
      if(!requireOwner()) return;
      const id = delBtn.getAttribute("data-id");
      const idx = entries.findIndex(x=>x.id === id);
      if(idx === -1) return;
      if(!confirm("Delete this log?")) return;
      entries.splice(idx,1);
      saveEntries(entries);
      rerenderAll();
      return;
    }

    if(editBtn){
      if(!requireOwner()) return;
      const id = editBtn.getAttribute("data-id");
      const entry = entries.find(x=>x.id === id);
      if(!entry) return;

      showModal("log", { mode:"edit", entryId:id });
      $("fOrg").value = entry.organization || "";
      $("fActivity").value = entry.activity || "";
      $("fDate").value = entry.date || new Date().toISOString().slice(0,10);
      $("fHours").value = entry.hours ?? "";
      $("fCategory").value = entry.category || "Community Service";
      return;
    }
  });

  list.dataset.actionsHooked = "1";
}

/* ---------- Organizations ---------- */
function renderOrganizations(){
  if(!$("orgGrid")) return;

  const grid  = $("orgGrid");
  const stats = $("orgStats");

  const byOrg = {};
  const sessions = {};
  entries.forEach(e=>{
    const org = e.organization;
    byOrg[org] = (byOrg[org]||0) + Number(e.hours||0);
    sessions[org] = (sessions[org]||0) + 1;
  });

  const items = Object.keys(byOrg)
    .map(orgName=>({
      org: orgName,
      hours: byOrg[orgName],
      sessions: sessions[orgName],
      category: orgPrimaryCategory(orgName),
      contact: orgs[orgName] || { person:"(add contact)", email:"(add email)" }
    }))
    .sort((a,b)=>b.hours-a.hours);

  if(stats) stats.textContent = `${items.length} organization${items.length===1?"":"s"}`;

  grid.innerHTML = "";
  items.forEach(x=>{
    const card = document.createElement("div");
    card.className = "orgCard";
    card.innerHTML = `
      <div class="orgTop">
        <div>
          <h3 class="orgName">${safeText(x.org)}</h3>
          <div class="tag">${safeText(x.category)}</div>
        </div>

        <button class="orgMenuBtn" type="button" data-org="${safeText(x.org)}" aria-label="Edit organization"
                style="border:none;background:transparent;color:#94a3b8;font-weight:900;font-size:18px;cursor:pointer;"
                ${isOwner() ? "" : "disabled"}
                title="${isOwner() ? "" : "View-only mode"}">
          ⋮
        </button>
      </div>

      <div class="orgInfo">
        <div>👤 ${safeText(x.contact.person)}</div>
        <div>✉ ${safeText(x.contact.email)}</div>
      </div>

      <div class="hr"></div>

      <div class="orgBottom">
        <span>⏱ ${safeText(x.hours.toFixed(1))}h</span>
        <span style="color:#94a3b8;">•</span>
        <span style="color:#64748b;">${safeText(x.sessions)} session${x.sessions===1?"":"s"}</span>
      </div>
    `;
    grid.appendChild(card);
  });

  hookOrgMenu();
}

function hookOrgMenu(){
  const grid = $("orgGrid");
  if(!grid || grid.dataset.menuHooked === "1") return;

  grid.addEventListener("click", (e)=>{
    const btn = e.target.closest?.(".orgMenuBtn");
    if(!btn) return;
    if(!requireOwner()) return;

    const orgName = btn.getAttribute("data-org");
    if(!orgName) return;

    showModal("org");

    if($("oName")){
      $("oName").value = orgName;
      $("oName").disabled = true;
    }

    const c = orgs[orgName] || {};
    if($("oPerson")) $("oPerson").value = (c.person && c.person !== "(add contact)") ? c.person : "";
    if($("oEmail"))  $("oEmail").value  = (c.email  && c.email  !== "(add email)")   ? c.email  : "";

    const submitBtn = document.querySelector("#orgForm .btnPrimary");
    if(submitBtn) submitBtn.textContent = "Save Contact";
  });

  grid.dataset.menuHooked = "1";
}

/* ---------- Modals ---------- */
let _logMode = "add";
let _editEntryId = null;

function setErr(id, msg){
  const el = $(id);
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
}

function clearErr(id){
  const el = $(id);
  if(!el) return;
  el.textContent = "";
  el.className = "formError";
}

function closeModal(){
  const overlay = $("modalOverlay");
  if(overlay) overlay.classList.remove("show");

  const logForm = $("logForm");
  const orgForm = $("orgForm");

  if(logForm) logForm.reset();
  if(orgForm) orgForm.reset();

  if($("oName")) $("oName").disabled = false;

  clearErr("logError");
  clearErr("orgError");

  _logMode = "add";
  _editEntryId = null;

  const logSubmit = document.querySelector("#logForm .btnPrimary");
  if(logSubmit) logSubmit.textContent = "Save Hours";
  const orgSubmit = document.querySelector("#orgForm .btnPrimary");
  if(orgSubmit) orgSubmit.textContent = "Add Organization";
}

function showModal(kind, opts={}){
  const overlay = $("modalOverlay");
  if(!overlay) return;

  const logForm = $("logForm");
  const orgForm = $("orgForm");

  clearErr("logError");
  clearErr("orgError");

  overlay.classList.add("show");

  if(kind === "log"){
    _logMode = opts.mode || "add";
    _editEntryId = opts.entryId || null;

    if($("modalTitle")) $("modalTitle").textContent = (_logMode === "edit") ? "Edit Log" : "Log Hours";
    if($("modalSub"))   $("modalSub").textContent   = (_logMode === "edit") ? "Update this volunteer session" : "Add a volunteer session";

    if(logForm) logForm.style.display = "block";
    if(orgForm) orgForm.style.display = "none";

    const submitBtn = document.querySelector("#logForm .btnPrimary");
    if(submitBtn) submitBtn.textContent = (_logMode === "edit") ? "Save Changes" : "Save Hours";

    if($("fDate") && _logMode !== "edit") $("fDate").value = new Date().toISOString().slice(0,10);
    if($("fOrg")) $("fOrg").focus();
  }else{
    if($("modalTitle")) $("modalTitle").textContent = "Add Organization";
    if($("modalSub"))   $("modalSub").textContent   = "Save an organization contact";

    if(logForm) logForm.style.display = "none";
    if(orgForm) orgForm.style.display = "block";

    const submitBtn = document.querySelector("#orgForm .btnPrimary");
    if(submitBtn) submitBtn.textContent = "Add Organization";

    if($("oName")) $("oName").focus();
  }
}

/* ---------- Buttons + Events ---------- */
function hookButtons(){
  // open buttons (LOCKED)
  const logBtn = $("logHoursBtn");
  if(logBtn && !logBtn.dataset.hooked){
    logBtn.addEventListener("click", ()=>{
      if(!requireOwner()) return;
      showModal("log");
    });
    logBtn.dataset.hooked = "1";
  }

  const addOrgBtn = $("addOrgBtn");
  if(addOrgBtn && !addOrgBtn.dataset.hooked){
    addOrgBtn.addEventListener("click", ()=>{
      if(!requireOwner()) return;
      showModal("org");
    });
    addOrgBtn.dataset.hooked = "1";
  }

  // close buttons
  const closeBtn = $("modalClose");
  if(closeBtn && !closeBtn.dataset.hooked){
    closeBtn.addEventListener("click", closeModal);
    closeBtn.dataset.hooked = "1";
  }

  const logCancel = $("logCancel");
  if(logCancel && !logCancel.dataset.hooked){
    logCancel.addEventListener("click", closeModal);
    logCancel.dataset.hooked = "1";
  }

  const orgCancel = $("orgCancel");
  if(orgCancel && !orgCancel.dataset.hooked){
    orgCancel.addEventListener("click", closeModal);
    orgCancel.dataset.hooked = "1";
  }

  // click outside closes
  const overlay = $("modalOverlay");
  if(overlay && !overlay.dataset.hooked){
    overlay.addEventListener("click", (e)=>{
      if(e.target === overlay) closeModal();
    });
    overlay.dataset.hooked = "1";
  }

  // submit log hours (LOCKED)
  const logForm = $("logForm");
  if(logForm && !logForm.dataset.hooked){
    logForm.addEventListener("submit", (e)=>{
      e.preventDefault();
      if(!requireOwner()) return;

      const organization = ($("fOrg")?.value || "").trim();
      const activity = ($("fActivity")?.value || "").trim();
      const date = $("fDate")?.value;
      const hours = Number($("fHours")?.value);
      const category = $("fCategory")?.value || "Community Service";

      if(!organization) return setErr("logError", "Please enter an organization.");
      if(!activity) return setErr("logError", "Please enter an activity description.");
      if(!date) return setErr("logError", "Please pick a date.");
      if(!Number.isFinite(hours) || hours <= 0) return setErr("logError", "Hours must be a number greater than 0.");

      if(_logMode === "edit" && _editEntryId){
        const idx = entries.findIndex(x=>x.id === _editEntryId);
        if(idx === -1) return setErr("logError", "Could not find that log to edit.");
        entries[idx] = { ...entries[idx], organization, activity, date, hours, category };
      }else{
        entries.push({ id: makeId(), organization, activity, date, hours, category });
      }

      saveEntries(entries);

      if(!orgs[organization]){
        orgs[organization] = { person:"(add contact)", email:"(add email)" };
        saveOrgs(orgs);
      }

      rerenderAll();
      closeModal();
    });

    logForm.dataset.hooked = "1";
  }

  // submit add org / save contact (LOCKED)
  const orgForm = $("orgForm");
  if(orgForm && !orgForm.dataset.hooked){
    orgForm.addEventListener("submit", (e)=>{
      e.preventDefault();
      if(!requireOwner()) return;

      const name = ($("oName")?.value || "").trim();
      const person = ($("oPerson")?.value || "").trim() || "(add contact)";
      const email = ($("oEmail")?.value || "").trim() || "(add email)";

      if(!name) return setErr("orgError", "Please enter the organization name.");

      orgs[name] = { person, email };
      saveOrgs(orgs);

      rerenderAll();
      closeModal();
    });

    orgForm.dataset.hooked = "1";
  }
}

function rerenderAll(){
  renderDashboard();
  renderHistory();
  renderOrganizations();
  applyRoleUI(); // keep buttons correct after rerender
}

/* =========================
   Boot
   ========================= */
hookButtons();
rerenderAll();
applyRoleUI();
