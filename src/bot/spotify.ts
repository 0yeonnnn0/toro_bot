import SpotifyWebApi from "spotify-web-api-node";

const spotify = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID || "",
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
});

let tokenExpiresAt = 0;

async function ensureToken(): Promise<void> {
  if (Date.now() < tokenExpiresAt - 60000) return; // 1분 여유
  try {
    const data = await spotify.clientCredentialsGrant();
    spotify.setAccessToken(data.body.access_token);
    tokenExpiresAt = Date.now() + data.body.expires_in * 1000;
    console.log("Spotify 토큰 갱신 완료");
  } catch (err) {
    console.error("Spotify 토큰 발급 실패:", (err as Error).message);
  }
}

export interface SpotifyTrack {
  title: string;
  artist: string;
  query: string; // 유튜브 검색용
}

// 곡 제목 + 아티스트로 Spotify에서 검색 → 추천 곡 반환
export async function getRecommendations(title: string, artist: string | null, limit: number = 5): Promise<SpotifyTrack[]> {
  if (!process.env.SPOTIFY_CLIENT_ID) return [];

  try {
    await ensureToken();

    // 1. Spotify에서 원곡 검색
    const searchQuery = artist ? `${title} artist:${artist}` : title;
    const searchResult = await spotify.searchTracks(searchQuery, { limit: 1, market: "KR" });
    const tracks = searchResult.body.tracks?.items;
    if (!tracks || tracks.length === 0) return [];

    const seedTrack = tracks[0];
    const seedArtist = seedTrack.artists[0]?.id;

    // 2. 추천 요청
    const seedOptions: any = {
      seed_tracks: [seedTrack.id],
      limit,
      market: "KR",
    };
    if (seedArtist) seedOptions.seed_artists = [seedArtist];
    const rec = await spotify.getRecommendations(seedOptions);

    return rec.body.tracks.map(t => ({
      title: t.name,
      artist: t.artists.map(a => a.name).join(", "),
      query: `${t.artists[0]?.name || ""} ${t.name}`,
    }));
  } catch (err: any) {
    const msg = err?.body?.error?.message || err?.message || JSON.stringify(err);
    console.error("Spotify 추천 실패:", msg, "| status:", err?.statusCode || err?.status || "unknown");
    return [];
  }
}

// Spotify 연결 가능한지 확인
export function isConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}
