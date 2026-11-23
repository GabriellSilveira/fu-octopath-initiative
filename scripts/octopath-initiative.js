class FUOctopathInitiative {
  static container = null;
  static lastHeroId = null;
  static lastRound = null;
  static animateHeroSwap = false;
  static knownRemainingTurns = new Map();
  static observedMaxTurns = new Map();

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

  static getTrackerRow(combatantId) {
    return document.querySelector(
      `#combat .combat-tracker .combatant[data-combatant-id="${combatantId}"], ` +
      `#combat-popout .combat-tracker .combatant[data-combatant-id="${combatantId}"], ` +
      `.combat-tracker .combatant[data-combatant-id="${combatantId}"], ` +
      `#combat-tracker .combatant[data-combatant-id="${combatantId}"]`
    );
  }

  /**
   * Total de ações por rodada (1 para personagens normais, 2+ para Chefes/Campeões)
   */
  static getMaxTurns(combatant) {
    const observed = this.observedMaxTurns.get(combatant.id);
    if (typeof observed === "number" && observed > 0) return observed;

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
      const row = this.getTrackerRow(c.id);
      if (row && (row.classList.contains("active") || row.querySelector(".fa-play, .fa-circle-play, .fa-play-circle"))) {
        return c;
      }
    }

    return null;
  }

  /**
   * Lê quantos turnos ainda restam na fila de espera da rodada atual
   */
  static getRemainingQueueTurns(combat, combatant, actingCombatantId) {
    const row = this.getTrackerRow(combatant.id);
    const isCurrentlyActing = combatant.id === actingCombatantId;

    if (row) {
      // 1. Se já tem check (✓), terminou todas as ações da rodada
      if (row.querySelector(".fa-check, .fa-circle-check, .fa-check-circle")) {
        this.knownRemainingTurns.set(combatant.id, 0);
        return 0;
      }

      // 2. Se está agindo agora (▶), o turno atual já está no Losango Principal;
      // mantém na fila apenas turnos extras futuros (ex: chefe com 2+ ações)
      if (isCurrentlyActing || row.querySelector(".fa-play, .fa-circle-play, .fa-play-circle")) {
        const prev = this.knownRemainingTurns.get(combatant.id) ?? this.getMaxTurns(combatant);
        return Math.max(0, prev - 1);
      }

      // 3. Lê o número exibido no círculo à direita (1, 2, 3...)
      const candidates = row.querySelectorAll("a, button, span, div");
      for (const el of candidates) {
        if (el.children.length > 0) continue;
        const txt = el.textContent?.trim();
        if (txt && /^\d+$/.test(txt)) {
          const val = Math.max(0, parseInt(txt, 10));
          this.knownRemainingTurns.set(combatant.id, val);

          const prevMax = this.observedMaxTurns.get(combatant.id) ?? 1;
          if (val > prevMax) {
            this.observedMaxTurns.set(combatant.id, val);
          }
          return val;
        }
      }
    }

    // Fallback se a aba do tracker ainda não renderizou
    if (isCurrentlyActing) {
      const prev = this.knownRemainingTurns.get(combatant.id) ?? this.getMaxTurns(combatant);
      return Math.max(0, prev - 1);
    }

    if (this.knownRemainingTurns.has(combatant.id)) {
      return this.knownRemainingTurns.get(combatant.id);
    }

    return this.getMaxTurns(combatant);
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
      this.lastRound = null;
      this.knownRemainingTurns.clear();
      this.observedMaxTurns.clear();
      return;
    }

    // Limpa o histórico de turnos restantes ao virar a rodada
    if (this.lastRound !== combat.round) {
      this.lastRound = combat.round;
      this.knownRemainingTurns.clear();
    }

    const combatants = combat.combatants.filter((c) => this.isVisibleToUser(c));
    if (!combatants.length) {
      this.container.classList.add("fu-octo-hidden");
      return;
    }

    // Identifica quem está em evidência jogando agora (▶)
    const actingCombatant = this.getActingCombatant(combat, combatants);
    const isActivelyPlaying = Boolean(actingCombatant);

    // Monta a fila apenas com quem AINDA NÃO AGIU nesta rodada
    const currentRoundQueue = [];
    for (const c of combatants) {
      const rem = this.getRemainingQueueTurns(combat, c, actingCombatant?.id);
      for (let i = 0; i < rem; i++) {
        currentRoundQueue.push(c);
      }
    }

    // Se ninguém clicou para agir ainda (início da rodada), mostra o primeiro disponível em standby
    const heroCombatant = actingCombatant ?? currentRoundQueue[0] ?? combatants[0];

    if (heroCombatant.id !== this.lastHeroId) {
      this.lastHeroId = heroCombatant.id;
      this.animateHeroSwap = true;
    }

    // Se está em standby (ninguém com ▶ ainda), remove 1 cópia do heroCombatant da fila de espera para não duplicar
    if (!isActivelyPlaying) {
      const idx = currentRoundQueue.findIndex((c) => c.id === heroCombatant.id);
      if (idx >= 0) currentRoundQueue.splice(idx, 1);
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

        const row = this.getTrackerRow(combatantId);
        if (row) {
          // Procura especificamente o botão de turno à direita (evitando os botões de ocultar/derrotar/alvo)
          const turnBtn =
            row.querySelector('[data-action="takeTurn"], [data-action="startTurn"], [data-action="endTurn"]') ||
            Array.from(row.querySelectorAll("a, button")).find((btn) => {
              const txt = btn.textContent?.trim();
              return (txt && /^\d+$/.test(txt)) || btn.querySelector(".fa-play, .fa-circle-play");
            });

          if (turnBtn) {
            turnBtn.click();
            return;
          }
        }

        const idx = combat.turns.findIndex((t) => t.id === combatantId);
        if (idx >= 0 && game.user.isGM) {
          await combat.update({ turn: idx });
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
Hooks.on("updateCombat", () => setTimeout(() => FUOctopathInitiative.render(), 30));
Hooks.on("updateCombatant", () => setTimeout(() => FUOctopathInitiative.render(), 30));
Hooks.on("createCombatant", () => setTimeout(() => FUOctopathInitiative.render(), 30));
Hooks.on("deleteCombatant", () => setTimeout(() => FUOctopathInitiative.render(), 30));
Hooks.on("deleteCombat", () => FUOctopathInitiative.render());
Hooks.on("renderCombatTracker", () => FUOctopathInitiative.render());
