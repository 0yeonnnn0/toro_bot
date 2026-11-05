import { describe, it, expect } from "vitest";
import { buildWebSearchQuery, extractUrls, isPrivateAddress, shouldFetchWebSearchContext, validatePublicUrl } from "./scrape";

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

describe("URL fetch security", () => {
  it("blocks loopback, private, link-local, and metadata addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.0.0.5")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("192.168.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
  });

  it("rejects hostnames resolving to a private address", async () => {
    const lookup = async () => [{ address: "127.0.0.1", family: 4 }];
    await expect(validatePublicUrl("https://internal.example/path", lookup)).resolves.toBeNull();
  });

  it("accepts public http URLs after DNS validation", async () => {
    const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    await expect(validatePublicUrl("https://example.com/path", lookup)).resolves.toBe("https://example.com/path");
  });
});
