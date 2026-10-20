import type { CanvasLike } from '@/lib/image/render';

/** Records fillText calls and approximates text width so layout logic can be tested without a browser. */
export function createFakeCanvas(): CanvasLike & { texts: string[]; calls: string[] } {
  const texts: string[] = [];
  const calls: string[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif' };
  const fontSize = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);

  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'measureText') {
        return (text: string) => ({ width: Array.from(text).length * fontSize() * 0.55 });
      }
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      if (prop === 'fillText') {
        return (text: string) => {
          calls.push('fillText');
          texts.push(text);
        };
      }
      if (prop in target) return target[prop];
      return (..._args: unknown[]) => {
        calls.push(prop);
      };
    },
    set(target, prop: string, value: unknown) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return { width: 300, height: 150, getContext: () => ctx, texts, calls };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
