import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("TORO 사용 가이드"),

  new SlashCommandBuilder()
    .setName("mode")
    .setDescription("봇 프리셋 관리")
    .addSubcommand(sub =>
      sub.setName("list").setDescription("프리셋 목록 보기")
    )
    .addSubcommand(sub =>
      sub.setName("set").setDescription("프리셋 변경")
        .addStringOption(opt =>
          opt.setName("preset").setDescription("적용할 프리셋").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("current").setDescription("현재 프리셋 확인")
    ),

  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("봇에게 질문하기")
    .addStringOption(opt =>
      opt.setName("message").setDescription("메시지 내용").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("봇 상태 확인"),

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
          { name: "Flash (빠름)", value: "flash" },
          { name: "Pro (고품질)", value: "pro" },
        )
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("봇이 음성으로 답변해줘 (TTS)")
    .addStringOption(opt =>
      opt.setName("message").setDescription("말할 내용").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("voice").setDescription("음성 선택")
        .addChoices(
          { name: "Kore (여성, 차분)", value: "kore" },
          { name: "Aoede (여성, 밝음)", value: "aoede" },
          { name: "Leda (여성, 따뜻)", value: "leda" },
          { name: "Puck (남성, 활발)", value: "puck" },
          { name: "Charon (남성, 낮음)", value: "charon" },
          { name: "Fenrir (남성, 부드러움)", value: "fenrir" },
        )
    ),

  new SlashCommandBuilder()
    .setName("내정보")
    .setDescription("봇이 기억하는 내 정보 확인")
    .addUserOption(opt =>
      opt.setName("user").setDescription("다른 유저 정보 확인 (선택)")
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("이 채널에서 봇 임시 정지/해제")
    .addIntegerOption(opt =>
      opt.setName("minutes").setDescription("정지 시간 (분, 기본 30분, 0이면 해제)").setMinValue(0).setMaxValue(1440)
    ),

  new SlashCommandBuilder()
    .setName("mute-status")
    .setDescription("이 채널의 음소거 남은 시간 확인"),

  new SlashCommandBuilder()
    .setName("reply")
    .setDescription("봇 응답 모드 변경")
    .addStringOption(opt =>
      opt.setName("mode").setDescription("응답 모드").setRequired(true)
        .addChoices(
          { name: "자동 (AI 판단)", value: "auto" },
          { name: "간격 (타이머/메시지 수)", value: "interval" },
          { name: "음소거", value: "mute" },
        )
    )
    .addIntegerOption(opt =>
      opt.setName("interval").setDescription("간격 모드: 타이머 (초, 기본 120)").setMinValue(10).setMaxValue(600)
    )
    .addIntegerOption(opt =>
      opt.setName("threshold").setDescription("간격 모드: 메시지 수 (기본 5)").setMinValue(1).setMaxValue(50)
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
