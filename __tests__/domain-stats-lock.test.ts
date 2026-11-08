/// <reference path="../types.d.ts" />
import Domain from '../database/models/domain';
import Keyword from '../database/models/keyword';
import { updateDomainStats } from '../utils/updateDomainStats';

jest.mock('../database/models/keyword');
jest.mock('../database/models/domain');
jest.mock('../utils/appSettings', () => ({ getAppSettings: jest.fn().mockResolvedValue({}) }));
jest.mock('../utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const flush = () => new Promise<void>((resolve) => { setImmediate(resolve); });

describe('updateDomainStats ordering', () => {
  const findOne = Domain.findOne as unknown as jest.Mock;
  const update = Domain.update as unknown as jest.Mock;
  const findAll = Keyword.findAll as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    findOne.mockResolvedValue({ avgPosition: 0, mapPackKeywords: 0, keywordsTracked: 0 });
    findAll.mockResolvedValue([]);
  });

  it('runs two updates for the same domain one after the other, and the second reads after the first has saved', async () => {
    const events: string[] = [];
    let releaseFirstSave: () => void = () => undefined;
    update.mockImplementationOnce(async () => {
      events.push('first save started');
      await new Promise<void>((resolve) => { releaseFirstSave = resolve; });
      events.push('first save done');
    });
    findOne.mockImplementation(async () => {
      events.push('read');
      return { avgPosition: 0, mapPackKeywords: 0, keywordsTracked: 0 };
    });

    const first = updateDomainStats('example.com');
    const second = updateDomainStats('example.com');
    await flush();
    // The second update has not read anything yet; it waits for the first to save
    expect(events).toEqual(['read', 'first save started']);

    releaseFirstSave();
    await Promise.all([first, second]);
    expect(events).toEqual(['read', 'first save started', 'first save done', 'read']);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('lets different domains update at the same time', async () => {
    let releaseFirstSave: () => void = () => undefined;
    update.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirstSave = resolve; }));

    const first = updateDomainStats('one.com');
    const second = updateDomainStats('two.com');
    await flush();
    // two.com finished its whole update while one.com was still saving
    expect(update).toHaveBeenCalledTimes(2);
    await second;
    releaseFirstSave();
    await first;
  });

  it('keeps going after an earlier update for the domain failed', async () => {
    findOne.mockRejectedValueOnce(new Error('db busy')).mockRejectedValueOnce(new Error('db busy'));
    const failed = await updateDomainStats('example.com');
    const next = await updateDomainStats('example.com');
    expect(failed).toBe(false);
    expect(next).toBe(true);
  });
});
