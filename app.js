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

let suppressCardRealtime = false;

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

const TOPIC_STOP_WORDS = new Set([
  "para", "como", "pero", "porque", "cuando", "donde", "desde", "hasta",
  "entre", "sobre", "ante", "hacia", "segun", "tambien", "muy", "mas",
  "menos", "todo", "toda", "todos", "todas", "algo", "nada", "esto",
  "esta", "este", "estas", "estos", "que", "del", "las", "los", "una",
  "uno", "unos", "unas", "con", "sin", "por", "una", "hay", "fue",
  "ser", "son", "era", "eran", "nos", "nosotros", "nuestro", "nuestra",
  "muy", "ya", "se", "su", "sus", "al", "el", "la", "y", "o", "a",
  "en", "de", "un", "es", "me", "te", "le", "lo", "mi", "tu", "para"
]);


function normalizeTopicText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function stemTopicToken(token) {
  let value = String(token || "");
  if (value.length <= 4) return value;

  const suffixes = [
    "amientos", "imiento", "imientos", "aciones", "acion",
    "mente", "ando", "iendo", "ados", "adas", "idos", "idas",
    "es", "os", "as", "s"
  ];

  for (const suffix of suffixes) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 4) {
      return value.slice(0, -suffix.length);
    }
  }

  return value;
}

function getMeaningfulTokens(value) {
  return normalizeTopicText(value)
    .split(" ")
    .map(token => stemTopicToken(token.trim()))
    .filter(token =>
      token.length >= 4 &&
      !TOPIC_STOP_WORDS.has(token) &&
      !/^\d+$/.test(token)
    );
}


function topicKeyFromLabel(label) {
  return String(label || "")
    .trim()
    .slice(0, 120);
}


function titleCaseTopic(label) {
  return String(label || "")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}


function getDynamicTopics() {
  const grouped = new Map();

  state.cards
    .filter(card => card.topic_key)
    .forEach(card => {
      const key = card.topic_key;

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label: key,
          count: 0
        });
      }

      grouped.get(key).count += 1;
    });

  return Array.from(grouped.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}


function getTopicLabel(topicKey) {
  if (!topicKey) return "Sin agrupar";

  const topic = getDynamicTopics()
    .find(topic => topic.key === topicKey);

  return topic ? topic.label : topicKey;
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


function buildDynamicTopics(cards) {
  const prepared = cards.map(card => ({
    card,
    tokens: new Set(getMeaningfulTokens(card.contenido))
  }));

  if (!prepared.length) {
    return { candidates: [], assignments: new Map() };
  }

  const frequencies = new Map();
  prepared.forEach(item => {
    item.tokens.forEach(token => {
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    });
  });

  // 1. Detectar temas a partir de palabras/raíces repetidas.
  const candidateTokens = Array.from(frequencies.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const candidates = [];
  const usedTokens = new Set();

  candidateTokens.forEach(([token]) => {
    if (candidates.length >= 8 || usedTokens.has(token)) return;

    const matching = prepared.filter(item => item.tokens.has(token));
    if (matching.length < 2) return;

    const related = Array.from(
      new Set(matching.flatMap(item => Array.from(item.tokens)))
    )
      .filter(other =>
        other !== token &&
        !usedTokens.has(other) &&
        (frequencies.get(other) || 0) >= 2
      )
      .sort((a, b) =>
        (frequencies.get(b) || 0) - (frequencies.get(a) || 0) ||
        a.localeCompare(b)
      );

    const second = related[0];
    const label = second
      ? `${titleCaseTopic(token)} · ${titleCaseTopic(second)}`
      : titleCaseTopic(token);

    candidates.push({ label, cards: matching });
    usedTokens.add(token);
    if (second) usedTokens.add(second);
  });

  // 2. Si no hubo palabras repetidas, agrupar por similitud entre tarjetas.
  //    El umbral es deliberadamente bajo para que la agrupación no quede vacía.
  if (candidates.length === 0) {
    const unused = new Set(prepared.map(item => item.card.id));

    while (unused.size >= 2 && candidates.length < 8) {
      const seedId = unused.values().next().value;
      const seed = prepared.find(item => item.card.id === seedId);
      if (!seed) break;

      const matches = prepared.filter(item => {
        if (!unused.has(item.card.id) || item.card.id === seedId) return false;

        const intersection = Array.from(seed.tokens)
          .filter(token => item.tokens.has(token)).length;
        const union = new Set([...seed.tokens, ...item.tokens]).size;
        const similarity = union ? intersection / union : 0;

        return similarity >= 0.15;
      });

      if (!matches.length) {
        unused.delete(seedId);
        continue;
      }

      const topicCards = [seed, ...matches];
      const topicFrequency = new Map();
      topicCards.forEach(item => item.tokens.forEach(token => {
        topicFrequency.set(token, (topicFrequency.get(token) || 0) + 1);
      }));

      const words = Array.from(topicFrequency.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 2)
        .map(([token]) => titleCaseTopic(token));

      candidates.push({
        label: words.join(" · ") || "Tema",
        cards: topicCards
      });

      topicCards.forEach(item => unused.delete(item.card.id));
    }
  }

  const assignments = new Map();

  candidates.forEach(candidate => {
    const key = topicKeyFromLabel(candidate.label);

    candidate.cards.forEach(item => {
      const existing = assignments.get(item.card.id);
      if (!existing || candidate.cards.length > existing.count) {
        assignments.set(item.card.id, {
          key,
          label: candidate.label,
          count: candidate.cards.length
        });
      }
    });
  });

  // 3. Garantizar que ninguna tarjeta quede invisible después de generar.
  //    Si una tarjeta no comparte suficientes conceptos con otra, se crea
  //    un tópico individual basado en sus palabras más relevantes.
  prepared.forEach(item => {
    if (assignments.has(item.card.id)) return;

    const words = Array.from(item.tokens)
      .sort((a, b) =>
        (frequencies.get(b) || 0) - (frequencies.get(a) || 0) ||
        a.localeCompare(b)
      )
      .slice(0, 2)
      .map(titleCaseTopic);

    const label = words.join(" · ") || "Tema sin definir";
    assignments.set(item.card.id, {
      key: topicKeyFromLabel(label),
      label,
      count: 1
    });
  });

  const uniqueTopics = new Map();
  assignments.forEach(assignment => {
    if (!uniqueTopics.has(assignment.key)) {
      uniqueTopics.set(assignment.key, {
        key: assignment.key,
        label: assignment.label
      });
    }
  });

  return {
    candidates: Array.from(uniqueTopics.values()),
    assignments
  };
}


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
  return topicKey || "Sin agrupar";
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

  // Si el participante fue eliminado por un reinicio de sala,
  // recreamos la sesión antes de guardar el perfil.
  if (!state.participantId) {
    const recreated = await loadParticipant();
    if (!recreated || !state.participantId) {
      return false;
    }
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
    .select("id, retro_id, session_id, nombre, listo")
    .eq("retro_id", state.retroId);

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
  } else {
    // Si el participante fue eliminado (por ejemplo, al reiniciar la sala),
    // limpiar también la identidad local para volver a pedir nombre y apellido.
    state.participant = null;
    state.participantId = null;
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

  const sortedParticipants = [...state.participants].sort((a, b) => {
    const aIsFacilitator = a.session_id === state.facilitatorSessionId;
    const bIsFacilitator = b.session_id === state.facilitatorSessionId;

    if (aIsFacilitator && !bIsFacilitator) return -1;
    if (!aIsFacilitator && bIsFacilitator) return 1;

    return (a.nombre || "").localeCompare(
      b.nombre || "",
      "es",
      { sensitivity: "base" }
    );
  });

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
              : sortedParticipants.map(participant => {
                  const isFacilitator =
                    participant.session_id === state.facilitatorSessionId;

                  return `
                    <div
                      style="
                        display:flex;
                        align-items:center;
                        justify-content:space-between;
                        gap:12px;
                        padding:10px 0;
                        border-bottom:1px solid rgba(255,255,255,.07);
                      ">
                      <div style="display:flex;align-items:center;gap:9px;min-width:0;">
                        ${isFacilitator ? `
                          <span
                            title="Facilitador"
                            aria-label="Facilitador"
                            style="font-size:18px;line-height:1;">
                            👑
                          </span>
                        ` : ""}
                        <div style="min-width:0;">
                          <div style="font-weight:${isFacilitator ? "700" : "500"};">
                            ${escapeHtml(participant.nombre || "Sin identificar")}
                          </div>
                          ${isFacilitator ? `
                            <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.6;margin-top:2px;">
                              Facilitador
                            </div>
                          ` : ""}
                        </div>
                      </div>
                      <span
                        class="badge"
                        style="
                          flex-shrink:0;
                          ${participant.listo
                            ? "border-color:rgba(84,255,209,.3);"
                            : "opacity:.65;"}
                        ">
                        ${participant.listo ? "✓ Listo" : "○ Pendiente"}
                      </span>
                    </div>
                  `;
                }).join("")
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

// =====================================================
// FACILITADOR - REINICIAR SALA
// =====================================================

async function resetRetro() {

  if (!state.retroId || !state.participantSessionId) {
    return;
  }

  const confirmed = window.confirm(
    "¿Reiniciar la sala?\n\n" +
    "Se van a borrar todas las tarjetas de cosecha, agrupaciones, votos, acciones y participantes.\n" +
    "Todos tendrán que volver a ingresar su nombre para participar.\n\n" +
    "Esta acción no se puede deshacer."
  );

  if (!confirmed) {
    return;
  }

  const { data, error } = await supabaseClient.rpc(
    "reset_retro",
    {
      p_retro_id: state.retroId,
      p_session_id: state.participantSessionId
    }
  );

  if (error) {
    console.error("Error reiniciando la sala:", error);
    alert(
      "No se pudo reiniciar la sala.\n\n" +
      error.message
    );
    return;
  }

  console.log("Sala reiniciada:", data);

  state.step = 0;
  state.retroStarted = false;
  state.votes = {};
  state.myVotes = {};
  state.usedVotes = 0;
  state.cards = [];
  state.actions = [];
  state.facilitatorSessionId = null;
  state.facilitatorName = null;
  state.isFacilitator = false;

  localStorage.removeItem(
    `retro-my-votes-${state.retroId}`
  );

  await refreshRetroState();

  // El reset elimina también al participante actual.
  // Lo recreamos como una sesión nueva, todavía sin nombre/listo,
  // para que la sala vuelva a mostrar 0 de 1 y crezca a medida
  // que ingresen nuevas personas.
  await loadParticipant();
  await loadParticipants();
  render();
}


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

  if (!state.retroId || !state.participantSessionId) {
    return;
  }

  // Antes de iniciar, sincronizamos con Supabase para evitar que
  // el estado local quede desactualizado respecto del facilitador real.
  await refreshRetroState();

  // Si el facilitador se perdió por un refresh/race condition,
  // intentamos reclamarlo nuevamente para esta misma sesión.
  if (!state.isFacilitator) {
    const { data: claimData, error: claimError } =
      await supabaseClient.rpc("claim_facilitator", {
        p_retro_id: state.retroId,
        p_session_id: state.participantSessionId
      });

    if (claimError || !claimData?.is_facilitator) {
      console.error("No se pudo confirmar el control de facilitación:", claimError || claimData);
      alert(
        "No se pudo iniciar la retro.\n\n" +
        "La sesión actual no figura como facilitador. Volvé a tomar el control e intentá nuevamente."
      );
      await refreshRetroState();
      render();
      return;
    }

    await refreshRetroState();
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

async function ensureFacilitatorControl() {

  if (!state.retroId || !state.participantSessionId) {
    return false;
  }

  // Siempre verificamos contra Supabase antes de ejecutar una acción
  // exclusiva del facilitador. Esto evita que un evento Realtime
  // o un estado local viejo deje al navegador creyendo que tiene el control.
  await refreshRetroState();

  if (state.isFacilitator) {
    return true;
  }

  const { data, error } = await supabaseClient.rpc(
    "claim_facilitator",
    {
      p_retro_id: state.retroId,
      p_session_id: state.participantSessionId
    }
  );

  if (error || !data?.is_facilitator) {
    console.error(
      "No se pudo confirmar el control de facilitación:",
      error || data
    );
    return false;
  }

  await refreshRetroState();
  await loadParticipants();
  return state.isFacilitator;
}


async function advanceRetro() {

  const hasControl = await ensureFacilitatorControl();

  if (!hasControl) {

    console.log(
      "Solo el facilitador puede avanzar la retro."
    );

    alert(
      "No se pudo avanzar la retro.\n\n" +
      "La sesión actual no figura como facilitador en la sala."
    );

    render();
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

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">

          <button
            id="resetRetroBtn"
            style="
              padding:9px 14px;
              border-radius:10px;
              cursor:pointer;
              background:transparent;
              border:1px solid rgba(255,120,120,.5);
              color:inherit;
            "
          >
            Reiniciar sala
          </button>

          <button
            id="releaseFacilitatorBtn"
            style="
              padding:9px 14px;
              border-radius:10px;
              cursor:pointer;
              background:transparent;
              border:1px solid #54FFD1;
              color:#54FFD1;
            "
          >
            Liberar control
          </button>

        </div>

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

    const dynamicTopics = getDynamicTopics();

    const ungroupedCards =
      state.cards.filter(card => !card.topic_key);

    return `
      <section>

        <div class="eyebrow">
          Agrupación
        </div>

        <h2>
          ¿Qué temas aparecen en la cosecha?
        </h2>

        <p class="lead">
          Los tópicos se generan a partir de lo que escribió el equipo.
          No hay categorías predefinidas.
        </p>

        ${
          state.isFacilitator
            ? `
              <div class="card" style="margin-top:30px">
                <h3>Generar agrupación automática</h3>
                <p>
                  El sistema analiza las tarjetas de la cosecha, detecta temas repetidos y propone tópicos dinámicos.
                </p>
                <button
                  class="primary"
                  id="generateTopicsBtn"
                  style="margin-top:12px">
                  ${dynamicTopics.length ? "Regenerar tópicos" : "Generar tópicos"}
                </button>
              </div>
            `
            : `
              <div class="card" style="margin-top:30px">
                <p>
                  El facilitador está generando los tópicos a partir de la cosecha.
                </p>
              </div>
            `
        }

        <div class="topic-list" style="margin-top:30px">
          ${
            dynamicTopics.length
              ? dynamicTopics.map(topic => `
                  <div class="topic">
                    <strong>${escapeHtml(topic.label)}</strong>
                    <span class="badge">
                      ${topic.count}
                      tarjeta${topic.count === 1 ? "" : "s"}
                    </span>
                  </div>
                `).join("")
              : `
                <div class="card">
                  <p>
                    Todavía no hay tópicos generados.
                  </p>
                </div>
              `
          }
        </div>

        ${
          ungroupedCards.length
            ? `
              <div class="card" style="margin-top:30px">
                <h3>Tarjetas sin agrupar</h3>
                <p>
                  ${ungroupedCards.length}
                  tarjeta${ungroupedCards.length === 1 ? "" : "s"}
                  no encontró un tema suficientemente claro.
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
              : state.cards.map(card => `
                <div
                  class="card"
                  style="
                    display:flex;
                    gap:20px;
                    align-items:center;
                    justify-content:space-between;
                    flex-wrap:wrap;
                  ">

                  <div style="flex:1;min-width:250px;">
                    <div class="badge" style="margin-bottom:10px">
                      ${
                        card.etapa === "green"
                          ? "Funcionó"
                          : card.etapa === "red"
                            ? "Nos trabó"
                            : "Aprendimos"
                      }
                    </div>
                    <strong>${escapeHtml(card.contenido)}</strong>
                  </div>

                  <div style="min-width:250px;">
                    <select
                      class="card-topic-select"
                      data-card-id="${card.id}"
                      style="width:100%;">
                      <option value="">Sin agrupar</option>
                      ${dynamicTopics.map(topic => `
                        <option
                          value="${escapeHtml(topic.key)}"
                          ${card.topic_key === topic.key ? "selected" : ""}>
                          ${escapeHtml(topic.label)}
                        </option>
                      `).join("")}
                    </select>
                  </div>

                </div>
              `).join("")
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

          ${getDynamicTopics()
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
      getDynamicTopics()
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
      getDynamicTopics()
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

        if (suppressCardRealtime) {
          console.log("Realtime cards ignorado durante generación de tópicos:", payload);
          return;
        }

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
  // FACILITADOR - REINICIAR SALA
  // ===================================================

  const resetButton =
    document.querySelector(
      "#resetRetroBtn"
    );

  if (resetButton) {

    resetButton.onclick = async () => {

      resetButton.disabled = true;
      resetButton.textContent = "Reiniciando...";

      await resetRetro();

      if (document.body.contains(resetButton)) {
        resetButton.disabled = false;
        resetButton.textContent = "Reiniciar sala";
      }
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

  const generateTopicsBtn =
    document.querySelector("#generateTopicsBtn");

  if (generateTopicsBtn) {
    generateTopicsBtn.onclick = async () => {
      console.log("Click en Generar tópicos", {
        isFacilitator: state.isFacilitator,
        cards: state.cards.length,
        retroId: state.retroId,
        step: state.step
      });

      if (!state.isFacilitator) {
        alert("Solo el facilitador puede generar los tópicos.");
        return;
      }

      if (!state.cards.length) {
        alert("Todavía no hay tarjetas para agrupar.");
        return;
      }

      generateTopicsBtn.disabled = true;
      generateTopicsBtn.textContent = "Generando…";

      try {
        const { candidates, assignments } = buildDynamicTopics(state.cards);

        if (!assignments.size) {
          throw new Error("No se pudieron detectar temas en las tarjetas.");
        }

        const updates = state.cards.map(card => ({
          id: card.id,
          topic_key: assignments.get(card.id)?.key || null
        }));

        console.log("Iniciando generación de tópicos", {
          cards: state.cards.length,
          updates,
          candidates: candidates.map(topic => topic.label)
        });

        // Bloqueamos el realtime de cards durante esta operación para que
        // una actualización intermedia no vuelva a pintar datos viejos.
        suppressCardRealtime = true;

        // Pintado optimista: la pantalla muestra inmediatamente la agrupación
        // que acabamos de generar, incluso antes de terminar la persistencia.
        state.cards = state.cards.map(card => ({
          ...card,
          topic_key: assignments.get(card.id)?.key || null
        }));
        render();

        // La tabla cards tiene RLS. En vez de hacer UPDATE directo desde el
        // navegador, usamos una RPC que valida que quien agrupa sea el
        // facilitador actual y realiza el UPDATE de forma segura.
        const results = await Promise.all(
          updates.map(async update => {
            const { data, error } = await supabaseClient.rpc(
              "set_card_topic",
              {
                p_retro_id: state.retroId,
                p_session_id: state.participantSessionId,
                p_card_id: update.id,
                p_topic_key: update.topic_key
              }
            );

            if (error) throw error;

            if (!data || !data.success) {
              throw new Error(
                data?.message ||
                `No se pudo actualizar la tarjeta ${update.id}.`
              );
            }

            return data;
          })
        );

        console.log("Actualizaciones confirmadas por Supabase:", results);

        // Verificación final contra la base antes de considerar terminada
        // la agrupación.
        const { data: verifiedCards, error: verifyError } =
          await supabaseClient
            .from("cards")
            .select("id, topic_key")
            .eq("retro_id", state.retroId);

        if (verifyError) throw verifyError;

        const missing = updates.filter(update => {
          const row = verifiedCards?.find(card => card.id === update.id);
          return !row || row.topic_key !== update.topic_key;
        });

        if (missing.length) {
          throw new Error(
            `La base no confirmó ${missing.length} agrupación${missing.length === 1 ? "" : "es"}. Revisá RLS/permisos de UPDATE en cards.`
          );
        }

        // Usamos la respuesta verificada para el render definitivo.
        state.cards = state.cards.map(card => {
          const fresh = verifiedCards.find(row => row.id === card.id);
          return fresh ? { ...card, topic_key: fresh.topic_key } : card;
        });

        render();

        console.log("Tópicos generados:", candidates.map(topic => topic.label));
        console.log(`Tarjetas actualizadas: ${results.length}/${updates.length}`);
        console.log("Cards verificadas:", verifiedCards);

        alert(
          `Agrupación generada correctamente\n\n` +
          `${candidates.length} tópicos\n` +
          `${results.length} tarjetas agrupadas`
        );
      } catch (error) {
        console.error("Error generando tópicos:", error);

        // Si falló la persistencia, recuperamos el estado real de Supabase.
        await loadCards();
        render();

        alert(
          "No se pudo generar la agrupación.\n\n" +
          error.message
        );
      } finally {
        suppressCardRealtime = false;
        generateTopicsBtn.disabled = false;
        generateTopicsBtn.textContent = "Regenerar tópicos";
      }
    };
  }

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

    // En el lobby, el mismo botón inicia la retro.
    // Una vez iniciada, pasa a avanzar de etapa.
    if (!state.retroStarted) {
      await startRetro();
      return;
    }

    if (
      state.step >=
      steps.length - 1
    ) {
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
