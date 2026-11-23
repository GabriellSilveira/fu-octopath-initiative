class FUOctopathInitiative {
  static container = null;
  static activeCombatantId = null;
  static lastTurnCounts = new Map();
  static lastRound = null;
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
   * Lê quantos turnos o combatente ainda tem na rodada atual no sistema projectfu
   */
  static getRemainingTurns(combat, combatant) {
    const flagMap = combat.getFlag("projectfu", "turns");
    if (flagMap && typeof flagMap[combatant.id] === "number") {
      return Math.max(0, flagMap[combatant.id]);
    }

    const cFlag = combatant.getFlag("projectfu", "turns");
    if (typeof cFlag === "number") {
      return Math.max(0, cFlag);
    }

    const sysTurns = combatant.system?.turns;
    if (typeof sysTurns === "number") return Math.max(0, sysTurns);
    if (typeof sysTurns?.value === "number") return Math.max(0, sysTurns.value);

    // Fallback caso o combate ainda não tenha inicializado flags de turno
    return this.getMaxTurns(combatant);
  }

  /**
   * Lê o total de ações por rodada (1 para personagens normais, 2+ para Chefes/Campeões)
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

  /**
   * Detecta quem acabou de agir comparando os contadores de turno antes e depois da atualização
   */
  static detectActiveCombatant(combat) {
    const combatants = combat.combatants.filter((c) => this.isVisibleToUser(c));
    if (!combatants.length) {
      this.activeCombatantId = null;
      return;
    }

    // Se virou a rodada, limpa o histórico de contagem
    if (this.lastRound !== combat.round) {
      this.lastRound = combat.round;
      this.lastTurnCounts.clear();
    }

    let newlyActedId = null;
    const currentCounts = new Map();

    for (const c of combatants) {
      const rem = this.getRemainingTurns(combat, c);
      currentCounts.set(c.id, rem);

      if (this.lastTurnCounts.has(c.id)) {
        const prev = this.lastTurnCounts.get(c.id);
        if (rem < prev) {
          newlyActedId = c.id;
        }
      }
    }

    this.lastTurnCounts = currentCounts;

    if (newlyActedId && newlyActedId !== this.activeCombatantId) {
      this.activeCombatantId = newlyActedId;
      this.animateHeroSwap = true;
      return;
    }

    // Fallback: usa o combatant selecionado pelo tracker ou o primeiro disponível
    if (!this.activeCombatantId || !combatants.some((c) => c.id === this.activeCombatantId)) {
      const trackerCurrent = combat.combatant;
      if (trackerCurrent && this.isVisibleToUser(trackerCurrent)) {
        this.activeCombatantId = trackerCurrent.id;
      } else {
        const firstWithTurns = combatants.find((c) => this.getRemainingTurns(combat, c) > 0);
        this.activeCombatantId = (firstWithTurns ?? combatants[0]).id;
      }
      this.animateHeroSwap = true;
    }
  }

  static render() {
    if (!this.container) this.init();
    const combat = this.getCombat();

    if (!combat) {
      this.container.classList.add("fu-octo-hidden");
      this.activeCombatantId = null;
      this.lastTurnCounts.clear();
      this.lastRound = null;
      return;
    }

    const combatants = combat.combatants.filter((c) => this.isVisibleToUser(c));
    if (!combatants.length) {
      this.container.classList.add("fu-octo-hidden");
      return;
    }

    this.detectActiveCombatant(combat);

    const heroCombatant =
      combatants.find((c) => c.id === this.activeCombatantId) ?? combatants[0];

    // Monta a fila da rodada atual (todos que ainda têm turnos > 0)
    const currentRoundQueue = [];
    for (const c of combatants) {
      const rem = this.getRemainingTurns(combat, c);
      for (let i = 0; i < rem; i++) {
        currentRoundQueue.push(c);
      }
    }

    // Ordena intercalando o lado oposto ao ativo para simular a alternância do Fabula Ultima
    const heroIsAlly = this.isAlly(heroCombatant);
    currentRoundQueue.sort((a, b) => {
      const aDiffSide = this.isAlly(a) !== heroIsAlly ? 0 : 1;
      const bDiffSide = this.isAlly(b) !== heroIsAlly ? 0 : 1;
      return aDiffSide - bDiffSide;
    });

    // Monta a fila da próxima rodada
    const nextRoundQueue = [];
    for (const c of combatants) {
      const maxT = this.getMaxTurns(c);
      for (let i = 0; i < maxT; i++) {
        nextRoundQueue.push(c);
      }
    }

    const heroSideClass = heroIsAlly ? "fu-octo-ally" : "fu-octo-enemy";
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
        <!-- Losango Principal (Quem está agindo) -->
        <div class="fu-octo-hero ${heroSideClass} ${heroHiddenClass} ${heroAnimClass}"
             data-combatant-id="${heroCombatant.id}"
             title="${heroSafeName}">
          <div class="fu-octo-portrait-wrap">
            <img src="${this.getPortrait(heroCombatant)}" alt="${heroSafeName}" />
          </div>
          <span class="fu-octo-chevron fu-octo-chev-left">‹</span>
          <span class="fu-octo-chevron fu-octo-chev-right">›</span>
          <span class="fu-octo-tooltip">${heroSafeName}</span>
        </div>

        <!-- Placa de Rodada (estilo Turn 4 do Octopath) -->
        <div class="fu-octo-round-banner">
          <span class="fu-octo-round-label">Rodada</span>
          <span class="fu-octo-round-num">${combat.round}</span>
        </div>

        <!-- Trilho Horizontal -->
        <div class="fu-octo-track">
          <div class="fu-octo-track-line"></div>

          <!-- Fila da Rodada Atual -->
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

      // Destaca o token no mapa ao passar o mouse no losango
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

      // Clicar em um losango ativa o turno desse combatente (iniciativa livre)
      el.addEventListener("click", async () => {
        const combat = this.getCombat();
        const combatant = combat?.combatants.get(combatantId);
        if (!combat || !combatant) return;

        if (!game.user.isGM && !combatant.isOwner) return;

        // Tenta acionar o botão nativo de turno do projectfu no Combat Tracker
        const trackerBtn = document.querySelector(
          `#combat-tracker .combatant[data-combatant-id="${combatantId}"] [data-action="takeTurn"], ` +
          `#combat-tracker .combatant[data-combatant-id="${combatantId}"] .combatant-control`
        );

        if (trackerBtn && this.getRemainingTurns(combat, combatant) > 0) {
          trackerBtn.click();
        } else {
          // Fallback visual/turno padrão
          this.activeCombatantId = combatantId;
          this.animateHeroSwap = true;
          const idx = combat.turns.findIndex((t) => t.id === combatantId);
          if (idx >= 0 && game.user.isGM) {
            await combat.update({ turn: idx });
          } else {
            this.render();
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
