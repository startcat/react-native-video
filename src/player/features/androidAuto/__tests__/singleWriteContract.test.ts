import { routeCarPlayRequest, type SingleWriteSink } from '../carPlaybackRouter';

const makeSink = () => {
  const calls: string[] = [];
  const sink: SingleWriteSink = {
    play: (id) => calls.push(`play:${id}`),
    pause: () => calls.push('pause'),
    seek: (s) => calls.push(`seek:${s}`),
  };
  return { sink, calls };
};

describe('routeCarPlayRequest (single-write router)', () => {
  it('routes a car play request to exactly one sink call (no dual-write)', () => {
    const { sink, calls } = makeSink();
    routeCarPlayRequest({ type: 'play', mediaId: 'r1' }, sink);
    expect(calls).toEqual(['play:r1']);
  });

  it('pause then seek issue one write each, in order (no echo / re-entry)', () => {
    const { sink, calls } = makeSink();
    routeCarPlayRequest({ type: 'pause' }, sink);
    routeCarPlayRequest({ type: 'seek', positionSec: 42 }, sink);
    expect(calls).toEqual(['pause', 'seek:42']);
  });

  it('drops a request whose origin is the same sink (loop-guard) without writing', () => {
    const { sink, calls } = makeSink();
    routeCarPlayRequest({ type: 'play', mediaId: 'r1', origin: 'single-write-sink' }, sink);
    expect(calls).toEqual([]);
  });
});
