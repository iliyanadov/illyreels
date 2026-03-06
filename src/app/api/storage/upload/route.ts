import { NextRequest, NextResponse } from 'next/server';
import { uploadVideo as uploadToDrive } from '@/lib/drive-storage';

export const runtime = 'nodejs';

// Maximum file size: 1GB (Instagram's limit)
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const accessToken = formData.get('accessToken') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access token provided. Please connect Google Drive first.' },
        { status: 401 }
      );
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB` },
        { status: 400 }
      );
    }

    // Check file type
    if (!file.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only video files are allowed.' },
        { status: 400 }
      );
    }

    console.log('[Storage Upload] Uploading file:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Generate a unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'mp4';
    const filename = `sonoreels_${timestamp}.${extension}`;

    // Upload to Google Drive
    const { fileId, downloadUrl } = await uploadToDrive(file, filename, accessToken);

    console.log('[Storage Upload] Upload complete:', fileId);

    return NextResponse.json({
      success: true,
      fileId,
      downloadUrl,
      filename,
    });
  } catch (error: any) {
    console.error('[Storage Upload] Error:', error?.message || error);

    // Check for Google auth errors
    if (error?.message?.includes('invalid') || error?.message?.includes('authentication')) {
      return NextResponse.json(
        { error: 'Google authentication failed. Please reconnect your Google account.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to upload file' },
      { status: 500 }
    );
  }
}
