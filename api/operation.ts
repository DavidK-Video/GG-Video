
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  const { operationName, apiKey } = req.body;

  if (!operationName || !apiKey) {
    return res.status(400).json({ error: 'Thiếu thông tin Operation hoặc API Key.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Reconstruct the operation object using the name. The SDK type definition for GenerateVideosOperation 
    // includes internal properties like _fromAPIResponse which are lost during serialization, 
    // so we cast to any to allow reconstruction from just the name string received from the client.
    const operation = await ai.operations.getVideosOperation({ operation: { name: operationName } as any });
    
    return res.status(200).json(operation);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
