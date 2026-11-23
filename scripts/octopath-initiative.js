class FUOctopathInitiative {
  static container = null;
  static lastHeroId = null;
  static animateHeroSwap = false;
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
    return document.querySelector(`[data-combatant-id="${combatantId}"]`);
  }

  /**
   * Obtém o total de ações por rodada do combatente (1 para aliados, 2+ para Elite/Campeão)
   */
  static getMaxTurns(combatant) {
    const observed = this.observedMaxTurns.get(combatant.id);
    if (typeof observed === "number" && observed > 0) return observed;

    const actor = combatant.actor;
    const rank = actor?.system?.rank;

    if (rank === "elite" || rank?.value === "elite") return 2;
    if (rank === "champion" || rank?.value === "champion") {
      const soldiers = Number(rank?.replacedSoldiers ?? actor?.system?.rankValue ?? 2);
      return Math.max(2, soldiers);
    }

    const sysTurns = actor?.system?.turns;
    if (typeof sysTurns === "number" && sysTurns > 0) return sysTurns;
    if (typeof sysTurns?.max === "number" && sysTurns.max > 0) return sysTurns.max;

    return 1;
  }

  /**
   * Calcula quantas ações futuras ainda restam para o combatente na rodada atual
   */
  static getRemainingTurns(combat, combatant) {
    const roundKey = String(combat.round);
    const takenMap = combat.getFlag("projectfu", "CombatantsTurnTaken") ?? {};
    const takenList = Array.isArray(takenMap[roundKey]) ? takenMap[roundKey] : [];
    const takenCount = takenList.filter((id) => id === combatant.id).length;

    // Se o ícone counter_N estiver visível no tracker, sincroniza o máximo observado
    const row = this.getTrackerRow(combatant.id);
    const matIcon = row?.querySelector(".token-initiative .mats-o");
    const iconText = matIcon?.textContent?.trim() ?? "";
    const counterMatch = iconText.match(/^counter_(\d+)$/);

    if (counterMatch) {
      const domRemaining = parseInt(counterMatch[1], 10);
      const totalObserved = takenCount + domRemaining;
      if (totalObserved > (this.observedMaxTurns.get(combatant.id) ?? 0)) {
        this.observedMaxTurns.set(combatant.id, totalObserved);
      }
      return domRemaining;
    }

    const maxTurns = this.getMaxTurns(combatant);
    return Math.max(0, maxTurns - takenCount);
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
      this.observedMaxTurns.clear();
      return;
    }

    const combatants = combat.combatants.filter((c) => this.isVisibleToUser(c));
    if (!combatants.length) {
      this.container.classList.add("fu-octo-hidden");
      return;
    }

    // 1. Quem está agindo exatamente agora segundo a flag oficial do projectfu
    const activeId = combat.getFlag("projectfu", "CombatantId") || combat.current?.combatantId || null;
    const actingCombatant = activeId ? combatants.find((c) => c.id === activeId) ?? null : null;
    const isActivelyPlaying = Boolean(actingCombatant);

    // 2. Fila de espera da rodada atual (apenas quem ainda tem turnos futuros > 0)
    const currentRoundQueue = [];
    for (const c of combatants) {
      const rem = this.getRemainingTurns(combat, c);
      for (let i = 0; i < rem; i++) {
        currentRoundQueue.push(c);
      }
    }

    // Ordena priorizando o lado indicado por CurrentTurn (ou oposto a quem está agindo)
    const currentSide = combat.getFlag("projectfu", "CurrentTurn");
    const preferAllyFirst = isActivelyPlaying
      ? !this.isAlly(actingCombatant)
      : currentSide !== "hostile";

    currentRoundQueue.sort((a, b) => {
      const aMatch = this.isAlly(a) === preferAllyFirst ? 0 : 1;
      const bMatch = this.isAlly(b) === preferAllyFirst ? 0 : 1;
      return aMatch - bMatch;
    });

    // 3. Define quem ocupa o Losango Principal
    let heroCombatant = actingCombatant;
    if (!heroCombatant) {
      // Entre turnos (ninguém clicou em agir ainda): puxa o primeiro da fila em standby
      heroCombatant = currentRoundQueue.shift() ?? combatants[0];
    }

    if (heroCombatant.id !== this.lastHeroId) {
      this.lastHeroId = heroCombatant.id;
      this.animateHeroSwap = true;
    }

    // 4. Fila da Próxima Rodada
    const nextRoundQueue = [];
    for (const c of combatants) {
      const maxT = this.getMaxTurns(c);
      for (let i = 0; i < maxT; i++) {
        nextRoundQueue.push(c);
      }
    }

    const heroIsAlly = this.isAlly(heroCombatant);
    const heroSideClass = heroIsAlly ? "fu-octo-ally" : "fu-octo-enemy";
    const heroStateClass = isActively
