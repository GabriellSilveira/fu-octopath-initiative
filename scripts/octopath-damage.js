class FUOctopathDamage {
  static activePopups = new Set();

  static ELEMENT_MAP = {
    air:    { key: "air",    iconClass: "fu-air" },
    wind:   { key: "air",    iconClass: "fu-air" },
    bolt:   { key: "bolt",   iconClass: "fu-bolt" },
    lightning: { key: "bolt", iconClass: "fu-bolt" },
    dark:   { key: "dark",   iconClass: "fu-dark" },
    earth:  { key: "earth",  iconClass: "fu-earth" },
    fire:   { key: "fire",   iconClass: "fu-fire" },
    ice:    { key: "ice",    iconClass: "fu-ice" },
    light:  { key: "light",  iconClass: "fu-light" },
    poison: { key: "poison", iconClass: "fu-poison" }
  };

  /**
   * Suprime os números flutuantes nativos do Foundry (-16 HP, +10 HP, etc.)
   * sem afetar notificações de status (ex: +(Crise), +Abalado).
   */
  static patchNativeScrollingText() {
    if (!canvas?.interface?.createScrollingText) return;
    if (canvas.interface.createScrollingText._fuOctoPatched) return;

    const original = canvas.interface.createScrollingText.bind(canvas.interface);
    const wrapped = function (origin, content, options = {}) {
      const text = String(content ?? "").trim();
      if (/^[+-]?\d+\s*(HP|PV|MP|PM|IP|PI)?$/i.test(text)) {
        return Promise.resolve(null);
      }
      return original(origin, content, options);
    };

    wrapped._fuOctoPatched = true;
    canvas.interface.createScrollingText = wrapped;
  }

  /**
   * Identifica se o dano aplicado pertence a algum dos 8 elementos de Fabula Ultima
   */
  static detectElement(wrapper) {
    const inlineDmg = wrapper.querySelector(".inline-damage");
    const iconEl = inlineDmg?.querySelector("i") ?? wrapper.querySelector("i[class*='fu-']");

    if (iconEl) {
      for (const cls of iconEl.classList) {
        if (cls === "fu-icon" || cls.startsWith("fu-icon--")) continue;
        if (cls === "fu-physical") return null;

        const slug = cls.replace(/^fu-/, "").toLowerCase();
        if (this.ELEMENT_MAP[slug]) {
          return {
            key: this.ELEMENT_MAP[slug].key,
            iconClass: cls
          };
        }
      }
    }

    const typeText = (inlineDmg?.textContent || "").trim().toLowerCase();
    if (!typeText || /f[íi]sico|physical/.test(typeText)) return null;

    if (/\bar\b|wind|air/.test(typeText)) return this.ELEMENT_MAP.air;
    if (/raio|bolt|lightning/.test(typeText)) return this.ELEMENT_MAP.bolt;
    if (/trevas|dark/.test(typeText)) return this.ELEMENT_MAP.dark;
    if (/terra|earth/.test(typeText)) return this.ELEMENT_MAP.earth;
    if (/fogo|fire/.test(typeText)) return this.ELEMENT_MAP.fire;
    if (/gelo|ice/.test(typeText)) return this.ELEMENT_MAP.ice;
    if (/luz|light/.test(typeText)) return this.ELEMENT_MAP.light;
    if (/veneno|poison/.test(typeText)) return this.ELEMENT_MAP.poison;

    return null;
  }

  /**
   * Analisa a mensagem criada pelo botão "Aplicar Dano" do projectfu
   */
  static parseDamageMessage(message) {
    if (!message?.content) return null;

    // Ignora mensagens antigas ao recarregar a página
    if (message.timestamp && Date.now() - message.timestamp > 15000) return null;

    const fuFlags = message.flags?.projectfu ?? {};

    // Ignora o card de rolagem de ataque (que possui Check ou o botão "Aplicar Dano")
    if (fuFlags.Check) return null;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = message.content;
    if (wrapper.querySelector('[data-action="applyDamage"], .apply-damage')) return null;

    const rawText = (wrapper.textContent || "").replace(/\s+/g, " ").trim();
    const flavor = String(message.flavor ?? "").trim();
    const combinedInfo = `${flavor} ${rawText}`;

    const revertBtn = wrapper.querySelector('[data-action="revertDamage"]');
    const revertAmount = revertBtn ? Math.abs(parseInt(revertBtn.dataset.amount ?? "0", 10)) : 0;
    const hpMatch = rawText.match(/(\d+)\s*HP/i);
    const parsedHp = hpMatch ? parseInt(hpMatch[1], 10) : 0;
    const flagDamage = typeof fuFlags.Damage === "number" ? Math.abs(fuFlags.Damage) : 0;
    const flagHealing = typeof fuFlags.Healing === "number" ? Math.abs(fuFlags.Healing) : 0;

    const amount = flagDamage || flagHealing || revertAmount || parsedHp;
    const element = this.detectElement(wrapper);

    // 1. Absorção (Verde: +XYZ + ABSORÇÃO)
    if (/absor[çc][ãa]o|absorveu|absorbed|absorption/i.test(combinedInfo)) {
      return {
        type: "absorb",
        label: "ABSORÇÃO",
        valueText: `+${amount || 0}`,
        element
      };
    }

    // 2. Imunidade (Azul: 000 + IMUNE)
    if (/imunidade|imune|immunity|immune/i.test(combinedInfo)) {
      return {
        type: "immune",
        label: "IMUNE",
        valueText: "000",
        element
      };
    }

    // Confirma que é realmente uma mensagem de dano aplicado
    const isDamageApplied =
      typeof fuFlags.Damage === "number" ||
      Boolean(revertBtn) ||
      /(?:perdeu|sofreu|lost|took|suffered)\s+\d+\s*HP/i.test(rawText);

    if (!isDamageApplied) return null;

    // 3. Vulnerável (XYZ + FRACO)
    if (/vulnerabilidade|vulner[áa]vel|vulnerability|vulnerable/i.test(combinedInfo)) {
      return {
        type: "weak",
        label: "FRACO",
        valueText: String(amount),
        element
      };
    }

    // 4. Dano Normal ou Resistente
    return {
      type: "damage",
      label: "",
      valueText: String(amount),
      element
    };
  }

  /**
   * Localiza o token alvo na cena atual a partir do speaker da mensagem
   */
  static resolveTargetToken(message) {
    if (!canvas?.tokens) return null;

    const speaker = message.speaker ?? {};
    if (speaker.scene && speaker.scene !== canvas.scene?.id) return null;

    let token = null;

    if (speaker.token) {
      token = canvas.tokens.get(speaker.token) ?? null;
    }

    if (!token && speaker.actor) {
      token = canvas.tokens.placeables.find((t) => t.actor?.id === speaker.actor && t.visible) ?? null;
    }

    if (!token && speaker.alias) {
      token = canvas.tokens.placeables.find((t) => t.name === speaker.alias && t.visible) ?? null;
    }

    if (!token) return null;
    if (!game.user.isGM && !token.visible) return null;

    return token;
  }

  /**
   * Cria e anima o popup flutuante à direita do token
   */
  static spawnPopup(token, data) {
    if (!canvas?.stage) return;

    const container = document.createElement("div");
    container.classList.add("fu-octo-dmg-popup", `fu-octo-dmg-${data.type}`);

    if (data.element) {
      container.classList.add(`fu-octo-elem-${data.element.key}`);
    }

    // Pequeno deslocamento caso vários ataques acertem em sequência
    const jitterX = (Math.random() - 0.5) * 12;
    const jitterY = (Math.random() - 0.5) * 24;

    let labelHTML = "";
    if (data.label) {
      const sparkleHTML = data.type === "weak" ? `<span class="fu-octo-dmg-sparkle">✦</span>` : "";
      labelHTML = `
        <div class="fu-octo-dmg-label-row">
          ${sparkleHTML}
          <span class="fu-octo-dmg-label">${data.label}</span>
        </div>
      `;
    }

    const chars = Array.from(data.valueText);
    const digitsHTML = chars
      .map(
        (char, idx) => `
          <span class="fu-octo-dmg-digit" style="--char-idx: ${idx};">
            <span class="fu-octo-dmg-outline" aria-hidden="true">${char}</span>
            <span class="fu-octo-dmg-fill">${char}</span>
          </span>
        `
      )
      .join("");

    const elementIconHTML = data.element
      ? `
        <span class="fu-octo-dmg-elem-wrap" style="--char-idx: ${chars.length};">
          <i class="fu-icon fu-octo-dmg-elem-icon ${data.element.iconClass}" aria-hidden="true"></i>
        </span>
      `
      : "";

    container.innerHTML = `
      ${labelHTML}
      <div class="fu-octo-dmg-digits">
        ${digitsHTML}
        ${elementIconHTML}
      </div>
    `;

    document.body.appendChild(container);

    const entry = {
      token,
      element: container,
      jitterX,
      jitterY
    };

    this.activePopups.add(entry);
    this.updatePosition(entry);

    const totalSteps = chars.length + (data.element ? 1 : 0);
    const totalDuration = 2300 + totalSteps * 65;
    setTimeout(() => {
      container.remove();
      this.activePopups.delete(entry);
    }, totalDuration);
  }

  static updatePosition(entry) {
    if (!entry?.token || entry.token.destroyed || !canvas?.stage) return;

    // Posiciona à direita do token, na altura do tronco/ombro
    const worldPoint = {
      x: entry.token.x + entry.token.w * 1.08,
      y: entry.token.y + entry.token.h * 0.38
    };
    const screenPos = canvas.stage.worldTransform.apply(worldPoint);

    entry.element.style.left = `${screenPos.x + entry.jitterX}px`;
    entry.element.style.top = `${screenPos.y + entry.jitterY}px`;
  }

  static updateAllPositions() {
    for (const entry of this.activePopups) {
      this.updatePosition(entry);
    }
  }
}

Hooks.once("ready", () => FUOctopathDamage.patchNativeScrollingText());
Hooks.on("canvasReady", () => FUOctopathDamage.patchNativeScrollingText());

Hooks.on("createChatMessage", (message) => {
  const parsed = FUOctopathDamage.parseDamageMessage(message);
  if (!parsed) return;

  const token = FUOctopathDamage.resolveTargetToken(message);
  if (!token) return;

  FUOctopathDamage.spawnPopup(token, parsed);
});

Hooks.on("canvasPan", () => FUOctopathDamage.updateAllPositions());
