class FUOctopathDamage {
  static activePopups = new Set();

  /**
   * Analisa a mensagem criada pelo botão "Aplicar Dano" do projectfu
   */
  static parseDamageMessage(message) {
    if (!message?.content) return null;

    // Ignora mensagens antigas caso algum hook dispare fora de hora
    if (message.timestamp && Date.now() - message.timestamp > 15000) return null;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = message.content;
    const rawText = (wrapper.textContent || "").replace(/\s+/g, " ").trim();
    if (!rawText) return null;

    // Ignora o card de rolagem de ataque (que ainda contém o botão "Aplicar Dano")
    if (wrapper.querySelector('[data-action="applyDamage"], .apply-damage')) return null;

    const hpMatch = rawText.match(/(\d+)\s*HP/i);
    const amount = hpMatch ? parseInt(hpMatch[1], 10) : 0;

    // 1. Absorção (Verde: +XYZ + ABSORÇÃO)
    if (/absor[çc][ãa]o|absorveu|absorbed|absorption/i.test(rawText) && amount > 0) {
      return {
        type: "absorb",
        label: "ABSORÇÃO",
        valueText: `+${amount}`
      };
    }

    // 2. Imunidade (Azul: 000 + IMUNE)
    if (/imunidade|imune\s+a|immunity|immune\s+to/i.test(rawText)) {
      return {
        type: "immune",
        label: "IMUNE",
        valueText: "000"
      };
    }

    // Verifica se houve perda de HP aplicada
    const lostHpMatch = rawText.match(/(?:perdeu|sofreu|lost|took|suffered)\s+(\d+)\s*HP/i);
    if (!lostHpMatch) return null;

    const damageValue = parseInt(lostHpMatch[1], 10);

    // 3. Vulnerável (Vermelho: XYZ + FRACO)
    if (/vulnerabilidade|vulner[áa]vel|vulnerability|vulnerable/i.test(rawText)) {
      return {
        type: "weak",
        label: "FRACO",
        valueText: String(damageValue)
      };
    }

    // 4. Dano Normal ou Resistente (Vermelho: XYZ)
    return {
      type: "damage",
      label: "",
      valueText: String(damageValue)
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
   * Cria e anima o popup flutuante sobre o token
   */
  static spawnPopup(token, data) {
    if (!canvas?.stage) return;

    const container = document.createElement("div");
    container.classList.add("fu-octo-dmg-popup", `fu-octo-dmg-${data.type}`);

    // Pequeno deslocamento aleatório para múltiplos hits seguidos não se sobreporem
    const jitterX = (Math.random() - 0.5) * 28;
    const jitterY = (Math.random() - 0.5) * 14;

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
          <span class="fu-octo-dmg-char"
                data-char="${char}"
                style="--char-idx: ${idx};">${char}</span>
        `
      )
      .join("");

    container.innerHTML = `
      ${labelHTML}
      <div class="fu-octo-dmg-digits">
        ${digitsHTML}
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

    // Tempo total da animação em onda (1.65s + atraso dos dígitos)
    const totalDuration = 1650 + chars.length * 70;
    setTimeout(() => {
      container.remove();
      this.activePopups.delete(entry);
    }, totalDuration);
  }

  static updatePosition(entry) {
    if (!entry?.token || entry.token.destroyed || !canvas?.stage) return;

    // Posiciona na parte superior/central do token atingido
    const worldPoint = {
      x: entry.token.x + entry.token.w * 0.52,
      y: entry.token.y + entry.token.h * 0.22
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

Hooks.on("createChatMessage", (message) => {
  const parsed = FUOctopathDamage.parseDamageMessage(message);
  if (!parsed) return;

  const token = FUOctopathDamage.resolveTargetToken(message);
  if (!token) return;

  FUOctopathDamage.spawnPopup(token, parsed);
});

Hooks.on("canvasPan", () => FUOctopathDamage.updateAllPositions());
