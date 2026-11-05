import { createHash } from "node:crypto";
import type { ContestCandidate, ContestTrack } from "./types";

interface GithubIssue {
  html_url: string;
  body: string | null;
  pull_request?: unknown;
}

interface ContestRepo {
  track: ContestTrack;
  repo: string;
}

const ALLOWED_SOURCE_HOSTS = new Set(["linkareer.com", "www.linkareer.com", "wevity.com", "www.wevity.com"]);

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function normalizedSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

export function canonicalContestKey(input: Pick<ContestCandidate, "sourceUrl"> & Partial<ContestCandidate>): string {
  const sourceUrl = normalizedSourceUrl(input.sourceUrl) || input.sourceUrl.trim();
  return createHash("sha256").update(sourceUrl).digest("hex").slice(0, 32);
}

export function parseContestIssueBody(body: string, track: ContestTrack, sourceIssueUrl: string): ContestCandidate[] {
  const heading = /^### \[([^\n]+)]\((https?:\/\/[^\s)]+)\)\s*$/gm;
  const matches = [...body.matchAll(heading)];
  const contests: ContestCandidate[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const sourceUrl = normalizedSourceUrl(match[2]);
    if (!sourceUrl) continue;
    const title = clamp(match[1], 256);
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    const section = body.slice(start, end);
    const deadline = section.match(/\*\*마감\*\*\s*(\d{4}-\d{2}-\d{2})/);
    if (!deadline) continue;

    const hostValue = section.match(/\*\*주최\*\*\s*(.+?)(?=\s*·\s*\*\*분야\*\*|\n|$)/)?.[1];
    const categoryValue = section.match(/\*\*분야\*\*\s*([^\n]+)/)?.[1];
    const summaryValue = section.match(/^>\s*(.+)$/m)?.[1];
    const host = hostValue ? clamp(hostValue, 1024) : null;
    const category = categoryValue ? clamp(categoryValue, 1024) : null;
    const summary = summaryValue ? clamp(summaryValue, 4096) : null;
    const candidate: ContestCandidate = {
      canonicalKey: "",
      title,
      host,
      category,
      applyEnd: deadline[1],
      sourceUrl,
      sourceIssueUrl,
      summary,
      track,
    };
    candidate.canonicalKey = canonicalContestKey(candidate);
    contests.push(candidate);
  }

  return contests;
}

function configuredRepos(): ContestRepo[] {
  const raw = process.env.CONTEST_REPOS?.trim();
  if (!raw) return [{ track: "it", repo: "ysl-bots/Contest-Subscribe-IT" }];

  return raw.split(",").map((entry) => {
    const [track, repo] = entry.trim().split(":", 2);
    if ((track !== "it" && track !== "non-it") || !repo?.includes("/")) {
      throw new Error(`잘못된 CONTEST_REPOS 항목: ${entry}`);
    }
    return { track, repo };
  });
}

export class GithubIssueContestSource {
  constructor(
    private readonly repos: ContestRepo[] = configuredRepos(),
    private readonly request: typeof fetch = fetch,
  ) {}

  async fetchActiveContests(): Promise<ContestCandidate[]> {
    const token = process.env.CONTEST_GITHUB_TOKEN?.trim();
    const all: ContestCandidate[] = [];
    let succeededRepos = 0;
    const failures: string[] = [];

    for (const { track, repo } of this.repos) {
      try {
        for (let page = 1; page <= 10; page += 1) {
          const response = await this.request(
            `https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}`,
            {
              headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "TORO-Contest-Notifier/1.0",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              signal: AbortSignal.timeout(15_000),
            },
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const issues = await response.json() as GithubIssue[];
          for (const issue of issues) {
            if (issue.pull_request || !issue.body) continue;
            all.push(...parseContestIssueBody(issue.body, track, issue.html_url));
          }
          if (issues.length < 100) break;
        }
        succeededRepos += 1;
      } catch (error) {
        failures.push(`${repo}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (succeededRepos === 0 && failures.length > 0) {
      throw new Error(`공모전 저장소 조회 실패: ${failures.join("; ")}`);
    }
    if (failures.length > 0) console.warn(`일부 공모전 저장소 조회 실패: ${failures.join("; ")}`);

    return [...new Map(all.map((contest) => [contest.canonicalKey, contest])).values()];
  }
}
