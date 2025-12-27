import { NextRequest, NextResponse } from 'next/server';
import {
  moveFile,
  deleteFile,
  renameFile,
  createFolder,
} from '@/lib/file-system';
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, source, destination, newName } = body;

    const permissions = getPermissions(req);

    let success = false;
    let message = '';

    switch (action) {
      case 'move':
        if (!permissions.moveFiles) {
          return NextResponse.json(
            { error: 'Permission denied: Cannot move files' },
            { status: 403 }
          );
        }
        success = await moveFile(source, destination, permissions);
        message = success ? `Moved to ${destination}` : 'Failed to move file';
        break;

      case 'delete':
        if (!permissions.deleteFiles) {
          return NextResponse.json(
            { error: 'Permission denied: Cannot delete files' },
            { status: 403 }
          );
        }
        success = await deleteFile(source, permissions);
        message = success ? 'File deleted' : 'Failed to delete file';
        break;

      case 'rename':
        if (!permissions.renameFiles) {
          return NextResponse.json(
            { error: 'Permission denied: Cannot rename files' },
            { status: 403 }
          );
        }
        success = await renameFile(source, newName, permissions);
        message = success ? `Renamed to ${newName}` : 'Failed to rename file';
        break;

      case 'createFolder':
        if (!permissions.createFolders) {
          return NextResponse.json(
            { error: 'Permission denied: Cannot create folders' },
            { status: 403 }
          );
        }
        success = await createFolder(destination, permissions);
        message = success ? 'Folder created' : 'Failed to create folder';
        break;

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (!success) {
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Error in /api/files/operations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
