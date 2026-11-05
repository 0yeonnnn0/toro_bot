import { describe, expect, it, vi } from "vitest";
import { canonicalContestKey, GithubIssueContestSource, parseContestIssueBody } from "./source";

const body = `이번 주 공모전입니다.

## 📋 신규 공모전

### [2026 AI 데이터 분석 경진대회](https://linkareer.com/activity/1)
**마감** 2026-11-30 (D-25) · **주최** ○○기관 · **분야** AI/데이터
> 공공데이터를 활용해 문제를 해결하는 경진대회입니다.
- 링크: [원문](https://example.com/contest/1)

<details>
<summary>공모전이 아닌 모집</summary>
- [서포터즈 모집](https://example.com/not-contest) · 마감 2026-12-01
</details>`;

describe("contest source", () => {
  it("parses contest cards but excludes folded non-contest links", () => {
    const contests = parseContestIssueBody(body, "it", "https://github.com/example/issues/1");

    expect(contests).toEqual([
      expect.objectContaining({
        title: "2026 AI 데이터 분석 경진대회",
        sourceUrl: "https://linkareer.com/activity/1",
        applyEnd: "2026-11-30",
        host: "○○기관",
        category: "AI/데이터",
        summary: "공공데이터를 활용해 문제를 해결하는 경진대회입니다.",
        track: "it",
      }),
    ]);
  });

  it("keeps identity stable across metadata corrections and separates different source posts", () => {
    const a = canonicalContestKey({ sourceUrl: "https://linkareer.com/activity/123", title: "제1회 AI 경진대회", host: "기관 A", applyEnd: "2026-11-30" });
    const corrected = canonicalContestKey({ sourceUrl: "https://linkareer.com/activity/123", title: "제1회 AI·데이터 경진대회", host: "기관 A", applyEnd: "2026-12-07" });
    const nextEdition = canonicalContestKey({ sourceUrl: "https://linkareer.com/activity/456", title: "제2회 AI 경진대회", host: "기관 A", applyEnd: "2027-11-30" });

    expect(corrected).toBe(a);
    expect(nextEdition).not.toBe(a);
  });

  it("drops untrusted heading URLs and clamps embed-bound text", () => {
    const longTitle = "가".repeat(400);
    const malicious = `### [${longTitle}](https://evil.example/phish)\n**마감** 2026-12-01 · **주최** 기관 · **분야** AI/데이터`;
    const valid = `### [${longTitle}](https://linkareer.com/activity/123)\n**마감** 2026-12-01 · **주최** ${"주".repeat(1500)} · **분야** AI/데이터`;

    expect(parseContestIssueBody(malicious, "it", "https://github.com/example/issues/1")).toEqual([]);
    const [parsed] = parseContestIssueBody(valid, "it", "https://github.com/example/issues/1");
    expect(parsed.title.length).toBeLessThanOrEqual(256);
    expect(parsed.host?.length).toBeLessThanOrEqual(1024);
  });

  it("paginates GitHub issues beyond the first page", async () => {
    const issue = (id: number) => ({
      html_url: `https://github.com/example/issues/${id}`,
      body: `### [대회 ${id}](https://linkareer.com/activity/${id})\n**마감** 2026-12-01 · **주최** 기관 · **분야** AI/데이터`,
    });
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, (_, index) => issue(index + 1))), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([issue(101)]), { status: 200 }));
    const source = new GithubIssueContestSource([{ track: "it", repo: "example/repo" }], request);

    const contests = await source.fetchActiveContests();

    expect(contests).toHaveLength(101);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain("page=2");
  });
});
