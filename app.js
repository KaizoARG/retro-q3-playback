const SUPABASE_URL = "https://cjhnxghbbblnmumkutyy.supabase.co";
const SUPABASE_KEY = "sb_publishable_7U9b09ElsfExwu8hzDS49Q_CigP-_1s";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// =====================================================
// RETRO ACTUAL
// =====================================================

const urlParams = new URLSearchParams(window.location.search);

const RETRO_CODE =
  urlParams.get("retro") || "DEMO";

console.log("Código de retro:", RETRO_CODE);


// =====================================================
// ESTADO
// =====================================================

const state = {
  step: 0,
  energy: null,

  // Votos acumulados de todos los participantes
  votes: {},

  // Votos realizados por este participante
  myVotes: {},

  // Cantidad de votos utilizados
  usedVotes: 0,

  // Session ID del navegador
  participantSessionId: null,

  // ID del participante en Supabase
  participantId: null,

  // Datos del participante
  participant: null,

  // Tarjetas de la retro
  cards: [],

  // Retro actual
  retroId: null,

  // Acciones
  actions: [],

  // ---------------------------------------------------
  // FACILITADOR
  // ---------------------------------------------------

  isFacilitator: false,

  facilitatorSessionId: null,
  facilitatorName: null,
  retroStarted: false,
  participants: []
};


// =====================================================
// CONFIGURACIÓN
// =====================================================

const MAX_VOTES_PER_PARTICIPANT = 3;

const voteTopics = [
  {
    key: "dependencias",
    label: "Dependencias entre equipos"
  },
  {
    key: "calidad",
    label: "Calidad y UAT"
  },
  {
    key: "priorizacion",
    label: "Priorización y foco"
  },
  {
    key: "metricas",
    label: "Visibilidad de métricas"
  }
];

const steps = [
  "Inicio",
  "Check-in",
  "Cosecha",
  "Agrupación",
  "Votación",
  "Conversación",
  "Acciones",
  "Cierre"
];


// =====================================================
// HELPERS
// =====================================================

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function getTopicLabel(topicKey) {
  const topic = voteTopics.find(
    topic => topic.key === topicKey
  );

  return topic
    ? topic.label
    : "Sin agrupar";
}


function getTopicCount(topicKey) {
  return state.cards.filter(
    card => card.topic_key === topicKey
  ).length;
}


function getGroupedCards(topicKey) {
  return state.cards.filter(
    card => card.topic_key === topicKey
  );
}


// =====================================================
// SESSION ID
// =====================================================

function getParticipantSessionId() {

  if (!state.retroId) {
    console.error(
      "No se puede generar Session ID sin retroId."
    );

    return null;
  }

  const storageKey =
    `retro-session-id-${state.retroId}`;

  let sessionId =
    localStorage.getItem(storageKey);

  if (!sessionId) {

    sessionId =
      crypto.randomUUID();

    localStorage.setItem(
      storageKey,
      sessionId
    );

    console.log(
      "Nuevo Session ID generado:",
      sessionId
    );

  } else {

    console.log(
      "Session ID recuperado:",
      sessionId
    );
  }

  state.participantSessionId =
    sessionId;

  return sessionId;
}


// =====================================================
// PARTICIPANTE
// =====================================================

async function loadParticipant() {

  const sessionId =
    getParticipantSessionId();

  if (!sessionId) {
    return false;
  }

  console.log(
    "Session ID:",
    sessionId
  );


  // ---------------------------------------------------
  // BUSCAR PARTICIPANTE EXISTENTE
  // ---------------------------------------------------

  const {
    data: existing,
    error: searchError
  } = await supabaseClient
    .from("participantes")
    .select("*")
    .eq("retro_id", state.retroId)
    .eq("session_id", sessionId)
    .maybeSingle();


  if (searchError) {

    console.error(
      "Error buscando participante:",
      searchError
    );

    return false;
  }


  if (existing) {

    state.participant =
      existing;

    state.participantId =
      existing.id;

    console.log(
      "Participante recuperado:",
      existing
    );

    return true;
  }


  // ---------------------------------------------------
  // CREAR PARTICIPANTE
  // ---------------------------------------------------

  const {
    data: created,
    error: createError
  } = await supabaseClient
    .from("participantes")
    .insert({
      retro_id: state.retroId,
      session_id: sessionId
    })
    .select()
    .single();


  if (createError) {

    console.error(
      "Error creando participante:",
      createError
    );

    return false;
  }


  state.participant =
    created;

  state.participantId =
    created.id;

  console.log(
    "Nuevo participante creado:",
    created
  );

  return true;
}


// =====================================================
// CARGAR VOTOS DEL PARTICIPANTE
// =====================================================

async function loadMyVotes() {

  if (!state.participantId) {
    return;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("voto_participantes")
    .select("topic_key")
    .eq("retro_id", state.retroId)
    .eq("participante_id", state.participantId);


  if (error) {

    console.error(
      "Error cargando votos del participante:",
      error
    );

    state.myVotes = {};
    state.usedVotes = 0;

    return;
  }


  state.myVotes = {};

  (data || []).forEach(row => {

    state.myVotes[row.topic_key] =
      (state.myVotes[row.topic_key] || 0) + 1;

  });


  state.usedVotes =
    (data || []).length;


  console.log(
    "Mis votos:",
    state.myVotes
  );

  console.log(
    "Votos utilizados:",
    state.usedVotes
  );
}


// =====================================================
// PERFIL DEL PARTICIPANTE
// =====================================================

async function setParticipantProfile(nombre, listo) {

  if (!state.retroId || !state.participantSessionId) {
    return false;
  }

  const cleanName = String(nombre || "").trim();

  if (!cleanName) {
    alert("Ingresá tu nombre y apellido.");
    return false;
  }

  const { data, error } = await supabaseClient
    .rpc("set_participant_profile", {
      p_retro_id: state.retroId,
      p_session_id: state.participantSessionId,
      p_nombre: cleanName,
      p_listo: Boolean(listo)
    });

  if (error) {
    console.error("Error actualizando perfil:", error);
    alert("No se pudo guardar tu perfil.\n\n" + error.message);
    return false;
  }

  state.participant = {
    ...(state.participant || {}),
    nombre: cleanName,
    listo: Boolean(listo)
  };

  console.log("Perfil actualizado:", data);
  await loadParticipants();
  render();
  return true;
}


async function loadParticipants() {

  if (!state.retroId) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("participantes")
    .select("id, retro_id, session_id, nombre, listo, created_at")
    .eq("retro_id", state.retroId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error cargando participantes:", error);
    return;
  }

  state.participants = data || [];

  const current = state.participants.find(
    participant => participant.id === state.participantId
  );

  if (current) {
    state.participant = current;
  }
}


function getParticipantName() {
  return (state.participant?.nombre || "").trim();
}


function isParticipantReady() {
  return Boolean(state.participant?.listo);
}


function lobbyScreen() {

  const readyCount = state.participants.filter(
    participant => participant.listo
  ).length;

  const totalCount = state.participants.length;
  const currentName = getParticipantName();
  const currentReady = isParticipantReady();

  return `
    <section>

      <div class="eyebrow">
        Antes de empezar
      </div>

      <h2>
        Preparémonos para la retro.
      </h2>

      <p class="lead">
        Ingresá tu nombre y apellido y marcate como listo.
        El facilitador va a iniciar la retro cuando considere que es momento de empezar.
      </p>

      <div
        class="card"
        style="margin-top:30px;">

        <div class="eyebrow" style="margin-bottom:10px;">
          Tu identificación
        </div>

        <input
          id="participantName"
          type="text"
          value="${escapeHtml(currentName)}"
          placeholder="Nombre y apellido"
          autocomplete="name"
          style="width:100%;"
          ${currentReady ? "disabled" : ""}>

        <button
          id="readyBtn"
          class="primary"
          style="margin-top:12px;"
          ${currentReady ? "disabled" : ""}>
          ${currentReady ? "✓ Listo para empezar" : "Listo para empezar"}
        </button>

        ${currentReady ? `
          <button
            id="editParticipantBtn"
            style="
              margin-top:10px;
              padding:9px 14px;
              border-radius:10px;
              cursor:pointer;
              background:transparent;
              border:1px solid rgba(255,255,255,.18);
              color:inherit;
            ">
            Cambiar nombre
          </button>
        ` : ""}

      </div>

      <div
        class="card"
        style="margin-top:20px;">

        <div class="eyebrow" style="margin-bottom:14px;">
          Participantes
        </div>

        <div style="display:grid;gap:10px;">
          ${
            state.participants.length === 0
              ? `<p style="margin:0;opacity:.65;">Todavía no hay participantes.</p>`
              : state.participants.map(participant => `
                <div
                  style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:12px;
                    padding:10px 0;
                    border-bottom:1px solid rgba(255,255,255,.07);
                  ">
                  <span>
                    ${escapeHtml(participant.nombre || "Sin identificar")}
                  </span>
                  <span
                    class="badge"
                    style="
                      ${participant.listo
                        ? "border-color:rgba(84,255,209,.3);"
                        : "opacity:.65;"}
                    ">
                    ${participant.listo ? "✓ Listo" : "○ Pendiente"}
                  </span>
                </div>
              `).join("")
          }
        </div>

        <p style="margin:18px 0 0;opacity:.7;">
          ${readyCount} de ${totalCount} listos
        </p>

      </div>

      ${state.isFacilitator ? `
        <div
          class="card"
          style="margin-top:20px;border-color:rgba(84,255,209,.25);">
          <strong>
            Tenés el control como facilitador.
          </strong>
          <p style="margin-bottom:0;opacity:.75;">
            Podés iniciar la retro aunque todavía no estén todos listos.
          </p>
        </div>
      ` : ""}

    </section>
  `;
}


// =====================================================
// FACILITADOR - ESTADO
// =====================================================

function updateFacilitatorState() {

  state.isFacilitator =
    Boolean(
      state.facilitatorSessionId &&
      state.participantSessionId &&
      state.facilitatorSessionId ===
        state.participantSessionId
    );

}


// =====================================================
// FACILITADOR - TOMAR CONTROL
// =====================================================

async function claimFacilitator() {

  if (
    !state.retroId ||
    !state.participantSessionId
  ) {
    return;
  }

  const {
    data,
    error
  } = await supabaseClient
    .rpc(
      "claim_facilitator",
      {
        p_retro_id:
          state.retroId,

        p_session_id:
          state.participantSessionId
      }
    );


  if (error) {

    console.error(
      "Error tomando control como facilitador:",
      error
    );

    alert(
      "No se pudo tomar el control como facilitador.\n\n" +
      error.message
    );

    return;
  }


  console.log(
    "Resultado claim facilitador:",
    data
  );


  // Al tomar el control, el facilitador queda
  // identificado y listo para comenzar.
  await setParticipantProfile(
    state.participant?.nombre || "",
    true
  );


  // ---------------------------------------------------
  // Volvemos a consultar la retro para conocer
  // el estado real del facilitador.
  // ---------------------------------------------------

  await refreshRetroState();
  await loadParticipants();

  render();
}


// =====================================================
// FACILITADOR - CONFIRMACIÓN
// =====================================================

function openFacilitatorConfirmation() {

  const modal =
    document.querySelector("#facilitatorModal");

  if (!modal) {
    return;
  }

  modal.style.display = "flex";
}


function closeFacilitatorConfirmation() {

  const modal =
    document.querySelector("#facilitatorModal");

  if (!modal) {
    return;
  }

  modal.style.display = "none";
}


async function confirmClaimFacilitator() {

  closeFacilitatorConfirmation();

  await claimFacilitator();
}


// =====================================================
// FACILITADOR - LIBERAR CONTROL
// =====================================================

async function releaseFacilitator() {

  if (
    !state.retroId ||
    !state.participantSessionId
  ) {
    return;
  }

  const confirmed =
    window.confirm(
      "¿Liberar el control como facilitador?\n\n" +
      "Otro participante podrá tomar el control de la retro."
    );

  if (!confirmed) {
    return;
  }


  const {
    data,
    error
  } = await supabaseClient
    .rpc(
      "release_facilitator",
      {
        p_retro_id:
          state.retroId,

        p_session_id:
          state.participantSessionId
      }
    );


  if (error) {

    console.error(
      "Error liberando control:",
      error
    );

    alert(
      "No se pudo liberar el control.\n\n" +
      error.message
    );

    return;
  }


  console.log(
    "Control de facilitador liberado:",
    data
  );


  await refreshRetroState();

  render();
}


// =====================================================
// FACILITADOR - INICIAR RETRO
// =====================================================

async function startRetro() {

  if (!state.isFacilitator) {
    return;
  }

  const { data, error } = await supabaseClient
    .rpc("start_retro", {
      p_retro_id: state.retroId,
      p_session_id: state.participantSessionId
    });

  if (error) {
    console.error("Error iniciando retro:", error);
    alert("No se pudo iniciar la retro.\n\n" + error.message);
    return;
  }

  console.log("Retro iniciada:", data);
  state.retroStarted = true;
  state.step = Number(data?.step || 0);
  render();
}


// =====================================================
// FACILITADOR - AVANZAR
// =====================================================

async function advanceRetro() {

  if (!state.isFacilitator) {

    console.log(
      "Solo el facilitador puede avanzar la retro."
    );

    return;
  }


  if (
    state.step >=
    steps.length - 1
  ) {
    return;
  }


  const {
    data,
    error
  } = await supabaseClient
    .rpc(
      "advance_retro",
      {
        p_retro_id:
          state.retroId,

        p_session_id:
          state.participantSessionId
      }
    );


  if (error) {

    console.error(
      "Error avanzando retro:",
      error
    );

    alert(
      "No se pudo avanzar la retro.\n\n" +
      error.message
    );

    return;
  }


  console.log(
    "Retro avanzada:",
    data
  );

  // El cambio de etapa llegará también por Realtime.
  // Actualizamos localmente para que la respuesta
  // sea inmediata.
  if (
    data &&
    data.step !== undefined
  ) {

    state.step =
      Number(data.step);

  }

  render();
}


// =====================================================
// FACILITADOR - RETROCEDER
// =====================================================

async function previousRetroStep() {

  if (!state.isFacilitator) {

    console.log(
      "Solo el facilitador puede retroceder la retro."
    );

    return;
  }


  if (state.step <= 0) {
    return;
  }


  const {
    data,
    error
  } = await supabaseClient
    .rpc(
      "previous_retro_step",
      {
        p_retro_id:
          state.retroId,

        p_session_id:
          state.participantSessionId
      }
    );


  if (error) {

    console.error(
      "Error retrocediendo retro:",
      error
    );

    alert(
      "No se pudo retroceder la retro.\n\n" +
      error.message
    );

    return;
  }


  console.log(
    "Retro retrocedida:",
    data
  );


  if (
    data &&
    data.step !== undefined
  ) {

    state.step =
      Number(data.step);

  }

  render();
}


// =====================================================
// FACILITADOR - REFRESCAR ESTADO
// =====================================================

async function refreshRetroState() {

  if (!state.retroId) {
    return;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("retros")
    .select(
      "id, codigo, nombre, paso_actual, facilitador_session_id, facilitador_nombre, iniciada"
    )
    .eq("id", state.retroId)
    .single();


  if (error) {

    console.error(
      "Error refrescando estado de la retro:",
      error
    );

    return;
  }


  state.step =
    Number(data.paso_actual || 0);

  state.facilitatorSessionId =
    data.facilitador_session_id || null;

  state.facilitatorName =
    data.facilitador_nombre || null;

  state.retroStarted =
    Boolean(data.iniciada);

  updateFacilitatorState();


  console.log(
    "Estado de retro actualizado:",
    {
      step: state.step,
      facilitatorSessionId:
        state.facilitatorSessionId,
      isFacilitator:
        state.isFacilitator
    }
  );
}


// =====================================================
// CONTROL DE FACILITADOR - UI
// =====================================================

function facilitatorControls() {

  let content = "";


  // ---------------------------------------------------
  // SOY FACILITADOR
  // ---------------------------------------------------

  if (state.isFacilitator) {

    content = `
      <div
        style="
          margin-bottom:28px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          flex-wrap:wrap;
          padding:12px 16px;
          border:1px solid rgba(84,255,209,.25);
          border-radius:14px;
          background:rgba(84,255,209,.05);
        "
      >

        <div>
          <div
            style="
              font-size:11px;
              letter-spacing:.08em;
              text-transform:uppercase;
              opacity:.7;
              margin-bottom:4px;
            "
          >
            FACILITADOR
          </div>

          <strong>
            Tenés el control de la retro
          </strong>

          <div style="margin-top:4px;opacity:.7;font-size:13px;">
            ${escapeHtml(state.facilitatorName || getParticipantName())}
          </div>
        </div>

        <button
          id="releaseFacilitatorBtn"
          style="
            padding:9px 14px;
            border-radius:10px;
            cursor:pointer;
            background:transparent;
            border:1px solid currentColor;
          "
        >
          Liberar control
        </button>

      </div>
    `;

  }


  // ---------------------------------------------------
  // OTRO FACILITADOR
  // ---------------------------------------------------

  else if (state.facilitatorSessionId) {

    content = `
      <div
        style="
          margin-bottom:28px;
          padding:12px 16px;
          border:1px solid rgba(255,255,255,.12);
          border-radius:14px;
          background:rgba(255,255,255,.03);
        "
      >

        <div
          style="
            font-size:11px;
            letter-spacing:.08em;
            text-transform:uppercase;
            opacity:.6;
            margin-bottom:4px;
          "
        >
          PARTICIPANTE
        </div>

        <strong>
          El facilitador controla el avance de la retro
        </strong>

        ${state.facilitatorName ? `
          <div style="margin-top:4px;opacity:.7;font-size:13px;">
            ${escapeHtml(state.facilitatorName)}
          </div>
        ` : ""}

      </div>
    `;

  }


  // ---------------------------------------------------
  // NADIE TIENE CONTROL
  // ---------------------------------------------------

  else {

    content = `
      <div
        style="
          margin-bottom:28px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          flex-wrap:wrap;
          padding:12px 16px;
          border:1px solid rgba(255,255,255,.12);
          border-radius:14px;
          background:rgba(255,255,255,.03);
        "
      >

        <div>
          <div
            style="
              font-size:11px;
              letter-spacing:.08em;
              text-transform:uppercase;
              opacity:.6;
              margin-bottom:4px;
            "
          >
            CONTROL DE LA RETRO
          </div>

          <strong>
            Todavía no hay un facilitador
          </strong>
        </div>

        <button
          id="claimFacilitatorBtn"
          class="primary"
          style="
            padding:10px 16px;
          "
        >
          Tomar control como facilitador
        </button>

      </div>
    `;

  }


  return content;
}


// =====================================================
// MODAL FACILITADOR
// =====================================================

function facilitatorModal() {

  return `
    <div
      id="facilitatorModal"
      style="
        display:none;
        position:fixed;
        inset:0;
        z-index:9999;
        align-items:center;
        justify-content:center;
        padding:24px;
        background:rgba(0,0,0,.72);
        backdrop-filter:blur(6px);
      "
    >

      <div
        style="
          width:min(460px, 100%);
          padding:28px;
          border-radius:18px;
          background:#111;
          border:1px solid rgba(255,255,255,.14);
          box-shadow:0 20px 80px rgba(0,0,0,.5);
        "
      >

        <div
          style="
            font-size:11px;
            letter-spacing:.08em;
            text-transform:uppercase;
            opacity:.6;
            margin-bottom:10px;
          "
        >
          CONTROL DE LA RETRO
        </div>

        <h3
          style="
            margin:0 0 12px 0;
          "
        >
          ¿Tomar control como facilitador?
        </h3>

        <p
          style="
            margin:0;
            line-height:1.6;
            opacity:.78;
          "
        >
          Vas a controlar el avance de la retro
          para todos los participantes.
        </p>

        <div
          style="
            display:flex;
            justify-content:flex-start;
            gap:10px;
            margin-top:24px;
            flex-wrap:wrap;
          "
        >

          <button
            id="confirmClaimFacilitatorBtn"
            class="primary"
            style="
              padding:11px 16px;
            "
          >
            Sí, tomar el control
          </button>

          <button
            id="cancelClaimFacilitatorBtn"
            style="
              padding:11px 16px;
              border-radius:10px;
              cursor:pointer;
              background:transparent;
              border:1px solid rgba(255,255,255,.18);
              color:inherit;
            "
          >
            Cancelar
          </button>

        </div>

      </div>

    </div>
  `;
}


// =====================================================
// RENDER PRINCIPAL
// =====================================================

function render() {

  const stepLabel =
    document.querySelector("#stepLabel");

  const progressBar =
    document.querySelector("#progressBar");

  const backBtn =
    document.querySelector("#backBtn");

  const nextBtn =
    document.querySelector("#nextBtn");

  const app =
    document.querySelector("#app");


  if (!stepLabel || !progressBar || !backBtn || !nextBtn || !app) {
    console.error(
      "No se encontraron elementos principales de la interfaz."
    );

    return;
  }


  if (!state.retroStarted) {
    stepLabel.textContent = "Preparación";
    progressBar.style.width = "0%";
  } else {
    stepLabel.textContent =
      `${state.step + 1} / ${steps.length}`;

    progressBar.style.width =
      `${((state.step + 1) / steps.length) * 100}%`;
  }


  // ---------------------------------------------------
  // BOTÓN ATRÁS
  // ---------------------------------------------------

  if (
    state.isFacilitator &&
    state.step > 0
  ) {

    backBtn.style.visibility =
      "visible";

    backBtn.disabled =
      false;

  } else {

    backBtn.style.visibility =
      "hidden";

    backBtn.disabled =
      true;

  }


  // ---------------------------------------------------
  // BOTÓN SIGUIENTE
  // ---------------------------------------------------

  if (!state.retroStarted) {

    backBtn.style.visibility = "hidden";
    backBtn.disabled = true;

    if (state.isFacilitator) {
      nextBtn.textContent = "Iniciar retro →";
      nextBtn.disabled = false;
    } else {
      nextBtn.textContent = "Esperando al facilitador";
      nextBtn.disabled = true;
    }

  } else if (state.step === steps.length - 1) {

    nextBtn.textContent = "Retro finalizada ✓";
    nextBtn.disabled = true;

  } else if (!state.isFacilitator) {

    nextBtn.textContent = "Esperando al facilitador";
    nextBtn.disabled = true;

  } else {

    nextBtn.textContent =
      state.step === 0
        ? "Continuar →"
        : "Continuar →";

    nextBtn.disabled = false;
  }


  // ---------------------------------------------------
  // CONTENIDO
  // ---------------------------------------------------

  app.innerHTML =
    facilitatorControls() +
    (state.retroStarted
      ? screens[state.step]()
      : lobbyScreen()) +
    facilitatorModal();


  bind();
}


// =====================================================
// PANTALLAS
// =====================================================

const screens = [

  // ===================================================
  // 1. INICIO
  // ===================================================

  () => `
    <section class="hero">

      <div class="pill">
        RETRO · Q3 2026
      </div>

      <h1>
        Hagamos visible<br>
        lo que aprendimos.
      </h1>

      <p class="lead">
        Una retro guiada para transformar experiencias del trimestre
        en aprendizajes, conversaciones y acciones concretas.
      </p>

      <div class="grid">

        <div class="card">
          <h3>01 · Cosechar</h3>
          <p>
            Traemos hechos, aprendizajes y fricciones.
          </p>
        </div>

        <div class="card">
          <h3>02 · Conversar</h3>
          <p>
            Elegimos dónde poner energía como equipo.
          </p>
        </div>

        <div class="card">
          <h3>03 · Accionar</h3>
          <p>
            Convertimos la conversación en compromisos.
          </p>
        </div>

      </div>

    </section>
  `,


  // ===================================================
  // 2. CHECK-IN
  // ===================================================

  () => `
    <section>

      <div class="eyebrow">
        Check-in
      </div>

      <h2>
        ¿Con qué energía llegás?
      </h2>

      <p class="lead">
        No buscamos una respuesta correcta.
        Queremos tener una lectura rápida del estado del equipo.
      </p>

      <div class="choice-row">

        ${["😣", "😕", "😐", "🙂", "🚀"]
          .map((emoji, index) => `
            <button
              class="choice ${state.energy === index ? "selected" : ""}"
              data-energy="${index}">
              ${emoji}
            </button>
          `)
          .join("")}

      </div>

    </section>
  `,


  // ===================================================
  // 3. COSECHA
  // ===================================================

  () => `
    <section>

      <div class="eyebrow">
        Cosecha
      </div>

      <h2>
        ¿Qué pasó durante este período?
      </h2>

      <p class="lead">
        Compartí algo que funcionó, algo que nos trabó
        o algo que aprendimos.
      </p>

      <div
        class="card"
        style="margin-top:30px">

        <div class="action-form">

          <select id="cardType">

            <option value="green">
              Funcionó
            </option>

            <option value="red">
              Nos trabó
            </option>

            <option value="blue">
              Aprendimos
            </option>

          </select>

          <textarea
            id="cardText"
            placeholder="Escribí tu tarjeta..."></textarea>

        </div>

        <button
          class="primary"
          id="addCard"
          style="margin-top:12px">

          Agregar tarjeta +

        </button>

      </div>


      <div
        class="columns"
        style="margin-top:30px">

        <div class="column">

          <div class="column-title">
            Funcionó
            <small>
              · ${
                state.cards.filter(
                  card => card.etapa === "green"
                ).length
              }
            </small>
          </div>

          ${
            state.cards
              .filter(card => card.etapa === "green")
              .map(card => `
                <div class="sticky">
                  ${escapeHtml(card.contenido)}
                </div>
              `)
              .join("")
          }

        </div>


        <div class="column">

          <div class="column-title">
            Nos trabó
            <small>
              · ${
                state.cards.filter(
                  card => card.etapa === "red"
                ).length
              }
            </small>
          </div>

          ${
            state.cards
              .filter(card => card.etapa === "red")
              .map(card => `
                <div class="sticky">
                  ${escapeHtml(card.contenido)}
                </div>
              `)
              .join("")
          }

        </div>


        <div class="column">

          <div class="column-title">
            Aprendimos
            <small>
              · ${
                state.cards.filter(
                  card => card.etapa === "blue"
                ).length
              }
            </small>
          </div>

          ${
            state.cards
              .filter(card => card.etapa === "blue")
              .map(card => `
                <div class="sticky">
                  ${escapeHtml(card.contenido)}
                </div>
              `)
              .join("")
          }

        </div>

      </div>

    </section>
  `,


  // ===================================================
  // 4. AGRUPACIÓN
  // ===================================================

  () => {

    const ungroupedCards =
      state.cards.filter(
        card => !card.topic_key
      );

    return `
      <section>

        <div class="eyebrow">
          Agrupación
        </div>

        <h2>
          ¿Qué temas aparecen varias veces?
        </h2>

        <p class="lead">
          Agrupá las tarjetas según el tema al que hacen referencia.
          El resultado se actualiza para todos los participantes.
        </p>


        <div
          class="topic-list"
          style="margin-top:30px">

          ${voteTopics
            .map(topic => {

              const count =
                getTopicCount(topic.key);

              return `
                <div class="topic">

                  <strong>
                    ${topic.label}
                  </strong>

                  <span class="badge">
                    ${count}
                    tarjeta${count === 1 ? "" : "s"}
                  </span>

                </div>
              `;

            })
            .join("")}

        </div>


        ${
          ungroupedCards.length > 0
            ? `
              <div
                class="card"
                style="margin-top:30px">

                <h3>
                  Tarjetas pendientes de agrupar
                </h3>

                <p>
                  Hay ${ungroupedCards.length}
                  tarjeta${ungroupedCards.length === 1 ? "" : "s"}
                  que todavía no tienen un tema asignado.
                </p>

              </div>
            `
            : ""
        }


        <div
          style="
            margin-top:30px;
            display:grid;
            gap:16px;
          ">

          ${
            state.cards.length === 0
              ? `
                <div class="card">
                  <p>
                    Todavía no hay tarjetas en esta retro.
                  </p>
                </div>
              `
              : state.cards
                  .map(card => `
                    <div
                      class="card"
                      style="
                        display:flex;
                        gap:20px;
                        align-items:center;
                        justify-content:space-between;
                        flex-wrap:wrap;
                      ">

                      <div
                        style="
                          flex:1;
                          min-width:250px;
                        ">

                        <div
                          class="badge"
                          style="margin-bottom:10px">

                          ${
                            card.etapa === "green"
                              ? "Funcionó"
                              : card.etapa === "red"
                                ? "Nos trabó"
                                : "Aprendimos"
                          }

                        </div>

                        <strong>
                          ${escapeHtml(card.contenido)}
                        </strong>

                      </div>


                      <div
                        style="
                          min-width:250px;
                        ">

                        <select
                          class="card-topic-select"
                          data-card-id="${card.id}"
                          style="width:100%;">

                          <option value="">
                            Sin agrupar
                          </option>

                          ${voteTopics
                            .map(topic => `
                              <option
                                value="${topic.key}"
                                ${
                                  card.topic_key === topic.key
                                    ? "selected"
                                    : ""
                                }>

                                ${topic.label}

                              </option>
                            `)
                            .join("")}

                        </select>

                      </div>

                    </div>
                  `)
                  .join("")
          }

        </div>

      </section>
    `;
  },


  // ===================================================
  // 5. VOTACIÓN
  // ===================================================

  () => {

    const remainingVotes =
      Math.max(
        0,
        MAX_VOTES_PER_PARTICIPANT -
          state.usedVotes
      );

    return `
      <section>

        <div class="eyebrow">
          Votación
        </div>

        <h2>
          ¿Dónde deberíamos poner energía?
        </h2>

        <p class="lead">
          Tenés 3 votos. Elegí los temas que consideres
          más importantes para conversar.
        </p>

        <div
          class="badge"
          style="margin:20px 0">

          Te quedan
          <strong>
            ${remainingVotes}
          </strong>
          voto${remainingVotes === 1 ? "" : "s"}

        </div>


        <div class="topic-list">

          ${voteTopics
            .map(topic => {

              const totalVotes =
                state.votes[topic.key] || 0;

              const myVotes =
                state.myVotes[topic.key] || 0;

              const cardCount =
                getTopicCount(topic.key);

              const disabled =
                remainingVotes === 0;

              return `
                <div class="topic">

                  <div>

                    <strong>
                      ${topic.label}
                    </strong>

                    <div
                      class="badge"
                      style="margin-top:6px">

                      ${cardCount}
                      tarjeta${cardCount === 1 ? "" : "s"}

                      ·

                      ${totalVotes}
                      voto${totalVotes === 1 ? "" : "s"}

                      ${
                        myVotes > 0
                          ? ` · vos: ${myVotes}`
                          : ""
                      }

                    </div>

                  </div>


                  <button
                    class="primary vote"
                    data-topic="${topic.key}"
                    ${disabled ? "disabled" : ""}>

                    ${
                      disabled
                        ? "Sin votos"
                        : "Votar +1"
                    }

                  </button>

                </div>
              `;

            })
            .join("")}

        </div>

      </section>
    `;
  },


  // ===================================================
  // 6. CONVERSACIÓN
  // ===================================================

  () => {

    const topTopic =
      voteTopics
        .slice()
        .sort(
          (a, b) =>
            (state.votes[b.key] || 0) -
            (state.votes[a.key] || 0)
        )[0];

    const topTopicVotes =
      topTopic
        ? state.votes[topTopic.key] || 0
        : 0;

    const topicCards =
      topTopic
        ? getGroupedCards(topTopic.key)
        : [];

    return `
      <section>

        <div class="eyebrow">
          Conversación
        </div>

        <h2>
          ${
            topTopic
              ? topTopic.label
              : "Tema principal"
          }
        </h2>

        <p class="lead">

          Este tema recibió
          ${topTopicVotes}
          voto${topTopicVotes === 1 ? "" : "s"}.

          La pregunta ahora no es solamente qué pasó,
          sino qué hay detrás.

        </p>


        ${
          topicCards.length > 0
            ? `
              <div
                class="card"
                style="margin-top:30px">

                <h3>
                  Lo que apareció en la cosecha
                </h3>

                <div
                  style="
                    display:grid;
                    gap:10px;
                    margin-top:20px;
                  ">

                  ${topicCards
                    .map(card => `
                      <div class="sticky">
                        ${escapeHtml(card.contenido)}
                      </div>
                    `)
                    .join("")}

                </div>

              </div>
            `
            : ""
        }


        <div
          class="card"
          style="margin-top:34px">

          <h3>
            Preguntas guía
          </h3>

          <p>

            ¿Dónde aparece la dependencia?

            <br><br>

            ¿Qué información llega tarde?

            <br><br>

            ¿Qué decisión podría tomarse antes?

            <br><br>

            ¿Qué necesitamos cambiar
            en nuestro sistema de trabajo?

          </p>

        </div>

      </section>
    `;
  },


  // ===================================================
  // 7. ACCIONES
  // ===================================================

  () => `
    <section>

      <div class="eyebrow">
        Acciones
      </div>

      <h2>
        Convirtamos la conversación en algo concreto.
      </h2>

      <p class="lead">
        Una acción útil tiene un responsable y una fecha.
        Evitemos acciones genéricas.
      </p>


      <div class="action-form">

        <input
          id="actionText"
          placeholder="¿Qué vamos a hacer?">

        <input
          id="actionOwner"
          placeholder="Responsable">

        <input
          id="actionDate"
          type="date">

        <textarea
          id="actionWhy"
          placeholder="¿Cómo sabremos que funcionó?"></textarea>

      </div>


      <button
        class="primary"
        id="addAction"
        style="margin-top:12px">

        Agregar acción +

      </button>


      <div class="actions">

        ${
          state.actions
            .map(action => `
              <div class="action">

                <div>

                  <strong>
                    ${escapeHtml(action.text)}
                  </strong>

                  <div class="badge">
                    ${escapeHtml(action.owner)}
                    ·
                    ${escapeHtml(action.date)}
                  </div>

                </div>

              </div>
            `)
            .join("")
        }

      </div>

    </section>
  `,


  // ===================================================
  // 8. CIERRE
  // ===================================================

  () => {

    const lastAction =
      state.actions.length > 0
        ? state.actions[state.actions.length - 1]
        : null;

    const topTopic =
      voteTopics
        .slice()
        .sort(
          (a, b) =>
            (state.votes[b.key] || 0) -
            (state.votes[a.key] || 0)
        )[0];

    return `
      <section class="center">

        <div class="eyebrow">
          Cierre
        </div>

        <h2>
          Nos llevamos esto.
        </h2>

        <p
          class="lead"
          style="margin:auto">

          La retro termina cuando la conversación
          se transforma en una decisión visible.

        </p>


        <div class="summary">

          <div class="card">

            <div class="badge">
              TEMA PRINCIPAL
            </div>

            <h3>
              ${
                topTopic
                  ? topTopic.label
                  : "Todavía no hay votos"
              }
            </h3>

            <p>
              ${
                topTopic
                  ? `${state.votes[topTopic.key] || 0} votos`
                  : "Votá un tema para definirlo."
              }
            </p>

          </div>


          <div class="card">

            <div class="badge">
              PRÓXIMA ACCIÓN
            </div>

            <h3>
              ${
                lastAction
                  ? escapeHtml(lastAction.text)
                  : "Todavía no hay acciones"
              }
            </h3>

            <p>
              ${
                lastAction
                  ? `${escapeHtml(lastAction.owner)} · ${escapeHtml(lastAction.date)}`
                  : "Agregá una acción para verla acá."
              }
            </p>

          </div>

        </div>


        <div class="big-number">
          ✓
        </div>

        <p class="badge">
          Retro finalizada · Q3 2026
        </p>

      </section>
    `;
  }

];


// =====================================================
// CARGAR RETRO
// =====================================================

async function loadRetro() {

  const { data, error } =
    await supabaseClient
      .from("retros")
      .select(
        "id, codigo, nombre, paso_actual, facilitador_session_id, facilitador_nombre, iniciada"
      )
      .eq("codigo", RETRO_CODE)
      .single();

  if (error) {

    console.error(
      "Error cargando retro:",
      error
    );

    alert(
      "No se encontró la retro: " +
      RETRO_CODE
    );

    return false;
  }

  state.retroId =
    data.id;

  state.step =
    Number(data.paso_actual || 0);

  state.facilitatorSessionId =
    data.facilitador_session_id || null;

  state.facilitatorName =
    data.facilitador_nombre || null;

  state.retroStarted =
    Boolean(data.iniciada);

  updateFacilitatorState();

  console.log(
    "Retro cargada:",
    data
  );

  return true;
}


// =====================================================
// CARGAR TARJETAS
// =====================================================

async function loadCards() {

  const { data, error } =
    await supabaseClient
      .from("cards")
      .select("*")
      .eq("retro_id", state.retroId)
      .order("created_at", {
        ascending: true
      });

  if (error) {

    console.error(
      "Error cargando tarjetas:",
      error
    );

    return;
  }

  state.cards =
    data || [];

  console.log(
    "Tarjetas cargadas:",
    state.cards
  );
}


// =====================================================
// CARGAR ACCIONES
// =====================================================

async function loadActions() {

  const { data, error } =
    await supabaseClient
      .from("acciones")
      .select("*")
      .eq("retro_id", state.retroId)
      .order("created_at", {
        ascending: true
      });

  if (error) {

    console.error(
      "Error cargando acciones:",
      error
    );

    return;
  }

  state.actions =
    (data || []).map(action => ({
      id: action.id,
      text: action.descripcion,
      owner: action.responsable,
      date: action.fecha || "Por definir"
    }));

  console.log(
    "Acciones cargadas:",
    state.actions
  );
}


// =====================================================
// CARGAR VOTOS GLOBALES
// =====================================================

async function loadVotes() {

  const { data, error } =
    await supabaseClient
      .from("votos")
      .select("*")
      .eq("retro_id", state.retroId);

  if (error) {

    console.error(
      "Error cargando votos:",
      error
    );

    return;
  }

  state.votes = {};

  (data || []).forEach(row => {

    state.votes[row.topic_key] =
      row.votos || 0;

  });

  console.log(
    "Votos cargados:",
    state.votes
  );
}


// =====================================================
// REALTIME - RETRO / FACILITADOR
// =====================================================

function subscribeToRetro() {

  supabaseClient

    .channel(
      "retro-realtime-" +
      state.retroId
    )

    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "retros",
        filter:
          `id=eq.${state.retroId}`
      },

      payload => {

        console.log(
          "Cambio de estado de retro recibido:",
          payload
        );


        if (!payload.new) {
          return;
        }


        const newStep =
          Number(
            payload.new.paso_actual || 0
          );

        const newFacilitator =
          payload.new.facilitador_session_id ||
          null;

        state.step =
          newStep;

        state.facilitatorSessionId =
          newFacilitator;

        state.facilitatorName =
          payload.new.facilitador_nombre || null;

        state.retroStarted =
          Boolean(payload.new.iniciada);

        updateFacilitatorState();


        render();

      }
    )

    .subscribe(status => {

      console.log(
        "Realtime retro:",
        status
      );

    });
}


// =====================================================
// REALTIME - PARTICIPANTES
// =====================================================

function subscribeToParticipants() {

  supabaseClient
    .channel("participants-realtime-" + state.retroId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "participantes",
        filter: `retro_id=eq.${state.retroId}`
      },
      async payload => {
        console.log("Cambio en participante:", payload);
        await loadParticipants();
        render();
      }
    )
    .subscribe(status => {
      console.log("Realtime participantes:", status);
    });
}


// =====================================================
// REALTIME - CARDS
// =====================================================

function subscribeToCards() {

  supabaseClient

    .channel(
      "cards-realtime-" +
      state.retroId
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "cards",
        filter:
          `retro_id=eq.${state.retroId}`
      },

      payload => {

        console.log(
          "Cambio en tarjeta:",
          payload
        );


        // INSERT

        if (
          payload.eventType === "INSERT"
        ) {

          const exists =
            state.cards.some(
              card =>
                card.id === payload.new.id
            );

          if (!exists) {

            state.cards.push(
              payload.new
            );

          }

        }


        // UPDATE

        if (
          payload.eventType === "UPDATE"
        ) {

          const index =
            state.cards.findIndex(
              card =>
                card.id === payload.new.id
            );

          if (index !== -1) {

            state.cards[index] =
              payload.new;

          }

        }


        // DELETE

        if (
          payload.eventType === "DELETE"
        ) {

          state.cards =
            state.cards.filter(
              card =>
                card.id !== payload.old.id
            );

        }


        if (
          state.step === 2 ||
          state.step === 3 ||
          state.step === 4 ||
          state.step === 5
        ) {

          render();

        }

      }
    )

    .subscribe(status => {

      console.log(
        "Realtime cards:",
        status
      );

    });
}


// =====================================================
// REALTIME - VOTOS
// =====================================================

function subscribeToVotes() {

  supabaseClient

    .channel(
      "votes-realtime-" +
      state.retroId
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "votos",
        filter:
          `retro_id=eq.${state.retroId}`
      },

      payload => {

        console.log(
          "Cambio de votos recibido:",
          payload
        );

        const row =
          payload.new;

        if (!row) {
          return;
        }

        state.votes[row.topic_key] =
          row.votos || 0;

        if (
          state.step === 4 ||
          state.step === 5 ||
          state.step === 7
        ) {

          render();

        }

      }
    )

    .subscribe(status => {

      console.log(
        "Realtime votos:",
        status
      );

    });
}


// =====================================================
// REALTIME - ACCIONES
// =====================================================

function subscribeToActions() {

  supabaseClient

    .channel(
      "actions-realtime-" +
      state.retroId
    )

    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "acciones",
        filter:
          `retro_id=eq.${state.retroId}`
      },

      payload => {

        console.log(
          "Nueva acción recibida:",
          payload.new
        );

        if (!payload.new) {
          return;
        }

        const exists =
          state.actions.some(
            action =>
              action.id === payload.new.id
          );

        if (exists) {
          return;
        }

        state.actions.push({
          id: payload.new.id,
          text: payload.new.descripcion,
          owner:
            payload.new.responsable ||
            "Por definir",
          date:
            payload.new.fecha ||
            "Por definir"
        });

        if (
          state.step === 6 ||
          state.step === 7
        ) {

          render();

        }

      }
    )

    .subscribe(status => {

      console.log(
        "Realtime acciones:",
        status
      );

    });
}


// =====================================================
// EVENTOS
// =====================================================

async function bind() {


  // ===================================================
  // FACILITADOR - TOMAR CONTROL
  // ===================================================

  const claimButton =
    document.querySelector(
      "#claimFacilitatorBtn"
    );

  if (claimButton) {

    claimButton.onclick = () => {

      openFacilitatorConfirmation();

    };

  }


  // ===================================================
  // FACILITADOR - CONFIRMAR
  // ===================================================

  const confirmClaimButton =
    document.querySelector(
      "#confirmClaimFacilitatorBtn"
    );

  if (confirmClaimButton) {

    confirmClaimButton.onclick = async () => {

      confirmClaimButton.disabled =
        true;

      confirmClaimButton.textContent =
        "Tomando control...";

      await confirmClaimFacilitator();

    };

  }


  // ===================================================
  // FACILITADOR - CANCELAR
  // ===================================================

  const cancelClaimButton =
    document.querySelector(
      "#cancelClaimFacilitatorBtn"
    );

  if (cancelClaimButton) {

    cancelClaimButton.onclick = () => {

      closeFacilitatorConfirmation();

    };

  }


  // ===================================================
  // FACILITADOR - LIBERAR
  // ===================================================

  const releaseButton =
    document.querySelector(
      "#releaseFacilitatorBtn"
    );

  if (releaseButton) {

    releaseButton.onclick = async () => {

      releaseButton.disabled =
        true;

      await releaseFacilitator();

    };

  }


  // ===================================================
  // LOBBY - PERFIL
  // ===================================================

  const readyBtn =
    document.querySelector("#readyBtn");

  if (readyBtn) {
    readyBtn.onclick = async () => {
      const input = document.querySelector("#participantName");
      const name = input ? input.value.trim() : "";

      if (!name) {
        alert("Ingresá tu nombre y apellido.");
        if (input) input.focus();
        return;
      }

      readyBtn.disabled = true;
      readyBtn.textContent = "Guardando...";
      await setParticipantProfile(name, true);
    };
  }

  const editParticipantBtn =
    document.querySelector("#editParticipantBtn");

  if (editParticipantBtn) {
    editParticipantBtn.onclick = async () => {
      const input = document.querySelector("#participantName");
      if (!input) return;

      input.disabled = false;
      input.focus();
      input.select();

      const current = state.participant || {};
      state.participant = { ...current, listo: false };
      await setParticipantProfile(input.value, false);
    };
  }


  // ===================================================
  // CHECK-IN
  // ===================================================

  document
    .querySelectorAll("[data-energy]")
    .forEach(button => {

      button.onclick = () => {

        state.energy =
          Number(button.dataset.energy);

        render();

      };

    });


  // ===================================================
  // AGRUPACIÓN
  // ===================================================

  document
    .querySelectorAll(".card-topic-select")
    .forEach(select => {

      select.onchange = async () => {

        const cardId =
          select.dataset.cardId;

        const topicKey =
          select.value || null;

        select.disabled = true;


        const {
          data,
          error
        } = await supabaseClient
          .from("cards")
          .update({
            topic_key: topicKey
          })
          .eq("id", cardId)
          .select()
          .single();


        if (error) {

          console.error(
            "Error actualizando agrupación:",
            error
          );

          alert(
            "No se pudo actualizar el agrupamiento.\n\n" +
            error.message
          );

          select.disabled = false;

          return;
        }


        console.log(
          "Tarjeta agrupada:",
          data
        );


        const index =
          state.cards.findIndex(
            card =>
              card.id === cardId
          );

        if (index !== -1) {

          state.cards[index] =
            data;

        }


        render();

      };

    });


  // ===================================================
  // VOTACIÓN
  // ===================================================

  document
    .querySelectorAll(".vote")
    .forEach(button => {

      button.onclick = async () => {

        const topicKey =
          button.dataset.topic;


        if (!state.participantId) {

          alert(
            "No se pudo identificar tu participación en la retro."
          );

          return;
        }


        if (
          state.usedVotes >=
          MAX_VOTES_PER_PARTICIPANT
        ) {

          alert(
            "Ya utilizaste tus 3 votos."
          );

          return;
        }


        button.disabled = true;


        // ---------------------------------------------
        // REGISTRAR VOTO DEL PARTICIPANTE
        // ---------------------------------------------

        const {
          data,
          error
        } = await supabaseClient
          .rpc(
            "cast_vote",
            {
              p_retro_id:
                state.retroId,

              p_participante_id:
                state.participantId,

              p_topic_key:
                topicKey
            }
          );


        if (error) {

          console.error(
            "Error guardando voto:",
            error
          );

          alert(
            "No se pudo registrar el voto.\n\n" +
            error.message
          );

          button.disabled = false;

          return;
        }


        console.log(
          "Voto guardado:",
          data
        );


        // ---------------------------------------------
        // ACTUALIZAR VOTOS DEL PARTICIPANTE
        // ---------------------------------------------

        state.myVotes[topicKey] =
          (state.myVotes[topicKey] || 0) + 1;

        state.usedVotes =
          state.usedVotes + 1;


        // ---------------------------------------------
        // ACTUALIZAR TOTAL GLOBAL
        // ---------------------------------------------

        if (
          data &&
          data.topic_key &&
          data.votos !== undefined
        ) {

          state.votes[data.topic_key] =
            data.votos;

        } else {

          // El RPC actual devuelve JSON con
          // used_votes / remaining_votes.
          // El realtime de votos actualizará
          // el total global.

          await loadVotes();

        }


        render();

      };

    });


  // ===================================================
  // COSECHA - AGREGAR TARJETA
  // ===================================================

  const addCard =
    document.querySelector("#addCard");


  if (addCard) {

    addCard.onclick = async () => {

      const text =
        document
          .querySelector("#cardText")
          .value
          .trim();

      const type =
        document
          .querySelector("#cardType")
          .value;


      if (!text) {

        alert(
          "Escribí algo antes de agregar la tarjeta."
        );

        return;
      }


      addCard.disabled = true;


      const {
        data,
        error
      } = await supabaseClient
        .from("cards")
        .insert({
          contenido: text,
          etapa: type,
          retro_id: state.retroId,
          topic_key: null
        })
        .select()
        .single();


      if (error) {

        console.error(
          "Error guardando tarjeta:",
          error
        );

        alert(
          "No se pudo guardar la tarjeta.\n\n" +
          error.message
        );

        addCard.disabled = false;

        return;
      }


      console.log(
        "Tarjeta guardada:",
        data
      );


      const exists =
        state.cards.some(
          card =>
            card.id === data.id
        );

      if (!exists) {

        state.cards.push(
          data
        );

      }


      render();

    };

  }


  // ===================================================
  // ACCIONES
  // ===================================================

  const add =
    document.querySelector("#addAction");


  if (add) {

    add.onclick = async () => {

      const text =
        document
          .querySelector("#actionText")
          .value
          .trim();


      if (!text) {

        alert(
          "Escribí una acción."
        );

        return;
      }


      const owner =
        document
          .querySelector("#actionOwner")
          .value
          .trim()
        || "Por definir";


      const date =
        document
          .querySelector("#actionDate")
          .value
        || null;


      add.disabled = true;


      const {
        data,
        error
      } = await supabaseClient
        .from("acciones")
        .insert({
          descripcion: text,
          responsable: owner,
          fecha: date,
          retro_id: state.retroId
        })
        .select()
        .single();


      if (error) {

        console.error(
          "ERROR SUPABASE",
          error
        );

        alert(
          "ERROR SUPABASE\n\n" +
          "Code: " +
          (error?.code || "N/A") +
          "\nMessage: " +
          (error?.message || "N/A") +
          "\nDetails: " +
          (error?.details || "N/A")
        );

        add.disabled = false;

        return;
      }


      console.log(
        "Acción guardada:",
        data
      );


      const newAction = {

        id:
          data.id,

        text:
          data.descripcion,

        owner:
          data.responsable,

        date:
          data.fecha ||
          "Por definir"

      };


      state.actions.push(
        newAction
      );


      render();

    };

  }

}


// =====================================================
// BOTÓN SIGUIENTE
// =====================================================

document
  .querySelector("#nextBtn")
  .onclick = async () => {

    if (!state.isFacilitator) {
      return;
    }

    if (!state.retroStarted) {
      await startRetro();
      return;
    }

    if (state.step >= steps.length - 1) {
      return;
    }

    await advanceRetro();
  };


// =====================================================
// BOTÓN ATRÁS
// =====================================================

document
  .querySelector("#backBtn")
  .onclick = async () => {

    if (!state.isFacilitator) {

      return;

    }


    if (state.step <= 0) {

      return;

    }


    await previousRetroStep();

  };


// =====================================================
// INICIAR
// =====================================================

async function initialize() {

  console.log(
    "Inicializando retro..."
  );


  // ---------------------------------------------------
  // RETRO
  // ---------------------------------------------------

  const retroLoaded =
    await loadRetro();


  if (!retroLoaded) {
    return;
  }


  // ---------------------------------------------------
  // PARTICIPANTE
  // ---------------------------------------------------

  const participantLoaded =
    await loadParticipant();


  if (!participantLoaded) {

    console.error(
      "No se pudo inicializar participante."
    );

    return;
  }


  // ---------------------------------------------------
  // REFRESCAR ESTADO DE FACILITADOR
  // ---------------------------------------------------

  await refreshRetroState();


  // ---------------------------------------------------
  // DATOS
  // ---------------------------------------------------

  await loadCards();

  await loadActions();

  await loadVotes();

  await loadMyVotes();

  await loadParticipants();


  // ---------------------------------------------------
  // REALTIME
  // ---------------------------------------------------

  subscribeToRetro();

  subscribeToParticipants();

  subscribeToCards();

  subscribeToVotes();

  subscribeToActions();


  // ---------------------------------------------------
  // RENDER
  // ---------------------------------------------------

  render();

}


initialize();
