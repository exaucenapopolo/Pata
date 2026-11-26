import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.NEXT_PUBLIC_APP_BUILD_ID
  || 'local';

export async function GET() {
  return NextResponse.json(
    { buildId: BUILD_ID },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } }
  );
}
