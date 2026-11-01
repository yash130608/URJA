const API = "";
const $ = (id) => document.getElementById(id);
let token = localStorage.getItem("urja_token");
let currentUser = null;
let appliances = [];
let chart = null;
let isSignup = false;
let tariff = Number(localStorage.getItem("urja_tariff") || 7.5);

function authHeaders() {
  return {"Content-Type":"application/json", ...(token ? {"Authorization":`Bearer ${token}`} : {})};
}
async function api(path, options={}) {
  const response = await fetch(`${API}/api${path}`, {
    ...options,
    headers: {...authHeaders(), ...(options.headers || {})}
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    if (response.status === 401 && token) signOut(false);
    throw new Error(data.detail || "Something went wrong. Please try again.");
  }
  return data;
}
function toast(message, error=false) {
  const el=$("toast"); el.textContent=message; el.className=`toast show${error?" error":""}`;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.className="toast",3200);
}
function setTheme(dark) {
  document.body.classList.toggle("dark",dark);
  localStorage.setItem("urja_theme",dark?"dark":"light");
}
function toggleTheme(){setTheme(!document.body.classList.contains("dark"));}
function setAuthMode(signup) {
  isSignup=signup;
  $("authTitle").textContent=signup?"Create your account":"Welcome back";
  $("authSubtitle").textContent=signup?"Start understanding your energy use today.":"Sign in to see your energy dashboard.";
  $("nameField").classList.toggle("hidden",!signup);
  $("authName").required=signup;
  $("authSubmit").innerHTML=signup?'Create account <span>→</span>':'Sign in <span>→</span>';
  $("switchText").textContent=signup?"Already have an account?":"New to URJA?";
  $("switchAuth").textContent=signup?"Sign in":"Create an account";
  $("authPassword").autocomplete=signup?"new-password":"current-password";
}
function showAuth(){ $("authScreen").classList.remove("hidden"); $("appShell").classList.add("hidden"); }
function showApp(){
  $("authScreen").classList.add("hidden"); $("appShell").classList.remove("hidden");
  $("sideName").textContent=currentUser.name; $("sideEmail").textContent=currentUser.email;
  $("avatarInitial").textContent=currentUser.name.trim().charAt(0).toUpperCase();
  $("welcomeName").textContent=currentUser.name.split(" ")[0];
  $("todayDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  $("tariffInput").value=tariff;
}
async function signOut(showMessage=true){
  token=null;currentUser=null;localStorage.removeItem("urja_token");showAuth();
  if(showMessage)toast("You've signed out.");
}
async function loadApp(){
  try{
    const result=await api("/me");currentUser=result.user;showApp();await refreshData();
  }catch(e){token=null;localStorage.removeItem("urja_token");showAuth();}
}
async function refreshData(){
  appliances=await api("/appliances");
  const summary=await api(`/summary?tariff=${encodeURIComponent(tariff)}`);
  renderSummary(summary);renderAppliances(summary);renderChart(summary);renderSmartTips(summary);
}
function money(value){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(value||0);}
function renderSummary(s){
  $("monthlyKwh").textContent=s.monthly_kwh.toFixed(2);
  $("monthlyCost").textContent=money(s.monthly_cost);
  $("dailyKwh").textContent=s.daily_kwh.toFixed(2);
  $("co2Value").textContent=s.co2_kg.toFixed(1);
  $("estimateBill").textContent=money(s.monthly_cost);
  $("applianceCount").textContent=s.appliance_count;
  $("applianceUsage").textContent=`${s.monthly_kwh.toFixed(2)} kWh`;
  $("applianceCost").textContent=money(s.monthly_cost);
}
const symbols={Cooling:"❄",Lighting:"☼",Kitchen:"♨",Entertainment:"♫",Cleaning:"✧",Other:"ϟ"};
function monthlyFor(a){return a.watts*a.quantity*a.hours_per_day*a.days_per_month/1000;}
function renderAppliances(s){
  const list=$("applianceList");list.innerHTML="";
  $("emptyAppliances").classList.toggle("hidden",appliances.length>0);
  appliances.forEach(a=>{
    const card=document.createElement("article");card.className="panel appliance-card";
    const icon=document.createElement("div");icon.className="appliance-symbol";icon.textContent=symbols[a.category]||"ϟ";
    const info=document.createElement("div");info.className="appliance-info";
    const title=document.createElement("b");title.textContent=a.name;
    const details=document.createElement("small");details.textContent=`${a.category} · ${a.watts} W × ${a.quantity} · ${a.hours_per_day} hrs/day`;
    info.append(title,details);
    const kwh=document.createElement("div");kwh.className="appliance-kwh";
    const value=document.createElement("b");value.textContent=`${monthlyFor(a).toFixed(2)} kWh`;
    const sub=document.createElement("small");sub.textContent="per month";
    kwh.append(value,sub);
    const del=document.createElement("button");del.className="delete-appliance";del.title="Delete appliance";del.setAttribute("aria-label",`Delete ${a.name}`);del.textContent="×";
    del.addEventListener("click",()=>deleteAppliance(a.id));
    card.append(icon,info,kwh,del);list.append(card);
  });
}
function renderChart(s){
  const canvas=$("usageChart"),empty=$("chartEmpty");
  if(chart){chart.destroy();chart=null;}
  if(!s.appliances.length){empty.style.display="grid";return;}
  empty.style.display="none";
  const labels=s.appliances.map(a=>a.name);
  const values=s.appliances.map(a=>Number(monthlyFor(a).toFixed(2)));
  chart=new Chart(canvas,{type:"doughnut",data:{labels,datasets:[{data:values,backgroundColor:["#24bd87","#9b83e6","#f2ad5b","#5ba8dc","#e47e9b","#6fc5c0"],borderWidth:0,hoverOffset:7}]},options:{responsive:true,maintainAspectRatio:false,cutout:"68%",plugins:{legend:{position:"right",labels:{usePointStyle:true,pointStyle:"circle",boxWidth:7,padding:13,color:getComputedStyle(document.body).getPropertyValue("--muted"),font:{family:"DM Sans",size:10}}},tooltip:{callbacks:{label:(ctx)=>` ${ctx.label}: ${ctx.raw} kWh`}}}}});
}
function renderSmartTips(s){
  const box=$("smartTips");box.innerHTML="";
  if(!s.appliances.length){box.innerHTML='<p class="muted">Add appliances to receive suggestions based on your estimated usage.</p>';return;}
  const ranked=[...s.appliances].sort((a,b)=>monthlyFor(b)-monthlyFor(a));
  const biggest=ranked[0];
  const tips=[
    {title:`Review ${biggest.name}`,text:`This is currently your largest estimated energy user at ${monthlyFor(biggest).toFixed(2)} kWh/month. Check whether its daily operating hours can be reduced.`},
    {title:"Compare your estimates",text:"Check the appliance ratings and usage hours against your real routine. More accurate inputs make the estimate more useful."},
    {title:"Try one small habit",text:"Switch off unused devices and review your next electricity bill to see how your actual consumption changes."}
  ];
  tips.forEach(t=>{const div=document.createElement("div");div.className="smart-tip";const b=document.createElement("b");b.textContent=t.title;const p=document.createElement("span");p.textContent=t.text;div.append(b,p);box.append(div);});
}
function openModal(){$("applianceModal").classList.remove("hidden");$("applianceName").focus();}
function closeModal(){$("applianceModal").classList.add("hidden");$("applianceForm").reset();$("applianceQuantity").value=1;$("applianceDays").value=30;$("previewKwh").textContent="0.00 kWh";}
async function deleteAppliance(id){
  if(!confirm("Remove this appliance from your energy profile?"))return;
  try{await api(`/appliances/${id}`,{method:"DELETE"});toast("Appliance removed.");await refreshData();}
  catch(e){toast(e.message,true);}
}
function go(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(`${view}View`).classList.remove("hidden");
  document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("breadcrumbPage").textContent=view==="overview"?"Overview":view==="appliances"?"My appliances":"Energy insights";
  $("sidebar").classList.remove("open");
  if(view==="overview")setTimeout(()=>refreshData().catch(e=>toast(e.message,true)),0);
}
document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
document.querySelectorAll("[data-view-link]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();go(b.dataset.viewLink);}));
$("switchAuth").addEventListener("click",()=>setAuthMode(!isSignup));
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const payload={name:$("authName").value.trim(),email:$("authEmail").value.trim(),password:$("authPassword").value};
  try{
    const result=await api(isSignup?"/auth/signup":"/auth/login",{method:"POST",body:JSON.stringify(payload)});
    token=result.token;localStorage.setItem("urja_token",token);currentUser=result.user;showApp();await refreshData();toast(isSignup?"Your URJA account is ready!":"Welcome back!");
  }catch(err){toast(err.message,true);}
});
$("themeToggle").addEventListener("click",toggleTheme);
$("topThemeToggle").addEventListener("click",toggleTheme);
$("authTheme").addEventListener("click",toggleTheme);
$("logoutBtn").addEventListener("click",()=>signOut());
$("quickAddBtn").addEventListener("click",openModal);
$("addApplianceBtn").addEventListener("click",openModal);
$("emptyAddBtn").addEventListener("click",openModal);
$("closeModal").addEventListener("click",closeModal);
$("applianceModal").addEventListener("click",e=>{if(e.target===$("applianceModal"))closeModal();});
$("menuToggle").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("tariffInput").addEventListener("change",async()=>{
  const val=Number($("tariffInput").value);
  if(!Number.isFinite(val)||val<=0||val>1000){toast("Enter a rate between 0.1 and 1000.",true);$("tariffInput").value=tariff;return;}
  tariff=val;localStorage.setItem("urja_tariff",String(tariff));
  try{await refreshData();}catch(e){toast(e.message,true);}
});
function updatePreview(){
  const watts=Number($("applianceWatts").value)||0,qty=Number($("applianceQuantity").value)||1;
  const hours=Number($("applianceHours").value)||0,days=Number($("applianceDays").value)||30;
  $("previewKwh").textContent=`${(watts*qty*hours*days/1000).toFixed(2)} kWh`;
}
["applianceWatts","applianceQuantity","applianceHours","applianceDays"].forEach(id=>$(id).addEventListener("input",updatePreview));
$("applianceForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const payload={name:$("applianceName").value.trim(),category:$("applianceCategory").value,watts:Number($("applianceWatts").value),quantity:Number($("applianceQuantity").value),hours_per_day:Number($("applianceHours").value),days_per_month:Number($("applianceDays").value)};
  try{await api("/appliances",{method:"POST",body:JSON.stringify(payload)});closeModal();toast("Appliance added to your profile.");await refreshData();}
  catch(err){toast(err.message,true);}
});
setTheme(localStorage.getItem("urja_theme")==="dark");
setAuthMode(false);
if(token)loadApp();else showAuth();
