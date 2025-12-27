import { NextRequest, NextResponse } from 'next/server';
import { indexer } from '@/lib/indexing/indexer';
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
    const { path, recursive = true, includeContent = false } = body;

    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    const permissions = getPermissions(req);

    if (!permissions.indexContent) {
      return NextResponse.json(
        { error: 'Permission denied: Cannot index content' },
        { status: 403 }
      );
    }

    indexer.indexDirectory(path, permissions, recursive, includeContent).catch((error) => {
      console.error('Background indexing error:', error);
    });

    const stats = indexer.getIndexStats();

    return NextResponse.json({
      message: 'Indexing started',
      stats,
    });
  } catch (error) {
    console.error('Error in /api/indexing/start:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const stats = indexer.getIndexStats();
    const progress = indexer.getLastProgress();
    const entities = indexer.getEntitySummary();
    return NextResponse.json({ stats, progress, entities });
  } catch (error) {
    console.error('Error getting indexing stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
