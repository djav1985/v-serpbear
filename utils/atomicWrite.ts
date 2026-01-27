import { randomBytes } from 'crypto';
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
   const { writeFile, rename, unlink } = await import('fs/promises');
   
   // Generate a temporary file path with random suffix
   const tempFilePath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`;
   
   try {
      // Write to temporary file first
      await writeFile(tempFilePath, data, { encoding });
      
      // Atomic rename - this is atomic on most filesystems
      await rename(tempFilePath, filePath);
   } catch (error) {
      // Clean up temp file if it exists
      try {
         await unlink(tempFilePath);
      } catch (_cleanupError) {
         // Ignore cleanup errors - file might not exist
      }
      
      logger.error('Atomic write failed', error instanceof Error ? error : new Error(String(error)), {
         targetPath: filePath,
         tempPath: tempFilePath,
      });
      
      throw error;
   }
};
