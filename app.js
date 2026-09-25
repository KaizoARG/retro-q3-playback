const SUPABASE_URL = "https://cjhnxghbbblnmumkutyy.supabase.co";
const SUPABASE_KEY = "sb_publishable_7U9b09ElsfExwu8hzDS49Q_CigP-_1s";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

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
  votes: {},
  cards: [],
  retroId: null,
  actions: []
};


// =====================================================
// ETAPAS
// =====================================================

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
// RENDER
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

  () => `<section class="hero">

    <div class="pill">RETRO · Q3 2026</div>

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

  </section>`,



  // ===================================================
  // 2. CHECK-IN
  // ===================================================

  () => `<section>

    <div class="eyebrow">Check-in</div>

    <h2>
      ¿Con qué energía llegás?
    </h2>

    <p class="lead">
      No buscamos una respuesta correcta.
      Queremos tener una lectura rápida del estado del equipo.
    </p>

    <div class="choice-row">

      ${["😣","😕","😐","🙂","🚀"]
        .map((x,i) =>
          `<button
            class="choice ${state.energy === i ? "selected" : ""}"
            data-energy="${i}">
            ${x}
          </button>`
        )
        .join("")}

    </div>

  </section>`,



  // ===================================================
  // 3. COSECHA
  // ===================================================

  () => `<section>

    <div class="eyebrow">Cosecha</div>

    <h2>
      ¿Qué pasó durante este período?
    </h2>

    <p class="lead">
      Compartí algo que funcionó, algo que nos trabó
      o algo que aprendimos.
    </p>

    <div class="card" style="margin-top:30px">

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
          placeholder="Escribí tu tarjeta...">
        </textarea>

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


      <!-- FUNCIONÓ -->

      <div class="column">

        <div class="column-title">

          Funcionó

          <small>
            · ${
              state.cards.filter(
                c => c.etapa === "green"
              ).length
            }
          </small>

        </div>


        ${
          state.cards
            .filter(c => c.etapa === "green")
            .map(c => `

              <div class="sticky">
                ${c.contenido}
              </div>

            `)
            .join("")
        }

      </div>



      <!-- NOS TRABÓ -->

      <div class="column">

        <div class="column-title">

          Nos trabó

          <small>
            · ${
              state.cards.filter(
                c => c.etapa === "red"
              ).length
            }
          </small>

        </div>


        ${
          state.cards
            .filter(c => c.etapa === "red")
            .map(c => `

              <div class="sticky">
                ${c.contenido}
              </div>

            `)
            .join("")
        }

      </div>



      <!-- APRENDIMOS -->

      <div class="column">

        <div class="column-title">

          Aprendimos

          <small>
            · ${
              state.cards.filter(
                c => c.etapa === "blue"
              ).length
            }
          </small>

        </div>


        ${
          state.cards
            .filter(c => c.etapa === "blue")
            .map(c => `

              <div class="sticky">
                ${c.contenido}
              </div>

            `)
            .join("")
        }

      </div>


    </div>

  </section>`,



  // ===================================================
  // 4. AGRUPACIÓN
  // ===================================================

  () => `<section>

    <div class="eyebrow">
      Agrupación
    </div>

    <h2>
      ¿Qué temas aparecen varias veces?
    </h2>

    <p class="lead">
      En una sesión real, el facilitador puede agrupar
      tarjetas similares. Acá mostramos cómo quedaría
      el resultado.
    </p>


    <div class="topic-list">

      ${[
        "Dependencias entre equipos",
        "Calidad y UAT",
        "Priorización y foco",
        "Visibilidad de métricas"
      ]

      .map((x,i) =>

        `<div class="topic">

          <strong>
            ${x}
          </strong>

          <span class="badge">
            ${[6,5,4,3][i]} tarjetas
          </span>

        </div>`

      ).join("")}

    </div>

  </section>`,



  // ===================================================
  // 5. VOTACIÓN
  // ===================================================

  () => `<section>

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


    <div class="topic-list">

      ${[
        "Dependencias entre equipos",
        "Calidad y UAT",
        "Priorización y foco",
        "Visibilidad de métricas"
      ]

      .map((x,i) =>

        `<div class="topic">

          <strong>
            ${x}
          </strong>


          <button
            class="primary vote"
            data-topic="${i}">

            Votar · ${state.votes[i] || 0}

          </button>

        </div>`

      ).join("")}

    </div>

  </section>`,



  // ===================================================
  // 6. CONVERSACIÓN
  // ===================================================

  () => `<section>

    <div class="eyebrow">
      Conversación
    </div>

    <h2>
      Dependencias entre equipos
    </h2>

    <p class="lead">
      Este tema recibió más votos en el ejemplo.
      La pregunta ahora no es solamente qué pasó,
      sino qué hay detrás.
    </p>


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

  </section>`,



  // ===================================================
  // 7. ACCIONES
  // ===================================================

  () => `<section>

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
        placeholder="¿Cómo sabremos que funcionó?">
      </textarea>

    </div>


    <button
      class="primary"
      id="addAction"
      style="margin-top:12px">

      Agregar acción +

    </button>


    <div class="actions">

      ${state.actions

        .map(a =>

          `<div class="action">

            <div>

              <strong>
                ${a.text}
              </strong>

              <div class="badge">
                ${a.owner} · ${a.date}
              </div>

            </div>

          </div>`

        )

        .join("")}

    </div>

  </section>`,



  // ===================================================
  // 8. CIERRE
  // ===================================================

  () => {

    const lastAction =
      state.actions.length > 0
        ? state.actions[state.actions.length - 1]
        : null;

    return `<section class="center">

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


        <!-- TEMA PRINCIPAL -->

        <div class="card">

          <div class="badge">
            TEMA PRINCIPAL
          </div>

          <h3>
            Dependencias entre equipos
          </h3>

          <p>
            Necesitamos anticipar dependencias
            y hacerlas visibles antes de comprometer trabajo.
          </p>

        </div>



        <!-- PRÓXIMA ACCIÓN -->

        <div class="card">

          <div class="badge">
            PRÓXIMA ACCIÓN
          </div>

          <h3>
            ${
              lastAction
                ? lastAction.text
                : "Todavía no hay acciones"
            }
          </h3>

          <p>
            ${
              lastAction
                ? `${lastAction.owner} · ${lastAction.date}`
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

    </section>`;
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
// CARGAR TARJETAS DESDE SUPABASE
// =====================================================

async function loadCards() {

  const { data, error } =
    await supabaseClient
      .from("cards")
      .select("*")
      .eq("retro_id", state.retroId)
      .order("created_at", { ascending: true });

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
// CARGAR ACCIONES DESDE SUPABASE
// =====================================================

async function loadActions() {

  const { data, error } =
    await supabaseClient
      .from("acciones")
      .select("*")
      .eq("retro_id", state.retroId)
      .order("created_at", { ascending: true });

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

      date:
        action.fecha || "Por definir"

    }));

  console.log(
    "Acciones cargadas:",
    state.actions
  );

}


// =====================================================
// REALTIME - ESCUCHAR NUEVAS TARJETAS
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
        event: "INSERT",
        schema: "public",
        table: "cards",
        filter:
          `retro_id=eq.${state.retroId}`
      },

      (payload) => {

        console.log(
          "Nueva tarjeta recibida:",
          payload.new
        );

        const exists =
          state.cards.some(
            card =>
              card.id === payload.new.id
          );

        if (!exists) {

          state.cards.push(
            payload.new
          );

          if (state.step === 2) {
            render();
          }

        }

      }
    )

    .subscribe((status) => {

      console.log(
        "Realtime cards:",
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
    .forEach(b => {

      b.onclick = () => {

        state.energy =
          +b.dataset.energy;

        render();

      };

    });



  // ===================================================
  // VOTACIÓN
  // ===================================================

  document
    .querySelectorAll(".vote")
    .forEach(b => {

      b.onclick = () => {

        const k =
          b.dataset.topic;

        if (
          (state.votes[k] || 0) < 3
        ) {

          state.votes[k] =
            (state.votes[k] || 0) + 1;

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

      const { data, error } =
        await supabaseClient
          .from("cards")
          .insert({
            contenido: text,
            etapa: type,
            retro_id: state.retroId
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

        return;
      }

      console.log(
        "Tarjeta guardada:",
        data
      );

      const exists =
        state.cards.some(
          card => card.id === data.id
        );

      if (!exists) {
        state.cards.push(data);
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

      const t =
        document
          .querySelector("#actionText")
          .value
          .trim();

      if (!t) {

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


      // =================================================
      // GUARDAR ACCIÓN EN SUPABASE
      // =================================================

      const { data, error } =
        await supabaseClient
          .from("acciones")
          .insert({
            descripcion: t,
            responsable: owner,
            fecha: date,
            retro_id: state.retroId
          })
          .select()
          .single();


      if (error) {

        console.error(
          "ERROR SUPABASE"
        );

        console.error(
          "code:",
          error?.code
        );

        console.error(
          "message:",
          error?.message
        );

        console.error(
          "details:",
          error?.details
        );

        console.error(
          "hint:",
          error?.hint
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

        return;
      }


      console.log(
        "Acción guardada en Supabase:",
        data
      );


      // =================================================
      // AGREGAR AL ESTADO LOCAL
      // =================================================

      state.actions.push({

        id: data.id,

        text:
          data.descripcion,

        owner:
          data.responsable,

        date:
          data.fecha || "Por definir"

      });


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

  subscribeToCards();

  render();
}

initialize();
