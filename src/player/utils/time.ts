/*
 * Duration Parser Helper
 *
 */

function segmentDuration(durationInSeconds: number) {

    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = durationInSeconds % 60;
  
    return {
        hours: hours,
        minutes: minutes,
        seconds: seconds
    };

}

export function parseToCounter (durationInSeconds: number | string): string {

    let seconds = 0;

    if (typeof(durationInSeconds) !== 'number'){
        seconds = parseInt(durationInSeconds, 10);

    } else {
        seconds = durationInSeconds;

    }

    const segments = segmentDuration(seconds);

    const segmentsToString = {
        hours: segments.hours.toFixed(0).padStart(2, '0'),
        minutes: segments.minutes.toFixed(0).padStart(2, '0'),
        seconds: segments.seconds.toFixed(0).padStart(2, '0')
    };

    return `${segmentsToString.hours}:${segmentsToString.minutes}:${segmentsToString.seconds}`;

};

export function parseToDetails (durationInSeconds: number | string): string {

    let seconds = 0;

    if (typeof(durationInSeconds) !== 'number'){
        seconds = parseInt(durationInSeconds, 10);

    } else {
        seconds = durationInSeconds;

    }

    const minutes = Math.floor(seconds / 60);

    if (minutes){
        return `${minutes}min`;

    } else {
        return ``;

    }

};