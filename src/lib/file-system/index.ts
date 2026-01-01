'use server';

import fs from 'fs';
import path from 'path';
import { FileMetadata, DirectoryNode, Permissions } from '@/types';

export async function getFileMetadata(
  filePath: string,
  permissions: Permissions
): Promise<FileMetadata | null> {
  try {
    if (!permissions.readFiles) {
      console.warn(`Permission denied: Cannot read ${filePath}`);
      return null;
    }

    const stats = fs.statSync(filePath);
    const name = path.basename(filePath);

    return {
      path: filePath,
      name,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      created: stats.birthtime.getTime(),
      modified: stats.mtime.getTime(),
      accessed: stats.atime.getTime(),
      isHidden: name.startsWith('.'),
      permissions: stats.mode,
    };
  } catch (error) {
    console.error(`Error reading metadata for ${filePath}:`, error);
    return null;
  }
}

export async function listDirectory(
  dirPath: string,
  permissions: Permissions,
  recursive: boolean = false
): Promise<DirectoryNode | null> {
  try {
    if (!permissions.listDirectories) {
      console.warn(`Permission denied: Cannot list ${dirPath}`);
      return null;
    }

    const metadata = await getFileMetadata(dirPath, permissions);
    if (!metadata || metadata.type !== 'directory') {
      return null;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const children: (DirectoryNode | FileMetadata)[] = [];
    let totalSize = 0;
    let fileCount = 0;
    let folderCount = 0;

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const childMetadata = await getFileMetadata(fullPath, permissions);

      if (childMetadata) {
        if (entry.isDirectory() && recursive) {
          const subDir = await listDirectory(fullPath, permissions, true);
          if (subDir) {
            children.push(subDir);
            totalSize += subDir.size;
            fileCount += subDir.fileCount;
            folderCount += 1;
          }
        } else {
          children.push(childMetadata);
          if (entry.isDirectory()) {
            folderCount++;
          } else {
            fileCount++;
            totalSize += childMetadata.size;
          }
        }
      }
    }

    return {
      path: dirPath,
      name: path.basename(dirPath),
      children,
      size: totalSize,
      fileCount,
      folderCount,
    };
  } catch (error) {
    console.error(`Error listing directory ${dirPath}:`, error);
    return null;
  }
}

export async function readFileContent(
  filePath: string,
  permissions: Permissions,
  encoding: BufferEncoding = 'utf8',
  maxSize: number = 1000000
): Promise<string | null> {
  try {
    if (!permissions.readFiles) {
      console.warn(`Permission denied: Cannot read ${filePath}`);
      return null;
    }

    const stats = fs.statSync(filePath);
    if (stats.size > maxSize) {
      console.warn(`File too large: ${filePath} (${stats.size} bytes)`);
      return null;
    }

    return fs.readFileSync(filePath, encoding);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

export async function moveFile(
  sourcePath: string,
  destPath: string,
  permissions: Permissions
): Promise<boolean> {
  try {
    if (!permissions.moveFiles && !permissions.deleteFiles) {
      console.warn('Permission denied: Cannot move files');
      return false;
    }

    fs.renameSync(sourcePath, destPath);
    return true;
  } catch (error) {
    console.error(`Error moving file ${sourcePath} to ${destPath}:`, error);
    return false;
  }
}

export async function deleteFile(
  filePath: string,
  permissions: Permissions
): Promise<boolean> {
  try {
    if (!permissions.deleteFiles) {
      console.warn('Permission denied: Cannot delete files');
      return false;
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
    return false;
  }
}

export async function renameFile(
  filePath: string,
  newName: string,
  permissions: Permissions
): Promise<boolean> {
  try {
    if (!permissions.renameFiles) {
      console.warn('Permission denied: Cannot rename files');
      return false;
    }

    const dir = path.dirname(filePath);
    const newPath = path.join(dir, newName);
    fs.renameSync(filePath, newPath);
    return true;
  } catch (error) {
    console.error(`Error renaming file ${filePath}:`, error);
    return false;
  }
}

export async function createFolder(
  dirPath: string,
  permissions: Permissions
): Promise<boolean> {
  try {
    if (!permissions.createFolders) {
      console.warn('Permission denied: Cannot create folders');
      return false;
    }

    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error(`Error creating folder ${dirPath}:`, error);
    return false;
  }
}
