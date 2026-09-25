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

  // Votos realizados por ESTE navegador
  myVotes: {},

  // Tarjetas de la retro
  cards: [],

  // Retro actual
  retroId: null,

  // Acciones
  actions: []
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
// RENDER PRINCIPAL
// =====================================================

function render() {

  document.querySelector("#stepLabel").textContent =
    `${state.step + 1} / ${steps.length}`;

  document.querySelector("#progressBar").style.width =
    `${((state.step + 1) / steps.length) * 100}%`;

  document.querySelector("#backBtn").style.visibility =
    state.step === 0 ? "hidden" : "visible";

  document.querySelector("#nextBtn").textContent =
    state.step === steps.length - 1
      ? "Reiniciar ↻"
      : (state.step === 0 ? "Comenzar →" : "Continuar →");

  document.querySelector("#app").innerHTML =
    screens[state.step]();

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


        <!-- RESUMEN DE TEMAS -->

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


        <!-- TARJETAS SIN AGRUPAR -->

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


        <!-- TODAS LAS TARJETAS -->

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

    const usedVotes =
      Object.values(state.myVotes)
        .reduce(
          (sum, value) => sum + value,
          0
        );

    const remainingVotes =
      Math.max(
        0,
        MAX_VOTES_PER_PARTICIPANT - usedVotes
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
      .select("id, codigo, nombre")
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

  state.retroId = data.id;

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

  state.cards = data || [];

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
// CARGAR VOTOS
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
// CARGAR MIS VOTOS
// =====================================================

function loadMyVotes() {

  if (!state.retroId) {
    return;
  }

  const storageKey =
    `retro-my-votes-${state.retroId}`;

  try {

    const saved =
      localStorage.getItem(storageKey);

    state.myVotes =
      saved
        ? JSON.parse(saved)
        : {};

  } catch (error) {

    console.error(
      "Error cargando votos locales:",
      error
    );

    state.myVotes = {};
  }

  console.log(
    "Mis votos:",
    state.myVotes
  );
}


// =====================================================
// GUARDAR MIS VOTOS
// =====================================================

function saveMyVotes() {

  const storageKey =
    `retro-my-votes-${state.retroId}`;

  localStorage.setItem(
    storageKey,
    JSON.stringify(state.myVotes)
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


        // ---------------------------------------------
        // INSERT
        // ---------------------------------------------

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


        // ---------------------------------------------
        // UPDATE
        // ---------------------------------------------

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


        // ---------------------------------------------
        // DELETE
        // ---------------------------------------------

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
// EVENTOS
// =====================================================

async function bind() {


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


        const { data, error } =
          await supabaseClient
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


        const usedVotes =
          Object.values(state.myVotes)
            .reduce(
              (sum, value) =>
                sum + value,
              0
            );


        if (
          usedVotes >=
          MAX_VOTES_PER_PARTICIPANT
        ) {

          alert(
            "Ya utilizaste tus 3 votos."
          );

          return;
        }


        button.disabled = true;


        // ---------------------------------------------
        // INCREMENTAR VOTO EN SUPABASE
        // ---------------------------------------------

        const { data, error } =
          await supabaseClient
            .rpc(
              "increment_vote",
              {
                p_retro_id:
                  state.retroId,

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
        // ACTUALIZAR VOTOS LOCALES
        // ---------------------------------------------

        state.myVotes[topicKey] =
          (state.myVotes[topicKey] || 0) + 1;

        saveMyVotes();


        // ---------------------------------------------
        // ACTUALIZAR TOTAL GLOBAL
        // ---------------------------------------------

        if (data) {

          state.votes[data.topic_key] =
            data.votos;

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


      const { data, error } =
        await supabaseClient
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


      // ---------------------------------------------
      // GUARDAR ACCIÓN
      // ---------------------------------------------

      const { data, error } =
        await supabaseClient
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


      // ---------------------------------------------
      // AGREGAR AL ESTADO LOCAL
      // ---------------------------------------------

      const newAction = {

        id:
          data.id,

        text:
          data.descripcion,

        owner:
          data.responsable,

        date:
          data.fecha || "Por definir"

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
  .onclick = () => {

    if (
      state.step ===
      steps.length - 1
    ) {

      state.step = 0;

      state.energy = null;

      state.votes = {};

      loadVotes();

      render();

    }

    else {

      state.step++;

      render();

    }

  };


// =====================================================
// BOTÓN ATRÁS
// =====================================================

document
  .querySelector("#backBtn")
  .onclick = () => {

    if (state.step > 0) {

      state.step--;

      render();

    }

  };


// =====================================================
// INICIAR
// =====================================================

async function initialize() {

  const retroLoaded =
    await loadRetro();


  if (!retroLoaded) {
    return;
  }


  await loadCards();


  await loadActions();


  await loadVotes();


  loadMyVotes();


  subscribeToCards();


  subscribeToVotes();


  render();

}


initialize();
