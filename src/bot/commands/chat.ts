import { ChatInputCommandInteraction, TextChannel, ChannelType } from "discord.js";
import { getReply } from "../ai";

// ── /ask ──
export async function handleQuestion(interaction: ChatInputCommandInteraction): Promise<void> {
  const message = interaction.options.getString("message", true);
  await interaction.deferReply();

  try {
    const history = [{ role: "user" as const, content: `${interaction.user.displayName}: ${message}` }];
    const reply = await getReply(history, "", interaction.user.id);
    await interaction.editReply(reply);
  } catch (err) {
    const isRateLimit = (err as Error).message?.includes("429") || (err as Error).message?.includes("quota");
    await interaction.editReply(
      isRateLimit
        ? "오늘은 너무 많이 떠들었다냥... 내일 다시 돌아온다냥! >w<"
        : "뭔가 고장났다냥... @д@ [CH]"
    );
  }
}

// ── /summary ──
export async function handleSummary(interaction: ChatInputCommandInteraction): Promise<void> {
  const count = interaction.options.getInteger("count") || 50;
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "텍스트 채널에서만 사용 가능해", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const messages = await (channel as TextChannel).messages.fetch({ limit: count });
    const sorted = [...messages.values()]
      .filter(m => !m.author.bot)
      .reverse();

    if (sorted.length === 0) {
      await interaction.editReply("요약할 메시지가 없어");
      return;
    }

    const chatLog = sorted.map(m =>
      `${m.author.displayName}: ${m.content}`
    ).join("\n");

    const summaryPrompt = `아래 디스코드 채팅 내용을 한국어로 요약해줘.
주요 주제별로 정리하고, 누가 뭘 말했는지 간략히 포함해.
3~5개 항목으로 정리해. 이모지 쓰지 마.

---
${chatLog}`;

    const history = [{ role: "user" as const, content: summaryPrompt }];
    const reply = await getReply(history, "", interaction.user.id);

    const embed = {
      color: 0x6c8aff,
      title: `💬 최근 ${sorted.length}개 메시지 요약`,
      description: reply,
      footer: { text: `#${(channel as TextChannel).name}` },
      timestamp: new Date().toISOString(),
    };

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply("요약하다가 고장났다냥... @д@ " + (err as Error).message);
  }
}
