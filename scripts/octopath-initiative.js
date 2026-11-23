class FUOctopathInitiative {
  static container = null;
  static lastHeroId = null;
  static animateHeroSwap = false;

  static init() {
    if (this.container) return;
    const el = document.createElement("div");
    el.id = "fu-octopath-hud";
    el.classList.add("fu-octo-hidden");
    document.body.appendChild(el);
    this.container = el;
  }

  static getCombat() {
    return game.combat?.started ? game.combat : null;
  }

  /**
   * Lê quantos turnos ainda restam para o combatente na rodada atual
   */
  static getRemainingTurns(combat, combatant) {
    // 1. Flags e DataModel do sistema projectfu
    const flagTurns = combat.getFlag("projectfu", "turns");
    if (flagTurns && typeof flagTurns[combatant.id] === "number") {
      return Math.max(0, flagTurns[combatant.id]);
    }

    const sysTurns = combat.system?.turns;
    if (sysTurns && typeof sysTurns[combatant.id] === "number") {
      return Math.max(0, sysTurns[combatant.id]);
    }

    const cFlag = combatant.getFlag("projectfu", "turns");
    if (typeof cFlag === "number") {
      return Math.max(0, cFlag);
    }

    // 2. Leitura direta do estado renderizado no Combat Tracker (1, 2, 3, ▶ ou ✓)
    const row = document.querySelector(`#combat-tracker .combatant[data-combatant-id="${combatant.id}"]`);
    if (row) {
      if (row.querySelector(".fa-check, .fa-circle-check")) {
        return 0;
      }

      const controls = row.querySelectorAll(".combatant-control, [data-action], .fu-combatant-turns, span, a");
      for (const el of controls) {
        const txt = el.textContent?.trim();
        if (txt && /^\d+$/.test(txt)) {
          return Math.max(0, parseInt(txt, 10));
        }
      }

      if (row.querySelector(".fa-play, .fa-circle-play")) {
        return 0;
      }
    }

    // 3. Fallback inicial
    return this.getMaxTurns(combatant);
  }

  /**
   * Total de ações por rodada (1 para personagens normais, 2+ para Chefes/Campeões)
   */
  static getMaxTurns(combatant) {
    const actor = combatant.actor;
    const sysTurns = actor?.system?.turns;
    if (typeof sysTurns === "number" && sysTurns > 0) return sysTurns;
    if (typeof sysTurns?.max === "number" && sysTurns.max > 0) return sysTurns.max;

    if (actor?.system?.rank === "champion") {
      return Math.max(2, Number(actor.system.rankValue ?? 2));
    }
    return 1;
  }

  /**
   * Identifica quem está com o turno ativo em evidência (ícone ▶)
   */
  static getActingCombatant(combat, combatants) {
    if (combat.turn !== null && combat.turn !== undefined && combat.combatant) {
      const current = combatants.find((c) => c.id === combat.combatant.id);
      if (current) return current;
    }

    for (const c of combatants) {
      const row = document.querySelector(`#combat-tracker .combatant[data-combatant-id="${c.id}"]`);
      if (row && (row.classList.contains("active") || row.querySelector(".fa-play, .fa-circle-play"))) {
        return c;
      }
    }

    return null;
  }

  static isAlly(combatant) {
    const disp = combatant.token?.disposition ?? combatant.actor?.prototypeToken?.disposition;
    return disp === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  }

  static isVisibleToUser(combatant) {
    if (combatant.isDefeated) return false;
    if (!game.user.isGM && combatant.hidden) return false;
    return true;
  }

  static getPortrait(combatant) {
    return (
      combatant.token?.texture?.src ||
      combatant.img ||
      combatant.actor?.img ||
      "icons/svg/mystery-man.svg"
    );
  }

  static render() {
    if (!this.container) this.init();
    const combat = this.getCombat();

    if (!combat) {
      this.container.classList.add("fu-octo-hidden");
      this.lastHeroId = null;
      return;
    }

    const combatants = combat.combatants.filter((c) => this.isVisibleToUser(c));
    if (!combatants.length) {
      this.container.classList.add("fu-octo-hidden");
      return;
    }

    // Monta a fila apenas com quem AINDA NÃO AGIU nesta rodada (turnos restantes > 0)
    const currentRoundQueue = [];
    for (const c of combatants) {
      const rem = this.getRemainingTurns(combat, c);
      for (let i = 0; i < rem; i++) {
        currentRoundQueue.push(c);
      }
    }

    // Descobre quem está em evidência jogando agora
    const actingCombatant = this.getActingCombatant(combat, combatants);
    const isActivelyPlaying = Boolean(actingCombatant);

    // Se ninguém clicou para agir ainda (início da rodada), mostra o primeiro disponível em standby
    const heroCombatant = actingCombatant ?? currentRoundQueue[0] ?? combatants[0];

    if (heroCombatant.id !== this.lastHeroId) {
      this.lastHeroId = heroCombatant.id;
      this.animateHeroSwap = true;
    }

    // Intercala aliados e inimigos na fila restante da rodada atual
    const heroIsAlly = this.isAlly(heroCombatant);
    currentRoundQueue.sort((a, b) => {
      const aDiffSide = this.isAlly(a) !== heroIsAlly ? 0 : 1;
      const bDiffSide = this.isAlly(b) !== heroIsAlly ? 0 : 1;
      return aDiffSide - bDiffSide;
    });

    // Monta a fila da Próxima Rodada
    const nextRoundQueue = [];
    for (const c of combatants) {
      const maxT = this.getMaxTurns(c);
      for (let i = 0; i < maxT; i++) {
        nextRoundQueue.push(c);
      }
    }

    const heroSideClass = heroIsAlly ? "fu-octo-ally" : "fu-octo-enemy";
    const heroStateClass = isActivelyPlaying ? "fu-octo-is-acting" : "fu-octo-standby";
    const heroHiddenClass = heroCombatant.hidden ? "fu-octo-secret" : "";
    const heroAnimClass = this.animateHeroSwap ? "fu-octo-hero-swap" : "";
    this.animateHeroSwap = false;

    const renderDiamond = (c, index) => {
      const sideClass = this.isAlly(c) ? "fu-octo-ally" : "fu-octo-enemy";
      const secretClass = c.hidden ? "fu-octo-secret" : "";
      const safeName = foundry.utils.escapeHTML(c.name);
      return `
        <div class="fu-octo-node ${sideClass} ${secretClass}"
             data-combatant-id="${c.id}"
             style="--stagger: ${index};"
             title="${safeName}">
          <div class="fu-octo-portrait-wrap">
            <img src="${this.getPortrait(c)}" alt="${safeName}" />
          </div>
          <span class="fu-octo-tooltip">${safeName}</span>
        </div>
      `;
    };

    const heroSafeName = foundry.utils.escapeHTML(heroCombatant.name);

    this.container.innerHTML = `
      <div class="fu-octo-wrapper">
        <!-- Losango Principal (Combatente em Evidência) -->
        <div class="fu-octo-hero ${heroSideClass} ${heroStateClass} ${heroHiddenClass} ${heroAnimClass}"
             data-combatant-id="${heroCombatant.id}"
             title="${heroSafeName}">
          <div class="fu-octo-portrait-wrap">
            <img src="${this.getPortrait(heroCombatant)}" alt="${heroSafeName}" />
          </div>
          <span class="fu-octo-chevron fu-octo-chev-left">‹</span>
          <span class="fu-octo-chevron fu-octo-chev-right">›</span>
          <span class="fu-octo-tooltip">${heroSafeName}</span>
        </div>

        <!-- Placa de Rodada -->
        <div class="fu-octo-round-banner">
          <span class="fu-octo-round-label">Rodada</span>
          <span class="fu-octo-round-num">${combat.round}</span>
        </div>

        <!-- Trilho Horizontal -->
        <div class="fu-octo-track">
          <div class="fu-octo-track-line"></div>

          <!-- Fila da Rodada Atual (Apenas quem ainda vai agir) -->
          <div class="fu-octo-queue fu-octo-current-queue">
            ${currentRoundQueue.map((c, idx) => renderDiamond(c, idx)).join("")}
          </div>

          <!-- Separador e Fila da Próxima Rodada -->
          <div class="fu-octo-next-section">
            <div class="fu-octo-next-label">Próxima Rodada</div>
            <div class="fu-octo-queue fu-octo-next-queue">
              ${nextRoundQueue.map((c, idx) => renderDiamond(c, idx)).join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.classList.remove("fu-octo-hidden");
    this.bindEvents();
  }

  static bindEvents() {
    if (!this.container) return;

    const nodes = this.container.querySelectorAll("[data-combatant-id]");
    nodes.forEach((el) => {
      const combatantId = el.dataset.combatantId;

      el.addEventListener("pointerenter", () => {
        const combatant = game.combat?.combatants.get(combatantId);
        const token = combatant?.token?.object;
        if (token?.visible) {
          token._onHoverIn(new Event("pointerover"));
        }
      });

      el.addEventListener("pointerleave", () => {
        const combatant = game.combat?.combatants.get(combatantId);
        const token = combatant?.token?.object;
        if (token?.visible) {
          token._onHoverOut(new Event("pointerout"));
        }
      });

      el.addEventListener("click", async () => {
        const combat = this.getCombat();
        const combatant = combat?.combatants.get(combatantId);
        if (!combat || !combatant) return;

        if (!game.user.isGM && !combatant.isOwner) return;

        const trackerBtn = document.querySelector(
          `#combat-tracker .combatant[data-combatant-id="${combatantId}"] [data-action="takeTurn"], ` +
          `#combat-tracker .combatant[data-combatant-id="${combatantId}"] .combatant-control`
        );

        if (trackerBtn && this.getRemainingTurns(combat, combatant) > 0) {
          trackerBtn.click();
        } else {
          const idx = combat.turns.findIndex((t) => t.id === combatantId);
          if (idx >= 0 && game.user.isGM) {
            await combat.update({ turn: idx });
          }
        }
      });
    });
  }
}

Hooks.once("ready", () => {
  FUOctopathInitiative.init();
  FUOctopathInitiative.render();
});

Hooks.on("combatStart", () => FUOctopathInitiative.render());
Hooks.on("updateCombat", () => FUOctopathInitiative.render());
Hooks.on("updateCombatant", () => FUOctopathInitiative.render());
Hooks.on("createCombatant", () => FUOctopathInitiative.render());
Hooks.on("deleteCombatant", () => FUOctopathInitiative.render());
Hooks.on("deleteCombat", () => FUOctopathInitiative.render());
Hooks.on("renderCombatTracker", () => FUOctopathInitiative.render());
