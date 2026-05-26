import { describe, it, expect } from "vitest";
import { buildWebSearchQuery, extractUrls, shouldFetchWebSearchContext } from "./scrape";

describe("extractUrls", () => {
  it("extracts URLs from text", () => {
    const urls = extractUrls("check this out https://example.com and http://foo.bar/baz");
    expect(urls).toEqual(["https://example.com", "http://foo.bar/baz"]);
  });

  it("returns empty array when no URLs", () => {
    expect(extractUrls("no links here")).toEqual([]);
  });

  it("handles URLs with query params", () => {
    const urls = extractUrls("https://example.com/page?id=123&foo=bar");
    expect(urls).toEqual(["https://example.com/page?id=123&foo=bar"]);
  });

  it("ignores non-http protocols", () => {
    expect(extractUrls("ftp://files.com ws://socket.io")).toEqual([]);
  });
});


describe("web search context helpers", () => {
  it("detects Korean web-search intent without fetching URLs", () => {
    expect(shouldFetchWebSearchContext("요즘 맥북 가격 어떻게 생각해?")).toBe(true);
    expect(shouldFetchWebSearchContext("이 링크 봐줘 https://example.com")).toBe(false);
  });

  it("cleans bot mention ids from web search queries", () => {
    expect(buildWebSearchQuery("<@123> 최신 AI 뉴스 찾아줘")).toBe("최신 AI 뉴스 찾아줘");
  });
});
