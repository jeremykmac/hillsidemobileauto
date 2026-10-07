(function(){
  const WORKER = "https://hma-worker.jeremykmacdonald.workers.dev/intake";
  const FALLBACK_BOOKING = "https://app.squareup.com/appointments/book/8vo31a3owzji1t/L7HJP6SJY1D4C/start";
  const EPA = "https://www.fueleconomy.gov/ws/rest/vehicle/menu";
  const TERMS_VERSION = "2026-10-06"; // date of the current Service Terms (terms.html). Update when the terms change.
  const IN_SCOPE = ["Acura","Buick","Cadillac","Chevrolet","Chrysler","Dodge","Ford","Genesis","GMC","Honda","Hyundai","Infiniti","Isuzu","Jeep","Kia","Lexus","Lincoln","Mazda","Mercury","Mitsubishi","Nissan","Oldsmobile","Plymouth","Pontiac","Ram","Saturn","Scion","Subaru","Suzuki","Toyota"];

  const $ = (id) => document.getElementById(id);
  const yearSel = $("year"), makeSel = $("make"), modelSel = $("model"), engSel = $("engine");
  const cache = new Map();
  let groups = new Map();      // base model name -> [EPA model names]
  let mode = "ymm";            // or "vin"
  let vinInfo = null;          // decoded VIN

  const asList = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  async function epa(path){
    if (cache.has(path)) return cache.get(path);
    const p = fetch(EPA + path, { headers: { Accept: "application/json" } })
      .then((r) => { if (!r.ok) throw new Error("EPA " + r.status); return r.json(); })
      .then((d) => asList(d && d.menuItem));
    cache.set(path, p);
    p.catch(() => cache.delete(path));
    return p;
  }

  function fill(sel, placeholder, items, disabled){
    sel.innerHTML = "";
    const o = document.createElement("option"); o.value = ""; o.textContent = placeholder; sel.appendChild(o);
    for (const it of items){
      const op = document.createElement("option");
      op.value = typeof it === "string" ? it : it.value;
      op.textContent = typeof it === "string" ? it : it.text;
      sel.appendChild(op);
    }
    sel.disabled = !!disabled;
  }
  function loading(sel, label){ fill(sel, label, [], true); }
  function setStatus(el, kind, html){ el.className = "status show " + kind; el.innerHTML = html; }
  function clearStatus(el){ el.className = "status"; el.innerHTML = ""; }

  // EPA lists one car under many names ("F150 Pickup 4WD FFV", "Silverado K15 4WD", "Corvette Z06", "Camry Hybrid").
  // 1) drop electric / fuel-cell variants (no oil to change), 2) boil each name down to the model family,
  // 3) fold trims into their base model. Hybrids stay: they show up as an engine choice instead.
  const EV = /\b(EV|EUV|Electric|Electrified|Leaf|Bolt|LYRIQ|OPTIQ|VISTIQ|CELESTIQ|Prologue|F-150 Lightning|Mach-E|ARIYA|Ioniq [569]|EV\d|Solterra|Trailseeker|Uncharted|bZ\w*|Mirai|Nexo|FCV|FCEV|FCX|Fuel Cell|MX-30|i-MiEV|Wagoneer S|Recon|RZ|GV60|Daytona|Th!nk|Hyper-Mini|Altra)\b|^ZDX (AWD|RWD)|\bES \d+e\b|^C-HR AWD \d+inch/i;
  const SW = "2WD 4WD AWD FWD RWD PAWD 4x4 4x2 FFV BASE PAYLOAD Cab Pickup Chassis L LE SE XLE XSE LTD Limited Eco Hybrid Plug-in PHEV MHEV HEV Energi eAssist Taxi Police USPS Special Service Blue Nismo ST RS SHO Hellcat TRX Raptor Convertible Roadster Hatchback Premier Crew Ext MAX Wagon Van Cargo Select Performance Bullitt LWB SWB Z06 ZR1 ZR2 Type Sport NYC Turbo Prime Sedan Coupe FF Timberline Platinum Badlands Sasquatch Tremor Diamond Black Dual-fuel Bi-Fuel CNG Natural Gas SFE XFE HFE HO RHO Warlock Lariat Lobo STX SS Si HF HX Widebody Scat Aero Hearse Limo Limo. Livery Funeral Coach Armored Postal Mud Terrain Tires Trailhawk TrackHawk Trackhawk EcoDiesel Rubicon Rubic Wilderness Denali with without R/T SRT-8 - Classic LD Door Doors Dr 2Dr 4Dr 5Dr 2-Dr 4-Dr 4-Door 5-Door 2Door 4Door".split(" ");
  const STOP = new RegExp("^(" + SW.map((x) => x.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&")).join("|") + "|GVWR.*|\\d\\.\\dL|[CK]\\d{2,4}|\\d{2}|1500|2500|3500|HD|SRT\\d*|[A-Z]|\\d)$", "i");
  const LEXUS = /^(CT|ES|GS|GX|HS|IS|LC|LS|LX|NX|RC|RX|SC|TX|UX) ?\d*/;
  // Pairs that look like "base + trim" but are really different vehicles; keep them separate.
  const DISTINCT = new Set(["Corolla|Corolla Cross", "Corolla|GR Corolla", "Transit|Transit Connect", "Eclipse|Eclipse Cross", "Camry|Camry Solara", "Crown|Crown Signia", "Express|City Express", "Grand Cherokee|Grand Cherokee L", "Santa|Santa Cruz", "Ram|Ram Promaster"]);

  function family(make, name){
    name = name.trim().replace(/^New /, ""); let m;
    if (make === "Lexus" && (m = name.match(LEXUS))) return m[1];            // RX 350 / RX 350h / RX 450h -> RX
    if (/^(Shelby .*Mustang|Mustang)/.test(name)) return "Mustang";
    if (/^GR ?86/.test(name)) return "GR86";
    if (/^Sentra/.test(name)) return "Sentra";
    if (/^Prius/.test(name)) return "Prius";
    if (/^Transit T\d+/.test(name)) return "Transit";
    if (/^(Sonic|Aveo|Optra) 5/.test(name)) return name.split(" ")[0];
    const out = [];
    name.split(/\s+/).forEach((t, i) => { if (out.stop) return; if (i > 0 && STOP.test(t)) { out.stop = true; return; } out.push(t); });
    let r = out.join(" ") || name;
    if (make === "Mazda" && /^\d$/.test(r.split(" ")[0])) r = "Mazda" + r.split(" ")[0];   // "3 4-Door" -> Mazda3
    return r;
  }
  function buildGroups(make, names){
    const fam = new Map();                                  // family -> [EPA model names]
    for (const n of names){ if (EV.test(n)) continue; const f = family(make, n); if (!fam.has(f)) fam.set(f, []); fam.get(f).push(n); }
    const out = new Map();
    for (const [f, list] of fam){
      const w = f.split(" "); let tgt = f;
      for (let k = w.length - 1; k > 0; k--){ const p = w.slice(0, k).join(" "); if (fam.has(p) && !DISTINCT.has(p + "|" + f)){ tgt = p; break; } }
      if (!out.has(tgt)) out.set(tgt, []); out.get(tgt).push(...list);
    }
    return out;
  }

  // "Auto (S8), 6 cyl, 3.5 L, Turbo" -> "3.5L 6-cyl Turbo"
  function engineLabel(text){
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
    let disp = "", cyl = ""; const extra = [];
    for (const p of parts){
      let m;
      if (/^(auto|manual)/i.test(p)) continue;
      if ((m = p.match(/^(\d+)\s*cyl/i))) cyl = m[1] + "-cyl";
      else if ((m = p.match(/^(\d+(?:\.\d+)?)\s*L$/i))) disp = parseFloat(m[1]).toFixed(1) + "L";
      else extra.push(...p.split(";").map((x) => x.trim()));
    }
    if (!disp && !cyl) return "Electric";
    // Keep only what matters for oil and filters; drop marketing/transmission notes (SIDI, XFE, eTorque...).
    const keep = [];
    for (const x of extra){
      if (/diesel/i.test(x)) keep.push("Diesel");
      else if (/turbo/i.test(x)) keep.push("Turbo");
      else if (/supercharg/i.test(x)) keep.push("Supercharged");
      else if (/plug-in|phev/i.test(x)) keep.push("Plug-in Hybrid");
      else if (/hybrid/i.test(x)) keep.push("Hybrid");
    }
    return [disp, cyl, ...new Set(keep)].filter(Boolean).join(" ");
  }

  // EPA only says "hybrid" in the model name (Prius, "RAV4 Hybrid", "RX 450h"), not in the engine text.
  // Now that hybrids are folded into their base model, tag the engine so a 2.5L hybrid isn't mistaken for the 2.5L gas one.
  function powertrainTag(modelName){
    if (/plug-in|PHEV|Energi|\bPrime\b|^(Volt|Clarity)\b/i.test(modelName)) return "Plug-in Hybrid";
    if (/hybrid|\bHEV\b|\b\d{3}h\b|\bPlus$|^(Prius|Insight|CR-Z|Ioniq)\b/i.test(modelName)) return "Hybrid";
    return "";
  }

  async function initYears(){
    loading(yearSel, "Loading…");
    try{
      const ys = (await epa("/year")).map((y) => y.value).filter((y) => +y >= 2000);
      fill(yearSel, "Year", ys, false);
    }catch(e){
      const ys = []; const now = new Date().getFullYear() + 1;
      for (let y = now; y >= 2000; y--) ys.push(String(y));
      fill(yearSel, "Year", ys, false);
    }
  }

  yearSel.addEventListener("change", async () => {
    fill(modelSel, "Model", [], true); fill(engSel, "Engine", [], true); clearStatus($("vstatus")); updateChip();
    if (!yearSel.value){ fill(makeSel, "Make", [], true); return; }
    loading(makeSel, "Loading makes…");
    try{
      const makes = (await epa("/make?year=" + yearSel.value)).map((m) => m.text);
      const inScope = makes.filter((m) => IN_SCOPE.some((x) => x.toLowerCase() === m.toLowerCase()));
      fill(makeSel, "Make", [...inScope, { text: "Other make", value: "__other" }], false);
    }catch(e){ epaDown(); }
  });

  makeSel.addEventListener("change", async () => {
    fill(engSel, "Engine", [], true); clearStatus($("vstatus")); updateChip();
    if (!makeSel.value){ fill(modelSel, "Model", [], true); return; }
    if (makeSel.value === "__other"){
      fill(modelSel, "Model", [], true);
      setStatus($("vstatus"), "warn", "I currently service most domestic, Japanese and Korean vehicles. <a href=\"sms:+18018663466\">Text me</a> your year, make and model and I'll see if I can help.");
      return;
    }
    loading(modelSel, "Loading models…");
    try{
      const names = (await epa("/model?year=" + yearSel.value + "&make=" + encodeURIComponent(makeSel.value))).map((m) => m.text);
      groups = buildGroups(makeSel.value, names);
      const bases = [...groups.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      fill(modelSel, "Model", [...bases, { text: "Don't see your model?", value: "__missing" }], false);
    }catch(e){ epaDown(); }
  });

  modelSel.addEventListener("change", async () => {
    clearStatus($("vstatus")); updateChip();
    if (!modelSel.value){ fill(engSel, "Engine", [], true); return; }
    if (modelSel.value === "__missing"){
      fill(engSel, "Engine", [], true);
      setStatus($("vstatus"), "warn", "Heavy-duty trucks (like an F-250 or Ram 2500) aren't in this list. <button type=\"button\" class=\"linkbtn\" data-vin>Use the VIN tab instead</button>.");
      return;
    }
    loading(engSel, "Loading engines…");
    try{
      const variants = groups.get(modelSel.value) || [modelSel.value];
      const lists = await Promise.all(variants.map((v) =>
        epa("/options?year=" + yearSel.value + "&make=" + encodeURIComponent(makeSel.value) + "&model=" + encodeURIComponent(v)).catch(() => [])));
      const seen = new Set(); const engines = [];
      lists.forEach((list, i) => {
        const tag = powertrainTag(variants[i]);
        for (const o of list){
          let l = engineLabel(o.text); if (l === "Electric") continue;
          if (tag && !/hybrid/i.test(l)) l += " " + tag;
          if (!seen.has(l)){ seen.add(l); engines.push(l); }
        }
      });
      if (!engines.length){ fill(engSel, "Engine", [], true); setStatus($("vstatus"), "warn", "Good news: electric cars don't need oil changes. If your car does have an engine, <a href=\"sms:+18018663466\">text me</a> the year, make and model."); return; }
      engines.sort((a, b) => (parseFloat(a) || 99) - (parseFloat(b) || 99));
      const items = engines.map((e) => ({ text: e, value: e }));
      items.push({ text: "Not sure", value: "__unsure" });
      fill(engSel, engines.length === 1 ? "Engine" : "Pick your engine", items, false);
      if (engines.length === 1){ engSel.value = engines[0]; engSel.dispatchEvent(new Event("change")); }
    }catch(e){ epaDown(); }
  });

  engSel.addEventListener("change", () => {
    clearStatus($("vstatus"));
    const v = engSel.value;
    if (/diesel/i.test(v)) setStatus($("vstatus"), "warn", "Diesels need a quick check first. <a href=\"sms:+18018663466\">Text me</a> and I'll let you know if I can take it.");
    updateChip();
  });

  function epaDown(){
    setStatus($("vstatus"), "warn", "The vehicle list isn't loading right now. <button type=\"button\" class=\"linkbtn\" data-vin>Use the VIN tab instead</button>, or continue and I'll confirm your car before the visit.");
  }

  // VIN mode
  function setMode(m, focusField){
    mode = m;
    $("ymm").hidden = m !== "ymm";
    $("vinStep").hidden = m !== "vin";
    for (const [id, on] of [["tabYmm", m === "ymm"], ["tabVin", m === "vin"]]){
      $(id).setAttribute("aria-selected", on); $(id).tabIndex = on ? 0 : -1;
    }
    clearStatus($("vstatus")); updateChip();
    if (focusField && m === "vin") $("vin").focus();
  }
  $("tabYmm").addEventListener("click", () => setMode("ymm"));
  $("tabVin").addEventListener("click", () => setMode("vin", true));
  for (const id of ["tabYmm", "tabVin"]){
    $(id).addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight"){
        e.preventDefault(); const next = mode === "ymm" ? "vin" : "ymm";
        setMode(next); $(next === "vin" ? "tabVin" : "tabYmm").focus();
      }
    });
  }
  document.addEventListener("click", (e) => { if (e.target.matches("[data-vin]")) setMode("vin", true); });

  let vinTimer;
  $("vin").addEventListener("input", (e) => {
    const v = e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    e.target.value = v; vinInfo = null; updateChip(); clearStatus($("vstatus"));
    clearTimeout(vinTimer);
    if (v.length === 17) vinTimer = setTimeout(() => decodeVin(v), 150);
  });
  async function decodeVin(vin){
    setStatus($("vstatus"), "ok", "<span class=\"spin\"></span>Looking up your VIN…");
    try{
      const r = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/" + vin + "?format=json");
      const d = (await r.json()).Results[0];
      if (!d.Make || !d.ModelYear) throw new Error("no match");
      const disp = d.DisplacementL ? parseFloat(d.DisplacementL).toFixed(1) + "L" : "";
      const cyl = d.EngineCylinders ? d.EngineCylinders + "-cyl" : "";
      const turbo = /yes/i.test(d.Turbo || "") ? "Turbo" : "";
      vinInfo = { year: d.ModelYear, make: d.Make, model: d.Model, engine: [disp, cyl, turbo].filter(Boolean).join(" "), fuel: d.FuelTypePrimary || "" };
      clearStatus($("vstatus"));
      if (/^electric$/i.test(vinInfo.fuel)) setStatus($("vstatus"), "warn", "Good news: electric cars don't need oil changes.");
      else if (/diesel/i.test(vinInfo.fuel)) setStatus($("vstatus"), "warn", "Diesels need a quick check first. <a href=\"sms:+18018663466\">Text me</a> and I'll let you know if I can take it.");
      updateChip();
    }catch(e){
      setStatus($("vstatus"), "warn", "I couldn't decode that VIN. Double-check it, or switch back to year, make and model.");
    }
  }

  function titleCase(s){ return String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
  function currentVehicle(){
    if (mode === "vin") return vinInfo ? { year: vinInfo.year, make: titleCase(vinInfo.make), model: vinInfo.model, engine: vinInfo.engine, vin: $("vin").value } : null;
    if (!yearSel.value || !makeSel.value || makeSel.value === "__other" || !modelSel.value || modelSel.value === "__missing" || !engSel.value) return null;
    return { year: yearSel.value, make: makeSel.value, model: modelSel.value, engine: engSel.value === "__unsure" ? "" : engSel.value };
  }
  function updateChip(){
    const v = currentVehicle(); const chip = $("chip");
    if (!v){ chip.className = "vehicle-chip"; chip.textContent = ""; return; }
    chip.className = "vehicle-chip show";
    chip.textContent = "✓ " + [v.year, v.make, v.model].join(" ") + (v.engine ? " · " + v.engine : " · engine to confirm");
  }

  // Terms checkboxes: the Claim and Book buttons stay greyed out until checked.
  const agreeOffer = $("agreeOffer"), claim = $("claim");
  function syncClaim(){
    const on = agreeOffer.checked;
    claim.classList.toggle("is-off", !on);
    claim.setAttribute("aria-disabled", on ? "false" : "true");
  }
  agreeOffer.addEventListener("change", syncClaim);
  claim.addEventListener("click", (e) => { if (!agreeOffer.checked){ e.preventDefault(); agreeOffer.focus(); } });
  syncClaim();

  const agreeService = $("agreeService");
  agreeService.addEventListener("change", () => { $("go").disabled = !agreeService.checked; });
  $("go").disabled = !agreeService.checked;

  // Phone formatting
  $("phone").addEventListener("input", (e) => {
    const d = e.target.value.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
    e.target.value = d.length > 6 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : d.length > 3 ? `(${d.slice(0,3)}) ${d.slice(3)}` : d;
  });

  // Submit: save to the worker, then send to Square
  $("picker").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fs = $("fstatus"); clearStatus(fs);
    const v = currentVehicle();
    const name = $("name").value.trim();
    const digits = $("phone").value.replace(/\D/g, "");
    if (!v){ setStatus(fs, "err", mode === "vin" ? "Enter a full 17-character VIN, or switch to year, make and model." : "Pick your year, make, model and engine (or \"Not sure\")."); return; }
    if (!name){ setStatus(fs, "err", "Add your name."); $("name").focus(); return; }
    if (digits.length !== 10){ setStatus(fs, "err", "Add a 10-digit mobile number."); $("phone").focus(); return; }
    if (!agreeService.checked){ setStatus(fs, "err", "Check the box to agree to the Service Terms."); agreeService.focus(); return; }

    const btn = $("go"); btn.disabled = true; btn.innerHTML = "<span class=\"spin\"></span>Saving your car…";
    const body = { name, phone: digits, year: v.year, make: v.make, model: v.model, engine: v.engine, vin: v.vin || "", mileage: $("miles").value, website: $("website").value, terms_accepted: agreeService.checked, terms_version: TERMS_VERSION };
    try{
      const r = await fetch(WORKER, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (d.status === "out_of_scope"){
        btn.disabled = false; btn.textContent = "Book My Oil Change";
        setStatus(fs, "warn", "Thanks, I've got your info. This vehicle needs a quick check before booking. <a href=\"sms:+18018663466\">Text me</a> and I'll get back to you fast.");
        return;
      }
      if (!r.ok || !d.ok) throw new Error(d.error || "save failed");
      btn.innerHTML = "<span class=\"spin\"></span>Opening booking…";
      window.location.href = d.next || FALLBACK_BOOKING;
    }catch(err){
      // Never block a booking because the save failed. Jeremy's prep list will flag the missing car.
      btn.disabled = false; btn.textContent = "Book My Oil Change";
      setStatus(fs, "warn", "I couldn't save your car details just now. <a href=\"" + FALLBACK_BOOKING + "\">Continue to booking anyway</a> and I'll confirm your car by text.");
    }
  });

  initYears();
})();
