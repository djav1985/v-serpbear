import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('ts-node/esm', pathToFileURL('./'));

try {
  const { retryQueueManager } = await import('./utils/retryQueueManager');
  console.log('✓ Import successful');
  console.log('✓ Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(retryQueueManager)).filter(m => m !== 'constructor'));
  
  await retryQueueManager.clearQueue();
  console.log('✓ clearQueue() works');
  await retryQueueManager.addToQueue(123);
  console.log('✓ addToQueue() works');
  const queue = await retryQueueManager.getQueue();
  console.log('✓ getQueue() works, queue:', queue);
  await retryQueueManager.clearQueue();
  console.log('✓ All tests passed');
} catch (error) {
  console.error('✗ Error:', error);
  process.exit(1);
}
