
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const interpretTheStars = async (particleCount: number) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `你现在是文森特·梵高的创作灵魂。
      请解读一个由 ${particleCount} 个白色、浅蓝和淡黄色粒子构成的 3D 数字艺术作品，其灵感来自你的《星空》。
      这些粒子在数字虚空中交织成流动的漩涡和璀璨的星云。
      请写三行极具诗意的中文诗句，描述这种数字湍流中的孤独与美丽。`,
      config: {
        temperature: 0.9,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Interpretation Error:", error);
    return "星光在蓝色的暗涌中跳动，\n它是灵魂未竟的梦境，\n在数字的漩涡里，我们终将重逢。";
  }
};
