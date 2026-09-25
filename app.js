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

  // Nombre e identidad del participante
  participantName: null,
  retroStarted: false,
  facilitatorName: null,
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

    state.participantName =
      existing.nombre || null;

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

  state.participantName =
    created.nombre || null;

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
// PARTICIPANTE - PERFIL Y LOBBY
// =====================================================

function getParticipantName() {
  return (
    state.participant?.nombre ||
    state.participantName ||
    ""
  ).trim();
}


async function setParticipantProfile(nombre, listo) {

  const cleanName =
    (nombre || "").trim();

  if (!cleanName) {

    alert(
      "Ingresá tu nombre y apellido."
    );

    return false;
  }

  if (cleanName.length < 3) {

    alert(
      "Ingresá tu nombre y apellido."
    );

    return false;
  }

  if (
    !state.participantId ||
    !state.participantSessionId
  ) {

    alert(
      "No se pudo identificar tu participación en la retro."
    );

    return false;
  }

  const {
    data,
    error
  } = await supabaseClient
    .rpc(
      "set_participant_profile",
      {
        p_retro_id:
          state.retroId,

        p_session_id:
          state.participantSessionId,

        p_nombre:
          cleanName,

        p_listo:
          Boolean(listo)
      }
    );


  if (error) {

    console.error(
      "Error guardando perfil del participante:",
      error
    );

    alert(
      "No se pudo guardar tu nombre.\n\n" +
      error.message
    );

    return false;
  }


  state.participant = {

    ...(state.participant || {}),

    ...(data || {}),

    nombre:
      cleanName,

    listo:
      Boolean(listo)

  };


  state.participantName =
    cleanName;


  await loadParticipants();

  render();

  return true;
}


// =====================================================
// CARGAR PARTICIPANTES
// =====================================================

async function loadParticipants() {

  if (!state.retroId) {
    return;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("participantes")
    .select(
      "id, retro_id, session_id, nombre, listo"
    )
    .eq(
      "retro_id",
      state.retroId
    )
    .order(
      "created_at",
      {
        ascending: true
      }
    );


  if (error) {

    console.error(
      "Error cargando participantes:",
      error
    );

    return;
  }


  state.participants =
    data || [];
}


// =====================================================
// PANTALLA DE IDENTIFICACIÓN
// =====================================================

function participantProfileScreen() {

  const currentName =
    getParticipantName();


  return `
    <section
      class="hero"
      style="
        max-width:720px;
        margin:60px auto;
      "
    >

      <div class="pill">
        IDENTIFICACIÓN
      </div>


      <h1
        style="
          margin-bottom:16px;
        "
      >
        Ingresá tu nombre y apellido
      </h1>


      <p
        class="lead"
        style="
          max-width:620px;
        "
      >
        Antes de entrar a la retro necesitamos
        identificarte para poder mostrarte como
        participante y registrar tus votos y participación.
      </p>


      <div
        class="card"
        style="
          margin-top:28px;
          padding:24px;
        "
      >

        <label
          for="participantNameInput"
          style="
            display:block;
            font-size:13px;
            font-weight:600;
            margin-bottom:8px;
          "
        >
          Nombre y apellido
        </label>


        <input
          id="participantNameInput"
          type="text"
          value="${escapeHtml(currentName)}"
          placeholder="Ej. Diego Pérez"
          autocomplete="name"
          style="
            width:100%;
            box-sizing:border-box;
            padding:13px 14px;
            border-radius:10px;
            border:1px solid rgba(255,255,255,.18);
            background:rgba(255,255,255,.06);
            color:inherit;
            font-size:16px;
          "
        />


        <button
          id="saveParticipantBtn"
          class="primary"
          style="
            margin-top:16px;
            padding:12px 18px;
          "
        >
          Estoy listo ✓
        </button>

      </div>


      ${
        state.retroStarted
          ? `
            <p
              style="
                margin-top:18px;
                opacity:.6;
                font-size:13px;
              "
            >
              La retro ya comenzó. Después de
              identificarte vas a ingresar directamente
              al paso actual.
            </p>
          `
          : ""
      }

    </section>
  `;
}


// =====================================================
// LOBBY
// =====================================================

function lobbyScreen() {

  const namedParticipants =
    state.participants.filter(
      participant =>
        (participant.nombre || "").trim() !== ""
    );


  const readyCount =
    namedParticipants.filter(
      participant =>
        participant.listo
    ).length;


  const participantRows =
    namedParticipants.length

      ? namedParticipants
          .map(
            participant => `
              <div
                style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:12px;
                  padding:10px 0;
                  border-bottom:1px solid rgba(255,255,255,.08);
                "
              >

                <span>
                  ${
                    participant.listo
                      ? "✓"
                      : "○"
                  }

                  ${escapeHtml(
                    participant.nombre
                  )}
                </span>

                <span
                  style="
                    font-size:12px;
                    opacity:.55;
                  "
                >
                  ${
                    participant.listo
                      ? "Listo"
                      : "Esperando"
                  }
                </span>

              </div>
            `
          )
          .join("")

      : `
          <div
            style="
              opacity:.55;
              padding:10px 0;
            "
          >
            Todavía no hay participantes identificados.
          </div>
        `;


  return `
    <section
      class="hero"
      style="
        max-width:760px;
        margin:50px auto;
      "
    >

      <div class="pill">
        SALA DE ESPERA
      </div>


      <h1
        style="
          margin-bottom:12px;
        "
      >
        ${
          state.isFacilitator
            ? "Listos para comenzar"
            : "Esperando el inicio"
        }
      </h1>


      <p
        class="lead"
        style="
          max-width:650px;
        "
      >
        Identificate con tu nombre y apellido.
        El facilitador va a iniciar la retro
        cuando esté listo.
      </p>


      <div
        class="grid"
        style="
          margin-top:28px;
        "
      >

        <div
          class="card"
          style="
            padding:24px;
          "
        >

          <div
            style="
              font-size:11px;
              letter-spacing:.08em;
              text-transform:uppercase;
              opacity:.6;
              margin-bottom:8px;
            "
          >
            PARTICIPANTES
          </div>


          <strong
            style="
              font-size:18px;
            "
          >
            ${readyCount} de ${namedParticipants.length} listos
          </strong>


          <div
            style="
              margin-top:14px;
            "
          >
            ${participantRows}
          </div>

        </div>


        <div
          class="card"
          style="
            padding:24px;
          "
        >

          <div
            style="
              font-size:11px;
              letter-spacing:.08em;
              text-transform:uppercase;
              opacity:.6;
              margin-bottom:8px;
            "
          >
            TU PARTICIPACIÓN
          </div>


          <strong>
            ${escapeHtml(
              getParticipantName()
            )}
          </strong>


          <p
            style="
              margin:10px 0 0;
              opacity:.65;
              line-height:1.5;
            "
          >
            ${
              state.participant?.listo
                ? "Estás marcado como listo."
                : "Todavía no estás marcado como listo."
            }
          </p>


          <button
            id="editParticipantBtn"
            style="
              margin-top:16px;
              padding:10px 14px;
              border-radius:10px;
              cursor:pointer;
              background:transparent;
              border:1px solid rgba(255,255,255,.18);
              color:inherit;
            "
          >
            Cambiar nombre / estado
          </button>

        </div>

      </div>


      ${
        state.isFacilitator
          ? `
            <div
              class="card"
              style="
                margin-top:20px;
                padding:24px;
              "
            >

              <strong>
                Facilitador
              </strong>


              <p
                style="
                  margin:8px 0 0;
                  opacity:.65;
                "
              >
                Podés iniciar la retro aunque no todos estén listos.
              </p>


              <button
                id="startRetroBtn"
                class="primary"
                style="
                  margin-top:16px;
                  padding:12px 18px;
                "
              >
                Iniciar retro →
              </button>

            </div>
          `
          : ""
      }

    </section>
  `;
}


// =====================================================
// INICIAR RETRO
// =====================================================

async function startRetro() {

  if (!state.isFacilitator) {
    return;
  }


  const {
    data,
    error
  } = await supabaseClient
    .rpc(
      "start_retro",
      {
        p_retro_id:
          state.retroId,

        p_session_id:
          state.participantSessionId
      }
    );


  if (error) {

    console.error(
      "Error iniciando retro:",
      error
    );

    alert(
      "No se pudo iniciar la retro.\n\n" +
      error.message
    );

    return;
  }


  state.retroStarted =
    true;

  state.step =
    Number(
      data?.step || 0
    );


  render();
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


  await refreshRetroState();

  render();
}


// =====================================================
// FACILITADOR - CONFIRMACIÓN
// =====================================================

function openFacilitatorConfirmation() {

  const modal =
    document.querySelector(
      "#facilitatorModal"
    );

  if (!modal) {
    return;
  }

  modal.style.display =
    "flex";
}


function closeFacilitatorConfirmation() {

  const modal =
    document.querySelector(
      "#facilitatorModal"
    );

  if (!modal) {
    return;
  }

  modal.style.display =
    "none";
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
    .eq(
      "id",
      state.retroId
    )
    .single();


  if (error) {

    console.error(
      "Error refrescando estado de la retro:",
      error
    );

    return;
  }


  state.step =
    Number(
      data.paso_actual || 0
    );


  state.facilitatorSessionId =
    data.facilitador_session_id ||
    null;


  state.facilitatorName =
    data.facilitador_nombre ||
    null;


  state.retroStarted =
    Boolean(
      data.iniciada
    );


  updateFacilitatorState();


  console.log(
    "Estado de retro actualizado:",
    {
      step:
        state.step,

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
    document.querySelector(
      "#stepLabel"
    );

  const progressBar =
    document.querySelector(
      "#progressBar"
    );

  const backBtn =
    document.querySelector(
      "#backBtn"
    );

  const nextBtn =
    document.querySelector(
      "#nextBtn"
    );

  const app =
    document.querySelector(
      "#app"
    );


  if (
    !stepLabel ||
    !progressBar ||
    !backBtn ||
    !nextBtn ||
    !app
  ) {

    console.error(
      "No se encontraron elementos principales de la interfaz."
    );

    return;
  }


  stepLabel.textContent =
    `${state.step + 1} / ${steps.length}`;


  progressBar.style.width =
    `${((state.step + 1) / steps.length) * 100}%`;


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

  if (
    state.step ===
    steps.length - 1
  ) {

    nextBtn.textContent =
      "Retro finalizada ✓";

    nextBtn.disabled =
      true;

  }

  else if (!state.isFacilitator) {

    nextBtn.textContent =
      "Esperando al facilitador";

    nextBtn.disabled =
      true;

  }

  else {

    nextBtn.textContent =
      state.step === 0
        ? "Comenzar →"
        : "Continuar →";

    nextBtn.disabled =
      false;

  }


  // ---------------------------------------------------
  // IDENTIDAD / LOBBY / RETRO
  // ---------------------------------------------------

  if (
    !getParticipantName()
  ) {

    app.innerHTML =
      participantProfileScreen() +
      facilitatorModal();

  }

  else if (
    !state.retroStarted
  ) {

    app.innerHTML =
      facilitatorControls() +
      lobbyScreen() +
      facilitatorModal();

  }

  else {

    app.innerHTML =
      facilitatorControls() +
      screens[state.step]() +
      facilitatorModal();

  }


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
          <h3>
            01 · Cosechar
          </h3>

          <p>
            Traemos hechos, aprendizajes y fricciones.
          </p>
        </div>


        <div class="card">
          <h3>
            02 · Conversar
          </h3>

          <p>
            Elegimos dónde poner energía como equipo.
          </p>
        </div>


        <div class="card">
          <h3>
            03 · Accionar
          </h3>

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

    <section class="hero">

      <div class="pill">
        CHECK-IN
      </div>


      <h2>
        ¿Con qué energía llegás?
      </h2>


      <p class="lead">
        Elegí una opción para registrar cómo llegamos
        al comienzo de la conversación.
      </p>


      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
          gap:12px;
          margin-top:30px;
        "
      >

        <button
          data-energy="1"
          style="
            padding:24px 16px;
            border-radius:14px;
            cursor:pointer;
            background:${
              state.energy === 1
                ? "rgba(84,255,209,.16)"
                : "rgba(255,255,255,.04)"
            };
            border:1px solid ${
              state.energy === 1
                ? "rgba(84,255,209,.6)"
                : "rgba(255,255,255,.12)"
            };
            color:inherit;
            font-size:28px;
          "
        >
          😴

          <div
            style="
              font-size:13px;
              margin-top:8px;
            "
          >
            Baja
          </div>

        </button>


        <button
          data-energy="2"
          style="
            padding:24px 16px;
            border-radius:14px;
            cursor:pointer;
            background:${
              state.energy === 2
                ? "rgba(84,255,209,.16)"
                : "rgba(255,255,255,.04)"
            };
            border:1px solid ${
              state.energy === 2
                ? "rgba(84,255,209,.6)"
                : "rgba(255,255,255,.12)"
            };
            color:inherit;
            font-size:28px;
          "
        >
          😐

          <div
            style="
              font-size:13px;
              margin-top:8px;
            "
          >
            Media
          </div>

        </button>


        <button
          data-energy="3"
          style="
            padding:24px 16px;
            border-radius:14px;
            cursor:pointer;
            background:${
              state.energy === 3
                ? "rgba(84,255,209,.16)"
                : "rgba(255,255,255,.04)"
            };
            border:1px solid ${
              state.energy === 3
                ? "rgba(84,255,209,.6)"
                : "rgba(255,255,255,.12)"
            };
            color:inherit;
            font-size:28px;
          "
        >
          🙂

          <div
            style="
              font-size:13px;
              margin-top:8px;
            "
          >
            Buena
          </div>

        </button>


        <button
          data-energy="4"
          style="
            padding:24px 16px;
            border-radius:14px;
            cursor:pointer;
            background:${
              state.energy === 4
                ? "rgba(84,255,209,.16)"
                : "rgba(255,255,255,.04)"
            };
            border:1px solid ${
              state.energy === 4
                ? "rgba(84,255,209,.6)"
                : "rgba(255,255,255,.12)"
            };
            color:inherit;
            font-size:28px;
          "
        >
          🚀

          <div
            style="
              font-size:13px;
              margin-top:8px;
            "
          >
            Alta
          </div>

        </button>

      </div>

    </section>

  `,


  // ===================================================
  // 3. COSECHA
  // ===================================================

  () => `

    <section>

      <div class="hero">

        <div class="pill">
          COSECHA
        </div>


        <h2>
          ¿Qué pasó durante el trimestre?
        </h2>


        <p class="lead">
          Sumemos hechos, aprendizajes, fricciones
          y situaciones que valga la pena conversar.
        </p>


        <div
          class="card"
          style="
            margin-top:24px;
          "
        >

          <textarea
            id="cardText"
            placeholder="Escribí una situación, aprendizaje o fricción..."
            style="
              width:100%;
              min-height:120px;
              resize:vertical;
              box-sizing:border-box;
            "
          ></textarea>


          <div
            style="
              display:flex;
              gap:12px;
              align-items:center;
              flex-wrap:wrap;
              margin-top:12px;
            "
          >

            <select
              id="cardType"
              style="
                min-width:180px;
              "
            >

              <option value="aprendizaje">
                Aprendizaje
              </option>

              <option value="friccion">
                Fricción
              </option>

              <option value="hecho">
                Hecho
              </option>

            </select>


            <button
              id="addCard"
              class="primary"
            >
              Agregar
            </button>

          </div>

        </div>

      </div>


      <div
        style="
          max-width:1100px;
          margin:0 auto 50px;
          padding:0 24px;
        "
      >

        ${
          state.cards.length
            ? `
              <div
                style="
                  display:grid;
                  grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
                  gap:14px;
                "
              >

                ${state.cards.map(card => `

                  <div
                    class="card"
                    style="
                      position:relative;
                    "
                  >

                    <div
                      style="
                        font-size:11px;
                        text-transform:uppercase;
                        letter-spacing:.08em;
                        opacity:.55;
                        margin-bottom:10px;
                      "
                    >
                      ${
                        card.etapa ||
                        "Sin clasificar"
                      }
                    </div>


                    <p
                      style="
                        margin:0;
                        line-height:1.55;
                      "
                    >
                      ${escapeHtml(
                        card.contenido
                      )}
                    </p>

                  </div>

                `).join("")}

              </div>
            `
            : `
              <div
                class="card"
                style="
                  text-align:center;
                  opacity:.65;
                "
              >
                Todavía no hay tarjetas.
              </div>
            `
        }

      </div>

    </section>

  `,


  // ===================================================
  // 4. AGRUPACIÓN
  // ===================================================

  () => `

    <section>

      <div class="hero">

        <div class="pill">
          AGRUPACIÓN
        </div>


        <h2>
          Hagamos visibles los temas.
        </h2>


        <p class="lead">
          Asignemos cada tarjeta al tema que mejor
          represente lo que estamos viendo.
        </p>

      </div>


      <div
        style="
          max-width:1100px;
          margin:0 auto 50px;
          padding:0 24px;
        "
      >

        ${
          state.cards.length
            ? `
              <div
                style="
                  display:grid;
                  gap:14px;
                "
              >

                ${state.cards.map(card => `

                  <div
                    class="card"
                    style="
                      display:flex;
                      justify-content:space-between;
                      gap:20px;
                      align-items:center;
                      flex-wrap:wrap;
                    "
                  >

                    <div
                      style="
                        flex:1;
                        min-width:260px;
                      "
                    >

                      <div
                        style="
                          font-size:11px;
                          text-transform:uppercase;
                          letter-spacing:.08em;
                          opacity:.55;
                          margin-bottom:8px;
                        "
                      >
                        ${
                          card.etapa ||
                          "Sin clasificar"
                        }
                      </div>


                      <div
                        style="
                          line-height:1.5;
                        "
                      >
                        ${escapeHtml(
                          card.contenido
                        )}
                      </div>

                    </div>


                    <select
                      class="card-topic-select"
                      data-card-id="${card.id}"
                      style="
                        min-width:220px;
                      "
                    >

                      <option
                        value=""
                        ${
                          !card.topic_key
                            ? "selected"
                            : ""
                        }
                      >
                        Sin agrupar
                      </option>


                      ${voteTopics.map(topic => `

                        <option
                          value="${topic.key}"
                          ${
                            card.topic_key === topic.key
                              ? "selected"
                              : ""
                          }
                        >
                          ${topic.label}
                        </option>

                      `).join("")}

                    </select>

                  </div>

                `).join("")}

              </div>
            `
            : `
              <div
                class="card"
                style="
                  text-align:center;
                  opacity:.65;
                "
              >
                No hay tarjetas para agrupar.
              </div>
            `
        }

      </div>

    </section>

  `,


  // ===================================================
  // 5. VOTACIÓN
  // ===================================================

  () => `

    <section>

      <div class="hero">

        <div class="pill">
          VOTACIÓN
        </div>


        <h2>
          ¿Dónde necesitamos poner el foco?
        </h2>


        <p class="lead">
          Tenés ${MAX_VOTES_PER_PARTICIPANT} votos para distribuir
          entre los temas que consideres más relevantes.
        </p>


        <div
          style="
            margin-top:16px;
            opacity:.7;
          "
        >
          Votos utilizados:
          <strong>
            ${state.usedVotes}
          </strong>
          /
          ${MAX_VOTES_PER_PARTICIPANT}
        </div>

      </div>


      <div
        style="
          max-width:1100px;
          margin:0 auto 50px;
          padding:0 24px;
        "
      >

        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
            gap:16px;
          "
        >

          ${voteTopics.map(topic => `

            <div
              class="card"
              style="
                text-align:center;
              "
            >

              <h3>
                ${topic.label}
              </h3>


              <div
                style="
                  font-size:34px;
                  font-weight:700;
                  margin:16px 0;
                "
              >
                ${
                  state.votes[topic.key] ||
                  0
                }
              </div>


              <button
                class="vote primary"
                data-topic="${topic.key}"
                ${
                  state.usedVotes >=
                  MAX_VOTES_PER_PARTICIPANT
                    ? "disabled"
                    : ""
                }
              >
                +1 voto
              </button>

            </div>

          `).join("")}

        </div>

      </div>

    </section>

  `,


  // ===================================================
  // 6. CONVERSACIÓN
  // ===================================================

  () => `

    <section>

      <div class="hero">

        <div class="pill">
          CONVERSACIÓN
        </div>


        <h2>
          ¿Qué necesitamos conversar?
        </h2>


        <p class="lead">
          Tomemos los temas priorizados y profundicemos
          en lo que está detrás.
        </p>

      </div>


      <div
        style="
          max-width:1100px;
          margin:0 auto 50px;
          padding:0 24px;
        "
      >

        <div
          style="
            display:grid;
            gap:16px;
          "
        >

          ${voteTopics.map(topic => `

            <div
              class="card"
              style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:20px;
                flex-wrap:wrap;
              "
            >

              <div>

                <div
                  style="
                    font-size:11px;
                    text-transform:uppercase;
                    letter-spacing:.08em;
                    opacity:.55;
                    margin-bottom:6px;
                  "
                >
                  TEMA
                </div>


                <h3
                  style="
                    margin:0;
                  "
                >
                  ${topic.label}
                </h3>

              </div>


              <div
                style="
                  font-size:30px;
                  font-weight:700;
                "
              >
                ${
                  state.votes[topic.key] ||
                  0
                }
              </div>

            </div>

          `).join("")}

        </div>

      </div>

    </section>

  `,


  // ===================================================
  // 7. ACCIONES
  // ===================================================

  () => `

    <section>

      <div class="hero">

        <div class="pill">
          ACCIONES
        </div>


        <h2>
          ¿Qué vamos a hacer?
        </h2>


        <p class="lead">
          Transformemos la conversación en acciones
          concretas y trazables.
        </p>


        <div
          class="card"
          style="
            margin-top:24px;
          "
        >

          <input
            id="actionText"
            placeholder="Acción concreta..."
            style="
              width:100%;
              box-sizing:border-box;
              margin-bottom:12px;
            "
          />


          <div
            style="
              display:grid;
              grid-template-columns:1fr 180px;
              gap:12px;
            "
          >

            <input
              id="actionOwner"
              placeholder="Responsable"
            />


            <input
              id="actionDate"
              type="date"
            />

          </div>


          <button
            id="addAction"
            class="primary"
            style="
              margin-top:12px;
            "
          >
            Agregar acción
          </button>

        </div>

      </div>


      <div
        style="
          max-width:1100px;
          margin:0 auto 50px;
          padding:0 24px;
        "
      >

        ${
          state.actions.length

            ? `
              <div
                style="
                  display:grid;
                  gap:12px;
                "
              >

                ${state.actions.map(action => `

                  <div
                    class="card"
                    style="
                      display:flex;
                      justify-content:space-between;
                      gap:20px;
                      align-items:center;
                      flex-wrap:wrap;
                    "
                  >

                    <div>

                      <strong>
                        ${escapeHtml(
                          action.text
                        )}
                      </strong>


                      <div
                        style="
                          margin-top:6px;
                          opacity:.6;
                          font-size:13px;
                        "
                      >
                        Responsable:
                        ${
                          escapeHtml(
                            action.owner
                          ) ||
                          "Por definir"
                        }
                      </div>

                    </div>


                    <div
                      style="
                        opacity:.6;
                        font-size:13px;
                      "
                    >
                      ${
                        escapeHtml(
                          action.date
                        ) ||
                        "Por definir"
                      }
                    </div>

                  </div>

                `).join("")}

              </div>
            `

            : `
              <div
                class="card"
                style="
                  text-align:center;
                  opacity:.65;
                "
              >
                Todavía no hay acciones.
              </div>
            `
        }

      </div>

    </section>

  `,


  // ===================================================
  // 8. CIERRE
  // ===================================================

  () => `

    <section>

      <div class="hero">

        <div class="pill">
          CIERRE
        </div>


        <h2>
          Nos llevamos esto.
        </h2>


        <p class="lead">
          Gracias por participar.
          Las acciones quedan registradas para poder
          darles seguimiento.
        </p>


        <div
          class="grid"
          style="
            margin-top:30px;
          "
        >

          <div class="card">

            <div
              style="
                font-size:11px;
                text-transform:uppercase;
                letter-spacing:.08em;
                opacity:.55;
              "
            >
              Tarjetas
            </div>


            <strong
              style="
                display:block;
                font-size:32px;
                margin-top:8px;
              "
            >
              ${state.cards.length}
            </strong>

          </div>


          <div class="card">

            <div
              style="
                font-size:11px;
                text-transform:uppercase;
                letter-spacing:.08em;
                opacity:.55;
              "
            >
              Acciones
            </div>


            <strong
              style="
                display:block;
                font-size:32px;
                margin-top:8px;
              "
            >
              ${state.actions.length}
            </strong>

          </div>


          <div class="card">

            <div
              style="
                font-size:11px;
                text-transform:uppercase;
                letter-spacing:.08em;
                opacity:.55;
              "
            >
              Temas
            </div>


            <strong
              style="
                display:block;
                font-size:32px;
                margin-top:8px;
              "
            >
              ${
                voteTopics.filter(
                  topic =>
                    (state.votes[topic.key] || 0) > 0
                ).length
              }
            </strong>

          </div>

        </div>

      </div>

    </section>

  `
];


// =====================================================
// CARGAR RETRO
// =====================================================

async function loadRetro() {

  const {
    data,
    error
  } = await supabaseClient
    .from("retros")
    .select(
      "id, codigo, nombre, paso_actual, facilitador_session_id, facilitador_nombre, iniciada"
    )
    .eq(
      "codigo",
      RETRO_CODE
    )
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
    Number(
      data.paso_actual || 0
    );


  state.facilitatorSessionId =
    data.facilitador_session_id ||
    null;


  state.facilitatorName =
    data.facilitador_nombre ||
    null;


  state.retroStarted =
    Boolean(
      data.iniciada
    );


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

  const {
    data,
    error
  } = await supabaseClient
    .from("cards")
    .select("*")
    .eq(
      "retro_id",
      state.retroId
    )
    .order(
      "created_at",
      {
        ascending: true
      }
    );


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

  const {
    data,
    error
  } = await supabaseClient
    .from("acciones")
    .select("*")
    .eq(
      "retro_id",
      state.retroId
    )
    .order(
      "created_at",
      {
        ascending: true
      }
    );


  if (error) {

    console.error(
      "Error cargando acciones:",
      error
    );

    return;
  }


  state.actions =
    (data || []).map(
      action => ({

        id:
          action.id,

        text:
          action.descripcion,

        owner:
          action.responsable,

        date:
          action.fecha ||
          "Por definir"

      })
    );


  console.log(
    "Acciones cargadas:",
    state.actions
  );
}


// =====================================================
// CARGAR VOTOS GLOBALES
// =====================================================

async function loadVotes() {

  const {
    data,
    error
  } = await supabaseClient
    .from("votos")
    .select("*")
    .eq(
      "retro_id",
      state.retroId
    );


  if (error) {

    console.error(
      "Error cargando votos:",
      error
    );

    return;
  }


  state.votes = {};


  (data || []).forEach(
    row => {

      state.votes[
        row.topic_key
      ] =
        row.votos || 0;

    }
  );


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
          payload.new.facilitador_nombre ||
          null;


        state.retroStarted =
          Boolean(
            payload.new.iniciada
          );


        updateFacilitatorState();


        render();

      }
    )

    .subscribe(
      status => {

        console.log(
          "Realtime retro:",
          status
        );

      }
    );
}


// =====================================================
// REALTIME - PARTICIPANTES
// =====================================================

function subscribeToParticipants() {

  supabaseClient

    .channel(
      "participants-realtime-" +
      state.retroId
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "participantes",
        filter:
          `retro_id=eq.${state.retroId}`
      },

      payload => {

        console.log(
          "Cambio de participante:",
          payload
        );


        // INSERT

        if (
          payload.eventType ===
          "INSERT"
        ) {

          const exists =
            state.participants.some(
              participant =>
                participant.id ===
                payload.new.id
            );


          if (!exists) {

            state.participants.push(
              payload.new
            );

          }

        }


        // UPDATE

        if (
          payload.eventType ===
          "UPDATE"
        ) {

          const index =
            state.participants.findIndex(
              participant =>
                participant.id ===
                payload.new.id
            );


          if (index !== -1) {

            state.participants[index] =
              payload.new;

          }

        }


        // DELETE

        if (
          payload.eventType ===
          "DELETE"
        ) {

          state.participants =
            state.participants.filter(
              participant =>
                participant.id !==
                payload.old.id
            );

        }


        render();

      }
    )

    .subscribe(
      status => {

        console.log(
          "Realtime participantes:",
          status
        );

      }
    );
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
          payload.eventType ===
          "INSERT"
        ) {

          const exists =
            state.cards.some(
              card =>
                card.id ===
                payload.new.id
            );


          if (!exists) {

            state.cards.push(
              payload.new
            );

          }

        }


        // UPDATE

        if (
          payload.eventType ===
          "UPDATE"
        ) {

          const index =
            state.cards.findIndex(
              card =>
                card.id ===
                payload.new.id
            );


          if (index !== -1) {

            state.cards[index] =
              payload.new;

          }

        }


        // DELETE

        if (
          payload.eventType ===
          "DELETE"
        ) {

          state.cards =
            state.cards.filter(
              card =>
                card.id !==
                payload.old.id
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

    .subscribe(
      status => {

        console.log(
          "Realtime cards:",
          status
        );

      }
    );
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


        state.votes[
          row.topic_key
        ] =
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

    .subscribe(
      status => {

        console.log(
          "Realtime votos:",
          status
        );

      }
    );
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
              action.id ===
              payload.new.id
          );


        if (exists) {
          return;
        }


        state.actions.push({

          id:
            payload.new.id,

          text:
            payload.new.descripcion,

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

    .subscribe(
      status => {

        console.log(
          "Realtime acciones:",
          status
        );

      }
    );
}


// =====================================================
// EVENTOS
// =====================================================

async function bind() {


  // ===================================================
  // PARTICIPANTE - PERFIL
  // ===================================================

  const saveParticipantButton =
    document.querySelector(
      "#saveParticipantBtn"
    );


  if (saveParticipantButton) {

    saveParticipantButton.onclick =
      async () => {

        const input =
          document.querySelector(
            "#participantNameInput"
          );


        const nombre =
          input
            ? input.value.trim()
            : "";


        saveParticipantButton.disabled =
          true;


        saveParticipantButton.textContent =
          "Guardando...";


        const saved =
          await setParticipantProfile(
            nombre,
            true
          );


        if (!saved) {

          saveParticipantButton.disabled =
            false;

          saveParticipantButton.textContent =
            "Estoy listo ✓";

        }

      };

  }


  // ===================================================
  // PARTICIPANTE - EDITAR
  // ===================================================

  const editParticipantButton =
    document.querySelector(
      "#editParticipantBtn"
    );


  if (editParticipantButton) {

    editParticipantButton.onclick =
      async () => {

        const nombre =
          getParticipantName();

        await setParticipantProfile(
          nombre,
          false
        );

      };

  }


  // ===================================================
  // FACILITADOR - INICIAR
  // ===================================================

  const startRetroButton =
    document.querySelector(
      "#startRetroBtn"
    );


  if (startRetroButton) {

    startRetroButton.onclick =
      async () => {

        startRetroButton.disabled =
          true;

        startRetroButton.textContent =
          "Iniciando...";


        await startRetro();

      };

  }


  // ===================================================
  // FACILITADOR - TOMAR CONTROL
  // ===================================================

  const claimButton =
    document.querySelector(
      "#claimFacilitatorBtn"
    );


  if (claimButton) {

    claimButton.onclick =
      () => {

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

    confirmClaimButton.onclick =
      async () => {

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

    cancelClaimButton.onclick =
      () => {

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

    releaseButton.onclick =
      async () => {

        releaseButton.disabled =
          true;

        await releaseFacilitator();

      };

  }


  // ===================================================
  // CHECK-IN
  // ===================================================

  document
    .querySelectorAll(
      "[data-energy]"
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            state.energy =
              Number(
                button.dataset.energy
              );

            render();

          };

      }
    );


  // ===================================================
  // AGRUPACIÓN
  // ===================================================

  document
    .querySelectorAll(
      ".card-topic-select"
    )
    .forEach(
      select => {

        select.onchange =
          async () => {

            const cardId =
              select.dataset.cardId;


            const topicKey =
              select.value ||
              null;


            select.disabled =
              true;


            const {
              data,
              error
            } =
              await supabaseClient
                .from("cards")
                .update({
                  topic_key:
                    topicKey
                })
                .eq(
                  "id",
                  cardId
                )
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


              select.disabled =
                false;


              return;
            }


            console.log(
              "Tarjeta agrupada:",
              data
            );


            const index =
              state.cards.findIndex(
                card =>
                  card.id ===
                  cardId
              );


            if (index !== -1) {

              state.cards[index] =
                data;

            }


            render();

          };

      }
    );


  // ===================================================
  // VOTACIÓN
  // ===================================================

  document
    .querySelectorAll(
      ".vote"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

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


            button.disabled =
              true;


            const {
              data,
              error
            } =
              await supabaseClient
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


              button.disabled =
                false;


              return;
            }


            console.log(
              "Voto guardado:",
              data
            );


            state.myVotes[
              topicKey
            ] =
              (
                state.myVotes[
                  topicKey
                ] ||
                0
              ) + 1;


            state.usedVotes =
              state.usedVotes + 1;


            if (
              data &&
              data.topic_key &&
              data.votos !== undefined
            ) {

              state.votes[
                data.topic_key
              ] =
                data.votos;

            }

            else {

              await loadVotes();

            }


            render();

          };

      }
    );


  // ===================================================
  // COSECHA - AGREGAR TARJETA
  // ===================================================

  const addCard =
    document.querySelector(
      "#addCard"
    );


  if (addCard) {

    addCard.onclick =
      async () => {

        const text =
          document
            .querySelector(
              "#cardText"
            )
            .value
            .trim();


        const type =
          document
            .querySelector(
              "#cardType"
            )
            .value;


        if (!text) {

          alert(
            "Escribí algo antes de agregar la tarjeta."
          );

          return;
        }


        addCard.disabled =
          true;


        const {
          data,
          error
        } =
          await supabaseClient
            .from("cards")
            .insert({
              contenido:
                text,

              etapa:
                type,

              retro_id:
                state.retroId,

              topic_key:
                null
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


          addCard.disabled =
            false;


          return;
        }


        console.log(
          "Tarjeta guardada:",
          data
        );


        const exists =
          state.cards.some(
            card =>
              card.id ===
              data.id
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
    document.querySelector(
      "#addAction"
    );


  if (add) {

    add.onclick =
      async () => {

        const text =
          document
            .querySelector(
              "#actionText"
            )
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
            .querySelector(
              "#actionOwner"
            )
            .value
            .trim()
          ||
          "Por definir";


        const date =
          document
            .querySelector(
              "#actionDate"
            )
            .value
          ||
          null;


        add.disabled =
          true;


        const {
          data,
          error
        } =
          await supabaseClient
            .from("acciones")
            .insert({
              descripcion:
                text,

              responsable:
                owner,

              fecha:
                date,

              retro_id:
                state.retroId
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
            (
              error?.code ||
              "N/A"
            ) +
            "\nMessage: " +
            (
              error?.message ||
              "N/A"
            ) +
            "\nDetails: " +
            (
              error?.details ||
              "N/A"
            )
          );


          add.disabled =
            false;


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
  .querySelector(
    "#nextBtn"
  )
  .onclick =
  async () => {

    if (
      !state.isFacilitator
    ) {

      return;

    }


    if (
      state.step >=
      steps.length - 1
    ) {

      return;

    }


    if (
      !state.retroStarted
    ) {

      await startRetro();

      return;

    }


    await advanceRetro();

  };


// =====================================================
// BOTÓN ATRÁS
// =====================================================

document
  .querySelector(
    "#backBtn"
  )
  .onclick =
  async () => {

    if (
      !state.isFacilitator
    ) {

      return;

    }


    if (
      state.step <= 0
    ) {

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
