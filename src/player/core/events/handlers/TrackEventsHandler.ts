/*
 *  Handler específico para eventos de pistas de audio, subtítulos y video
 *
 */

import { PlayerAnalyticsEvents } from "../../../features/analytics";

import type { OnAudioTracksData, OnVolumeChangeData } from "../../../../specs/VideoNativeComponent";

import type { OnLoadData, OnTextTracksData } from "../../../../types/events";

export class TrackEventsHandler {
	private analyticsEvents: PlayerAnalyticsEvents;
	private currentAudioIndex = -1;
	private currentTextIndex = -1;
	private currentVolume = 1.0;
	private currentMuted = false;

	constructor(analyticsEvents: PlayerAnalyticsEvents) {
		this.analyticsEvents = analyticsEvents;
	}

	handleTracksLoad = (data: OnLoadData) => {
		// Detectar pistas de audio seleccionadas inicialmente
		const selectedAudio = data.audioTracks.find(track => track.selected);
		if (selectedAudio) {
			this.currentAudioIndex = selectedAudio.index;
			this.analyticsEvents.onAudioTrackChange({
				trackIndex: selectedAudio.index,
				trackLabel: selectedAudio.title,
				language: selectedAudio.language,
			});
		}

		// Detectar pistas de texto seleccionadas inicialmente
		const selectedText = data.textTracks.find(track => track.selected);
		if (selectedText) {
			this.currentTextIndex = selectedText.index;
			this.analyticsEvents.onSubtitleTrackChange({
				trackIndex: selectedText.index,
				trackLabel: selectedText.title,
				language: selectedText.language,
			});
		}
	};

	handleAudioTracks = (data: OnAudioTracksData) => {
		const selectedTrack = data.audioTracks.find(track => track.selected);

		if (selectedTrack && selectedTrack.index !== this.currentAudioIndex) {
			this.currentAudioIndex = selectedTrack.index;
			this.analyticsEvents.onAudioTrackChange({
				trackIndex: selectedTrack.index,
				trackLabel: selectedTrack.title,
				language: selectedTrack.language,
			});
		}
	};

	handleTextTracks = (data: OnTextTracksData) => {
		const selectedTrack = data.textTracks.find(track => track.selected);

		if (selectedTrack && selectedTrack.index !== this.currentTextIndex) {
			this.currentTextIndex = selectedTrack.index;
			this.analyticsEvents.onSubtitleTrackChange({
				trackIndex: selectedTrack.index,
				trackLabel: selectedTrack.title,
				language: selectedTrack.language,
			});

			this.analyticsEvents.onSubtitleShow({
				trackIndex: selectedTrack.index,
			});
		} else if (!selectedTrack && this.currentTextIndex !== -1) {
			// Los subtítulos se han desactivado
			this.currentTextIndex = -1;
			this.analyticsEvents.onSubtitleHide();
		}
	};

	handleVolumeChange = (data: OnVolumeChangeData, previousVolume: number, wasMuted: boolean) => {
		// Detectar cambios en el volumen
		if (data.volume !== previousVolume) {
			this.analyticsEvents.onVolumeChange({
				volume: data.volume,
				previousVolume: previousVolume,
			});
			this.currentVolume = data.volume;
		}

		// Detectar cambios en el estado de silencio
		const isMuted = data.volume === 0;
		if (isMuted !== wasMuted) {
			this.analyticsEvents.onMuteChange({
				muted: isMuted,
			});
			this.currentMuted = isMuted;
		}
	};

	getCurrentAudioIndex = () => this.currentAudioIndex;
	getCurrentTextIndex = () => this.currentTextIndex;
	getCurrentVolume = () => this.currentVolume;
	getCurrentMuted = () => this.currentMuted;
}
