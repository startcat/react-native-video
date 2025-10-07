/*
 *  Componentes
 *
 */

import React, { FunctionComponent } from "react";

import {
	ControlsBarProps,
	HeaderMetadataProps,
	LiveButtonProps,
	MenuProps,
	NextButtonProps,
	SliderDVRProps,
	SliderVODProps,
	TimeMarkExternalButtonProps,
} from "./types";

interface CommonComponents {
	loader?: React.ReactElement;
	suspenseLoader?: React.ReactElement;
	sliderVOD?: FunctionComponent<SliderVODProps>;
	sliderDVR?: FunctionComponent<SliderDVRProps>;
	nextButton?: FunctionComponent<NextButtonProps>;
	liveButton?: FunctionComponent<LiveButtonProps>;
	skipIntroButton?: FunctionComponent<TimeMarkExternalButtonProps>;
	skipRecapButton?: FunctionComponent<TimeMarkExternalButtonProps>;
	skipCreditsButton?: FunctionComponent<TimeMarkExternalButtonProps>;
}

export interface IPlayerCustomAudioComponents extends CommonComponents {}

export interface IPlayerCustomVideoComponents extends CommonComponents {
	mosca?: React.ReactElement;
	headerMetadata?: FunctionComponent<HeaderMetadataProps>;
	controlsBottomBar?: FunctionComponent<ControlsBarProps>;
	controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
	controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
	menu?: FunctionComponent<MenuProps>;
	settingsMenu?: FunctionComponent<MenuProps>;
}
