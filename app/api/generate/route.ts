import { NextResponse } from 'next/server';
import { generatePosts } from '@/lib/llm';
import { clientIp, RateLimiter } from '@/lib/rateLimit';
import { GenerateRequestSchema, type ErrorResponse, type GenerateResponse } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 8_192;

const limiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse<GenerateResponse | ErrorResponse>> {
  const rate = limiter.check(clientIp(request.headers));
  const rateHeaders = {
    'X-RateLimit-Limit': String(RATE_LIMIT),
    'X-RateLimit-Remaining': String(rate.remaining),
  };
  if (!rate.allowed) {
    return errorResponse(
      429,
      'rate_limited',
      `Too many requests. Please wait ${rate.retryAfterSeconds} seconds and try again.`,
      { ...rateHeaders, 'Retry-After': String(rate.retryAfterSeconds) },
    );
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return errorResponse(
      415,
      'unsupported_media_type',
      'Requests must be sent as JSON.',
      rateHeaders,
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return errorResponse(413, 'payload_too_large', 'Your request is too large.', rateHeaders);
    }
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(
      400,
      'invalid_json',
      'The request could not be read. Please try again.',
      rateHeaders,
    );
  }

  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request.';
    return errorResponse(400, 'invalid_request', message, rateHeaders);
  }

  try {
    const result = await generatePosts(parsed.data);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', ...rateHeaders } });
  } catch (error) {
    console.error('Unexpected generation failure:', error);
    return errorResponse(
      500,
      'generation_failed',
      'Something went wrong while drafting your posts. Please try again.',
      rateHeaders,
    );
  }
}
