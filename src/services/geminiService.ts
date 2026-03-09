import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function refineSketch(base64Image: string, style: string = 'Digital Art'): Promise<string | null> {
  try {
    // Remove data:image/png;base64, prefix if present
    const data = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: data,
              mimeType: 'image/png',
            },
          },
          {
            text: `Refine this rough hand-drawn sketch into a clean, professional, and visually appealing artwork in the style of "${style}". 
            Enhance lines, improve clarity, smooth edges, and present it in a polished, high-quality format. 
            Maintain the original structure and idea perfectly, but apply the artistic characteristics of ${style}. 
            Output ONLY the refined image.`,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    return null;
  } catch (error) {
    console.error("Error refining sketch:", error);
    return null;
  }
}
