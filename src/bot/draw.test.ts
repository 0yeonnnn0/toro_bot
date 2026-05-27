import { describe, expect, it } from "vitest";
import { extractImagePrompt, isImageGenerationRequest } from "./draw";

describe("draw intent helpers", () => {
  it("detects natural Korean image generation requests", () => {
    expect(isImageGenerationRequest("고양이 우주비행사 그림 그려줘")).toBe(true);
    expect(isImageGenerationRequest("사이버펑크 토로 이미지 만들어줘")).toBe(true);
  });

  it("does not steal explicit SVG/code/vector requests", () => {
    expect(isImageGenerationRequest("고양이 SVG로 그려줘")).toBe(false);
    expect(isImageGenerationRequest("구조 다이어그램 코드로 만들어줘")).toBe(false);
  });

  it("extracts the prompt while preserving the subject", () => {
    expect(extractImagePrompt("토로야 고양이 우주비행사 그림 그려줘")).toBe("고양이 우주비행사");
  });
});
