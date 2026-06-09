// src/player/features/androidAuto/__tests__/carSkipRouter.test.ts
import { routeSkipRequest, SKIP_SINK_ORIGIN, type SkipSink } from '../carSkipRouter';

const makeSink = () => {
  const calls: string[] = [];
  const sink: SkipSink = {
    next: () => calls.push('next'),
    previous: () => calls.push('previous'),
  };
  return { sink, calls };
};

describe('routeSkipRequest (single-write skip router)', () => {
  it('routes a next request to exactly one sink.next call', () => {
    const { sink, calls } = makeSink();
    expect(routeSkipRequest({ type: 'next' }, sink)).toBe(true);
    expect(calls).toEqual(['next']);
  });

  it('routes a previous request to exactly one sink.previous call', () => {
    const { sink, calls } = makeSink();
    expect(routeSkipRequest({ type: 'previous' }, sink)).toBe(true);
    expect(calls).toEqual(['previous']);
  });

  it('drops a self-origin request (loop guard) without writing', () => {
    const { sink, calls } = makeSink();
    expect(routeSkipRequest({ type: 'next', origin: SKIP_SINK_ORIGIN }, sink)).toBe(false);
    expect(calls).toEqual([]);
  });
});
