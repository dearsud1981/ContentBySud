import type { Platform, Tone } from '../schemas';
import { createDesign, type Design, type Shape } from './design';
import { fitHeadline, safeArea, type HeadlineLayout } from './layout';
import { IMAGE_SIZES, pickTextColor, withAlpha, type ImageSize } from './palette';

export const HEADLINE_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** The subset of HTMLCanvasElement the renderer needs, so tests can pass a stub. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: '2d'): CanvasRenderingContext2D | null;
}

export type BackgroundImage = CanvasImageSource & { width: number; height: number };

export interface RenderOptions {
  idea: string;
  tone: Tone;
  platform: Platform;
  headline: string;
  /** Optional AI artwork drawn beneath the tone overlay. */
  background?: BackgroundImage | null;
}

export interface RenderResult {
  size: ImageSize;
  design: Design;
  headline: HeadlineLayout;
}

function font(size: number): string {
  return `800 ${size}px ${HEADLINE_FONT_FAMILY}`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawGradient(
  ctx: CanvasRenderingContext2D,
  size: ImageSize,
  design: Design,
  alpha = 1,
): void {
  const { width, height } = size;
  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(width, height) / 2;
  const dx = Math.cos(design.gradientAngle) * reach;
  const dy = Math.sin(design.gradientAngle) * reach;
  const gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  gradient.addColorStop(0, withAlpha(design.palette.from, alpha));
  gradient.addColorStop(1, withAlpha(design.palette.to, alpha));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawCover(ctx: CanvasRenderingContext2D, image: BackgroundImage, size: ImageSize): void {
  const scale = Math.max(size.width / image.width, size.height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (size.width - w) / 2, (size.height - h) / 2, w, h);
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  size: ImageSize,
  alphaScale: number,
): void {
  const unit = Math.min(size.width, size.height);
  ctx.save();
  ctx.globalAlpha = Math.min(1, shape.alpha * alphaScale);
  ctx.fillStyle = shape.color;
  ctx.strokeStyle = shape.color;

  switch (shape.kind) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(shape.x * size.width, shape.y * size.height, shape.size * unit, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = Math.max(1, shape.width * unit);
      ctx.beginPath();
      ctx.arc(shape.x * size.width, shape.y * size.height, shape.size * unit, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'triangle': {
      const r = shape.size * unit;
      ctx.translate(shape.x * size.width, shape.y * size.height);
      ctx.rotate(shape.rotation);
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'square': {
      const s = shape.size * unit;
      ctx.translate(shape.x * size.width, shape.y * size.height);
      ctx.rotate(shape.rotation);
      roundedRect(ctx, -s / 2, -s / 2, s, s, s * 0.12);
      ctx.fill();
      break;
    }
    case 'dots': {
      const spacing = Math.max(8, shape.spacing * unit);
      const radius = Math.max(1, shape.radius * unit);
      for (let y = spacing / 2; y < size.height; y += spacing) {
        for (let x = spacing / 2; x < size.width; x += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'stripes': {
      const spacing = Math.max(8, shape.spacing * unit);
      const reach = Math.hypot(size.width, size.height);
      ctx.translate(size.width / 2, size.height / 2);
      ctx.rotate(shape.angle);
      ctx.lineWidth = Math.max(1, shape.width * unit);
      for (let offset = -reach; offset <= reach; offset += spacing) {
        ctx.beginPath();
        ctx.moveTo(offset, -reach);
        ctx.lineTo(offset, reach);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

/**
 * Draws a complete post image onto the canvas at the platform's exact size.
 * Fully deterministic for a given idea, tone, platform and headline.
 */
export function renderPostImage(canvas: CanvasLike, options: RenderOptions): RenderResult {
  const size = IMAGE_SIZES[options.platform];
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');

  const design = createDesign(options.idea, options.tone);
  const hasArtwork = Boolean(options.background);

  // Background: gradient, or AI artwork tinted with the tone gradient for consistency.
  ctx.clearRect(0, 0, size.width, size.height);
  if (options.background) {
    drawCover(ctx, options.background, size);
    drawGradient(ctx, size, design, 0.62);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, size.width, size.height);
  } else {
    drawGradient(ctx, size, design);
  }

  for (const shape of design.shapes) drawShape(ctx, shape, size, hasArtwork ? 0.6 : 1);

  // Headline block inside the safe area.
  const area = safeArea(size);
  const unit = Math.min(size.width, size.height);
  const padding = Math.round(unit * 0.05);
  const accentHeight = Math.max(6, Math.round(unit * 0.012));
  const accentGap = Math.round(unit * 0.035);
  const textMaxWidth = area.width - padding * 2;
  const textMaxHeight = (area.height - padding * 2 - accentHeight - accentGap) * 0.85;

  ctx.font = font(100);
  const measure = (text: string, fontSize: number): number => {
    ctx.font = font(fontSize);
    return ctx.measureText(text).width;
  };
  const layout = fitHeadline(options.headline, textMaxWidth, textMaxHeight, measure, {
    maxFontSize: Math.round(unit * 0.11),
    minFontSize: Math.round(unit * 0.045),
  });

  const panelWidth = Math.min(area.width, layout.width + padding * 2);
  const panelHeight = layout.height + accentHeight + accentGap + padding * 2;
  const panelX = area.x;
  const panelY = area.y + (area.height - panelHeight) / 2;

  // A translucent scrim guarantees readable contrast over busy patterns or artwork.
  ctx.save();
  ctx.fillStyle = withAlpha(design.palette.from, hasArtwork ? 0.72 : 0.55);
  roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, Math.round(unit * 0.03));
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = design.palette.accent;
  roundedRect(
    ctx,
    panelX + padding,
    panelY + padding,
    Math.round(unit * 0.12),
    accentHeight,
    accentHeight / 2,
  );
  ctx.fill();

  const textColor = pickTextColor([design.palette.from, design.palette.to]);
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.font = font(layout.fontSize);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = Math.round(layout.fontSize * 0.15);
  const textTop = panelY + padding + accentHeight + accentGap;
  layout.lines.forEach((line, index) => {
    ctx.fillText(
      line,
      panelX + padding,
      textTop + index * layout.lineHeight + (layout.lineHeight - layout.fontSize) / 2,
    );
  });
  ctx.restore();

  return { size, design, headline: layout };
}

/** Promise wrapper around canvas.toBlob for PNG export. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
      'image/png',
    );
  });
}
