import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("TORO 사용 가이드"),



  new SlashCommandBuilder()
    .setName("login")
    .setDescription("TORO 팀 로그인/가입 상태 확인"),

  new SlashCommandBuilder()
    .setName("team")
    .setDescription("TORO 팀 관리")
    .addSubcommand(sub =>
      sub.setName("create")
        .setDescription("새 TORO 팀 생성")
        .addStringOption(opt =>
          opt.setName("name").setDescription("팀 이름").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("invite")
        .setDescription("현재 팀 초대 코드 생성")
    )
    .addSubcommand(sub =>
      sub.setName("join")
        .setDescription("초대 코드로 TORO 팀 가입")
        .addStringOption(opt =>
          opt.setName("code").setDescription("초대 코드").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("switch")
        .setDescription("사용할 TORO 팀 선택")
        .addStringOption(opt =>
          opt.setName("team").setDescription("팀 슬러그").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("내 TORO 팀 정보 확인")
    )
    .addSubcommand(sub =>
      sub.setName("members")
        .setDescription("현재 TORO 팀 멤버 확인")
    ),



  new SlashCommandBuilder()
    .setName("calendar")
    .setDescription("팀 Google Calendar 관리")
    .addSubcommand(sub => sub.setName("connect").setDescription("팀 캘린더 연결 링크 생성"))
    .addSubcommand(sub => sub.setName("status").setDescription("팀 캘린더 연결 상태 확인"))
    .addSubcommand(sub => sub.setName("disconnect").setDescription("팀 캘린더 연결 해제"))
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("팀 일정 조회")
        .addStringOption(opt => opt.setName("range").setDescription("오늘|이번주|다음주").addChoices(
          { name: "오늘", value: "오늘" },
          { name: "이번주", value: "이번주" },
          { name: "다음주", value: "다음주" },
        ))
    )
    .addSubcommand(sub =>
      sub.setName("add")
        .setDescription("팀 일정 추가")
        .addStringOption(opt => opt.setName("title").setDescription("일정 제목").setRequired(true))
        .addStringOption(opt => opt.setName("date").setDescription("날짜").setRequired(true))
        .addStringOption(opt => opt.setName("time").setDescription("시간"))
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
