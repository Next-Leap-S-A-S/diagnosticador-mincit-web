(() => {
  const TOKEN_KEY = "diagnosticador_mincit_token";
  const STORE_KEY = "diagnosticador_mincit_state_v1";
  const $ = (id) => document.getElementById(id);
  // En GitHub Pages solo está la página; las llamadas a Claude van al servidor de Vercel.
  const API_BASE = location.hostname.endsWith("github.io") ? "https://diagnosticador-mincit.vercel.app" : "";

  const FIELDS = [
    { key: "problema", label: "01. Problema", hint: "¿Qué tarea o proceso duele, a quién, cada cuánto y cuánto cuesta (horas, dinero, términos legales)?" },
    { key: "solucion_ia", label: "02. Solución con IA", hint: "¿Automatización, prompt, asistente, chatbot o agente? ¿Qué hace la IA y qué decide siempre una persona?" },
    { key: "datos_insumos", label: "03. Datos e insumos", hint: "¿Qué documentos, bases o sistemas necesita, quién es el dueño y si hay datos personales o reservados?" },
    { key: "impacto_kpi", label: "04. Impacto y KPI", hint: "¿Qué indicador cambia, cuánto vale hoy, cuál es la meta y cómo se mide?" },
    { key: "roi_estimado", label: "05. ROI estimado", hint: "Ahorro estimado menos costo de implementar y operar, con los supuestos a la vista." },
    { key: "riesgo_principal", label: "06. Riesgo principal", hint: "El peor escenario realista, qué tan grave es y cómo se evita." },
  ];
  const META = ["dependencia", "plataforma", "grupo", "integrantes"];
  const TABS = ["diagnostico", "flujo", "prompt"];
  const ENDPOINT = { diagnostico: "/api/diagnostico", flujo: "/api/flujo", prompt: "/api/prompt-rci" };
  const LABEL = { diagnostico: "diagnóstico", flujo: "flujo", prompt: "prompt RCI" };

  let state = load();
  let busy = false;

  function blank() {
    return { canvas: { entidad: "Mincit" }, diagnostico: null, flujo: null, prompt: null, notas: {} };
  }
  function load() {
    try { return Object.assign(blank(), JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); } catch { return blank(); }
  }
  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    $("saved").textContent = "Guardado en este navegador.";
  }

  // ---------- Acceso ----------
  const token = () => sessionStorage.getItem(TOKEN_KEY) || "";
  function showApp() { $("gate").hidden = true; $("app").hidden = false; }
  function showGate(msg) { $("gate").hidden = false; $("app").hidden = true; if (msg) { $("gateErr").textContent = msg; $("gateErr").hidden = false; } }
  if (token()) showApp(); // si el código guardado ya no sirve, la primera llamada devuelve al acceso
  $("gateBtn").onclick = async () => {
    const v = $("gateInput").value.trim();
    if (!v) return;
    sessionStorage.setItem(TOKEN_KEY, v);
    $("gateBtn").disabled = true;
    try {
      const res = await fetch(API_BASE + "/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${v}` },
        body: JSON.stringify({ modo: "ping" }),
      });
      if (res.status === 401) { sessionStorage.removeItem(TOKEN_KEY); $("gateErr").textContent = "Código incorrecto. Revisa que esté igual a como te lo dieron."; $("gateErr").hidden = false; }
      else { $("gateErr").hidden = true; showApp(); }
    } catch {
      $("gateErr").textContent = "No pude conectar con el servidor. Revisa tu conexión."; $("gateErr").hidden = false;
    }
    $("gateBtn").disabled = false;
  };
  $("gateInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("gateBtn").click(); });

  // ---------- Llamadas ----------
  async function api(url, payload) {
    const res = await fetch(API_BASE + url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) { sessionStorage.removeItem(TOKEN_KEY); showGate("Código incorrecto."); throw new Error("Código incorrecto"); }
    return res;
  }
  async function apiJson(url, payload) {
    const res = await api(url, payload);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Error HTTP ${res.status}`);
    return body;
  }
  async function apiStream(url, payload, onPartial) {
    const res = await api(url, payload);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Error HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", result = null, error = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const m = JSON.parse(line);
        if (m.done) { result = m.result; error = m.error; }
        else if (onPartial && m.partial) onPartial(m.partial);
      }
    }
    if (error) throw new Error(error);
    if (!result) throw new Error("La respuesta llegó incompleta. Intenta de nuevo.");
    return result;
  }

  // ---------- Lienzo ----------
  function buildFields() {
    $("fields").innerHTML = FIELDS.map((f) => `
      <div class="field" data-key="${f.key}">
        <div class="field-head"><b>${f.label}</b><button class="small" data-act="assist" data-key="${f.key}">Mejorar con IA</button></div>
        <p class="hint">${f.hint}</p>
        <textarea id="f_${f.key}" rows="4"></textarea>
        <div class="assist-out" id="a_${f.key}"></div>
      </div>`).join("");
  }
  function fillForm() {
    [...FIELDS.map((f) => f.key), ...META].forEach((k) => { const el = $("f_" + k); if (el) el.value = state.canvas[k] || ""; });
  }
  function bindForm() {
    [...FIELDS.map((f) => f.key), ...META].forEach((k) => {
      $("f_" + k).addEventListener("input", (e) => { state.canvas[k] = e.target.value; save(); });
    });
  }

  $("fields").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const key = btn.dataset.key;
    const out = $("a_" + key);
    if (btn.dataset.act === "assist") {
      btn.disabled = true; btn.textContent = "Pensando...";
      out.innerHTML = "";
      try {
        const r = await apiJson("/api/assist", { modo: "campo", campo: key, canvas: state.canvas });
        out.innerHTML = `<div class="assist">
          <p><b>Estado:</b> ${badge(r.nivel)}</p>
          ${r.queFalta?.length ? `<b>Qué falta</b>${ul(r.queFalta)}` : ""}
          <b>Preguntas para responder</b>${ul(r.preguntas)}
          <b>Sugerencia</b><div class="sug">${esc(r.sugerencia)}</div>
          <button class="small" data-act="use" data-key="${key}">Usar sugerencia</button>
        </div>`;
        out.dataset.sug = r.sugerencia;
      } catch (err) {
        out.innerHTML = `<div class="assist"><span class="err">${esc(err.message)}</span></div>`;
      }
      btn.disabled = false; btn.textContent = "Mejorar con IA";
    } else if (btn.dataset.act === "use") {
      const sug = out.dataset.sug || "";
      state.canvas[key] = sug; $("f_" + key).value = sug; save();
      out.innerHTML = "";
    }
  });

  $("btnIdea").onclick = async () => {
    const idea = $("ideaText").value.trim();
    $("ideaMsg").textContent = "Organizando...";
    $("btnIdea").disabled = true;
    try {
      const r = await apiJson("/api/assist", { modo: "estructurar", idea });
      FIELDS.forEach((f) => { state.canvas[f.key] = r[f.key] || ""; });
      if (r.dependencia && !state.canvas.dependencia) state.canvas.dependencia = r.dependencia;
      save(); fillForm();
      $("ideaMsg").textContent = r.vacios?.length ? `Listo. Falta confirmar: ${r.vacios.join("; ")}` : "Listo. Revisa cada campo y usa Mejorar con IA.";
    } catch (err) {
      $("ideaMsg").textContent = err.message;
    }
    $("btnIdea").disabled = false;
  };

  // ---------- Entregables ----------
  function renderPane(name) {
    const pane = $("pane_" + name);
    const data = state[name];
    const body = data
      ? (name === "diagnostico" ? renderDiagnostico(data) : name === "flujo" ? renderFlujo(data) : renderPrompt(data))
      : `<p class="pane-empty">Aún no hay ${LABEL[name]}. Genéralo con el botón de abajo.</p>`;
    const needs = name === "flujo" && !state.diagnostico ? "Recomendado: genera primero el diagnóstico." : name === "prompt" && !state.flujo ? "Recomendado: genera primero el diagnóstico y el flujo." : "";
    pane.innerHTML = `${body}
      <div class="notes">
        <label>Ajustes para ${LABEL[name]} (opcional)
          <textarea id="n_${name}" rows="2" placeholder="Ej. el agente también debe revisar el término de respuesta; agreguen un paso de revisión del jefe">${esc(state.notas[name] || "")}</textarea>
        </label>
        <div class="row"><button class="primary" data-act="gen" data-name="${name}">${data ? "Volver a generar" : "Generar"} ${LABEL[name]}</button><span class="status" id="s_${name}">${needs}</span></div>
        <div class="bar" id="b_${name}" hidden><i></i></div>
      </div>`;
    if (name === "flujo" && data) drawFlujo(data, $("diagram"));
    $("dot_" + name).className = "dot" + (data ? " done" : "");
    $("n_" + name).addEventListener("input", (e) => { state.notas[name] = e.target.value; save(); });
  }

  const PROGRESS_KEYS = {
    diagnostico: ["resumenEjecutivo", "viabilidad", "tipoDeSolucion", "observaciones", "madurez", "riesgos", "kpisSugeridos", "hojaDeRuta", "preguntasAbiertas"],
    flujo: ["nombre", "trigger", "nodos", "fuentesDeDatos", "puntosDeControlHumano", "erroresComunes", "ejemploDeEjecucion"],
    prompt: ["rol", "contexto", "instruccion"],
  };

  async function generate(name) {
    if (busy) return;
    const c = state.canvas;
    if (!c.problema?.trim() || !c.solucion_ia?.trim()) {
      $("s_" + name).textContent = "Completa al menos el problema y la solución con IA.";
      return;
    }
    busy = true;
    setBusy(true);
    const dot = $("dot_" + name), status = $("s_" + name), bar = $("b_" + name);
    dot.className = "dot busy"; bar.hidden = false; status.textContent = "Claude está trabajando, puede tardar uno o dos minutos...";
    const payload = { canvas: c, notas: state.notas[name] || "", diagnostico: state.diagnostico, flujo: name === "prompt" ? state.flujo : undefined };
    try {
      const result = await apiStream(ENDPOINT[name], payload, (p) => {
        const keys = PROGRESS_KEYS[name];
        const n = keys.filter((k) => p[k] != null).length;
        bar.firstElementChild.style.width = Math.round((n / keys.length) * 100) + "%";
      });
      state[name] = result;
      save();
      renderPane(name);
    } catch (err) {
      dot.className = "dot";
      status.textContent = "Error: " + err.message;
      bar.hidden = true;
    }
    busy = false;
    setBusy(false);
  }
  function setBusy(b) {
    document.querySelectorAll('button[data-act="gen"], #btnTodo').forEach((x) => (x.disabled = b));
  }

  document.querySelector(".card:has(.tabs)").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (t) { switchTab(t.dataset.tab); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    if (b.dataset.act === "gen") generate(b.dataset.name);
    if (b.dataset.act === "copy-prompt") copy(state.prompt?.textoCompleto, b);
    if (b.dataset.act === "dl-svg") downloadSvg();
    if (b.dataset.act === "dl-png") downloadPng();
    if (b.dataset.act === "copy-mermaid") copy(flujoToMermaid(state.flujo), b);
    if (b.dataset.act === "dl-prompt") download("prompt-rci.md", state.prompt?.textoCompleto || "");
  });

  function svgText() {
    const el = $("diagram")?.querySelector("svg");
    if (!el) return null;
    const c = el.cloneNode(true);
    c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return { el, text: new XMLSerializer().serializeToString(c) };
  }
  function downloadSvg() {
    const s = svgText(); if (!s) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([s.text], { type: "image/svg+xml" }));
    a.download = "flujo-agente.svg"; a.click(); URL.revokeObjectURL(a.href);
  }
  function downloadPng() {
    const s = svgText(); if (!s) return;
    const box = s.el.getBoundingClientRect();
    const w = Math.ceil(box.width * 2), h = Math.ceil(box.height * 2);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "flujo-agente.png"; a.click(); URL.revokeObjectURL(a.href); });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.text.replace(/<br\s*>/g, "<br/>"));
  }

  function switchTab(name) {
    TABS.forEach((t) => { $("pane_" + t).hidden = t !== name; });
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text || ""); const o = btn.textContent; btn.textContent = "Copiado"; setTimeout(() => (btn.textContent = o), 1200); } catch { /* sin permiso de portapapeles */ }
  }
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }

  $("btnTodo").onclick = async () => {
    for (const n of TABS) { switchTab(n); await generate(n); if (!state[n]) break; }
  };

  // ---------- Informe .md ----------
  function informeMd() {
    const c = state.canvas;
    const d = state.diagnostico, f = state.flujo, p = state.prompt;
    const L = [`# Proyecto de IA: ${c.grupo || "Grupo sin nombre"}`, `${c.entidad || "Mincit"} · ${c.dependencia || ""}`, `Integrantes: ${c.integrantes || ""}`, ""];
    L.push("## Lienzo", ...FIELDS.map((x) => `**${x.label}**\n${c[x.key] || ""}\n`));
    if (d) {
      L.push("## Diagnóstico", d.resumenEjecutivo, `\nViabilidad: ${Math.round(d.viabilidad.puntaje)}/100`);
      L.push(`\nTipo: ${d.tipoDeSolucion.tipo} (${d.tipoDeSolucion.intervencion}). ${d.tipoDeSolucion.justificacion}`);
      L.push("\n### Observaciones", ...d.observaciones.map((x) => `- ${x}`));
      L.push("\n### Madurez", ...d.madurez.map((m) => `- ${m.dimension}: Tier ${m.tierAsignado}. ${m.justificacion} Siguiente paso: ${m.siguientePaso}`));
      L.push("\n### Riesgos", ...d.riesgos.map((r) => `- (${r.severidad}) ${r.riesgo}. Mitigación: ${r.mitigacion}`));
      L.push("\n### KPIs", ...d.kpisSugeridos.map((k) => `- ${k.kpi}: ${k.formula}. Base: ${k.lineaBase}. Meta: ${k.meta} (${k.frecuencia})`));
      L.push("\n### Hoja de ruta", ...d.hojaDeRuta.map((w) => `- **${w.semana}** ${w.objetivo}: ${w.acciones.join("; ")}. ${w.comoHacerlo}`));
      L.push("\n### Preguntas abiertas", ...d.preguntasAbiertas.map((x) => `- ${x}`), "");
    }
    if (f) {
      L.push(`## Flujo: ${f.nombre}`, f.objetivo, `\nTrigger (${f.trigger.tipo}): ${f.trigger.descripcion}. Intervención: ${f.intervencion}.\n`);
      L.push(...f.nodos.map((n, i) => `${i + 1}. [${n.tipo}/${n.actor}] **${n.titulo}**: ${n.detalle}`));
      L.push("\n```mermaid", flujoToMermaid(f), "```", "");
    }
    if (p) L.push("## Prompt RCI", "", p.textoCompleto);
    return L.join("\n");
  }
  $("btnMd").onclick = () => download(`Proyecto IA - ${(state.canvas.grupo || "grupo").replace(/[\\/:*?"<>|]/g, "")}.md`, informeMd());
  $("btnPrint").onclick = () => { TABS.forEach((t) => ($("pane_" + t).hidden = false)); window.print(); switchTab("diagnostico"); };

  $("btnNuevo").onclick = () => {
    if (!confirm("Esto borra el lienzo y los resultados actuales de este navegador. ¿Continuar?")) return;
    state = blank(); save(); fillForm(); $("ideaText").value = ""; $("ideaMsg").textContent = "";
    $("fields").querySelectorAll(".assist-out").forEach((x) => (x.innerHTML = ""));
    TABS.forEach(renderPane); switchTab("diagnostico");
  };

  buildFields(); fillForm(); bindForm(); TABS.forEach(renderPane);
})();
