import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  let url: string;
  try {
    const body = await request.json();
    url = body.url;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!url?.trim()) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const form = new URLSearchParams({ url: url.trim(), hd: '1' });

  try {
    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Upstream service error' }, { status: 502 });
    }

    const json = await res.json();

    if (json.code !== 0) {
      return NextResponse.json({ error: json.msg || 'Failed to fetch video data' }, { status: 400 });
    }

    return NextResponse.json(json.data);
  } catch {
    return NextResponse.json({ error: 'Failed to reach download service' }, { status: 502 });
  }
}
