import { describe, expect, it } from "vitest";
import { buildDuckDuckGoImageProxyUrl, extractImageSearchQuery, isImageSearchRequest } from "./image-search";

describe("image search intent helpers", () => {
  it("detects Korean image search requests", () => {
    expect(isImageSearchRequest("귀여운 고양이 사진 찾아줘")).toBe(true);
    expect(isImageSearchRequest("요즘 맥북 가격 검색해줘")).toBe(false);
  });

  it("extracts an image search query", () => {
    expect(extractImageSearchQuery("<@123> 토로야 귀여운 고양이 사진 찾아줘")).toBe("귀여운 고양이");
    expect(extractImageSearchQuery("뉴진스 이미지 검색해줘")).toBe("뉴진스");
  });

  it("downloads search results only through the fixed DuckDuckGo proxy", () => {
    const proxy = new URL(buildDuckDuckGoImageProxyUrl("http://169.254.169.254/latest/meta-data"));
    expect(proxy.origin).toBe("https://external-content.duckduckgo.com");
    expect(proxy.pathname).toBe("/iu/");
    expect(proxy.searchParams.get("u")).toBe("http://169.254.169.254/latest/meta-data");
  });
});
