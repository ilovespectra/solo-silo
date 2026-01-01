import { NextRequest, NextResponse } from 'next/server';
import { listDirectory, getFileMetadata } from '@/lib/file-system';
import { Permissions } from '@/types';

const getPermissions = (req: NextRequest): Permissions => {
  const storedPerms = req.headers.get('x-permissions');
  if (storedPerms) {
    try {
      return JSON.parse(storedPerms);
    } catch {
    }
  }

  return {
    readFiles: false,
    listDirectories: false,
    indexContent: false,
    recognizeFaces: false,
    analyzeImages: false,
    searchText: false,
    moveFiles: false,
    deleteFiles: false,
    renameFiles: false,
    createFolders: false,
    modifyMetadata: false,
  };
};

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return demo test-files structure
    return NextResponse.json({
      path: '/test-files',
      name: 'test-files',
      isDirectory: true,
      children: [
        {
          path: '/test-files/images',
          name: 'images',
          isDirectory: true,
          children: [
            { path: '/test-files/images/flowers', name: 'flowers', isDirectory: true },
            { path: '/test-files/images/cars', name: 'cars', isDirectory: true },
            { path: '/test-files/images/sunset', name: 'sunset', isDirectory: true },
            { path: '/test-files/images/bowie', name: 'bowie', isDirectory: true },
            { path: '/test-files/images/abdul', name: 'abdul', isDirectory: true },
            { path: '/test-files/images/luka', name: 'luka', isDirectory: true }
          ]
        }
      ]
    });
  }
  
  try {
    const { searchParams } = new URL(req.url);
    const dirPath = searchParams.get('path');
    const recursive = searchParams.get('recursive') === 'true';

    if (!dirPath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    const permissions = getPermissions(req);

    if (!permissions.listDirectories) {
      return NextResponse.json(
        { error: 'Permission denied: Cannot list directories' },
        { status: 403 }
      );
    }

    const directory = await listDirectory(dirPath, permissions, recursive);

    if (!directory) {
      return NextResponse.json({ error: 'Failed to list directory' }, { status: 500 });
    }

    return NextResponse.json(directory);
  } catch (error) {
    console.error('Error in /api/files/browse:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
