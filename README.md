# Fabula Ultima - Octopath Initiative Carousel

A lightweight Foundry VTT module for the **Fabula Ultima (`projectfu`)** system that replaces the need to keep the Combat Tracker open with an animated, horizontal diamond turn carousel inspired by **Octopath Traveler**.

Designed for Fabula Ultima's free-initiative combat flow, it tracks remaining actions per round, highlights who is currently acting, and previews the upcoming round directly on the canvas HUD.

---

## Features

- **Octopath-Style Diamond Carousel:** Displays the active combatant inside a large rotated diamond with a round counter banner, followed by a horizontal track of upcoming turns.
- **Free-Initiative & Multi-Action Support:** Automatically detects when a character takes their turn in `projectfu` and displays multiple diamonds for bosses or Champions with multiple turns per round.
- **Current & Next Round Queues:** Shows everyone who still has actions left in the active round alongside a preview of the **Next Round** queue.
- **Smooth Turn-Swap Animations:** Animates the active portrait into the main diamond whenever initiative passes from one combatant to another.
- **Allies vs. Enemies Color Coding:** Glows blue for friendly tokens and red for enemies, while keeping GM-hidden combatants invisible to players.
- **Interactive Canvas Integration:**
  - **Hover:** Hovering over any diamond highlights the corresponding token on the battlemap (and triggers compatible token hover modules).
  - **Click:** Clicking a diamond directly triggers that combatant's turn without opening the sidebar Combat Tracker.

---

## Installation

1. Open **Foundry VTT** and navigate to the **Add-on Modules** tab.
2. Click **Install Module** at the bottom of the window.
3. Paste the following URL into the **Manifest URL** field:
   ```text
   https://raw.githubusercontent.com/GabriellSilveira/fu-octopath-initiative/main/module.json