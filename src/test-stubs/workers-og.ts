// ---------------------------------------------------------------------------
// Test stub for workers-og — wired up via the vitest config alias.
//
// The real package imports .wasm modules (satori/resvg/yoga) that only load
// in the Workers runtime; Node/vitest cannot evaluate them. Tests exercise
// the /og route against this stub; the real renderer is bundle-verified via
// `wrangler deploy --dry-run` and exercised in the deployed Worker.
// ---------------------------------------------------------------------------

/** Recognizable fake PNG header so route tests can assert pass-through */
export const STUB_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

export class ImageResponse extends Response {
  constructor(element: string, options: unknown) {
    void element
    void options
    super(STUB_PNG_BYTES, { headers: { 'Content-Type': 'image/png' } })
  }
}

export async function loadGoogleFont(opts: { family: string; weight?: number; text?: string }): Promise<ArrayBuffer> {
  void opts
  return new ArrayBuffer(8)
}
