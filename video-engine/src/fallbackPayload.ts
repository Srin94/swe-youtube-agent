// Bundled mock payload so the Remotion studio and renders always have valid
// data even before the Python pipeline has produced one. This is the SAME
// content written to public/assets/render_payload.json (the file the pipeline
// overwrites per run).
import mock from "./mock/render_payload.json";
import type { VideoRenderPayload } from "./types/schema";

export const FALLBACK_PAYLOAD = mock as unknown as VideoRenderPayload;
