/* ---------- ☁️ الكونفيج السحابي ولوحة المالك (app6) ----------
   - بيجيب كونفيج التطبيق من /api/admin/config (قراءة عامة): أزرار مخصصة + إعلان من المالك.
   - بيضيف قسم «لوحة المالك السحابية» جوه تبويب الإدارة بعد فتح القفل المحلي.
   - أي عطل في الشبكة/المخزن = التطبيق يشتغل عادي من غير الإضافات (degrade مفتوح). */
let CLOUD_CFG = { customButtons: [], customTabs: [], announcement: "" };
let cloudToken = null; /* توكن المالك في الذاكرة بس — بيتمسح مع قفل الإدارة */
async function loadCloudConfig(){
  try{
    const r = await fetch("/api/admin/config");
    if(!r.ok) return;
    const d = await r.json();
    if(d && d.config && typeof d.config === "object") CLOUD_CFG = d.config;
  }catch(e){}
  applyCloudConfig();
}
function applyCloudConfig(){
  applyCloudAnnouncement();
  renderCloudButtons();
}
function applyCloudAnnouncement(){
  let bar = $("#cloudAnnouncement");
  const text = (CLOUD_CFG.announcement || "").trim();
  if(!text){ if(bar) bar.remove(); return; }
  if(!bar){
    bar = document.createElement("div");
    bar.id = "cloudAnnouncement";
    bar.className = "card cloud-announce";
    const home = $("#tab-home") || document.body;
    home.insertBefore(bar, home.firstChild);
  }
  bar.textContent = "📢 " + text;
}
function renderCloudButtons(){
  const host = $(".home-actions"); if(!host) return;
  host.querySelectorAll(".cloud-btn").forEach(b=>b.remove());
  for(const b of (CLOUD_CFG.customButtons || [])){
    const el = document.createElement("button");
    el.type = "button"; el.className = "cloud-btn";
    el.textContent = (b.icon || "🔹") + " " + b.label;
    el.addEventListener("click", ()=>{
      if(b.url){ window.open(b.url, "_blank", "noopener"); }
      else if(b.tab && typeof switchTab === "function"){ switchTab(b.tab); }
    });
    host.appendChild(el);
  }
  (CLOUD_CFG.customTabs || []).forEach((t)=>{
    const el = document.createElement("button");
    el.type = "button"; el.className = "cloud-btn cloud-tab";
    el.textContent = (t.icon || "📑") + " " + t.label;
    el.addEventListener("click", ()=>{
      if(t.url){ window.open(t.url, "_blank", "noopener"); }
      else openCloudNote(t);
    });
    host.appendChild(el);
  });
}
function openCloudNote(t){
  let ov = $("#cloudNoteOv");
  if(!ov){
    ov = document.createElement("div"); ov.id = "cloudNoteOv";
    ov.innerHTML = '<div class="cloud-note-card card"><div class="row wrap" style="justify-content:space-between"><h2 id="cloudNoteTitle"></h2><button type="button" class="ghost" id="cloudNoteClose">✕ اقفل</button></div><div id="cloudNoteBody" style="white-space:pre-wrap;line-height:1.9"></div></div>';
    const st = document.createElement("style");
    st.textContent = "#cloudNoteOv{position:fixed;inset:0;background:rgba(10,8,6,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}.cloud-note-card{max-width:640px;width:100%;max-height:85vh;overflow:auto}";
    document.head.appendChild(st);
    ov.addEventListener("click", e=>{ if(e.target===ov) ov.remove(); });
  }
  ov.querySelector("#cloudNoteTitle").textContent = (t.icon||"📑") + " " + t.label;
  ov.querySelector("#cloudNoteBody").textContent = t.note || "";
  ov.querySelector("#cloudNoteClose").onclick = ()=>ov.remove();
  document.body.appendChild(ov);
}
/* قسم اللوحة السحابية جوه الإدارة المفتوحة */
function renderCloudAdmin(root){
  if(!root || $("#cloudAdminCard")) return;
  const card = document.createElement("div");
  card.className = "card"; card.id = "cloudAdminCard";
  card.innerHTML =
    '<h2>☁️ لوحة المالك السحابية</h2>' +
    '<p class="hint">دي لوحتك على السيرفر: إعلان لكل المستخدمين، أزرار مخصصة بتظهر في الرئيسية، وسجل المشتركين — متزامنة على كل الأجهزة. محمية بباسورد الإدارة السيرفري (مش كلمة سر الجهاز).</p>' +
    '<div id="cloudLoginBox">' +
    '<label>باسورد الإدارة السيرفري<input id="cloudPw" type="password" autocomplete="off" dir="ltr"></label>' +
    '<div class="row wrap"><button type="button" id="btnCloudLogin" class="primary">دخول اللوحة</button></div>' +
    '<p id="cloudLoginMsg" class="msg"></p></div>' +
    '<div id="cloudPanel" class="hidden">' +
    '<h3>📢 الإعلان</h3>' +
    '<label>نص الإعلان (فاضي = مفيش إعلان)<input id="cloudAnn" type="text" maxlength="500"></label>' +
    '<h3>🔘 الأزرار المخصصة (بتظهر في الرئيسية لكل المستخدمين)</h3>' +
    '<div id="cloudBtnList"></div>' +
    '<label>إيموجي<input id="cbIcon" type="text" maxlength="8" placeholder="🔹"></label>' +
    '<label>اسم الزرار<input id="cbLabel" type="text" maxlength="40"></label>' +
    '<label>تبويب داخلي (اختياري — زي: settings, library)<input id="cbTab" type="text" maxlength="24" dir="ltr"></label>' +
    '<label>أو لينك خارجي (اختياري)<input id="cbUrl" type="url" maxlength="300" dir="ltr" placeholder="https://…"></label>' +
    '<div class="row wrap"><button type="button" id="btnCbAdd" class="ghost">➕ إضافة الزرار</button>' +
    '<button type="button" id="btnCloudSave" class="primary">💾 حفظ الكونفيج</button></div>' +
    '<p id="cloudCfgMsg" class="msg"></p>' +
    '<h3>📑 التابات المخصصة (لينك أو صفحة ملاحظات من كتابتك)</h3>' +
    '<div id="cloudTabList"></div>' +
    '<label>إيموجي<input id="ctIcon" type="text" maxlength="8" placeholder="📑"></label>' +
    '<label>اسم التاب<input id="ctLabel" type="text" maxlength="40"></label>' +
    '<label>لينك (اختياري — لو فاضي هيبقى صفحة ملاحظات)<input id="ctUrl" type="url" maxlength="300" dir="ltr" placeholder="https://…"></label>' +
    '<label>نص صفحة الملاحظات (اختياري)<textarea id="ctNote" rows="4" maxlength="5000"></textarea></label>' +
    '<div class="row wrap"><button type="button" id="btnCtAdd" class="ghost">➕ إضافة التاب</button></div>' +
    '<p class="hint">بعد إضافة/مسح أي حاجة اضغط «💾 حفظ الكونفيج» عشان التغيير يتنشر.</p>' +
    '<h3>🔑 تغيير باسورد الإدارة السيرفري</h3>' +
    '<label>الباسورد الحالية<input id="pwCur" type="password" autocomplete="off" dir="ltr"></label>' +
    '<label>الجديدة (٦ حروف على الأقل)<input id="pwNew" type="password" autocomplete="new-password" dir="ltr"></label>' +
    '<label>أكّد الجديدة<input id="pwNew2" type="password" autocomplete="new-password" dir="ltr"></label>' +
    '<div class="row wrap"><button type="button" id="btnPwChange" class="ghost">🔑 غيّر الباسورد</button></div>' +
    '<p class="hint">التغيير فوري وبيطبق على التطبيقين (كتبي والراوي)، وبيقفل أي جلسة مفتوحة — هتدخل تاني بالجديدة.</p>' +
    '<p id="pwChangeMsg" class="msg"></p>' +
    '<h3>⭐ سجل المشتركين</h3>' +
    '<div class="row wrap"><input id="subCode" type="text" maxlength="32" dir="ltr" placeholder="كود الاشتراك">' +
    '<input id="subNote" type="text" maxlength="120" placeholder="ملاحظة (اسم العميل مثلًا)">' +
    '<button type="button" id="btnSubAdd" class="ghost">➕ تسجيل</button></div>' +
    '<div id="cloudSubList"></div>' +
    '<p id="cloudSubMsg" class="msg"></p></div>';
  root.appendChild(card);
  $("#btnCloudLogin").addEventListener("click", cloudLogin);
  $("#cloudPw").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); cloudLogin(); } });
  $("#btnCloudSave").addEventListener("click", cloudSaveConfig);
  $("#btnCbAdd").addEventListener("click", cloudAddButton);
  $("#btnSubAdd").addEventListener("click", cloudAddSub);
  $("#btnCtAdd").addEventListener("click", cloudAddTab);
  $("#btnPwChange").addEventListener("click", cloudChangePw);
  if(cloudToken){ $("#cloudLoginBox").classList.add("hidden"); $("#cloudPanel").classList.remove("hidden"); cloudRefresh(); }
}
async function cloudLogin(){
  const msg = $("#cloudLoginMsg"); msg.textContent = "بيتأكد…"; msg.classList.remove("err");
  try{
    const r = await fetch("/api/admin/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ password: $("#cloudPw").value }) });
    const d = await r.json();
    if(!r.ok){ msg.textContent = d.error || "الدخول مرفوض."; msg.classList.add("err"); return; }
    cloudToken = d.token;
    $("#cloudLoginBox").classList.add("hidden"); $("#cloudPanel").classList.remove("hidden");
    cloudRefresh();
  }catch(e){ msg.textContent = "السيرفر ماردش — جرّب تاني."; msg.classList.add("err"); }
}
function cloudRefresh(){
  $("#cloudAnn").value = CLOUD_CFG.announcement || "";
  renderCloudBtnList(); renderCloudTabList(); cloudLoadSubs();
}
function renderCloudBtnList(){
  const host = $("#cloudBtnList"); if(!host) return;
  const btns = CLOUD_CFG.customButtons || [];
  host.innerHTML = btns.length ? "" : '<p class="hint">مفيش أزرار مخصصة لسه.</p>';
  btns.forEach((b, i)=>{
    const row = document.createElement("div"); row.className = "row wrap";
    const t = document.createElement("span"); t.textContent = (b.icon||"🔹")+" "+b.label+(b.url?" 🔗":"") ;
    const del = document.createElement("button"); del.type="button"; del.className="ghost"; del.textContent="🗑";
    del.addEventListener("click", ()=>{ CLOUD_CFG.customButtons.splice(i,1); renderCloudBtnList(); });
    row.append(t, del); host.appendChild(row);
  });
}
function cloudAddButton(){
  const b = { icon: $("#cbIcon").value || "🔹", label: $("#cbLabel").value.trim(), tab: $("#cbTab").value.trim(), url: $("#cbUrl").value.trim() };
  const msg = $("#cloudCfgMsg");
  if(!b.label || (!b.tab && !b.url)){ msg.textContent = "اكتب اسم الزرار وحدّد تبويب أو لينك."; msg.classList.add("err"); return; }
  CLOUD_CFG.customButtons = CLOUD_CFG.customButtons || [];
  CLOUD_CFG.customButtons.push(b);
  $("#cbIcon").value = ""; $("#cbLabel").value = ""; $("#cbTab").value = ""; $("#cbUrl").value = "";
  msg.textContent = ""; msg.classList.remove("err");
  renderCloudBtnList();
}
function renderCloudTabList(){
  const host = $("#cloudTabList"); if(!host) return;
  const tabs = CLOUD_CFG.customTabs || [];
  host.innerHTML = tabs.length ? "" : '<p class="hint">مفيش تابات مخصصة لسه.</p>';
  tabs.forEach((t, i)=>{
    const row = document.createElement("div"); row.className = "row wrap";
    const s2 = document.createElement("span"); s2.textContent = (t.icon||"📑")+" "+t.label+(t.url?" 🔗":" 📝");
    const del = document.createElement("button"); del.type="button"; del.className="ghost"; del.textContent="🗑";
    del.addEventListener("click", ()=>{ CLOUD_CFG.customTabs.splice(i,1); renderCloudTabList(); });
    row.append(s2, del); host.appendChild(row);
  });
}
function cloudAddTab(){
  const msg = $("#cloudCfgMsg");
  const t = { icon: $("#ctIcon").value || "📑", label: $("#ctLabel").value.trim(), url: $("#ctUrl").value.trim(), note: $("#ctNote").value };
  if(!t.label || (!t.url && !t.note.trim())){ msg.textContent = "اكتب اسم التاب وحدّد لينك أو نص ملاحظات."; msg.classList.add("err"); return; }
  CLOUD_CFG.customTabs = CLOUD_CFG.customTabs || [];
  CLOUD_CFG.customTabs.push(t);
  $("#ctIcon").value=""; $("#ctLabel").value=""; $("#ctUrl").value=""; $("#ctNote").value="";
  msg.textContent = ""; msg.classList.remove("err");
  renderCloudTabList();
}
async function cloudSaveConfig(){
  const msg = $("#cloudCfgMsg"); msg.textContent = "بيحفظ…"; msg.classList.remove("err");
  try{
    const r = await fetch("/api/admin/config", { method:"PUT", headers:{"Content-Type":"application/json", Authorization:"Bearer "+cloudToken},
      body: JSON.stringify({ config: { announcement: $("#cloudAnn").value, customButtons: CLOUD_CFG.customButtons || [], customTabs: CLOUD_CFG.customTabs || [] } }) });
    const d = await r.json();
    if(!r.ok){ msg.textContent = d.error || "الحفظ فشل."; msg.classList.add("err"); return; }
    CLOUD_CFG = d.config; applyCloudConfig();
    msg.textContent = "اتحفظ ✔ هيظهر لكل المستخدمين خلال ثواني."; msg.classList.remove("err");
  }catch(e){ msg.textContent = "السيرفر ماردش — جرّب تاني."; msg.classList.add("err"); }
}
async function cloudChangePw(){
  const m = $("#pwChangeMsg"); m.textContent = ""; m.classList.remove("err");
  const cur = $("#pwCur").value, n1 = $("#pwNew").value, n2 = $("#pwNew2").value;
  if(!cur || !n1){ m.textContent = "املأ الباسورد الحالية والجديدة."; m.classList.add("err"); return; }
  if(n1.length < 6){ m.textContent = "الجديدة قصيرة — ٦ حروف على الأقل."; m.classList.add("err"); return; }
  if(n1 !== n2){ m.textContent = "الجديدة وتأكيدها مش زي بعض."; m.classList.add("err"); return; }
  m.textContent = "بيغيّر…";
  try{
    const r = await fetch("/api/admin/password", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ current: cur, next: n1 }) });
    const d = await r.json();
    if(!r.ok){ m.textContent = d.error || "التغيير فشل."; m.classList.add("err"); return; }
    cloudToken = null;
    $("#pwCur").value = ""; $("#pwNew").value = ""; $("#pwNew2").value = "";
    $("#cloudPanel").classList.add("hidden"); $("#cloudLoginBox").classList.remove("hidden");
    const lm = $("#cloudLoginMsg");
    if(lm){ lm.textContent = "اتغيّرت الباسورد ✔ على التطبيقين. سجّل دخول تاني بالجديدة."; lm.classList.remove("err"); }
  }catch(e){ m.textContent = "السيرفر ماردش — جرّب تاني."; m.classList.add("err"); }
}
async function cloudLoadSubs(){
  const host = $("#cloudSubList"); if(!host) return;
  host.innerHTML = '<p class="hint">بيجيب السجل…</p>';
  try{
    const r = await fetch("/api/admin/subs", { headers:{ Authorization:"Bearer "+cloudToken } });
    const d = await r.json();
    if(!r.ok){ host.innerHTML = ""; const m=$("#cloudSubMsg"); if(m){ m.textContent = d.error || "مقدرتش أجيب السجل."; m.classList.add("err"); } return; }
    const subs = d.subs || [];
    host.innerHTML = subs.length ? "" : '<p class="hint">مفيش مشتركين متسجلين لسه.</p>';
    subs.forEach(s=>{
      const row = document.createElement("div"); row.className = "row wrap";
      const t = document.createElement("span");
      t.textContent = (s.active?"🟢":"🔴") + " " + s.code + (s.note ? " — " + s.note : "") + " (" + String(s.createdAt||"").slice(0,10) + ")";
      const tg = document.createElement("button"); tg.type="button"; tg.className="ghost";
      tg.textContent = s.active ? "إيقاف" : "تفعيل";
      tg.addEventListener("click", ()=>cloudToggleSub(s.code, !s.active));
      row.append(t, tg); host.appendChild(row);
    });
  }catch(e){ host.innerHTML = '<p class="hint">السيرفر ماردش.</p>'; }
}
async function cloudAddSub(){
  const m = $("#cloudSubMsg"); m.textContent = ""; m.classList.remove("err");
  const code = $("#subCode").value.trim(); if(!code){ m.textContent = "اكتب الكود الأول."; m.classList.add("err"); return; }
  try{
    const r = await fetch("/api/admin/subs", { method:"POST", headers:{"Content-Type":"application/json", Authorization:"Bearer "+cloudToken},
      body: JSON.stringify({ code, note: $("#subNote").value.trim() }) });
    const d = await r.json();
    if(!r.ok){ m.textContent = d.error || "التسجيل فشل."; m.classList.add("err"); return; }
    $("#subCode").value = ""; $("#subNote").value = ""; cloudLoadSubs();
  }catch(e){ m.textContent = "السيرفر ماردش — جرّب تاني."; m.classList.add("err"); }
}
async function cloudToggleSub(code, active){
  try{
    await fetch("/api/admin/subs", { method:"PATCH", headers:{"Content-Type":"application/json", Authorization:"Bearer "+cloudToken},
      body: JSON.stringify({ code, active }) });
  }catch(e){}
  cloudLoadSubs();
}
loadCloudConfig();
