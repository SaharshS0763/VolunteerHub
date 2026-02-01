/* =========================
   VolunteerHub script.js
   - Works with: index.html, history.html, organizations.html
   - Uses localStorage (saved in this browser)
   - Uses modal UI (Log Hours / Add Organization)
   - Adds: edit/delete history entries, edit org contacts from ⋮ button
   ========================= */

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

function uid(){
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,9);
}

/* ---------- Storage ---------- */
const ENTRIES_KEY = "vh_entries_v1";
const ORGS_KEY    = "vh_orgs_v1";

function loadEntries(){
  try{
    const raw = localStorage.getItem(ENTRIES_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}

  // fallback starter data if you still have data.js
  // IMPORTANT: if your data.js uses const volunteerData, it must be a normal <script> (not type="module")
  // best: window.volunteerData = [...]
  return (typeof volunteerData !== "undefined" && Array.isArray(volunteerData))
    ? volunteerData.slice()
    : [];
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

/* Ensure every entry has an id (needed for edit/delete) */
let changedIds = false;
entries = entries.map(e=>{
  if(!e.id){
    changedIds = true;
    return { ...e, id: uid() };
  }
  return e;
});
if(changedIds) saveEntries(entries);

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
   Renderers
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

  // If you don't include Chart.js, we just won't draw
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

/* ---------- History (with Edit/Delete) ---------- */
function renderHistory(){
  if(!$("historyList")) return;

  const search = $("searchBox");
  const select = $("categorySelect");
  const list = $("historyList");
  const stats = $("historyStats");

  // fill dropdown once
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

      const matchCat = (cat==="all") ? true : ((e.category||"Community Service")===cat);
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
            <div style="min-width:0;">
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

            <div style="display:flex;align-items:center;gap:8px;">
              <span class="pill">⏱ ${safeText(e.hours)}h</span>
              <button class="btnGhost" type="button" data-action="edit" data-id="${safeText(e.id)}">Edit</button>
              <button class="btnGhost" type="button" data-action="delete" data-id="${safeText(e.id)}">Delete</button>
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

  // Edit/Delete clicks (event delegation)
  if(list && !list.dataset.hooked){
    list.addEventListener("click", (ev)=>{
      const btn = ev.target.closest("button[data-action]");
      if(!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if(action === "delete"){
        const ok = confirm("Delete this log entry?");
        if(!ok) return;

        entries = entries.filter(e=>e.id !== id);
        saveEntries(entries);

        renderDashboard();
        renderHistory();
        renderOrganizations();
        return;
      }

      if(action === "edit"){
        const entry = entries.find(e=>e.id === id);
        if(!entry) return;

        showModal("log", { mode:"edit", entry });
      }
    });
    list.dataset.hooked = "1";
  }

  apply();
}

/* ---------- Organizations (⋮ opens edit contact modal) ---------- */
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

        <button class="orgMenuBtn" type="button" data-org="${safeText(x.org)}" aria-label="Edit organization">
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

  // Click ⋮ to edit that org contact
  if(!grid.dataset.hooked){
    grid.addEventListener("click", (ev)=>{
      const btn = ev.target.closest(".orgMenuBtn");
      if(!btn) return;

      const orgName = btn.dataset.org;
      const contact = orgs[orgName] || { person:"", email:"" };

      showModal("org", {
        mode: "edit",
        orgName,
        person: contact.person || "",
        email: contact.email || ""
      });
    });
    grid.dataset.hooked = "1";
  }
}

/* =========================
   Modals
   ========================= */

let editingLogId = null;     // when editing a log entry
let editingOrgName = null;   // when editing an org contact

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

  editingLogId = null;
  editingOrgName = null;

  if($("logForm")) $("logForm").reset();
  if($("orgForm")) $("orgForm").reset();
  clearErr("logError");
  clearErr("orgError");

  // re-enable org name input by default
  if($("oName")) $("oName").disabled = false;
}

function showModal(kind, payload={}){
  const overlay = $("modalOverlay");
  if(!overlay) return;

  const logForm = $("logForm");
  const orgForm = $("orgForm");

  clearErr("logError");
  clearErr("orgError");

  overlay.classList.add("show");

  if(kind === "log"){
    if($("modalTitle")) $("modalTitle").textContent = (payload.mode==="edit") ? "Edit Hours" : "Log Hours";
    if($("modalSub"))   $("modalSub").textContent   = (payload.mode==="edit") ? "Update this volunteer session" : "Add a volunteer session";

    if(logForm) logForm.style.display = "block";
    if(orgForm) orgForm.style.display = "none";

    const e = payload.entry;

    if(payload.mode==="edit" && e){
      editingLogId = e.id;

      if($("fOrg")) $("fOrg").value = e.organization || "";
      if($("fActivity")) $("fActivity").value = e.activity || "";
      if($("fDate")) $("fDate").value = e.date || new Date().toISOString().slice(0,10);
      if($("fHours")) $("fHours").value = String(e.hours ?? "");
      if($("fCategory")) $("fCategory").value = e.category || "Community Service";
    }else{
      editingLogId = null;
      if($("fDate")) $("fDate").value = new Date().toISOString().slice(0,10);
      if($("fOrg")) $("fOrg").focus();
    }

    return;
  }

  // org modal
  if($("modalTitle")) $("modalTitle").textContent = (payload.mode==="edit") ? "Update Contact" : "Add Organization";
  if($("modalSub"))   $("modalSub").textContent   = (payload.mode==="edit") ? "Edit organization contact info" : "Save an organization contact";

  if(logForm) logForm.style.display = "none";
  if(orgForm) orgForm.style.display = "block";

  if(payload.mode==="edit"){
    editingOrgName = payload.orgName || null;

    if($("oName")) {
      $("oName").value = payload.orgName || "";
      $("oName").disabled = true; // keep org name fixed while editing
    }
    if($("oPerson")) $("oPerson").value = payload.person || "";
    if($("oEmail"))  $("oEmail").value  = payload.email || "";
  }else{
    editingOrgName = null;
    if($("oName")) {
      $("oName").disabled = false;
      $("oName").focus();
    }
  }
}

/* =========================
   Hooks
   ========================= */

function hookButtons(){
  // open log modal buttons (Dashboard + History if present)
  const logBtn = $("logHoursBtn");
  if(logBtn && !logBtn.dataset.hooked){
    logBtn.addEventListener("click", ()=>showModal("log", { mode:"new" }));
    logBtn.dataset.hooked = "1";
  }

  // open add org modal button (Organizations page)
  const addOrgBtn = $("addOrgBtn");
  if(addOrgBtn && !addOrgBtn.dataset.hooked){
    addOrgBtn.addEventListener("click", ()=>showModal("org", { mode:"new" }));
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

  // submit log hours (add OR edit)
  const logForm = $("logForm");
  if(logForm && !logForm.dataset.hooked){
    logForm.addEventListener("submit", (e)=>{
      e.preventDefault();
      clearErr("logError");

      const organization = ($("fOrg")?.value || "").trim();
      const activity = ($("fActivity")?.value || "").trim();
      const date = $("fDate")?.value;
      const hours = Number($("fHours")?.value);
      const category = $("fCategory")?.value || "Community Service";

      if(!organization) return setErr("logError", "Please enter an organization.");
      if(!activity) return setErr("logError", "Please enter an activity description.");
      if(!date) return setErr("logError", "Please pick a date.");
      if(!Number.isFinite(hours) || hours <= 0) return setErr("logError", "Hours must be a number greater than 0.");

      if(editingLogId){
        const idx = entries.findIndex(x=>x.id === editingLogId);
        if(idx !== -1){
          entries[idx] = { ...entries[idx], organization, activity, date, hours, category };
        }
      }else{
        entries.push({ id: uid(), organization, activity, date, hours, category });
      }

      saveEntries(entries);

      // make placeholder org contact if missing
      if(!orgs[organization]){
        orgs[organization] = { person:"(add contact)", email:"(add email)" };
        saveOrgs(orgs);
      }

      // IMPORTANT: these re-renders update totals + chart + recent + history
      renderDashboard();
      renderHistory();
      renderOrganizations();

      closeModal();
    });

    logForm.dataset.hooked = "1";
  }

  // submit add/update org contact
  const orgForm = $("orgForm");
  if(orgForm && !orgForm.dataset.hooked){
    orgForm.addEventListener("submit", (e)=>{
      e.preventDefault();
      clearErr("orgError");

      const name = ($("oName")?.value || "").trim();
      const person = ($("oPerson")?.value || "").trim() || "(add contact)";
      const email = ($("oEmail")?.value || "").trim() || "(add email)";

      if(!name) return setErr("orgError", "Please enter the organization name.");

      orgs[name] = { person, email };
      saveOrgs(orgs);

      renderOrganizations();
      closeModal();
    });

    orgForm.dataset.hooked = "1";
  }
}

/* =========================
   Boot
   ========================= */
hookButtons();
renderDashboard();
renderHistory();
renderOrganizations();