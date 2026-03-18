const MODEL_ID = "veo-3.1-generate-preview";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is missing");
  return key;
}

export interface VeoClipResult {
  videoBuffer: Buffer;
  mimeType: string;
}

/**
 * Generate a single video clip using Veo 3.1 via the predictLongRunning REST API.
 * Returns the raw mp4 buffer once the operation completes.
 */
export async function generateVideoClip(
  prompt: string,
): Promise<VeoClipResult> {
  const apiKey = getApiKey();

  // Start the long-running generation
  const startResp = await fetch(
    `${BASE_URL}/models/${MODEL_ID}:predictLongRunning?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: "16:9",
          sampleCount: 1,
          durationSeconds: 8,
          resolution: "720p",
        },
      }),
    },
  );

  if (!startResp.ok) {
    const text = await startResp.text();
    throw new Error(`Veo API error ${startResp.status}: ${text}`);
  }

  const startData = (await startResp.json()) as { name: string };
  const opName = startData.name;
  if (!opName) throw new Error("Veo API returned no operation name");

  // Poll until done
  while (true) {
    await new Promise((r) => setTimeout(r, 10_000));

    const pollResp = await fetch(`${BASE_URL}/${opName}?key=${apiKey}`);
    if (!pollResp.ok) {
      const text = await pollResp.text();
      throw new Error(`Veo poll error ${pollResp.status}: ${text}`);
    }

    const pollData = (await pollResp.json()) as {
      done?: boolean;
      response?: {
        generateVideoResponse?: {
          generatedSamples?: { video?: { uri?: string } }[];
        };
      };
      error?: { message?: string };
    };

    if (pollData.error) {
      throw new Error(`Veo generation failed: ${pollData.error.message}`);
    }

    if (!pollData.done) continue;

    const uri = pollData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) throw new Error("Veo 3 returned no video URI");

    // URI requires the API key to download
    const videoResp = await fetch(`${uri}&key=${apiKey}`);
    if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);

    const arrayBuffer = await videoResp.arrayBuffer();
    return {
      videoBuffer: Buffer.from(arrayBuffer),
      mimeType: "video/mp4",
    };
  }
}
