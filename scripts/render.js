// Renderizadores de los tres entregables. Todo el texto del modelo pasa por esc().
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ul = (a) => (a && a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
const badge = (txt, cls) => `<span class="badge ${esc(cls || txt)}">${esc(txt)}</span>`;

function renderDiagnostico(d) {
  if (!d) return "";
  const v = d.viabilidad || {};
  const t = d.tipoDeSolucion || {};
  return `<div class="r">
    <h3>Resumen</h3>
    <p>${esc(d.resumenEjecutivo)}</p>
    <div class="score"><b>${v.puntaje != null ? Math.round(v.puntaje) : "—"}</b><span class="muted">/100 de viabilidad</span></div>
    <p>Evidencia del problema ${d.evidenciaDelProblema ? badge(d.evidenciaDelProblema) : ""} · Concreción de la solución ${d.concrecionDeLaSolucion ? badge(d.concrecionDeLaSolucion) : ""}</p>
    <div class="grid2"><div><b>A favor</b>${ul(v.factoresAFavor)}</div><div><b>En contra</b>${ul(v.factoresEnContra)}</div></div>

    ${t.tipo ? `<h3>Tipo de solución</h3><p>${badge(t.tipo, "moderada")} ${badge(t.intervencion || "", "baja")}</p><p>${esc(t.justificacion)}</p>` : ""}

    ${d.observaciones ? `<h3>Observaciones</h3>${ul(d.observaciones)}` : ""}

    ${d.madurez ? `<h3>Madurez por dimensión</h3>
    <table class="t"><tr><th>Dimensión</th><th>Tier</th><th>Por qué</th><th>Siguiente paso</th></tr>
    ${d.madurez.map((m) => `<tr><td>${esc(m.dimension)}</td><td>${esc(m.tierAsignado)}</td><td>${esc(m.justificacion)}</td><td>${esc(m.siguientePaso)}</td></tr>`).join("")}</table>` : ""}

    ${d.riesgos ? `<h3>Riesgos</h3>
    <table class="t"><tr><th>Riesgo</th><th>Severidad</th><th>Mitigación</th></tr>
    ${d.riesgos.map((r) => `<tr><td>${esc(r.riesgo)}</td><td>${badge(r.severidad)}</td><td>${esc(r.mitigacion)}</td></tr>`).join("")}</table>` : ""}

    ${d.kpisSugeridos ? `<h3>KPIs sugeridos</h3>
    <table class="t"><tr><th>KPI</th><th>Fórmula</th><th>Línea base</th><th>Meta</th><th>Frecuencia</th></tr>
    ${d.kpisSugeridos.map((k) => `<tr><td>${esc(k.kpi)}</td><td>${esc(k.formula)}</td><td>${esc(k.lineaBase)}</td><td>${esc(k.meta)}</td><td>${esc(k.frecuencia)}</td></tr>`).join("")}</table>` : ""}

    ${d.hojaDeRuta ? `<h3>Hoja de ruta</h3>${d.hojaDeRuta.map((w) => `<div class="week"><span class="wk">${esc(w.semana)}</span> <b>${esc(w.objetivo)}</b>${ul(w.acciones)}<p class="muted">${esc(w.comoHacerlo)}</p></div>`).join("")}` : ""}

    ${d.preguntasAbiertas ? `<h3>Preguntas por resolver antes de construir</h3>${ul(d.preguntasAbiertas)}` : ""}
  </div>`;
}

const TIPO_LABEL = { trigger: "Trigger", accion: "Acción", decision: "Decisión", humano: "Control humano", salida: "Salida" };

function renderFlujo(f) {
  if (!f) return "";
  const nodos = f.nodos || [];
  const titulo = (id) => { const n = nodos.find((x) => x.id === id); return n ? n.titulo : id; };
  const flow = nodos
    .map((n, i) => {
      const sig = (n.siguientes || []).map((s) => `→ ${s.condicion ? esc(s.condicion) + ": " : ""}${esc(titulo(s.id))}`).join("<br>");
      return `<div class="node ${esc(n.tipo)}">
        <div class="nh"><span class="chip">${i + 1}</span><span class="chip">${esc(TIPO_LABEL[n.tipo] || n.tipo)}</span><span class="chip">${esc(n.actor)}</span><span class="nt">${esc(n.titulo)}</span></div>
        <p class="nd">${esc(n.detalle)}</p>
        ${n.herramienta ? `<div class="nx">Herramienta: ${esc(n.herramienta)}</div>` : ""}
        ${sig ? `<div class="nx">${sig}</div>` : ""}
      </div>${i < nodos.length - 1 ? '<div class="arrow">↓</div>' : ""}`;
    })
    .join("");
  const e = f.ejemploDeEjecucion || {};
  return `<div class="r">
    <h3>${esc(f.nombre)}</h3>
    <p>${esc(f.objetivo)}</p>
    <p>Trigger: ${badge(f.trigger?.tipo || "", "moderada")} ${esc(f.trigger?.descripcion)} · Intervención: ${badge(f.intervencion || "", "baja")}</p>
    <h3>Pasos</h3><div class="flow">${flow}</div>
    <div class="row"><button class="small" data-act="copy-mermaid">Copiar diagrama (Mermaid)</button></div>
    ${f.fuentesDeDatos ? `<h3>Fuentes de datos</h3>${ul(f.fuentesDeDatos)}` : ""}
    ${f.puntosDeControlHumano ? `<h3>Puntos de control humano</h3>${ul(f.puntosDeControlHumano)}` : ""}
    ${f.erroresComunes ? `<h3>Errores comunes</h3><table class="t"><tr><th>Falla</th><th>Qué hacer</th></tr>${f.erroresComunes.map((x) => `<tr><td>${esc(x.falla)}</td><td>${esc(x.queHacer)}</td></tr>`).join("")}</table>` : ""}
    ${e.entrada ? `<h3>Ejemplo de ejecución</h3><p><b>Entrada:</b> ${esc(e.entrada)}</p><p><b>Recorrido:</b> ${esc(e.recorrido)}</p><p><b>Resultado:</b> ${esc(e.resultado)}</p>` : ""}
  </div>`;
}

function flujoToMermaid(f) {
  const q = (s) => String(s ?? "").replace(/["\n]/g, " ").slice(0, 80);
  const lines = ["flowchart TD"];
  (f.nodos || []).forEach((n) => {
    const t = q(n.titulo);
    const shape = n.tipo === "decision" ? `{"${t}"}` : n.tipo === "trigger" || n.tipo === "salida" ? `(["${t}"])` : n.tipo === "humano" ? `[/"${t}"/]` : `["${t}"]`;
    lines.push(`  ${n.id}${shape}`);
  });
  (f.nodos || []).forEach((n) =>
    (n.siguientes || []).forEach((s) => lines.push(s.condicion ? `  ${n.id} -->|"${q(s.condicion)}"| ${s.id}` : `  ${n.id} --> ${s.id}`))
  );
  return lines.join("\n");
}

function renderPrompt(p) {
  if (!p) return "";
  const words = (p.textoCompleto || "").trim().split(/\s+/).filter(Boolean).length;
  return `<div class="r">
    <p class="muted">${words} palabras. Pégalo completo como instrucciones del agente en la plataforma del grupo. Revisa los [dato por confirmar] antes de usarlo.</p>
    <div class="row"><button class="small" data-act="copy-prompt">Copiar prompt</button><button class="small" data-act="dl-prompt">Descargar .md</button></div>
    <pre class="prompt">${esc(p.textoCompleto)}</pre>
  </div>`;
}
