import { describe, expect, it } from "vitest";
import { extractImageSearchQuery, isImageSearchRequest } from "./image-search";

describe("image search intent helpers", () => {
  it("detects Korean image search requests", () => {
    expect(isImageSearchRequest("귀여운 고양이 사진 찾아줘")).toBe(true);
    expect(isImageSearchRequest("요즘 맥북 가격 검색해줘")).toBe(false);
  });

  it("extracts an image search query", () => {
    expect(extractImageSearchQuery("<@123> 토로야 귀여운 고양이 사진 찾아줘")).toBe("귀여운 고양이");
    expect(extractImageSearchQuery("뉴진스 이미지 검색해줘")).toBe("뉴진스");
  });
});
