export interface PerformSkipAdParams {
  client: { skipAd: () => Promise<unknown> } | null;
  isPlayingAd: boolean;
  logger: { info: (m: string) => void; warn: (m: string) => void; debug: (m: string) => void };
}

export async function performSkipAd(params: PerformSkipAdParams): Promise<boolean> {
  const { client, isPlayingAd, logger } = params;
  if (!client) {
    logger.debug('skipAd: no client');
    return false;
  }
  if (!isPlayingAd) {
    logger.debug('skipAd: skipped — no ad active');
    return false;
  }
  logger.info('skipAd: requesting ad skip');
  try {
    await client.skipAd();
    return true;
  } catch (err) {
    logger.warn(`skipAd: rejected by receiver: ${String(err)}`);
    return false;
  }
}
