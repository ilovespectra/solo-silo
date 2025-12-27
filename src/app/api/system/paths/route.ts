import { NextRequest, NextResponse } from 'next/server';
import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * Returns common directories and drives for the user's system
 * This helps initialize the folder picker with useful starting points
 */
export async function GET() {
  try {
    const homeDir = os.homedir();
    const platform = process.platform;
    
    const commonPaths: Record<string, string> = {
      Home: homeDir,
      Desktop: path.join(homeDir, 'Desktop'),
      Documents: path.join(homeDir, 'Documents'),
      Downloads: path.join(homeDir, 'Downloads'),
      Pictures: path.join(homeDir, 'Pictures'),
      Videos: path.join(homeDir, 'Videos'),
    };

    // Platform-specific paths
    if (platform === 'darwin') {
      // macOS specific
      commonPaths['iCloud Drive'] = path.join(homeDir, 'Library/Mobile Documents/com~apple~CloudDocs');
    } else if (platform === 'win32') {
      // Windows specific
      commonPaths['C: Drive'] = 'C:\\';
      commonPaths['User Folder'] = homeDir;
    } else if (platform === 'linux') {
      // Linux specific
      commonPaths['Root'] = '/';
      commonPaths['Mnt'] = '/mnt';
    }

    // Verify paths exist
    const validPaths: Record<string, string> = {};
    for (const [label, dirPath] of Object.entries(commonPaths)) {
      if (fs.existsSync(dirPath)) {
        validPaths[label] = dirPath;
      }
    }

    return NextResponse.json({
      homeDirectory: homeDir,
      platform,
      commonPaths: validPaths,
    });
  } catch (error) {
    console.error('Error getting common paths:', error);
    return NextResponse.json(
      { error: 'Failed to get common paths' },
      { status: 500 }
    );
  }
}
