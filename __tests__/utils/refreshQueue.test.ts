import { refreshQueue } from '../../utils/refreshQueue';

describe('RefreshQueue', () => {
   beforeEach(() => {
      // Reset the queue state before each test
      jest.clearAllMocks();
   });

   it('processes tasks sequentially', async () => {
      const executionOrder: number[] = [];
      const task1 = jest.fn(async () => {
         executionOrder.push(1);
         await new Promise(resolve => setTimeout(resolve, 10));
      });
      const task2 = jest.fn(async () => {
         executionOrder.push(2);
         await new Promise(resolve => setTimeout(resolve, 10));
      });
      const task3 = jest.fn(async () => {
         executionOrder.push(3);
         await new Promise(resolve => setTimeout(resolve, 10));
      });

      // Enqueue all tasks
      await refreshQueue.enqueue('task1', task1);
      await refreshQueue.enqueue('task2', task2);
      await refreshQueue.enqueue('task3', task3);

      // Wait for all tasks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify tasks executed in order
      expect(executionOrder).toEqual([1, 2, 3]);
      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).toHaveBeenCalledTimes(1);
      expect(task3).toHaveBeenCalledTimes(1);
   });

   it('continues processing after task failure', async () => {
      const executionOrder: number[] = [];
      const task1 = jest.fn(async () => {
         executionOrder.push(1);
      });
      const task2 = jest.fn(async () => {
         executionOrder.push(2);
         throw new Error('Task 2 failed');
      });
      const task3 = jest.fn(async () => {
         executionOrder.push(3);
      });

      await refreshQueue.enqueue('task1', task1);
      await refreshQueue.enqueue('task2', task2);
      await refreshQueue.enqueue('task3', task3);

      // Wait for all tasks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all tasks executed despite failure
      expect(executionOrder).toEqual([1, 2, 3]);
      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).toHaveBeenCalledTimes(1);
      expect(task3).toHaveBeenCalledTimes(1);
   });

   it('returns correct queue status', async () => {
      const longRunningTask = jest.fn(async () => {
         await new Promise(resolve => setTimeout(resolve, 50));
      });

      // Enqueue a task
      await refreshQueue.enqueue('long-task', longRunningTask);

      // Check status immediately (should be processing)
      await new Promise(resolve => setTimeout(resolve, 5));
      const status = refreshQueue.getStatus();
      
      expect(status.isProcessing).toBe(true);
   });
});
