import { writeFile, rename, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import { dirname } from 'path';
import { logger } from './logger';

/**
 * Atomically writes data to a file using write-then-rename pattern
 * This prevents file corruption if the process crashes during write
 * @param filePath The target file path
 * @param data The data to write
 * @param encoding The file encoding (default: 'utf-8')
 */
export const atomicWriteFile = async (
   filePath: string,
   data: string,
   encoding: BufferEncoding = 'utf-8'
): Promise<void> => {
   // Generate a temporary file path with random suffix (16 bytes for stronger entropy)
   const tempFilePath = `${filePath}.tmp.${randomBytes(16).toString('hex')}`;
   
   try {
      // Write to temporary file first
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await writeFile(tempFilePath, data, { encoding });
      
      // Atomic rename - this is atomic on most filesystems
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await rename(tempFilePath, filePath);
   } catch (error) {
      // Clean up temp file if it exists
      try {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await unlink(tempFilePath);
      } catch (_cleanupError) {
         // Ignore cleanup errors - file might not exist
      }
      
      const err = error instanceof Error ? error : new Error(String(error));
      const nodeError = err as NodeJS.ErrnoException;
      
      // Provide clearer error message if directory doesn't exist
      if (nodeError.code === 'ENOENT') {
         const dir = dirname(filePath);
         logger.error('Atomic write failed: parent directory does not exist', err, {
            targetPath: filePath,
            tempPath: tempFilePath,
            directory: dir,
            suggestion: 'Ensure the parent directory exists before writing',
         });
      } else {
         logger.error('Atomic write failed', err, {
            targetPath: filePath,
            tempPath: tempFilePath,
         });
      }
      
      throw error;
   }
};
