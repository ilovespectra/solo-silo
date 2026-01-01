import { NextRequest, NextResponse } from 'next/server';
import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * Searches for a folder by name in common locations and returns its full path
 * This handles the browser File System API limitation where we only get the folder name
 */
export async function POST(request: NextRequest) {
  try {
    const { folderName } = await request.json();

    if (!folderName) {
      return NextResponse.json({ error: 'Folder name required' }, { status: 400 });
    }

    const homeDir = os.homedir();
    const searchPaths = [
      homeDir,
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, 'Documents'),
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'Pictures'),
      path.join(homeDir, 'Videos'),
    ];

    for (const searchPath of searchPaths) {
      try {
        const items = fs.readdirSync(searchPath, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory() && item.name === folderName) {
            const fullPath = path.join(searchPath, item.name);
            return NextResponse.json({ path: fullPath });
          }
        }
      } catch {
        continue;
      }
    }

    try {
      const searchDirectory = (dir: string, depth: number = 0): string | null => {
        if (depth > 2) return null;

        try {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            if (item.isDirectory() && item.name === folderName) {
              return path.join(dir, item.name);
            }
          }

          for (const item of items) {
            if (item.isDirectory() && !item.name.startsWith('.')) {
              const result = searchDirectory(path.join(dir, item.name), depth + 1);
              if (result) return result;
            }
          }
        } catch {
        }

        return null;
      };

      const foundPath = searchDirectory(homeDir);
      if (foundPath) {
        return NextResponse.json({ path: foundPath });
      }
    } catch {
    }

    return NextResponse.json({ path: folderName });
  } catch (error) {
    console.error('Error resolving path:', error);
    return NextResponse.json({ error: 'Failed to resolve path' }, { status: 500 });
  }
}
