class FUOctopathInitiative {
  static container = null;
  static lastHeroId = null;
  static animateHeroSwap = false;
  static observedMaxTurns = new Map();
  static collapseLevel = 0; // 0 = completo | 1 = sem próxima rodada | 2 = apenas destaque

  static init() {
    if (this.container && document.body.contains(this.container)) return;
    document.getElementById("fu-octopath-hud")?.remove();
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
      `#combat [data-combatant-id="${combatantId}"], ` +
      `#combat-popout [data-combatant-id="${combatantId}"], ` +
      `.combat-tracker [data-combatant-id="${combatantId}"]`
    );
  }

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

  static getRemainingTurns(combat, combatant) {
    const roundKey = String(combat.round ?? 1);
    const takenMap = combat.getFlag("projectfu", "CombatantsTurnTaken");
    const takenList = takenMap && Array.isArray(takenMap[roundKey]) ? takenMap[roundKey] : [];
    const takenCount = takenList.filter((id) => id === combatant.id).length;

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

  static applyCollapseClasses() {
    if (!this.container) return;
    this.container.classList.toggle("fu-octo-collapse-1", this.collapseLevel === 1);
    this.container.classList.toggle("fu-octo-collapse-2", this.collapseLevel === 2);
  }

  static cycleCollapse() {
    this.collapseLevel = (this.collapseLevel + 1) % 3;
    this.applyCollapseClasses();
  }

  static render() {
    try {
      this.init();
      const combat = this.getCombat();

      if (!combat) {
        this.container.classList.add("fu-octo-hidden");
        this.lastHeroId = null;
        this.observedMaxTurns.clear();
        this.collapseLevel = 0;
        this.applyCollapseClasses();
        return;
      }

      const combatants = combat.combatants.filter((c) => this.isVisibleToUser(c));
      if (!combatants.length) {
        this.container.classList.add("fu-octo-hidden");
        return;
      }

      const activeId = combat.getFlag("projectfu", "CombatantId") || combat.current?.combatantId || null;
      const actingCombatant = activeId ? combatants.find((c) => c.id === activeId) ?? null : null;
      const isActivelyPlaying = Boolean(actingCombatant);

      const currentRoundQueue = [];
      for (const c of combatants) {
        let rem = this.getRemainingTurns(combat, c);
        if (actingCombatant && c.id === actingCombatant.id) {
          rem = Math.max(0, rem - 1);
        }
        for (let i = 0; i < rem; i++) {
          currentRoundQueue.push(c);
        }
      }

      const currentSide = combat.getFlag("projectfu", "CurrentTurn");
      const preferAllyFirst = isActivelyPlaying
        ? !this.isAlly(actingCombatant)
        : currentSide !== "hostile";

      currentRoundQueue.sort((a, b) => {
        const aMatch = this.isAlly(a) === preferAllyFirst ? 0 : 1;
        const bMatch = this.isAlly(b) === preferAllyFirst ? 0 : 1;
        return aMatch - bMatch;
      });

      const currentHeroKey = actingCombatant ? actingCombatant.id : "__none__";
      if (currentHeroKey !== this.lastHeroId) {
        this.lastHeroId = currentHeroKey;
        this.animateHeroSwap = true;
      }

      const nextRoundQueue = [];
      for (const c of combatants) {
        const maxT = this.getMaxTurns(c);
        for (let i = 0; i < maxT; i++) {
          nextRoundQueue.push(c);
        }
      }

      const heroAnimClass = this.animateHeroSwap ? "fu-octo-hero-swap" : "";
      this.animateHeroSwap = false;

      const escape = (str) => foundry.utils.escapeHTML(String(str ?? ""));

      let heroHTML = "";
      if (actingCombatant) {
        const heroIsAlly = this.isAlly(actingCombatant);
        const heroSideClass = heroIsAlly ? "fu-octo-ally" : "fu-octo-enemy";
        const heroHiddenClass = actingCombatant.hidden ? "fu-octo-secret" : "";
        const heroSafeName = escape(actingCombatant.name);

        heroHTML = `
          <div class="fu-octo-hero ${heroSideClass} fu-octo-is-acting ${heroHiddenClass} ${heroAnimClass}"
               data-combatant-id="${actingCombatant.id}"
               data-is-hero="true"
               title="${heroSafeName} (Clique para retrair/expandir barra)">
            <div class="fu-octo-portrait-wrap">
              <img src="${this.getPortrait(actingCombatant)}" alt="${heroSafeName}" />
            </div>
            <span class="fu-octo-chevron fu-octo-chev-left">‹</span>
            <span class="fu-octo-chevron fu-octo-chev-right">›</span>
            <span class="fu-octo-tooltip">${heroSafeName}</span>
          </div>
        `;
      } else {
        heroHTML = `
          <div class="fu-octo-hero fu-octo-neutral fu-octo-is-acting ${heroAnimClass}"
               data-is-hero="true"
               title="Aguardando turno (Clique para retrair/expandir barra)">
            <div class="fu-octo-portrait-wrap">
              <span class="fu-octo-unknown-icon">?</span>
            </div>
            <span class="fu-octo-chevron fu-octo-chev-left">‹</span>
            <span class="fu-octo-chevron fu-octo-chev-right">›</span>
          </div>
        `;
      }

      const renderDiamond = (c, index) => {
        const sideClass = this.isAlly(c) ? "fu-octo-ally" : "fu-octo-enemy";
        const secretClass = c.hidden ? "fu-octo-secret" : "";
        const safeName = escape(c.name);
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

      this.container.innerHTML = `
        <div class="fu-octo-wrapper">
          ${heroHTML}

          <div class="fu-octo-round-banner">
            <span class="fu-octo-round-label">Rodada</span>
            <span class="fu-octo-round-num">${combat.round}</span>
          </div>

          <div class="fu-octo-track">
            <div class="fu-octo-track-line"></div>

            <div class="fu-octo-queue fu-octo-current-queue">
              ${currentRoundQueue.map((c, idx) => renderDiamond(c, idx)).join("")}
            </div>

            <div class="fu-octo-next-section">
              <div class="fu-octo-next-label">Próxima Rodada</div>
              <div class="fu-octo-queue fu-octo-next-queue">
                ${nextRoundQueue.map((c, idx) => renderDiamond(c, idx)).join("")}
              </div>
            </div>
          </div>
        </div>
      `;

      this.applyCollapseClasses();
      this.container.classList.remove("fu-octo-hidden");
      this.bindEvents();
    } catch (err) {
      console.error("[fu-octopath-initiative] Erro ao renderizar HUD:", err);
    }
  }

  static bindEvents() {
    if (!this.container) return;

    const heroEl = this.container.querySelector(".fu-octo-hero");
    if (heroEl) {
      heroEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.cycleCollapse();
      });
    }

    const nodes = this.container.querySelectorAll("[data-combatant-id]");
    nodes.forEach((el) => {
      const combatantId = el.dataset.combatantId;
      if (!combatantId) return;
      const isHero = el.dataset.isHero === "true";

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

      if (!isHero) {
        el.addEventListener("click", () => {
          const combat = this.getCombat();
          const combatant = combat?.combatants.get(combatantId);
          if (!combat || !combatant) return;
          if (!game.user.isGM && !combatant.isOwner) return;

          const row = this.getTrackerRow(combatantId);
          if (!row) return;

          const actionBtn = row.querySelector('[data-action="takeTurn"]');
          actionBtn?.click();
        });
      }
    });
  }
}

Hooks.once("ready", () => FUOctopathInitiative.render());
Hooks.on("combatStart", () => FUOctopathInitiative.render());
Hooks.on("updateCombat", () => FUOctopathInitiative.render());
Hooks.on("updateCombatant", () => FUOctopathInitiative.render());
Hooks.on("createCombatant", () => FUOctopathInitiative.render());
Hooks.on("deleteCombatant", () => FUOctopathInitiative.render());
Hooks.on("deleteCombat", () => FUOctopathInitiative.render());
Hooks.on("renderCombatTracker", () => FUOctopathInitiative.render());
