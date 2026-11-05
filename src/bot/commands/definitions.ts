import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("TORO 사용 가이드"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("봇 상태 확인"),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("현재 채널에서 TORO 멘션 응답 잠시 끄기/다시 켜기")
    .addIntegerOption(opt =>
      opt.setName("minutes")
        .setDescription("음소거 시간(분). 0 입력 시 해제")
        .setMinValue(0)
        .setMaxValue(1440)
    ),

  new SlashCommandBuilder()
    .setName("mutestatus")
    .setDescription("현재 채널 TORO 음소거 상태 확인"),

  new SlashCommandBuilder()
    .setName("summary")
    .setDescription("최근 대화 AI 요약")
    .addIntegerOption(opt =>
      opt.setName("count").setDescription("요약할 메시지 수 (기본 50)").setMinValue(10).setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("draw")
    .setDescription("AI로 이미지 생성")
    .addStringOption(opt =>
      opt.setName("prompt").setDescription("그릴 내용").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("quality").setDescription("모델 품질")
        .addChoices(
          { name: "GPT Fast (빠름)", value: "flash" },
          { name: "GPT High (고품질)", value: "pro" },
        )
    ),


  // ── Music ──
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("유튜브 음악 재생")
    .addStringOption(opt =>
      opt.setName("query").setDescription("검색어 또는 유튜브 URL").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("현재 곡 스킵"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("음악 정지 + 퇴장"),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("일시정지 / 재개"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("대기열 보기"),

  new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("현재 재생 중인 곡"),

  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("볼륨 조절 (0~100)")
    .addIntegerOption(opt =>
      opt.setName("level").setDescription("볼륨 (0~100, 기본 50)").setMinValue(0).setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("자동 추천 재생 (장르 지정 가능)")
    .addStringOption(opt =>
      opt.setName("genre").setDescription("장르 (예: kpop, lofi, jazz, rock) 또는 off")
        .addChoices(
          { name: "끄기", value: "off" },
          { name: "K-Pop", value: "kpop" },
          { name: "Pop", value: "pop" },
          { name: "Hip-Hop", value: "hiphop" },
          { name: "R&B", value: "rnb" },
          { name: "Rock", value: "rock" },
          { name: "Jazz", value: "jazz" },
          { name: "Lofi", value: "lofi" },
          { name: "EDM", value: "edm" },
          { name: "Classical", value: "classical" },
          { name: "아티스트 기반 (기본)", value: "artist" },
        )
    ),

  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("대기열에서 곡 제거")
    .addIntegerOption(opt =>
      opt.setName("번호").setDescription("제거할 곡 번호 (/queue에서 확인)").setRequired(true).setMinValue(1)
    ),
];
