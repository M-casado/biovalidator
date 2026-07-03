const NodeCache = require('node-cache');
const {CacheMetrics, aggregateCacheSnapshots} = require('../src/utils/cache-metrics');

describe('CacheMetrics', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('reports entry lifecycle timestamps and retains update history after expiration', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-03T10:00:00.000Z'));
    const cache = new NodeCache({stdTTL: 60, checkperiod: 0, useClones: false});
    const metrics = new CacheMetrics(cache, 60);

    cache.set('first', {value: 1});
    expect(metrics.snapshot()).toEqual({
      ttl_seconds: 60,
      entries: 1,
      last_updated_at: '2026-07-03T10:00:00.000Z',
      last_cleared_at: null,
      oldest_entry_at: '2026-07-03T10:00:00.000Z',
      newest_entry_at: '2026-07-03T10:00:00.000Z',
      next_expiration_at: '2026-07-03T10:01:00.000Z'
    });

    jest.setSystemTime(new Date('2026-07-03T10:01:01.000Z'));
    expect(metrics.snapshot()).toEqual({
      ttl_seconds: 60,
      entries: 0,
      last_updated_at: '2026-07-03T10:00:00.000Z',
      last_cleared_at: null,
      oldest_entry_at: null,
      newest_entry_at: null,
      next_expiration_at: null
    });
    cache.close();
  });

  test('retains update history and records clearing when an occupied cache is flushed', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-03T11:00:00.000Z'));
    const cache = new NodeCache({stdTTL: 60, checkperiod: 0, useClones: false});
    const metrics = new CacheMetrics(cache, 60);
    cache.set('entry', true);

    jest.setSystemTime(new Date('2026-07-03T11:00:30.000Z'));
    cache.flushAll();

    expect(metrics.snapshot()).toMatchObject({
      entries: 0,
      last_updated_at: '2026-07-03T11:00:00.000Z',
      last_cleared_at: '2026-07-03T11:00:30.000Z',
      oldest_entry_at: null,
      newest_entry_at: null,
      next_expiration_at: null
    });
    cache.close();
  });

  test('aggregates provider snapshots using total entries and lifecycle boundaries', () => {
    const aggregate = aggregateCacheSnapshots([
      {
        entries: 2,
        last_updated_at: '2026-07-03T10:02:00.000Z',
        last_cleared_at: null,
        oldest_entry_at: '2026-07-03T10:00:00.000Z',
        newest_entry_at: '2026-07-03T10:01:00.000Z',
        next_expiration_at: '2026-07-03T16:00:00.000Z'
      },
      {
        entries: 1,
        last_updated_at: '2026-07-03T10:04:00.000Z',
        last_cleared_at: '2026-07-03T09:00:00.000Z',
        oldest_entry_at: '2026-07-03T10:03:00.000Z',
        newest_entry_at: '2026-07-03T10:03:00.000Z',
        next_expiration_at: '2026-07-03T16:03:00.000Z'
      }
    ], 21600);

    expect(aggregate).toEqual({
      ttl_seconds: 21600,
      entries: 3,
      last_updated_at: '2026-07-03T10:04:00.000Z',
      last_cleared_at: '2026-07-03T09:00:00.000Z',
      oldest_entry_at: '2026-07-03T10:00:00.000Z',
      newest_entry_at: '2026-07-03T10:03:00.000Z',
      next_expiration_at: '2026-07-03T16:00:00.000Z'
    });
  });
});
