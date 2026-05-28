import type { ChatInputCommandInteraction } from "discord.js";
import { readUserNote } from "../vault";

// ── /내정보 ──
export async function handleMyInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") || interaction.user;
  const note = readUserNote({ discordUserId: target.id, displayName: target.displayName });

  if (!note) {
    await interaction.reply({
      content: `**${target.displayName}**에 대한 기록이 아직 없어`,
      ephemeral: true,
    });
    return;
  }

  // Strip frontmatter for display
  const display = note.replace(/^---[\s\S]*?---\n*/, "").trim();
  const truncated = display.length > 1800 ? display.slice(0, 1800) + "\n..." : display;

  const embed = {
    color: 0x6c8aff,
    title: `📋 ${target.displayName}`,
    description: truncated,
    footer: { text: "TORO Vault" },
    timestamp: new Date().toISOString(),
  };

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
