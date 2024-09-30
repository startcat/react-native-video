import { useSessionStore } from 'store';
import Config from 'react-native-config';

type YouboraCustomDimensions = {
	1?: string;
	2?: string;
	3?: string;
	4?: string;
	5?: string;
	6?: string;
	7?: string;
	8?: string;
	9?: string;
	10?: string;
};

type YouboraContent = {
	transactionCode?: string;
	id?: string;
	type?: string;
	title?: string;
	program?: string;
	isLive?: boolean;
	playbackType?: string;
	tvShow?: string;
	season?: string;
	episodeTitle?: string;
	channel?: string;
	customDimension?: YouboraCustomDimensions;
};

export type IYoubora = {
	accountCode: string;
	username?: string;
	content?: YouboraContent;
	offline?: boolean;
	userObfuscateIp?: boolean;
};

export type IYouboraSettingsFormat = 'mobile' | 'cast';

/*
 *  La mayoría de campos en Youbora son de tipo string, mientras que la API algunos provienen en numérico
 *  Hacemos el casting para evitar problemas en los adaptadores nativos
 *
 */

const paramToString = (param: any): string => {
	let result = '';

	if (param) {
		result = param?.toString();
	}

	return result;
};

/*
 *  Mapeamos el resultado de un contenido proveniente de la API a los campos de Youbora
 *  Montamos el objeto Youbora en formato web
 *
 */

export const mapYouboraOptions = (data: any, offline?: boolean) => {

    const session = useSessionStore.getState();

	let customDimensions: YouboraCustomDimensions = {
		2: require('~/api/common').getSessionId(),
		3: paramToString(data?.id),
	};

	let content: YouboraContent = {
		transactionCode: Config.YOUBORA_TRANSACTION_CODE,
		id: paramToString(data?.id),
		title: paramToString(data?.title),
		type: paramToString(data?.media_type),
		customDimension: customDimensions,
	};

	if (data?.collection === 'media') {
		content = {
			...content,
			type: !!data?.season_data ? 'series' : 'movie',
			program: paramToString(data?.season_data?.series_title),
			isLive: data?.type === 'live',
			playbackType: data?.type === 'live' ? 'live' : 'vod',
			tvShow: paramToString(data?.season_data?.series_title),
			season: paramToString(data?.season_data?.season_number),
			episodeTitle: !!data?.season_data
				? paramToString(data?.title)
				: undefined,
			customDimension: {
				...customDimensions,
				4: paramToString(data?.season_data?.series_id),
			},
		};
	}

	if (data?.collection === 'stream') {
		content = {
			...content,
			isLive: true,
			channel: paramToString(data?.title),
			playbackType: 'live',
		};
	}

	let options: IYoubora = {
		accountCode: Config.YOUBORA_ACCOUNT_CODE!,
		username: paramToString(session?.id()),
		offline: !!offline,
		content: content,
	};

	console.log(`[Youbora] Options ${JSON.stringify(options)}`);

	return options;
};

/*
 *  Los adaptadores de Youbora esperan los campos en un formato sutilmente distintos en web (Cast) y los códigos nativos
 *  Aquí realizaremos la transformación
 *
 */

export const getYouboraOptions = (
	data: IYoubora,
	format?: IYouboraSettingsFormat,
) => {
	let _format = format || 'mobile';
	let youboraSettings = {};

	if (!!data && _format === 'mobile') {
		youboraSettings = {
			accountCode: data?.accountCode,
			username: data?.username,
			contentTransactionCode: data?.content?.transactionCode,
			contentId: data?.content?.id,
			contentType: data?.content?.type,
			contentTitle: data?.content?.title,
			program: data?.content?.program,
			contentIsLive: data?.content?.isLive,
			contentPlaybackType: data?.content?.playbackType,
			contentTvShow: data?.content?.tvShow,
			contentSeason: data?.content?.season,
			contentEpisodeTitle: data?.content?.episodeTitle,
			contentChannel: data?.content?.channel,
			extraparam1: 'app',
			extraparam2: data?.content?.customDimension?.[2],
			extraparam3: data?.content?.customDimension?.[3],
			extraparam4: data?.content?.customDimension?.[4],
			extraparam5: data?.content?.customDimension?.[5],
			extraparam6: data?.content?.customDimension?.[6],
			extraparam7: data?.content?.customDimension?.[7],
			extraparam8: data?.content?.customDimension?.[8],
			extraparam9: data?.content?.customDimension?.[9],
			extraparam10: data?.content?.customDimension?.[10],
		};

		console.log(
			`[Youbora] Mapped Options ${JSON.stringify(youboraSettings)}`,
		);
		return youboraSettings;
	} else if (!!data && _format === 'cast') {
		youboraSettings = {
			accountCode: data?.accountCode,
			username: data?.username,
			'content.transactionCode': data?.content?.transactionCode,
			'content.id': data?.content?.id,
			'content.type': data?.content?.type,
			'content.title': data?.content?.title,
			'content.program': data?.content?.program,
			'content.isLive': data?.content?.isLive,
			'content.playbackType': data?.content?.playbackType,
			'content.tvShow': data?.content?.tvShow,
			'content.season': data?.content?.season,
			'content.episodeTitle': data?.content?.episodeTitle,
			'content.channel': data?.content?.channel,
			'content.customDimension.1': 'cast',
			'content.customDimension.2': data?.content?.customDimension?.[2],
			'content.customDimension.3': data?.content?.customDimension?.[3],
			'content.customDimension.4': data?.content?.customDimension?.[4],
			'content.customDimension.5': data?.content?.customDimension?.[5],
			'content.customDimension.6': data?.content?.customDimension?.[6],
			'content.customDimension.7': data?.content?.customDimension?.[7],
			'content.customDimension.8': data?.content?.customDimension?.[8],
			'content.customDimension.9': data?.content?.customDimension?.[9],
			'content.customDimension.10': data?.content?.customDimension?.[10],
		};

		console.log(
			`[Youbora] Mapped Options ${JSON.stringify(youboraSettings)}`,
		);
		return youboraSettings;
	} else {
		return {};
	}
};
